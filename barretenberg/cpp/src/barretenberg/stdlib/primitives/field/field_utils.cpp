// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: 777717f6af324188ecd6bb68c3c86ee7befef94d}
// external_1:  { status: Complete, auditors: [@ed25519 (Spearbit)], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "./field_utils.hpp"
#include "./field.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"

namespace bb::stdlib {

template <typename Builder>
void validate_split_in_field_unsafe(const field_t<Builder>& lo,
                                    const field_t<Builder>& hi,
                                    const size_t lo_bits,
                                    const uint256_t& field_modulus)
{
    const size_t hi_bits = static_cast<size_t>(field_modulus.get_msb()) + 1 - lo_bits;

    // Split the field modulus at the same position
    const uint256_t r_lo = field_modulus.slice(0, lo_bits);
    const uint256_t r_hi = field_modulus.slice(lo_bits, field_modulus.get_msb() + 1);

    // Precondition: r_lo must be nonzero. If r_lo == 0, the borrow logic below breaks.
    // The fields of our concern (bn254 Fr/Fq, secp256k1 Fq) have nonzero low bits, so this
    // precondition holds for all current uses.
    BB_ASSERT(r_lo != 0, "validate_split_in_field_unsafe: low bits of modulus are zero, borrow logic is unsound");

    // Algorithm: Validate lo + hi * 2^lo_bits < field_modulus using borrow logic
    //
    // We want: value < modulus, i.e., value <= modulus - 1
    // We compute: hi_diff = r_hi - hi - borrow, lo_diff = (r_lo - 1) - lo + borrow * 2^lo_bits
    // Both must be in range [0, 2^{*_bits}) for the check to pass.
    //
    //   - If lo <= r_lo - 1: no borrow needed
    //   - If lo > r_lo - 1 (i.e., lo >= r_lo): set borrow=1, which reduces the allowed hi value by 1
    bool need_borrow = uint256_t(lo.get_value()) > r_lo - 1;

    // If both lo and hi are constant, the validation is straightforward
    const bool both_constant = lo.is_constant() && hi.is_constant();
    Builder* ctx = validate_context(lo.get_context(), hi.get_context());

    field_t<Builder> borrow = both_constant
                                  ? need_borrow
                                  : field_t<Builder>::from_witness(ctx, typename field_t<Builder>::native(need_borrow));

    // Constrain borrow to be boolean (0 or 1) unless both inputs are constant.
    if (!both_constant) {
        // We need to manually propagate the origin tag
        borrow.set_origin_tag(lo.is_constant() ? hi.get_origin_tag() : lo.get_origin_tag());
        ctx->create_small_range_constraint(borrow.get_witness_index(), 1, "borrow");
    }

    // Hi range check = r_hi - hi - borrow
    // Lo range check = (r_lo - 1) - lo + borrow * 2^lo_bits
    field_t<Builder> hi_diff = (-hi + r_hi) - borrow;
    field_t<Builder> lo_diff = (-lo + (r_lo - fr(1))) + (borrow * (uint256_t(1) << lo_bits));

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
    BB_ASSERT(lo_bits < max_bits);

    const uint256_t value(field.get_value());
    const uint256_t lo_val = value.slice(0, lo_bits);
    const uint256_t hi_val = value.slice(lo_bits, max_bits);

    Builder* ctx = field.get_context();

    // If `field` is constant, return constants based on the native hi/lo values
    if (field.is_constant()) {
        return { field_t<Builder>(lo_val), field_t<Builder>(hi_val) };
    }

    // Create hi/lo witnesses
    auto lo = field_t<Builder>::from_witness(ctx, typename field_t<Builder>::native(lo_val));
    auto hi = field_t<Builder>::from_witness(ctx, typename field_t<Builder>::native(hi_val));

    // Component 1: Reconstruction constraint lo + hi * 2^lo_bits - field == 0
    const uint256_t shift = uint256_t(1) << lo_bits;
    auto zero = field_t<Builder>::from_witness_index(ctx, ctx->zero_idx());
    field_t<Builder>::evaluate_linear_identity(lo, hi * shift, -field, zero);

    // Set the origin tag for the limbs
    lo.set_origin_tag(field.get_origin_tag());
    hi.set_origin_tag(field.get_origin_tag());

    // Component 2: Field validation against bn254 scalar field modulus
    // Note: We use _unsafe variant because Component 3 applies range constraints (unless explicitly skipped). When
    // range constraints are skipped, caller must ensure they are applied elsewhere.
    validate_split_in_field_unsafe(lo, hi, lo_bits, native::modulus);

    // Component 3: Range constraints (unless skipped)
    if (!skip_range_constraints) {
        lo.create_range_constraint(lo_bits);
        const size_t hi_bits = max_bits - lo_bits;
        hi.create_range_constraint(hi_bits);
    }

    return { lo, hi };
}

template <typename Builder> void mark_witness_as_used(const field_t<Builder>& field)
{
    if (!field.is_constant()) {
        // Use raw witness_index to avoid normalization overhead
        field.get_context()->update_used_witnesses(field.witness_index);
    }
}

// Explicit instantiations for split_unique
template std::pair<field_t<bb::UltraCircuitBuilder>, field_t<bb::UltraCircuitBuilder>> split_unique(
    const field_t<bb::UltraCircuitBuilder>& field, const size_t lo_bits, const bool skip_range_constraints);
template std::pair<field_t<bb::MegaCircuitBuilder>, field_t<bb::MegaCircuitBuilder>> split_unique(
    const field_t<bb::MegaCircuitBuilder>& field, const size_t lo_bits, const bool skip_range_constraints);

// Explicit instantiations for validate_split_in_field_unsafe
template void validate_split_in_field_unsafe(const field_t<bb::UltraCircuitBuilder>& lo,
                                             const field_t<bb::UltraCircuitBuilder>& hi,
                                             const size_t lo_bits,
                                             const uint256_t& field_modulus);
template void validate_split_in_field_unsafe(const field_t<bb::MegaCircuitBuilder>& lo,
                                             const field_t<bb::MegaCircuitBuilder>& hi,
                                             const size_t lo_bits,
                                             const uint256_t& field_modulus);

// Explicit instantiations for mark_witness_as_used
template void mark_witness_as_used(const field_t<bb::UltraCircuitBuilder>& field);
template void mark_witness_as_used(const field_t<bb::MegaCircuitBuilder>& field);

template <typename Builder> uint32_t raw_witness_index(const field_t<Builder>& field)
{
    return field.witness_index;
}

template uint32_t raw_witness_index(const field_t<bb::UltraCircuitBuilder>& field);
template uint32_t raw_witness_index(const field_t<bb::MegaCircuitBuilder>& field);

} // namespace bb::stdlib
