/**
 * @file cycle_scalar_helpers.hpp
 * @brief Helper functions for cycle_scalar validation
 * @details Verifies that cycle_scalar field validation (validate_split_in_field_unsafe) gates exist.
 * Every helper mirrors a specific stdlib operation and uses FilterFunctionBuilder to find matching gates.
 */
#pragma once

#include "barretenberg/boomerang_value_detection/helpers/field_t_helpers.hpp"
#include "barretenberg/boomerang_value_detection/helpers/filter_function_builder.hpp"
#include "barretenberg/boomerang_value_detection/helpers/range_helpers.hpp"
#include "barretenberg/dsl/acir_format/witness_constant.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/stdlib/primitives/group/cycle_scalar.hpp"

namespace cdg {

using namespace acir_format;

/**
 * @brief Verify that validate_split_in_field_unsafe gates exist for cycle_scalar lo/hi
 * @details mirrors validate_split_in_field_unsafe(lo, hi, LO_BITS, ScalarField::modulus)
 *
 * The function creates:
 *   1. borrow witness + create_small_range_constraint(borrow, 1)
 *   2. hi_diff = (-hi + r_hi) - borrow  →  add_gate
 *   3. lo_diff = (-lo + (r_lo - 1)) + (borrow * 2^lo_bits)  →  add_gate
 *   4. hi_diff.create_range_constraint(hi_bits)  →  decompose chain
 *   5. lo_diff.create_range_constraint(lo_bits)  →  decompose chain
 *
 * We trace the gates by:
 *   - Using FilterFunctionBuilder with known selectors (computed from the modulus constants) to find
 *     the hi_diff add_gate, extracting borrow (w_r) and hi_diff (w_o)
 *   - Similarly finding lo_diff add_gate
 *   - Validating range constraints on hi_diff and lo_diff via validate_decompose_chain
 *
 * @param analyzer The analyzer
 * @param builder The builder
 * @param lo The lo field (after conditional_assign processing)
 * @param hi The hi field (after conditional_assign processing)
 * @return True if all validate_split_in_field_unsafe gates exist
 */
template <typename FF, typename CircuitBuilder>
bool is_validate_split_in_field_unsafe_constrained(StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                                   CircuitBuilder& builder,
                                                   const Field<CircuitBuilder>& lo,
                                                   const Field<CircuitBuilder>& hi)
{
    using ScalarField = bb::grumpkin::fr;

    if (lo.witness.is_constant() && hi.witness.is_constant()) {
        return true;
    }

    constexpr size_t LO_BITS = bb::stdlib::cycle_scalar<CircuitBuilder>::LO_BITS;   // 128
    constexpr size_t HI_BITS = bb::stdlib::cycle_scalar<CircuitBuilder>::HI_BITS;   // 126
    constexpr size_t NUM_BITS = bb::stdlib::cycle_scalar<CircuitBuilder>::NUM_BITS; // 254
    const uint256_t r_lo = ScalarField::modulus.slice(0, LO_BITS);
    const uint256_t r_hi = ScalarField::modulus.slice(LO_BITS, NUM_BITS);

    // --- Step 0: Normalize lo and hi if needed ---
    // When scalars are constant with a non-constant predicate, conditional_assign produces
    // field_ts with non-trivial mul/add (e.g., mul=scalar_value, add=0). The stdlib normalizes
    // these before creating the hi_diff/lo_diff arithmetic gates (via get_witness_index() →
    // normalize() in batch_mul's straus_scalar_slices). We must find the normalization gates
    // to get the actual wire indices used in the diff gates.
    auto lo_norm = get_field_normalization_result<FF>(analyzer, builder, lo);
    if (!lo_norm.has_value()) {
        log_error("is_validate_split_in_field_unsafe_constrained: failed to normalize lo");
        return false;
    }
    auto hi_norm = get_field_normalization_result<FF>(analyzer, builder, hi);
    if (!hi_norm.has_value()) {
        log_error("is_validate_split_in_field_unsafe_constrained: failed to normalize hi");
        return false;
    }

    // After normalization, lo_norm and hi_norm have mul=1, add=0
    auto lo_n = *lo_norm;
    auto hi_n = *hi_norm;

    // --- Step 1: Find the hi_diff add_gate and extract borrow ---
    // hi_diff = (-hi + r_hi) - borrow
    // After normalization, hi has mul=1, add=0, so the gate selectors are:
    //   w_l=hi_norm_idx, q_1=-1, w_r=borrow_idx, q_2=-1, w_o=hi_diff_idx, q_3=-1, q_c=r_hi
    auto hi_diff_filter = FilterFunctionBuilder<CircuitBuilder, FF>(builder)
                              .set_w_l(hi_n.witness_index)
                              .set_w_4(builder.zero_idx())
                              .set_q_m(FF::zero())
                              .set_q_1(-hi_n.witness.multiplicative_constant)
                              .set_q_2(FF::neg_one())
                              .set_q_3(FF::neg_one())
                              .set_q_c(FF(r_hi) - hi_n.witness.additive_constant)
                              .set_q_4(FF::zero())
                              .set_q_arith(FF::one());

    auto hi_gates = analyzer.get_variable_gates(hi_n.witness_index);
    auto hi_diff_gate = hi_diff_filter.filter_gates(hi_gates, analyzer);
    if (!hi_diff_gate.has_value()) {
        log_error("is_validate_split_in_field_unsafe_constrained: no hi_diff add_gate found for hi=",
                  hi_n.witness_index);
        return false;
    }

    auto borrow_idx = get_w_r_at(builder, *hi_diff_gate);
    auto hi_diff_idx = get_w_o_at(builder, *hi_diff_gate);

    // --- Step 2: Validate borrow is range-constrained to 1 bit ---
    if (!validate_range_constraint<FF>(analyzer, builder, borrow_idx, 1)) {
        log_error("is_validate_split_in_field_unsafe_constrained: borrow not range-constrained, borrow=", borrow_idx);
        return false;
    }

    // --- Step 3: Validate hi_diff is range-constrained to HI_BITS ---
    if (!validate_range_constraint<FF>(analyzer, builder, hi_diff_idx, HI_BITS)) {
        log_error("is_validate_split_in_field_unsafe_constrained: hi_diff not range-constrained, hi_diff=",
                  hi_diff_idx);
        return false;
    }

    // --- Step 4: Find the lo_diff add_gate ---
    // lo_diff = (-lo + (r_lo - 1)) + (borrow * 2^lo_bits)
    // After normalization, lo has mul=1, add=0, so the gate selectors are:
    //   w_l=lo_norm_idx, q_1=-1, w_r=borrow_idx, q_2=2^lo_bits, w_o=lo_diff_idx, q_3=-1, q_c=r_lo-1
    const uint256_t borrow_shift = uint256_t(1) << LO_BITS;

    auto lo_diff_filter = FilterFunctionBuilder<CircuitBuilder, FF>(builder)
                              .set_w_l(lo_n.witness_index)
                              .set_w_r(borrow_idx)
                              .set_w_4(builder.zero_idx())
                              .set_q_m(FF::zero())
                              .set_q_1(-lo_n.witness.multiplicative_constant)
                              .set_q_2(FF(borrow_shift))
                              .set_q_3(FF::neg_one())
                              .set_q_c(FF(r_lo - 1) - lo_n.witness.additive_constant)
                              .set_q_4(FF::zero())
                              .set_q_arith(FF::one());

    auto lo_gates = analyzer.get_variable_gates(lo_n.witness_index);
    auto lo_diff_gate = lo_diff_filter.filter_gates(lo_gates, analyzer);
    if (!lo_diff_gate.has_value()) {
        log_error("is_validate_split_in_field_unsafe_constrained: no lo_diff add_gate found for lo=",
                  lo_n.witness_index);
        return false;
    }

    auto lo_diff_idx = get_w_o_at(builder, *lo_diff_gate);

    // --- Step 5: Validate lo_diff is range-constrained to LO_BITS ---
    if (!validate_range_constraint<FF>(analyzer, builder, lo_diff_idx, LO_BITS)) {
        log_error("is_validate_split_in_field_unsafe_constrained: lo_diff not range-constrained, lo_diff=",
                  lo_diff_idx);
        return false;
    }

    return true;
}

/**
 * @brief Verify that a cycle_scalar is properly constrained
 * @details mirrors to_grumpkin_scalar + cycle_scalar(lo, hi) + validate_scalar_is_in_field
 *
 * Checks:
 *   1. If predicate is non-constant: conditional_assign gates exist for lo and hi
 *   2. validate_split_in_field_unsafe gates exist (borrow, hi_diff, lo_diff range constraints)
 *
 * @param analyzer The analyzer
 * @param builder The builder
 * @param scalar_lo The low limb of the scalar (WitnessOrConstant)
 * @param scalar_hi The high limb of the scalar (WitnessOrConstant)
 * @param predicate The predicate (WitnessOrConstant)
 * @return True if the cycle_scalar is properly constrained
 */
template <typename FF, typename CircuitBuilder>
bool is_cycle_scalar_constrained(StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                 CircuitBuilder& builder,
                                 const WitnessOrConstant<FF>& scalar_lo,
                                 const WitnessOrConstant<FF>& scalar_hi,
                                 const WitnessOrConstant<FF>& predicate)
{
    using field_ct = bb::stdlib::field_t<CircuitBuilder>;

    auto lo_field = witness_or_constant_to_field<FF>(scalar_lo, builder);
    auto hi_field = witness_or_constant_to_field<FF>(scalar_hi, builder);
    auto predicate_field = witness_or_constant_to_field<FF>(predicate, builder);

    // If predicate is non-constant, to_grumpkin_scalar applies conditional_assign:
    //   lo = conditional_assign(predicate, lo, 1)
    //   hi = conditional_assign(predicate, hi, 0)
    if (!predicate_field.witness.is_constant()) {
        auto lo_after_cond = get_the_result_of_conditional_assign_gate<FF>(
            analyzer,
            builder,
            predicate_field,
            lo_field,
            Field<CircuitBuilder>{ bb::stdlib::IS_CONSTANT, field_ct(FF::one()) });
        if (!lo_after_cond.has_value()) {
            log_error("is_cycle_scalar_constrained: failed to find conditional_assign for lo");
            return false;
        }
        lo_field = *lo_after_cond;

        auto hi_after_cond = get_the_result_of_conditional_assign_gate<FF>(
            analyzer,
            builder,
            predicate_field,
            hi_field,
            Field<CircuitBuilder>{ bb::stdlib::IS_CONSTANT, field_ct(FF::zero()) });
        if (!hi_after_cond.has_value()) {
            log_error("is_cycle_scalar_constrained: failed to find conditional_assign for hi");
            return false;
        }
        hi_field = *hi_after_cond;
    }

    // If both lo and hi are constant, the scalar is fully constant — no gates needed
    if (lo_field.witness.is_constant() && hi_field.witness.is_constant()) {
        return true;
    }

    // Verify validate_split_in_field_unsafe gates
    return is_validate_split_in_field_unsafe_constrained<FF>(analyzer, builder, lo_field, hi_field);
}

} // namespace cdg
