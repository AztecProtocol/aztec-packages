// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================
#pragma once

#include "barretenberg/common/thread.hpp"
#include "barretenberg/common/zip_view.hpp"
#include "barretenberg/polynomials/polynomial.hpp"

namespace bb {

/**
 * @brief A container for storing the partially evaluated multivariates produced by sumcheck.
 * @details This base class provides the common implementation for all flavors. Each flavor
 * should define a type alias like:
 *   using PartiallyEvaluatedMultivariates = PartiallyEvaluatedMultivariatesBase<AllEntities<Polynomial>,
 * ProverPolynomials, Polynomial>;
 *
 * @tparam AllEntitiesBase The AllEntities<Polynomial> type from the flavor
 * @tparam ProverPolynomialsType The ProverPolynomials type from the flavor
 * @tparam Polynomial The Polynomial type from the flavor
 */
template <typename AllEntitiesBase, typename ProverPolynomialsType, typename Polynomial>
class PartiallyEvaluatedMultivariatesBase : public AllEntitiesBase {
  public:
    using Fr = typename Polynomial::FF;

    /**
     * @brief Construct from full polynomials using arena-based allocation.
     * @details Instead of making ~60 separate allocations (one per polynomial), this constructor
     * computes the total memory needed, makes a single contiguous allocation, and then creates
     * each polynomial as an aliased sub-region of that arena. This reduces malloc contention
     * and improves cache locality.
     *
     * After the initial sumcheck round, each polynomial's new size is CEIL(end_index/2).
     */
    PartiallyEvaluatedMultivariatesBase(const ProverPolynomialsType& full_polynomials, size_t circuit_size)
    {
        const size_t half_circuit_size = circuit_size / 2;
        auto all_polys = this->get_all();
        auto all_full_polys = full_polynomials.get_all();

        // First pass: compute total size needed for the arena
        size_t total_size = 0;
        for (auto& full_poly : all_full_polys) {
            size_t desired_size = (full_poly.end_index() / 2) + (full_poly.end_index() % 2);
            total_size += desired_size;
        }

        // Single contiguous allocation for all polynomial data (not zeroed).
        auto arena_backing = BackingMemory<Fr>::allocate_raw(total_size);
        auto arena = arena_backing.aligned_memory;
        Fr* arena_raw = arena_backing.raw_data;

        // Zero the arena in parallel
        parallel_for_heuristic(
            total_size,
            [&](size_t start, size_t end, size_t /*chunk_index*/) {
                memset(static_cast<void*>(arena_raw + start), 0, sizeof(Fr) * (end - start));
            },
            thread_heuristics::FF_COPY_COST);

        // Second pass: create each polynomial as an aliased sub-region of the arena
        size_t offset = 0;
        for (auto [poly, full_poly] : zip_view(all_polys, all_full_polys)) {
            size_t desired_size = (full_poly.end_index() / 2) + (full_poly.end_index() % 2);

            auto backing = BackingMemory<Fr>::from_aliased(arena, arena_raw + offset);
            poly = Polynomial::from_backing_memory(std::move(backing), desired_size, half_circuit_size);

            offset += desired_size;
        }
    }
};

} // namespace bb
