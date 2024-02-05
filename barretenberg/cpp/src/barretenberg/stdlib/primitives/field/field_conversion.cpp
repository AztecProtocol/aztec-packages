#include "barretenberg/stdlib/primitives/field/field_conversion.hpp"

namespace bb::stdlib::field_conversion {

/**
 * @brief Converts a challenge to a fq<Builder>
 * @details We sometimes need challenges that are a bb::fq element, so we need to convert the bb::fr challenge to a
 * bb::fq type. We do this by in a similar fashion to the convert_from_bn254_frs function that converts to a
 * fq<Builder>. In fact, we do call that function that the end, but we first have to split the fr<Builder> into two
 * pieces, one that is the 136 lower bits and one that is the 118 higher bits. Then, we can split these two pieces into
 * their bigfield limbs through convert_from_bn254_frs, which is actually just a bigfield constructor that takes in two
 * two-limb frs.
 *
 * @tparam Builder
 */
template <typename Builder>
fq<Builder> convert_challenge(Builder& builder, const fr<Builder>& f, fq<Builder>* /*unused*/)
{
    constexpr uint64_t NUM_CONVERSION_TWO_LIMB_BITS = 2 * NUM_CONVERSION_LIMB_BITS;     // 136
    constexpr uint64_t UPPER_TWO_LIMB_BITS = TOTAL_BITS - NUM_CONVERSION_TWO_LIMB_BITS; // 118
    constexpr uint256_t shift = (uint256_t(1) << NUM_CONVERSION_TWO_LIMB_BITS);
    // split f into low_bits_in and high_bits_in
    constexpr uint256_t LIMB_MASK = shift - 1; // mask for upper 128 bits
    const uint256_t value = f;
    const uint256_t low_val = static_cast<uint256_t>(value & LIMB_MASK);
    const uint256_t hi_val = static_cast<uint256_t>(value >> NUM_CONVERSION_TWO_LIMB_BITS);

    fr<Builder> low{ witness_t<Builder>(&builder, low_val) };
    fr<Builder> hi{ witness_t<Builder>(&builder, hi_val) };
    // range constrain low to 136 bits and hi to 118 bits
    builder.range_constrain_two_limbs(
        low.witness_index, hi.witness_index, NUM_CONVERSION_TWO_LIMB_BITS, UPPER_TWO_LIMB_BITS);

    ASSERT(static_cast<uint256_t>(low_val) + (static_cast<uint256_t>(hi_val) << NUM_CONVERSION_TWO_LIMB_BITS) == value);
    // checks this decomposition low + hi * 2^64 = value with an add gate
    fr<Builder>::evaluate_linear_identity(low, hi * shift, -f, fr<Builder>(0));

    std::vector<fr<Builder>> fr_vec{ low, hi };
    return convert_from_bn254_frs<Builder, fq<Builder>>(builder, fr_vec);
}

} // namespace bb::stdlib::field_conversion
