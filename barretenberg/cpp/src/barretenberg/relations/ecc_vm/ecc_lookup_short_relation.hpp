// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/relations/ecc_vm/ecc_lookup_relation.hpp"
#include "barretenberg/relations/ecc_vm/ecc_short_monomial_relation_utils.hpp"
#include "barretenberg/relations/relation_types.hpp"

namespace bb {

/**
 * @brief Short-monomial variant of ECCVMLookupRelationImpl.
 *
 * Overrides the helper methods that the logderivative library calls (compute_lookup_term, compute_table_term,
 * compute_inverse_exists, lookup_read_counts, get_lookup_term_predicate, get_table_term_predicate) so that the
 * degree-1 fingerprints are built in length-2 coefficient basis and promoted to Accumulator at the end. Each
 * fingerprint combines 4-5 inputs with field scalars (gamma, beta, beta_sqr, beta_cube); building in coefficient
 * basis fuses the per-input extensions into a single Newton-forward-difference promotion per term.
 */
template <typename FF_> class ECCVMLookupShortRelationImpl : public ECCVMLookupRelationImpl<FF_> {
  public:
    using FF = FF_;
    using Base = ECCVMLookupRelationImpl<FF>;

    template <typename Accumulator, typename AllEntities>
    static Accumulator compute_inverse_exists(const AllEntities& in)
    {
        using ShortView = ECCVMShortMonomialView<Accumulator>;
        const auto row_has_write = ShortView(in.precompute_select);               // length 2
        const auto row_has_read = ShortView(in.msm_add) + ShortView(in.msm_skew); // length 2
        const auto write_times_read = row_has_write * row_has_read;               // length 3
        // length-3 term on LHS preserves the a2 coefficient under +.
        return Accumulator((-write_times_read) + (row_has_write + row_has_read));
    }

    template <typename Accumulator, size_t index, typename AllEntities>
    static Accumulator lookup_read_counts(const AllEntities& in)
    {
        using ShortView = ECCVMShortMonomialView<Accumulator>;
        if constexpr (index == 0) {
            return Accumulator(ShortView(in.lookup_read_counts_0));
        }
        if constexpr (index == 1) {
            return Accumulator(ShortView(in.lookup_read_counts_1));
        }
        return Accumulator(1);
    }

    template <typename Accumulator, size_t lookup_index, typename AllEntities>
    static Accumulator get_lookup_term_predicate(const AllEntities& in)
    {
        using ShortView = ECCVMShortMonomialView<Accumulator>;
        if constexpr (lookup_index == 0) {
            return Accumulator(ShortView(in.msm_add1));
        }
        if constexpr (lookup_index == 1) {
            return Accumulator(ShortView(in.msm_add2));
        }
        if constexpr (lookup_index == 2) {
            return Accumulator(ShortView(in.msm_add3));
        }
        if constexpr (lookup_index == 3) {
            return Accumulator(ShortView(in.msm_add4));
        }
        return Accumulator(1);
    }

    template <typename Accumulator, size_t table_index, typename AllEntities>
    static Accumulator get_table_term_predicate(const AllEntities& in)
    {
        using ShortView = ECCVMShortMonomialView<Accumulator>;
        if constexpr (table_index == 0 || table_index == 1) {
            return Accumulator(ShortView(in.precompute_select));
        }
        return Accumulator(1);
    }

    template <typename Accumulator, size_t table_index, typename AllEntities, typename Parameters>
    static Accumulator compute_table_term(const AllEntities& in, const Parameters& params)
    {
        using ShortView = ECCVMShortMonomialView<Accumulator>;
        static_assert(table_index < Base::NUM_TABLE_TERMS);

        const auto precompute_pc = ShortView(in.precompute_pc);
        const auto tx = ShortView(in.precompute_tx);
        const auto ty = ShortView(in.precompute_ty);
        const auto precompute_round = ShortView(in.precompute_round);
        const auto& gamma = params.gamma;
        const auto& beta = params.beta;
        const auto& beta_sqr = params.beta_sqr;
        const auto& beta_cube = params.beta_cube;

        if constexpr (table_index == 0) {
            const auto positive_slice_value = -precompute_round + FF(15);
            const auto positive_term =
                ((tx * beta_sqr + ty * beta_cube) + positive_slice_value * beta) + (precompute_pc * FF(1) + gamma);
            return Accumulator(positive_term);
        }
        if constexpr (table_index == 1) {
            const auto negative_term =
                ((tx * beta_sqr - ty * beta_cube) + precompute_round * beta) + (precompute_pc * FF(1) + gamma);
            return Accumulator(negative_term);
        }
        return Accumulator(1);
    }

    template <typename Accumulator, size_t lookup_index, typename AllEntities, typename Parameters>
    static Accumulator compute_lookup_term(const AllEntities& in, const Parameters& params)
    {
        using ShortView = ECCVMShortMonomialView<Accumulator>;
        static_assert(lookup_index < Base::NUM_LOOKUP_TERMS);

        const auto& gamma = params.gamma;
        const auto& beta = params.beta;
        const auto& beta_sqr = params.beta_sqr;
        const auto& beta_cube = params.beta_cube;
        const auto msm_pc = ShortView(in.msm_pc);
        const auto msm_count = ShortView(in.msm_count);
        const auto current_pc = msm_pc - msm_count;

        if constexpr (lookup_index == 0) {
            const auto slice = ShortView(in.msm_slice1);
            const auto x = ShortView(in.msm_x1);
            const auto y = ShortView(in.msm_y1);
            const auto term = ((slice * beta + x * beta_sqr) + y * beta_cube) + (current_pc + gamma);
            return Accumulator(term);
        }
        if constexpr (lookup_index == 1) {
            const auto slice = ShortView(in.msm_slice2);
            const auto x = ShortView(in.msm_x2);
            const auto y = ShortView(in.msm_y2);
            const auto term = ((slice * beta + x * beta_sqr) + y * beta_cube) + ((current_pc - FF(1)) + gamma);
            return Accumulator(term);
        }
        if constexpr (lookup_index == 2) {
            const auto slice = ShortView(in.msm_slice3);
            const auto x = ShortView(in.msm_x3);
            const auto y = ShortView(in.msm_y3);
            const auto term = ((slice * beta + x * beta_sqr) + y * beta_cube) + ((current_pc - FF(2)) + gamma);
            return Accumulator(term);
        }
        if constexpr (lookup_index == 3) {
            const auto slice = ShortView(in.msm_slice4);
            const auto x = ShortView(in.msm_x4);
            const auto y = ShortView(in.msm_y4);
            const auto term = ((slice * beta + x * beta_sqr) + y * beta_cube) + ((current_pc - FF(3)) + gamma);
            return Accumulator(term);
        }
        return Accumulator(1);
    }

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    static void accumulate(ContainerOverSubrelations& accumulator,
                           const AllEntities& in,
                           const Parameters& params,
                           const FF& scaling_factor);
};

template <typename FF> using ECCVMLookupShortRelation = Relation<ECCVMLookupShortRelationImpl<FF>>;

} // namespace bb
