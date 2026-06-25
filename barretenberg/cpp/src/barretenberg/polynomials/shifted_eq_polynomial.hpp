// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/polynomials/gate_separator.hpp"
#include "barretenberg/polynomials/polynomial.hpp"

#include <array>
#include <cstddef>
#include <span>
#include <vector>

namespace bb {

template <typename Curve, size_t log_num_monomials> class ShiftedEqPolynomial {
  public:
    using FF = typename Curve::ScalarField;
    using Polynomial = bb::Polynomial<FF>;

    static constexpr size_t poly_length = 1UL << log_num_monomials;

    static void add_scaled(Polynomial& result, const Polynomial& eq, const FF& scaling_factor)
        requires(!Curve::is_stdlib_type)
    {
        BB_ASSERT_LTE(eq.size(), poly_length);
        BB_ASSERT_LTE(result.size(), poly_length);
        parallel_for_heuristic(
            poly_length - 1,
            [&](size_t idx) { result.at(idx + 1) += scaling_factor * eq[idx]; },
            thread_heuristics::FF_ADDITION_COST + thread_heuristics::FF_MULTIPLICATION_COST);
    }

    static FF evaluate_from_eq(const Polynomial& eq, const Polynomial& witness)
        requires(!Curve::is_stdlib_type)
    {
        BB_ASSERT_LTE(eq.size(), poly_length);
        BB_ASSERT_LTE(witness.size(), poly_length);
        constexpr size_t ALLOW_ONE_PAST_READ = 1;
        const auto partials = parallel_for_heuristic(
            poly_length,
            FF::zero(),
            [&](size_t idx, FF& partial) { partial += eq[idx] * witness.get(idx + 1, ALLOW_ONE_PAST_READ); },
            thread_heuristics::FF_ADDITION_COST + thread_heuristics::FF_MULTIPLICATION_COST);

        FF result = FF::zero();
        for (const auto& partial : partials) {
            result += partial;
        }
        return result;
    }

    static FF evaluate_folded(std::span<const FF> point, std::span<const FF> ipa_round_challenges_inv)
    {
        BB_ASSERT_EQ(point.size(), log_num_monomials);
        BB_ASSERT_EQ(ipa_round_challenges_inv.size(), log_num_monomials);

        std::array<FF, log_num_monomials> lower_prefix_products;
        std::array<FF, log_num_monomials> upper_suffix_products;
        compute_prefix_suffix_products(point, ipa_round_challenges_inv, lower_prefix_products, upper_suffix_products);

        // Per lowest-set-bit term: left * right, with left = prefix * (1 - point), right = fold_factor * suffix.
        std::array<FF, log_num_monomials> left_products;
        std::array<FF, log_num_monomials> right_products;
        for (size_t lowest_set_bit = 0; lowest_set_bit < log_num_monomials; ++lowest_set_bit) {
            left_products[lowest_set_bit] = lower_prefix_products[lowest_set_bit] * (FF::one() - point[lowest_set_bit]);
            right_products[lowest_set_bit] =
                fold_factor(ipa_round_challenges_inv, lowest_set_bit) * upper_suffix_products[lowest_set_bit];
        }

        FF result = FF::zero();
        for (size_t idx = 0; idx < log_num_monomials; ++idx) {
            result += left_products[idx] * right_products[idx];
        }
        return result;
    }

    /**
     * @brief Fold the *unshifted* eq tensor eq(point, .) against the IPA s-vector.
     *
     * @details Companion of `evaluate_folded`: the TripleIPA batches the eq claim and the shifted-eq claim into
     * one opening, so the verifier needs both b_0 contractions. This is the plain product
     * `prod_i ((1 - point_i) + point_i * s_i)`, reusing the same `evaluate_eq_factor`/`fold_factor` primitives as the
     * shifted fold.
     */
    static FF evaluate_eq_folded(std::span<const FF> point, std::span<const FF> ipa_round_challenges_inv)
    {
        BB_ASSERT_EQ(point.size(), log_num_monomials);
        BB_ASSERT_EQ(ipa_round_challenges_inv.size(), log_num_monomials);

        FF result = FF::one();
        for (size_t coordinate_idx = 0; coordinate_idx < log_num_monomials; ++coordinate_idx) {
            result *= evaluate_eq_factor(point[coordinate_idx], fold_factor(ipa_round_challenges_inv, coordinate_idx));
        }
        return result;
    }

  private:
    static FF fold_factor(std::span<const FF> ipa_round_challenges_inv, const size_t coordinate_idx)
    {
        return ipa_round_challenges_inv[log_num_monomials - 1 - coordinate_idx];
    }

    // The eq / shifted-eq per-variable factor is the gate-separator pow_β factor (1 - coordinate) + coordinate * fold.
    static FF evaluate_eq_factor(const FF& coordinate, const FF& fold)
    {
        return GateSeparatorPolynomial<FF>::univariate_factor(coordinate, fold);
    }

    static void compute_prefix_suffix_products(std::span<const FF> point,
                                               std::span<const FF> ipa_round_challenges_inv,
                                               std::array<FF, log_num_monomials>& lower_prefix_products,
                                               std::array<FF, log_num_monomials>& upper_suffix_products)
    {
        FF lower_prefix = FF::one();
        for (size_t coordinate_idx = 0; coordinate_idx < log_num_monomials; ++coordinate_idx) {
            lower_prefix_products[coordinate_idx] = lower_prefix;
            lower_prefix *= point[coordinate_idx];
        }

        FF upper_suffix = FF::one();
        for (size_t reverse_idx = 0; reverse_idx < log_num_monomials; ++reverse_idx) {
            const size_t coordinate_idx = log_num_monomials - 1 - reverse_idx;
            upper_suffix_products[coordinate_idx] = upper_suffix;
            const FF s_i = fold_factor(ipa_round_challenges_inv, coordinate_idx);
            upper_suffix *= evaluate_eq_factor(point[coordinate_idx], s_i);
        }
    }
};

} // namespace bb
