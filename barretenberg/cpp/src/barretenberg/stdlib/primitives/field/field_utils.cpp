// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "./field_utils.hpp"
#include "./field.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"

namespace bb::stdlib {

template <typename Builder>
void validate_split_in_field(const field_t<Builder>& lo,
                             const field_t<Builder>& hi,
                             const size_t lo_bits,
                             const uint256_t& field_modulus)
{
    const size_t hi_bits = static_cast<size_t>(field_modulus.get_msb()) + 1 - lo_bits;

    // Split the field modulus at the same position
    const uint256_t r_lo = field_modulus.slice(0, lo_bits);
    const uint256_t r_hi = field_modulus.slice(lo_bits, field_modulus.get_msb() + 1);

    // Check if we need to borrow
    bool need_borrow = uint256_t(lo.get_value()) > r_lo;
    field_t<Builder> borrow =
        lo.is_constant() ? need_borrow : field_t<Builder>::from_witness(lo.get_context(), need_borrow);

    // directly call `create_new_range_constraint` to avoid creating an arithmetic gate
    if (!lo.is_constant()) {
        // We need to manually propagate the origin tag
        borrow.set_origin_tag(lo.get_origin_tag());
        lo.get_context()->create_new_range_constraint(borrow.get_witness_index(), 1, "borrow");
    }

    // Hi range check = r_hi - hi - borrow
    // Lo range check = r_lo - lo + borrow * 2^lo_bits
    field_t<Builder> hi_diff = (-hi + r_hi) - borrow;
    field_t<Builder> lo_diff = (-lo + r_lo) + (borrow * (uint256_t(1) << lo_bits));

    hi_diff.create_range_constraint(hi_bits);
    lo_diff.create_range_constraint(lo_bits);
}

template <typename Builder>
std::pair<field_t<Builder>, field_t<Builder>> split_unique(const field_t<Builder>& field,
                                                           const size_t lo_bits,
                                                           const bool skip_range_constraints)
{
    using native = typename field_t<Builder>::native;
    static constexpr size_t max_bits = native::modulus.get_msb() + 1;
    ASSERT(lo_bits < max_bits);

    const uint256_t value(field.get_value());
    const uint256_t lo_val = value.slice(0, lo_bits);
    const uint256_t hi_val = value.slice(lo_bits, max_bits);

    Builder* ctx = field.get_context();

    // If `field` is constant, return constants based on the native hi/lo values
    if (field.is_constant()) {
        return { field_t<Builder>(lo_val), field_t<Builder>(hi_val) };
    }

    // Create hi/lo witnesses
    auto lo = field_t<Builder>::from_witness(ctx, lo_val);
    auto hi = field_t<Builder>::from_witness(ctx, hi_val);

    // Component 1: Reconstruction constraint lo + hi * 2^lo_bits - field == 0
    const uint256_t shift = uint256_t(1) << lo_bits;
    auto zero = field_t<Builder>::from_witness_index(ctx, ctx->zero_idx);
    field_t<Builder>::evaluate_linear_identity(lo, hi * shift, -field, zero);

    // Set the origin tag for the limbs
    lo.set_origin_tag(field.get_origin_tag());
    hi.set_origin_tag(field.get_origin_tag());

    // Component 2: Field validation against bn254 scalar field modulus
    validate_split_in_field(lo, hi, lo_bits, native::modulus);

    // Component 3: Range constraints (unless skipped)
    if (!skip_range_constraints) {
        lo.create_range_constraint(lo_bits);
        // For bn254 scalar field, hi_bits = 254 - lo_bits
        const size_t hi_bits = 254 - lo_bits;
        hi.create_range_constraint(hi_bits);
    }

    return { lo, hi };
}

// Explicit instantiations for split_unique
template std::pair<field_t<bb::UltraCircuitBuilder>, field_t<bb::UltraCircuitBuilder>> split_unique(
    const field_t<bb::UltraCircuitBuilder>& field, const size_t lo_bits, const bool skip_range_constraints);
template std::pair<field_t<bb::MegaCircuitBuilder>, field_t<bb::MegaCircuitBuilder>> split_unique(
    const field_t<bb::MegaCircuitBuilder>& field, const size_t lo_bits, const bool skip_range_constraints);

// Explicit instantiations for validate_split_in_field
template void validate_split_in_field(const field_t<bb::UltraCircuitBuilder>& lo,
                                      const field_t<bb::UltraCircuitBuilder>& hi,
                                      const size_t lo_bits,
                                      const uint256_t& field_modulus);
template void validate_split_in_field(const field_t<bb::MegaCircuitBuilder>& lo,
                                      const field_t<bb::MegaCircuitBuilder>& hi,
                                      const size_t lo_bits,
                                      const uint256_t& field_modulus);

} // namespace bb::stdlib
