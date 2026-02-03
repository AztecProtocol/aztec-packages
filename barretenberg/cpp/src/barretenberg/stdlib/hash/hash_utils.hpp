// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib/primitives/witness/witness.hpp"

namespace bb::stdlib::hash_utils {

/**
 * @brief Compute (a + b) mod 2^32 with circuit constraints.
 *
 * Given two field_t elements a and b, this function computes ((a + b) % 2^{32}).
 * The overflow is constrained to fit within `overflow_bits` bits.
 *
 * Constrains: result = a + b - overflow * 2^32, where overflow is range-checked to overflow_bits.
 *
 * @param a First 32-bit operand (should be constrained externally).
 * @param b Second 32-bit operand (should be constrained externally).
 * @param overflow_bits Number of bits for overflow range constraint. Must accommodate max(a + b) / 2^32.
 *                      For two 32-bit inputs, 1 bit suffices. For accumulated sums, use appropriately larger values.
 *
 * @warning Marked `unsafe` since the result is not explicitly range-constrained herein. Callers must ensure
 *          the result is constrained to 32 bits, either explicitly via create_range_constraint() or implicitly
 *          via downstream lookup tables that enforce the range.
 */
template <typename Builder>
field_t<Builder> add_normalize_unsafe(const field_t<Builder>& a, const field_t<Builder>& b, size_t overflow_bits)
{
    using field_pt = field_t<Builder>;
    using witness_pt = witness_t<Builder>;

    Builder* ctx = a.get_context() ? a.get_context() : b.get_context();

    uint256_t sum = a.get_value() + b.get_value();
    uint256_t normalized_sum = static_cast<uint32_t>(sum.data[0]); // lower 32 bits

    if (a.is_constant() && b.is_constant()) {
        return field_pt(ctx, normalized_sum);
    }

    fr overflow_value = fr((sum - normalized_sum) >> 32);
    field_pt overflow = witness_pt(ctx, overflow_value);

    field_pt result = a.add_two(b, overflow * field_pt(ctx, -fr(1ULL << 32ULL)));
    overflow.create_range_constraint(overflow_bits);
    return result;
}

} // namespace bb::stdlib::hash_utils
