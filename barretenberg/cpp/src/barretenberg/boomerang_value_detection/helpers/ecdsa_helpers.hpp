/**
 * @file ecdsa_helpers.hpp
 * @brief Helper functions for ECDSA constraint validation in the static analyzer
 * @details Validates that ECDSA input bytes have conditional_assign + 8-bit range constraints,
 * and that the result witness is boolean-constrained and participates in conditional_assign + assert_equal.
 * We intentionally skip tracing ECDSA verification internals (biggroup/bigcurve) — same approach as MSM.
 */
#pragma once

#include "barretenberg/boomerang_value_detection/helpers/bool_t_helpers.hpp"
#include "barretenberg/boomerang_value_detection/helpers/field_t_helpers.hpp"
#include "barretenberg/boomerang_value_detection/helpers/range_helpers.hpp"
#include "barretenberg/dsl/acir_format/ecdsa_constraints.hpp"
#include "barretenberg/ecc/curves/secp256k1/secp256k1.hpp"
#include "barretenberg/ecc/curves/secp256r1/secp256r1.hpp"

namespace cdg {

using namespace acir_format;

/**
 * @brief Compute the default byte values for hashed_message, r, or s arrays
 * @details When predicate is false: r = s = H(m) = 1, meaning idx==0 is 1, rest are 0
 */
template <typename FF> std::array<FF, 32> compute_scalar_default_bytes()
{
    std::array<FF, 32> defaults;
    defaults[0] = FF(1);
    for (size_t i = 1; i < 32; i++) {
        defaults[i] = FF(0);
    }
    return defaults;
}

/**
 * @brief Compute the default byte values for pub_x or pub_y
 * @details When predicate is false: public key = 2 * Generator (curve-dependent)
 * @param curve_type The curve type (SECP256K1 or SECP256R1)
 * @param is_x true for x coordinate, false for y coordinate
 */
template <typename FF> std::array<FF, 32> compute_pubkey_default_bytes(bb::CurveType curve_type, bool is_x)
{
    std::array<uint8_t, 32> buffer;
    if (curve_type == bb::CurveType::SECP256K1) {
        auto default_pt = bb::secp256k1::g1::affine_element(bb::secp256k1::g1::one + bb::secp256k1::g1::one);
        if (is_x) {
            bb::secp256k1::fq::serialize_to_buffer(default_pt.x, buffer.data());
        } else {
            bb::secp256k1::fq::serialize_to_buffer(default_pt.y, buffer.data());
        }
    } else {
        auto default_pt = bb::secp256r1::g1::affine_element(bb::secp256r1::g1::one + bb::secp256r1::g1::one);
        if (is_x) {
            bb::secp256r1::fq::serialize_to_buffer(default_pt.x, buffer.data());
        } else {
            bb::secp256r1::fq::serialize_to_buffer(default_pt.y, buffer.data());
        }
    }
    std::array<FF, 32> defaults;
    for (size_t i = 0; i < 32; i++) {
        defaults[i] = FF(buffer[i]);
    }
    return defaults;
}

/**
 * @brief Validate that ECDSA input byte fields have conditional_assign + 8-bit range constraints
 * @details For non-constant predicate: verifies conditional_assign exists for each field
 *          (using get_the_result_of_conditional_assign_gate), then checks 8-bit range constraint
 *          via copy on the conditional_assign result (using is_range_constrained_via_copy from range_helpers.hpp).
 *          For constant predicate (true): verifies 8-bit range constraint exists via copy.
 *
 * @param witness_indices Array of 32 witness indices (byte fields)
 * @param predicate_field The predicate field
 * @param default_values Array of 32 default values used in conditional_assign when predicate is false
 * @return true if all bytes are properly constrained
 */
template <typename FF, typename CircuitBuilder>
bool is_ecdsa_input_bytes_constrained(StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                      CircuitBuilder& builder,
                                      const std::array<uint32_t, 32>& witness_indices,
                                      const Field<CircuitBuilder>& predicate_field,
                                      const std::array<FF, 32>& default_values)
{
    using field_ct = bb::stdlib::field_t<CircuitBuilder>;

    for (size_t i = 0; i < 32; i++) {
        uint32_t field_idx = witness_indices[i];
        auto input_field = Field<CircuitBuilder>{ field_idx, field_ct::from_witness_index(&builder, field_idx) };

        uint32_t byte_source_idx = field_idx;

        if (!predicate_field.witness.is_constant()) {
            // Non-constant predicate: verify conditional_assign exists
            auto rhs_field = Field<CircuitBuilder>{ bb::stdlib::IS_CONSTANT, field_ct(default_values[i]) };

            auto ca_result = get_the_result_of_conditional_assign_gate<FF>(
                analyzer, builder, predicate_field, input_field, rhs_field);
            if (!ca_result.has_value()) {
                log_error("is_ecdsa_input_bytes_constrained: conditional_assign not found for byte ",
                          i,
                          " witness=",
                          field_idx);
                return false;
            }
            byte_source_idx = ca_result->witness_index;
        }

        // Verify 8-bit range constraint exists.
        // The chain is: byte_source_idx --[copy]--> W_byte --[big_add_gate]--> limb_idx --[range_lists[255]]
        // is_in_range_list checks direct membership; is_range_constrained_via_limb_lookup traces
        // the arithmetic link from range list limbs back to our witness via real_variable_index.
        if (!is_in_range_list<FF>(builder, byte_source_idx, 255) &&
            !is_range_constrained_via_limb_lookup<FF>(analyzer, builder, byte_source_idx, 255)) {
            log_error("is_ecdsa_input_bytes_constrained: 8-bit range constraint not found for byte ",
                      i,
                      " witness=",
                      byte_source_idx);
            return false;
        }
    }
    return true;
}

/**
 * @brief Validate that ECDSA result is boolean-constrained and participates in
 *        conditional_assign + assert_equal
 * @details Traces the gate chain from:
 *   bool_ct result(result_field);  // creates boolean gate (line 103)
 *   signature_result.assert_equal(bool_ct::conditional_assign(predicate, result, signature_result));  // line 118
 *
 * For non-constant predicate, bool_t::conditional_assign creates:
 *   1. AND gate: predicate && result → and1 (via get_and_result)
 *   2. AND gate: !predicate && signature_result → and2 (via find_and_unknown_rhs to discover signature_result)
 *   3. OR gate: and1 || and2 → or_result (via get_or_result)
 *   4. assert_equal: signature_result == or_result (verify copy constraint)
 *
 * For constant predicate (true):
 *   conditional_assign returns result directly, then assert_equal creates copy constraint
 */
template <typename FF, typename CircuitBuilder>
bool is_ecdsa_result_constrained(StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                 CircuitBuilder& builder,
                                 uint32_t result_idx,
                                 const Field<CircuitBuilder>& predicate_field)
{
    using bool_ct = bb::stdlib::bool_t<CircuitBuilder>;

    // Step 1: Verify boolean gate on result (from bool_ct result(result_field) at ecdsa_constraints.cpp:103)
    if (!is_boolean_gate_exists<FF>(analyzer, builder, result_idx)) {
        log_error("is_ecdsa_result_constrained: boolean gate not found for result=", result_idx);
        return false;
    }

    auto result_bool = Bool<CircuitBuilder>{ result_idx, bool_ct::from_witness_index_unsafe(&builder, result_idx) };
    auto predicate_bool = Bool<CircuitBuilder>{ predicate_field.witness_index, bool_ct(predicate_field.witness) };

    if (predicate_field.witness.is_constant()) {
        // Constant predicate (must be true per BB_ASSERT in ecdsa_constraints.cpp:94)
        // conditional_assign returns result.normalize() → then assert_equal creates copy constraint
        auto normalized = get_normalization_result<FF>(analyzer, builder, result_bool);
        if (!normalized.has_value()) {
            log_error("is_ecdsa_result_constrained: normalization not found for result (constant predicate)");
            return false;
        }
        // Verify assert_equal created a copy constraint on the normalized result
        if (analyzer.to_real(normalized->witness_index) == normalized->witness_index) {
            log_error("is_ecdsa_result_constrained: assert_equal not found for result (constant predicate)");
            return false;
        }
        return true;
    }

    // Step 2: Find AND gate 1: predicate && result (using get_and_result from bool_t_helpers.hpp)
    auto and1 = get_and_result<FF>(analyzer, builder, predicate_bool, result_bool);
    if (!and1.has_value()) {
        log_error("is_ecdsa_result_constrained: AND gate (predicate && result) not found");
        return false;
    }

    // Step 3: Find AND gate 2: !predicate && signature_result
    // signature_result is unknown — use find_and_unknown_rhs to discover it
    auto inverted_predicate = Bool<CircuitBuilder>{ predicate_bool.witness_index, !predicate_bool.witness };
    auto and2_pair = find_and_unknown_rhs<FF>(analyzer, builder, inverted_predicate);
    if (!and2_pair.has_value()) {
        log_error("is_ecdsa_result_constrained: AND gate (!predicate && signature_result) not found");
        return false;
    }
    auto [signature_result_bool, and2] = *and2_pair;

    // Step 4: Find OR gate: and1 || and2 (using get_or_result from bool_t_helpers.hpp)
    auto or_result = get_or_result<FF>(analyzer, builder, *and1, and2);
    if (!or_result.has_value()) {
        log_error("is_ecdsa_result_constrained: OR gate (and1 || and2) not found");
        return false;
    }

    // Step 5: Verify assert_equal (copy constraint) on the OR result
    // signature_result.assert_equal(ca_output) creates a copy constraint
    if (analyzer.to_real(or_result->witness_index) == or_result->witness_index) {
        log_error("is_ecdsa_result_constrained: assert_equal not found for OR result=", or_result->witness_index);
        return false;
    }

    return true;
}

} // namespace cdg
