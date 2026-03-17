// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================
#pragma once

#include "barretenberg/common/zip_view.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include <unordered_map>

namespace bb {

/**
 * @brief A container for polynomials handles used by the prover.
 * @details This base class provides the common implementation for all flavors. Each flavor
 * should define a type alias like:
 *   template <bool HasZK_ = HasZK>
 *   using ProverPolynomials_ = ProverPolynomialsBase<AllEntities_<Polynomial, HasZK_>, AllValues_<HasZK_>, Polynomial>;
 *
 * @tparam AllEntitiesBase The AllEntities<Polynomial> type from the flavor
 * @tparam AllValuesType The AllValues type from the flavor
 * @tparam Polynomial The Polynomial type from the flavor
 */
template <typename AllEntitiesBase, typename AllValuesType, typename Polynomial>
class ProverPolynomialsBase : public AllEntitiesBase {
  public:
    ProverPolynomialsBase() = default;
    ProverPolynomialsBase& operator=(const ProverPolynomialsBase&) = delete;
    ProverPolynomialsBase(const ProverPolynomialsBase& o) = delete;
    ProverPolynomialsBase(ProverPolynomialsBase&& o) noexcept = default;
    ProverPolynomialsBase& operator=(ProverPolynomialsBase&& o) noexcept = default;
    ~ProverPolynomialsBase() = default;

    /**
     * @brief Allocate polynomials of the given circuit size.
     */
    explicit ProverPolynomialsBase(size_t circuit_size)
    {
        for (auto& poly : this->get_to_be_shifted()) {
            poly = Polynomial{ /*memory size*/ circuit_size - 1,
                               /*largest possible index*/ circuit_size,
                               /* offset */ 1 };
        }
        for (auto& poly : this->get_unshifted()) {
            if (poly.is_empty()) {
                poly = Polynomial{ /*memory size*/ circuit_size, /*largest possible index*/ circuit_size };
            }
        }
        set_shifted();
    }

    [[nodiscard]] size_t get_polynomial_size() const { return this->q_c.virtual_size(); }
    [[nodiscard]] AllValuesType get_row(size_t row_idx) const
    {
        AllValuesType result;
        for (auto [result_field, polynomial] : zip_view(result.get_all(), this->get_all())) {
            result_field = polynomial[row_idx];
        }
        return result;
    }

    [[nodiscard]] AllValuesType get_row_for_permutation_arg(size_t row_idx)
    {
        AllValuesType result;
        for (auto [result_field, polynomial] : zip_view(result.get_sigmas(), this->get_sigmas())) {
            result_field = polynomial[row_idx];
        }
        for (auto [result_field, polynomial] : zip_view(result.get_ids(), this->get_ids())) {
            result_field = polynomial[row_idx];
        }
        for (auto [result_field, polynomial] : zip_view(result.get_wires(), this->get_wires())) {
            result_field = polynomial[row_idx];
        }
        return result;
    }

    // Set all shifted polynomials based on their to-be-shifted counterpart
    void set_shifted()
    {
        for (auto [shifted, to_be_shifted] : zip_view(this->get_shifted(), this->get_to_be_shifted())) {
            shifted = to_be_shifted.shifted();
        }
    }

    // Returns the maximum end_index across all polynomials (i.e. the actual data extent)
    [[nodiscard]] size_t max_end_index() const
    {
        size_t result = 0;
        for (const auto& poly : this->get_all()) {
            result = std::max(result, poly.end_index());
        }
        return result;
    }

    /**
     * @brief Per-entity extent info for interleaved group allocation.
     */
    struct EntityExtent {
        size_t start_index = 0;
        size_t end_index = 0;
    };

