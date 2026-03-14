#pragma once

#include "barretenberg/constants.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include <array>
#include <vector>

namespace bb {

/**
 * @brief Stores ZK masking values for witness polynomials and manages their folding across sumcheck rounds.
 *
 * @details When witness polynomials are allocated to trace_active_range (not full dyadic_size), the masking
 * values at the last NUM_MASKED_ROWS positions are stored here instead. This struct:
 * 1. Holds the original masking values (generated at commitment time)
 * 2. Computes claimed evaluation corrections via Lagrange products of challenges
 *
 * The masking rows are at positions {n-3, n-2, n-1} where n = dyadic_size.
 */
template <typename Flavor> struct MaskingTailData {
    using FF = typename Flavor::FF;
    using Polynomial = typename Flavor::Polynomial;

    // Per-polynomial masking entry: original values
    struct Entry {
        size_t all_entities_index;                   // index in get_all()
        std::array<FF, NUM_MASKED_ROWS> mask_values; // original masking values at positions {n-3, n-2, n-1}
    };

    // Same structure but for shifted polys whose unshifted counterpart is masked
    struct ShiftedEntry {
        size_t all_entities_index; // index in get_all() for the shifted poly
        size_t source_entry_index; // index into 'entries' for the unshifted poly
    };

    // Folded masking values at disabled positions, tracked across sumcheck rounds.
    // After round 0: 2 values per entry (at positions n/2-2 and n/2-1 in PE).
    // After round 1+: 1 value per entry (at the last position in PE).
    struct FoldedValues {
        std::array<FF, 2> values{}; // [0]=even, [1]=odd (only [0] used after round 1)
        size_t count = 0;           // 2 after round 0, 1 after round 1+
    };

    std::vector<Entry> entries;
    std::vector<ShiftedEntry> shifted_entries;
    size_t dyadic_size = 0;

    // Folded masking values per entry and per shifted entry
    std::vector<FoldedValues> folded;
    std::vector<FoldedValues> shifted_folded;

    bool is_active() const { return !entries.empty(); }

    /**
     * @brief Register a polynomial for masking and generate random mask values.
     * @param polys The ProverPolynomials to search for the all_entities_index.
     * @param poly The polynomial to mask.
     * @return Index of the newly created entry.
     */
    template <typename ProverPolynomials>
    size_t register_masked_poly(const ProverPolynomials& polys, const Polynomial& poly)
    {
        size_t idx = find_all_entities_index(polys, poly);
        Entry entry;
        entry.all_entities_index = idx;
        for (auto& v : entry.mask_values) {
            v = FF::random_element();
        }
        entries.push_back(entry);
        return entries.size() - 1;
    }

    /**
     * @brief Register a shifted polynomial entry. The shifted poly inherits mask values from its source.
     */
    template <typename ProverPolynomials>
    void register_shifted_entry(const ProverPolynomials& polys,
                                const Polynomial& shifted_poly,
                                size_t source_entry_index)
    {
        size_t idx = find_all_entities_index(polys, shifted_poly);
        shifted_entries.push_back(ShiftedEntry{ idx, source_entry_index });
    }

    /**
     * @brief Register all shifted polynomials whose to-be-shifted source is already in entries.
     * @details Iterates over get_to_be_shifted()/get_shifted() pairs and matches against existing entries.
     */
    template <typename ProverPolynomials> void register_shifted_polys(ProverPolynomials& polys)
    {
        auto to_be_shifted = polys.get_to_be_shifted();
        auto shifted = polys.get_shifted();

        for (size_t s = 0; s < to_be_shifted.size(); s++) {
            size_t tbs_all_idx = find_all_entities_index(polys, to_be_shifted[s]);
            // Check if this to-be-shifted poly has a corresponding entry
            for (size_t e = 0; e < entries.size(); e++) {
                if (entries[e].all_entities_index == tbs_all_idx) {
                    size_t shifted_all_idx = find_all_entities_index(polys, shifted[s]);
                    shifted_entries.push_back(ShiftedEntry{ shifted_all_idx, e });
                    break;
                }
            }
        }
    }

    /**
     * @brief Compute the tail's contribution to the claimed evaluation at challenge point u = (u_0, ..., u_{d-1}).
     * @details Uses the Lagrange basis at the masking row positions:
     *   L_{n-1}(u) = u_0 · u_1 · u_2 · ... · u_{d-1}
     *   L_{n-2}(u) = (1-u_0) · u_1 · u_2 · ... · u_{d-1}
     *   L_{n-3}(u) = u_0 · (1-u_1) · u_2 · ... · u_{d-1}
     *
     * tail_correction = mask[0]*L_{n-3}(u) + mask[1]*L_{n-2}(u) + mask[2]*L_{n-1}(u)
     */
    FF compute_claimed_eval_correction(size_t entry_index, std::span<const FF> challenges) const
    {
        const auto& mask = entries[entry_index].mask_values;

        // Common factor: u_2 * u_3 * ... * u_{d-1}
        FF common_factor = FF::one();
        for (size_t i = 2; i < challenges.size(); i++) {
            common_factor *= challenges[i];
        }

        FF u0 = challenges[0];
        FF u1 = challenges[1];

        // L_{n-3}(u) = u_0 * (1-u_1) * common_factor
        // L_{n-2}(u) = (1-u_0) * u_1 * common_factor
        // L_{n-1}(u) = u_0 * u_1 * common_factor
        FF correction =
            common_factor * (mask[0] * u0 * (FF::one() - u1) + mask[1] * (FF::one() - u0) * u1 + mask[2] * u0 * u1);
        return correction;
    }

    /**
     * @brief Same as above but for a shifted polynomial.
     * @details Shifted poly: shift[i] = unshifted[i+1]. So:
     *   shift[n-4] = unshifted[n-3] = mask[0]
     *   shift[n-3] = unshifted[n-2] = mask[1]
     *   shift[n-2] = unshifted[n-1] = mask[2]
     *   shift[n-1] = 0
     *
     *   shift_correction = mask[0]*L_{n-4}(u) + mask[1]*L_{n-3}(u) + mask[2]*L_{n-2}(u)
     */
    FF compute_shifted_claimed_eval_correction(size_t shifted_entry_index, std::span<const FF> challenges) const
    {
        const auto& source = entries[shifted_entries[shifted_entry_index].source_entry_index];
        const auto& mask = source.mask_values;

        FF common_factor = FF::one();
        for (size_t i = 2; i < challenges.size(); i++) {
            common_factor *= challenges[i];
        }

        FF u0 = challenges[0];
        FF u1 = challenges[1];

        // L_{n-4}(u) = (1-u_0)*(1-u_1)*common_factor
        // L_{n-3}(u) = u_0*(1-u_1)*common_factor
        // L_{n-2}(u) = (1-u_0)*u_1*common_factor
        FF correction = common_factor * (mask[0] * (FF::one() - u0) * (FF::one() - u1) +
                                         mask[1] * u0 * (FF::one() - u1) + mask[2] * (FF::one() - u0) * u1);
        return correction;
    }

    /**
     * @brief Fold masking values after a sumcheck round challenge.
     * @details Maintains the values that SHOULD be at disabled positions in PE multivariates,
     * even though the actual PE has zeros there (because witness polys are short).
     *
     * For rounds 2+, needs access to PE to read the active even-position neighbor.
     *
     * @param challenge The round challenge u_i.
     * @param round_idx The sumcheck round index (0-based).
     * @param round_size The round size BEFORE halving (2^{d-i}).
     * @param pe Optional pointer to PE multivariates (needed for rounds 2+).
     */
    template <typename PolynomialCollection>
    void fold_masking_values(FF challenge,
                             size_t round_idx,
                             size_t round_size,
                             const PolynomialCollection* pe = nullptr)
    {
        if (!is_active()) {
            return;
        }

        if (round_idx == 0) {
            // Fold the 4 disabled positions (2 edge pairs) into 2 values per entry.
            // Unshifted: pos n-4=0, n-3=mask[0], n-2=mask[1], n-1=mask[2]
            folded.resize(entries.size());
            for (size_t e = 0; e < entries.size(); e++) {
                const auto& mask = entries[e].mask_values;
                folded[e].values[0] = challenge * mask[0];                       // fold(0, mask[0])
                folded[e].values[1] = mask[1] + challenge * (mask[2] - mask[1]); // fold(mask[1], mask[2])
                folded[e].count = 2;
            }
            // Shifted: pos n-4=mask[0], n-3=mask[1], n-2=mask[2], n-1=0
            shifted_folded.resize(shifted_entries.size());
            for (size_t s = 0; s < shifted_entries.size(); s++) {
                const auto& mask = entries[shifted_entries[s].source_entry_index].mask_values;
                shifted_folded[s].values[0] = mask[0] + challenge * (mask[1] - mask[0]); // fold(mask[0], mask[1])
                shifted_folded[s].values[1] = mask[2] * (FF::one() - challenge);         // fold(mask[2], 0)
                shifted_folded[s].count = 2;
            }
        } else if (round_idx == 1) {
            // Fold the 2 values into 1 per entry.
            for (size_t e = 0; e < entries.size(); e++) {
                folded[e].values[0] = folded[e].values[0] + challenge * (folded[e].values[1] - folded[e].values[0]);
                folded[e].count = 1;
            }
            for (size_t s = 0; s < shifted_entries.size(); s++) {
                shifted_folded[s].values[0] = shifted_folded[s].values[0] +
                                              challenge * (shifted_folded[s].values[1] - shifted_folded[s].values[0]);
                shifted_folded[s].count = 1;
            }
        } else {
            // Rounds 2+: fold single disabled value with its active PE neighbor.
            // The disabled edge pair is at (round_size-2, round_size-1) in PE.
            // Even position (round_size-2) is active and correct in PE.
            // Odd position (round_size-1) is disabled (0 in PE, should be folded value).
            // New folded = even + challenge * (folded - even)
            BB_ASSERT(pe != nullptr);
            size_t even_pos = round_size - 2;
            auto all_pe = pe->get_all();

            for (size_t e = 0; e < entries.size(); e++) {
                FF even_val = all_pe[entries[e].all_entities_index][even_pos];
                folded[e].values[0] = even_val + challenge * (folded[e].values[0] - even_val);
            }
            for (size_t s = 0; s < shifted_entries.size(); s++) {
                FF even_val = all_pe[shifted_entries[s].all_entities_index][even_pos];
                shifted_folded[s].values[0] = even_val + challenge * (shifted_folded[s].values[0] - even_val);
            }
        }
    }

    /**
     * @brief Get the folded masking values for a specific entry at the disabled edge positions.
     * @return Pair of (even_value, odd_value) for the disabled edge. If only 1 folded value,
     *         even_value is not from masking (caller should use actual PE value).
     */
    std::pair<FF, FF> get_entry_folded_values(size_t entry_idx) const
    {
        return { folded[entry_idx].values[0], folded[entry_idx].values[1] };
    }

    std::pair<FF, FF> get_shifted_entry_folded_values(size_t shifted_entry_idx) const
    {
        return { shifted_folded[shifted_entry_idx].values[0], shifted_folded[shifted_entry_idx].values[1] };
    }

    size_t get_folded_count() const { return folded.empty() ? 0 : folded[0].count; }

    /**
     * @brief Register tail polynomials with the batcher so masking values are included in PCS batching.
     * @details Instead of extending witness polynomials to full size (expensive), we create small tail
     * polynomials (NUM_MASKED_ROWS values at positions {n-3, n-2, n-1}) and batch them alongside
     * their corresponding base polynomials using the same rho scalar.
     */
    template <typename ProverPolynomials, typename PolynomialBatcher>
    void add_tails_to_batcher(const ProverPolynomials& prover_polynomials, PolynomialBatcher& batcher) const
    {
        if (!is_active()) {
            return;
        }

        auto all = prover_polynomials.get_all();

        info("add_tails_to_batcher: entries=",
             entries.size(),
             " dyadic=",
             dyadic_size,
             " batcher_unshifted=",
             batcher.unshifted.size(),
             " batcher_shifted=",
             batcher.to_be_shifted_by_one.size());
        for (const auto& entry : entries) {
            const auto& source_poly = all[entry.all_entities_index];
            // Skip polys that already cover the masked region (e.g. translation polys extended in-place)
            if (source_poly.end_index() >= dyadic_size) {
                info("  skip entry all_idx=", entry.all_entities_index, " end_idx=", source_poly.end_index());
                continue;
            }
            size_t start = dyadic_size - NUM_MASKED_ROWS;

            // Find this entry's polynomial in the batcher's unshifted list by data pointer
            bool found_u = false;
            for (size_t i = 0; i < batcher.unshifted.size(); i++) {
                if (batcher.unshifted[i].data() == source_poly.data()) {
                    Polynomial tail(NUM_MASKED_ROWS, dyadic_size, start);
                    for (size_t j = 0; j < NUM_MASKED_ROWS; j++) {
                        tail.at(start + j) = entry.mask_values[j];
                    }
                    batcher.add_unshifted_tail(i, std::move(tail));
                    found_u = true;
                    break;
                }
            }

            // Also check if this poly appears in the to_be_shifted list
            bool found_s = false;
            for (size_t i = 0; i < batcher.to_be_shifted_by_one.size(); i++) {
                if (batcher.to_be_shifted_by_one[i].data() == source_poly.data()) {
                    Polynomial tail(NUM_MASKED_ROWS, dyadic_size, start);
                    for (size_t j = 0; j < NUM_MASKED_ROWS; j++) {
                        tail.at(start + j) = entry.mask_values[j];
                    }
                    batcher.add_shifted_tail(i, std::move(tail));
                    found_s = true;
                    break;
                }
            }
            info("  entry all_idx=",
                 entry.all_entities_index,
                 " end=",
                 source_poly.end_index(),
                 " u=",
                 found_u,
                 " s=",
                 found_s);
        }
    }

    /**
     * @brief Write masking values back into all masked polynomials (extending them as needed).
     * @details Used by ECCVM where translation polys need mask values for univariate evaluation.
     * After calling this, shifted references are re-established via set_shifted().
     */
    template <typename ProverPolynomials> void inject_into_polynomials(ProverPolynomials& prover_polynomials) const
    {
        auto all = prover_polynomials.get_all();
        for (const auto& entry : entries) {
            auto& poly = all[entry.all_entities_index];
            size_t target_size = poly.virtual_size() - poly.start_index();
            Polynomial extended(poly, target_size);
            for (size_t j = 0; j < NUM_MASKED_ROWS; j++) {
                extended.at(dyadic_size - NUM_MASKED_ROWS + j) = entry.mask_values[j];
            }
            poly = std::move(extended);
        }
        prover_polynomials.set_shifted();
    }

    /**
     * @brief Apply claimed evaluation corrections to multivariate evaluations after sumcheck.
     */
    template <typename ClaimedEvaluations>
    void apply_claimed_eval_corrections(ClaimedEvaluations& evaluations, std::span<const FF> challenges) const
    {
        auto evals = evaluations.get_all();
        for (size_t e = 0; e < entries.size(); e++) {
            evals[entries[e].all_entities_index] += compute_claimed_eval_correction(e, challenges);
        }
        for (size_t s = 0; s < shifted_entries.size(); s++) {
            evals[shifted_entries[s].all_entities_index] += compute_shifted_claimed_eval_correction(s, challenges);
        }
    }

    /**
     * @brief Register a masked poly with pre-generated mask values.
     */
    template <typename ProverPolynomials>
    void register_masked_poly_with_values(ProverPolynomials& polys,
                                          const Polynomial& poly,
                                          const std::array<FF, NUM_MASKED_ROWS>& mask_vals)
    {
        size_t idx = find_all_entities_index(polys, poly);
        entries.push_back(Entry{ idx, mask_vals });
    }

    /**
     * @brief Find the index of a polynomial in get_all() by comparing data pointers and start indices.
     */
    template <typename ProverPolynomials>
    static size_t find_all_entities_index(ProverPolynomials& polys, const Polynomial& target)
    {
        auto all = polys.get_all();
        for (size_t i = 0; i < all.size(); i++) {
            if (all[i].data() == target.data() && all[i].start_index() == target.start_index()) {
                return i;
            }
        }
        throw_or_abort("MaskingTailData: polynomial not found in get_all()");
        return 0;
    }
};

} // namespace bb
