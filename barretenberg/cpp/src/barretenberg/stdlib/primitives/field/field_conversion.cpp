// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/stdlib/primitives/field/field_conversion.hpp"
namespace bb::stdlib::field_conversion {

/**
 * @brief Converts an in-circuit `fr`element to an `fq`, i.e. `field_t` --> `bigfield`.
 *
 * @details Our circuit builders are `fr`-native, which results in challenges being `field_t` elements. However,
 * ECCVMRecursiveVerifier and IPA Recursive Verification need challenges that are `bigfield` elements. We do this in
 * a similar fashion to the `convert_from_bn254_frs` function that converts to a `bigfield`. We split the `field_t`
 * into two pieces, one that is the 136 lower bits and one that is the 118 higher bits, assert the correctness of the
 * decomposition, and invoke the `bigfield` constructor.
 * @tparam Builder
 */
template <typename Builder> fq<Builder> convert_to_grumpkin_fr(Builder& builder, const fr<Builder>& fr_element)
{
    ASSERT(!fr_element.is_constant());
    static constexpr uint64_t NUM_LIMB_BITS = fq<Builder>::NUM_LIMB_BITS;

    constexpr uint64_t NUM_BITS_IN_TWO_LIMBS = 2 * NUM_LIMB_BITS; // 136

    constexpr uint256_t shift = (uint256_t(1) << NUM_BITS_IN_TWO_LIMBS);
    // split f into low_bits_in and high_bits_in
    constexpr uint256_t LIMB_MASK = shift - 1; // mask for upper 128 bits
    const uint256_t value = fr_element.get_value();
    const uint256_t low_val = static_cast<uint256_t>(value & LIMB_MASK);
    const uint256_t hi_val = static_cast<uint256_t>(value >> NUM_BITS_IN_TWO_LIMBS);

    fr<Builder> low{ witness_t<Builder>(&builder, low_val) };
    fr<Builder> hi{ witness_t<Builder>(&builder, hi_val) };

    BB_ASSERT_EQ(static_cast<uint256_t>(low_val) + (static_cast<uint256_t>(hi_val) << NUM_BITS_IN_TWO_LIMBS),
                 value,
                 "field_conversion: limb decomposition");
    // check the decomposition low + hi * 2^136 = value in circuit
    const fr<Builder> zero = fr<Builder>::from_witness_index(&builder, builder.zero_idx);
    fr<Builder>::evaluate_linear_identity(hi * shift, low, -fr_element, zero);

    return fq<Builder>(low, hi);
}

template fq<UltraCircuitBuilder> convert_to_grumpkin_fr<UltraCircuitBuilder>(UltraCircuitBuilder& builder,
                                                                             const fr<UltraCircuitBuilder>& f);
template fq<MegaCircuitBuilder> convert_to_grumpkin_fr<MegaCircuitBuilder>(MegaCircuitBuilder& builder,
                                                                           const fr<MegaCircuitBuilder>& f);

} // namespace bb::stdlib::field_conversion