    /**
     * @brief Allocate interleaved group buffers and assign entity polynomials as strided views.
     *
     * @details For each group defined by GroupAccessors, allocates a single contiguous buffer
     *          of size max_end_index_in_group * BS. Entity polynomials become strided views into
     *          the group buffer with their own (start_index, end_index) extents.
     *
     *          The entity_extents map provides per-entity sizes. Entities not in the map (or null
     *          group slots) are skipped. Shiftable groups (the last num_shiftable groups) produce
     *          shiftable buffers with start_index = BS.
     *
     * @tparam BS Batch size (interleaving width).
     * @tparam GroupAccessors The GroupAccessors_<BS> type that defines group structure.
     * @param virtual_size The dyadic circuit size (virtual_size for entities and group buffers).
     * @param num_shiftable Number of shiftable groups at the end of the group list.
     * @param entity_extents Map from entity polynomial address to its (start_index, end_index).
     */
    template <size_t BS, typename GroupAccessors>
    void allocate_interleaved_groups(size_t virtual_size,
                                     size_t num_shiftable,
                                     const std::unordered_map<const Polynomial*, EntityExtent>& entity_extents)
    {
        static_assert(BS > 1, "Interleaved group allocation only for BS > 1");

        auto groups = GroupAccessors::template get_unshifted_groups<false>(*this);
        const size_t num_groups = groups.size();
        const size_t shiftable_start = num_groups - num_shiftable;

        group_buffers_.resize(num_groups);

        for (size_t g = 0; g < num_groups; g++) {
            const bool shiftable = (g >= shiftable_start);

            // Compute group buffer size = max end_index across non-null entities in the group
            size_t group_end_index = 0;
            for (size_t j = 0; j < groups[g].size(); j++) {
                if (groups[g][j] != nullptr) {
                    auto it = entity_extents.find(groups[g][j]);
                    BB_ASSERT(it != entity_extents.end(), "Entity not found in extents map");
                    group_end_index = std::max(group_end_index, it->second.end_index);
                }
            }

            // TODO(optimization): use group_end_index * BS once commitment/PCS size handling is verified
            const size_t buffer_size = virtual_size * BS;
            const size_t buffer_virtual_size = virtual_size * BS;

            // Allocate the group buffer
            if (shiftable) {
                group_buffers_[g] = Polynomial::shiftable(buffer_size, buffer_virtual_size, BS);
            } else {
                group_buffers_[g] = Polynomial(buffer_size, buffer_virtual_size);
            }

            // Create strided views for each entity in the group.
            // The strided view's start_index is derived from the group buffer's start (0 for
            // non-shiftable, 1 for shiftable), NOT from the entity's natural start. Entities
            // like sigmas/ids have data starting at row 1 but live in non-shiftable groups —
            // their row-0 slot is simply zero (from the zero-initialized buffer).
            const size_t group_logical_start = shiftable ? 1 : 0;
            for (size_t j = 0; j < groups[g].size(); j++) {
                if (groups[g][j] != nullptr) {
                    auto it = entity_extents.find(groups[g][j]);
                    const auto& ext = it->second;
                    const size_t logical_size = ext.end_index - group_logical_start;
                    *groups[g][j] = Polynomial::strided_view(
                        group_buffers_[g].backing_memory(), BS, j, group_logical_start, logical_size, virtual_size);
                }
            }
        }
    }

    /**
     * @brief Find the group buffer that backs a given entity polynomial.
     * @details Matches by backing_memory pointer identity (entity shares memory with its group buffer).
     */
    const Polynomial& group_buffer_for(const Polynomial& entity) const
    {
        for (const auto& buf : group_buffers_) {
            if (buf.backing_memory().raw_data == entity.backing_memory().raw_data) {
                return buf;
            }
        }
        throw_or_abort("Entity not found in any group buffer");
    }

    // Group buffers for interleaved polynomial storage (BS > 1).
    // Each buffer is a contiguous Polynomial of size max_group_end_index * BS,
    // representing one interleaved group. Entity polynomials are strided views into these.
    std::vector<Polynomial> group_buffers_;

    void increase_polynomials_virtual_size(const size_t size_in)
    {
        for (auto& polynomial : this->get_all()) {
            polynomial.increase_virtual_size(size_in);
        }
    }
};

} // namespace bb
