// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: 777717f6af324188ecd6bb68c3c86ee7befef94d}
// external_1:  { status: Complete, auditors: [@ed25519 (Spearbit)], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "./field.hpp"
#include <utility>

namespace bb::stdlib {

template <typename Builder> class field_t;

/**
 * @brief Split a bn254 scalar field element into unique lo and hi limbs
 *
 * @details Splits `field` into a low and high limb at the given bit index with:
 * 1. Reconstruction constraint: lo + hi * 2^lo_bits = field
 * 2. Modulus check: lo + hi * 2^lo_bits < bn254::ScalarField::modulus
 * 3. Range constraints: lo in [0, 2^lo_bits), hi in [0, 2^(254-lo_bits)) (unless skip_range_constraints = true)
 *
 * @note The combination of (2) and (3) establishes the uniqueness of the decomposition.
 *
 * @param field The bn254 scalar field element to split
 * @param lo_bits Number of bits for the low limb
 * @param skip_range_constraints If true, skip range constraints (use when they're implicit, e.g., in lookups)
 * @return std::pair<field_t<Builder>, field_t<Builder>> The (lo, hi) pair
 */
template <typename Builder>
std::pair<field_t<Builder>, field_t<Builder>> split_unique(const field_t<Builder>& field,
                                                           const size_t lo_bits,
                                                           const bool skip_range_constraints = false);

/**
 * @brief Validates that lo + hi * 2^lo_bits < field_modulus (assuming range constraints on lo and hi)
 * @details Uses a borrow-subtraction algorithm to check the inequality. Can be used in conjunction with range
 * constraints on lo and hi to establish a unique decomposition of a field element.
 *
 * @warning: This function only checks the borrow arithmetic; it does NOT apply the following range constraints which
 * are necessary to establish the above inequality in the integer sense:
 * - lo < 2^lo_bits
 * - hi < 2^hi_bits (where hi_bits = field_modulus.get_msb() + 1 - lo_bits)
 *
 * @pre The low lo_bits of field_modulus must be nonzero. If they are zero, the borrow arithmetic has
 * undefined behaviour.
 *
 * @param lo The low limb
 * @param hi The high limb
 * @param lo_bits The bit position at which the split occurred
 * @param field_modulus The field modulus to validate against
 */
template <typename Builder>
void validate_split_in_field_unsafe(const field_t<Builder>& lo,
                                    const field_t<Builder>& hi,
                                    const size_t lo_bits,
                                    const uint256_t& field_modulus);

/**
 * @brief Mark a field_t witness as used (for UltraBuilder only).
 *
 * @details For certain operations like assert_is_not_zero, we create intermediate witnesses
 * that are not part of the circuit's primary logic but are needed for constraints.
 * This function marks such witnesses as "used" to prevent them from being incorrectly
 * identified as unused. Uses raw witness_index to avoid normalization overhead.
 *
 * This is a no-op for non-Ultra builders.
 *
 * @param field The field element whose witness should be marked as used
 */
template <typename Builder> void mark_witness_as_used(const field_t<Builder>& field);

/**
 * @brief Return the raw witness_index of a field_t without triggering normalization.
 *
 * @details field_t::get_witness_index() calls normalize(), which creates a new witness + gate
 * when multiplicative_constant != 1 or additive_constant != 0. For diagnostic/analysis tooling
 * (e.g. static analyzer gate lookups) we need the underlying witness_index the field_t currently
 * points to, WITHOUT mutating the circuit. This helper provides that raw access via friend
 * declaration on field_t.
 *
 * @warning Returned index may correspond to a witness whose stored value is NOT the logical
 * value of this field_t (it's scaled by multiplicative_constant + additive_constant).
 * Caller must account for the scaling when interpreting results.
 *
 * @return witness_index (IS_CONSTANT if the field_t is a constant)
 */
template <typename Builder> uint32_t raw_witness_index(const field_t<Builder>& field);

} // namespace bb::stdlib
