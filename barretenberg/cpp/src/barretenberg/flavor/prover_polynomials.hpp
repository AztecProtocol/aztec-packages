// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================
#pragma once

#include "barretenberg/common/zip_view.hpp"
#include "barretenberg/polynomials/polynomial.hpp"

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
     * @brief Build a temporary interleaved polynomial from a group of entity pointers.
     * @details Interleaves entity data: result[i*BS + j] = entity_j[i]. Null slots are zero.
     *          The result is a fresh polynomial (not a view), suitable for commitment or PCS batching.
     * @param group Vector of entity pointers (some may be nullptr for padding).
     * @param virtual_size The dyadic circuit size (entity-level).
     * @param batch_size The interleaving width (BS).
     * @param shiftable If true, the buffer starts at index BS (shiftable by BS).
     */
    template <typename Group>
    static Polynomial build_interleaved_polynomial(const Group& group,
                                                   size_t virtual_size,
                                                   size_t batch_size,
                                                   bool shiftable = false)
    {
        size_t max_end = 0;
        for (size_t j = 0; j < group.size(); j++) {
            if (group[j] != nullptr) {
                max_end = std::max(max_end, group[j]->end_index());
            }
        }
        if (max_end == 0) {
            return {};
        }

        const size_t buffer_size = max_end * batch_size;
        const size_t buffer_virtual_size = virtual_size * batch_size;

        Polynomial buf = shiftable ? Polynomial::shiftable(buffer_size, buffer_virtual_size, batch_size)
                                   : Polynomial(buffer_size, buffer_virtual_size);

        for (size_t j = 0; j < group.size(); j++) {
            if (group[j] != nullptr) {
                const auto& entity = *group[j];
                for (size_t i = entity.start_index(); i < entity.end_index(); i++) {
                    buf.at(i * batch_size + j) = entity[i];
                }
            }
        }
        return buf;
    }

    /**
     * @brief Pre-batch interleaved groups into F and G using rho powers, freeing entity memory.
     * @details Shifted groups are processed first (they share polys with last unshifted groups).
     *          Unshifted groups are freed greedily after consumption.
     * @param Flavor The flavor providing GroupAccessors and NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS.
     * @return {F, G} — rho-weighted batched polynomials of size n * BS.
     */
    template <typename Flavor, typename FF>
    static std::pair<Polynomial, Polynomial> batch_interleaved_groups_with_rho(
        ProverPolynomialsBase&& polynomials, const FF& rho, size_t n, size_t batch_size, size_t pcs_size)
    {
        constexpr size_t NUM_SHIFTABLE = Flavor::NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS;

        auto unshifted_groups = Flavor::get_unshifted_groups_mut(polynomials);
        auto shifted_groups = Flavor::get_to_be_shifted_groups(polynomials);
        const size_t num_groups = unshifted_groups.size();
        const size_t shiftable_start = num_groups - NUM_SHIFTABLE;

        Polynomial batched_unshifted(pcs_size);
        Polynomial batched_to_be_shifted = Polynomial::shiftable(pcs_size, pcs_size, batch_size);

        // Shifted groups first (they share polys with last unshifted groups — must read before freeing)
        FF rho_shifted = rho.pow(num_groups);
        for (size_t g = 0; g < shifted_groups.size(); g++) {
            auto buf = build_interleaved_polynomial(shifted_groups[g], n, batch_size, true);
            batched_to_be_shifted.add_scaled(buf, rho_shifted);
            rho_shifted *= rho;
        }

        // Unshifted groups with greedy freeing
        FF rho_power(1);
        for (size_t g = 0; g < num_groups; g++) {
            auto buf = build_interleaved_polynomial(unshifted_groups[g], n, batch_size, g >= shiftable_start);
            batched_unshifted.add_scaled(buf, rho_power);
            rho_power *= rho;
            for (auto* ptr : unshifted_groups[g]) {
                if (ptr != nullptr) {
                    *ptr = Polynomial();
                }
            }
        }

        return { std::move(batched_unshifted), std::move(batched_to_be_shifted) };
    }

    void increase_polynomials_virtual_size(const size_t size_in)
    {
        for (auto& polynomial : this->get_all()) {
            polynomial.increase_virtual_size(size_in);
        }
    }
};

} // namespace bb
