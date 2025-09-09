// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/common/assert.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include "barretenberg/stdlib/primitives/bigfield/goblin_field.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib/primitives/group/cycle_group.hpp"

namespace bb::stdlib::field_conversion {

template <typename Builder> using fr = field_t<Builder>;
template <typename Builder> using fq = bigfield<Builder, bb::Bn254FqParams>;
template <typename Builder> using bn254_element = element<Builder, fq<Builder>, fr<Builder>, curve::BN254::Group>;
template <typename Builder> using grumpkin_element = cycle_group<Builder>;

template <typename Builder> static void constrain_bigfield_limbs(const fr<Builder>& lo, const fr<Builder>& hi)
{
    static constexpr uint64_t NUM_LIMB_BITS = fq<Builder>::NUM_LIMB_BITS;
    static constexpr uint64_t NUM_LAST_LIMB_BITS = NUM_LIMB_BITS + fq<Builder>::NUM_LAST_LIMB_BITS; // 118
    static constexpr uint64_t NUM_BITS_IN_TWO_LIMBS = 2 * NUM_LIMB_BITS;                            // 136

    // range constrain low to 136 bits and hi to 118 bits
    lo.create_range_constraint(NUM_BITS_IN_TWO_LIMBS, "field_conversion: create_range_constraint");
    hi.create_range_constraint(NUM_LAST_LIMB_BITS, "field_conversion: create_range_constraint");
}
/**
 * @brief Check whether a point corresponds to (0, 0), the conventional representation of the point infinity.
 *
 * bn254: In the case of a bn254 point, the bigfield limbs (x_lo, x_hi, y_lo, y_hi) are range constrained, and their sum
 * is a non-negative integer not exceeding 2^138, i.e. it does not overflow the fq modulus, hence all limbs must be 0.
 *
 * Grumpkin: We are using the fact that (x^2 + y^2 = 0) has no non-trivial solutions on Grumpkin, as Grumpkin modulus is
 * == 3 mod 4.
 *
 * @return
 */
template <typename Builder, typename T> bool_t<Builder> check_point_at_infinity(std::span<const fr<Builder>> fr_vec)
{
    if constexpr (IsAnyOf<T, bn254_element<Builder>>) {
        // Sum the limbs and check whether the sum is 0
        return (fr<Builder>::accumulate(std::vector<fr<Builder>>(fr_vec.begin(), fr_vec.end())).is_zero());
    } else {
        // Efficiently compute ((x^2 + y^2) == 0)
        const fr<Builder> x_sqr = fr_vec[0].sqr();
        const fr<Builder> y = fr_vec[1];
        return (y.madd(y, x_sqr).is_zero());
    }
}

template <typename Builder> fq<Builder> convert_to_grumpkin_fr(Builder& builder, const fr<Builder>& f);

template <typename Builder, typename T> inline T convert_challenge(Builder& builder, const fr<Builder>& challenge)
{
    if constexpr (std::is_same_v<T, fr<Builder>>) {
        return challenge;
    } else if constexpr (std::is_same_v<T, fq<Builder>>) {
        return convert_to_grumpkin_fr(builder, challenge);
    }
}

template <typename Builder>
inline std::vector<fr<Builder>> convert_goblin_fr_to_bn254_frs(const goblin_field<Builder>& input)
{

    return { input.limbs[0], input.limbs[1] };
}

template <typename Builder> inline std::vector<fr<Builder>> convert_grumpkin_fr_to_bn254_frs(const fq<Builder>& input)
{
    static constexpr uint64_t NUM_LIMB_BITS = fq<Builder>::NUM_LIMB_BITS;

    static constexpr bb::fr shift(static_cast<uint256_t>(1) << NUM_LIMB_BITS);
    std::vector<fr<Builder>> result(2);
    result[0] = input.binary_basis_limbs[0].element + (input.binary_basis_limbs[1].element * shift);
    result[1] = input.binary_basis_limbs[2].element + (input.binary_basis_limbs[3].element * shift);
    return result;
}
/**
 * @brief Calculates the size of a types (in their native form) in terms of fr<Builder>s
 * @details We want to support the following types: fr<Builder>, fq<Builder>,
 * bn254_element<Builder>, grumpkin_element<Builder, bb::Univariate<FF, N>, std::array<FF, N>, for
 * FF = fr<Builder> or fq<Builder>, and N is arbitrary
 * @tparam Builder
 * @tparam T
 * @return constexpr size_t
 */
template <typename Builder, typename T> constexpr size_t calc_num_bn254_frs()
{
    if constexpr (IsAnyOf<T, fr<Builder>>) {
        return Bn254FrParams::NUM_BN254_SCALARS;
    } else if constexpr (IsAnyOf<T, fq<Builder>, goblin_field<Builder>>) {
        return Bn254FqParams::NUM_BN254_SCALARS;
    } else if constexpr (IsAnyOf<T, bn254_element<Builder>, grumpkin_element<Builder>>) {
        using BaseField = bn254_element<Builder>::BaseField;
        return 2 * calc_num_bn254_frs<Builder, BaseField>();
    } else {
        // Array or Univariate
        return calc_num_bn254_frs<Builder, typename T::value_type>() * (std::tuple_size<T>::value);
    }
}

/**
 * @brief Conversions from vector of fr<Builder> elements to transcript types.
 * @details We want to support the following types: fr<Builder>, fq<Builder>,
 * bn254_element<Builder>, grumpkin_element<Builder, bb::Univariate<FF, N>, std::array<FF, N>, for
 * FF = fr<Builder> or fq<Builder>, and N is arbitrary
 * @tparam Builder
 * @tparam T
 * @param builder
 * @param fr_vec
 * @return T
 * @todo https://github.com/AztecProtocol/barretenberg/issues/1065  optimize validate_on_curve and check points
 * reconstructed from the transcript
 */
template <typename Builder, typename T> T convert_from_bn254_frs(std::span<const fr<Builder>> fr_vec)
{
    using field_ct = fr<Builder>;
    using bigfield_ct = fq<Builder>;

    constexpr size_t expected_size = calc_num_bn254_frs<Builder, T>();
    BB_ASSERT_EQ(fr_vec.size(), expected_size);

    ASSERT(validate_context<Builder>(fr_vec));

    if constexpr (IsAnyOf<T, field_ct>) {
        // Case 1: input type matches the output type
        return fr_vec[0];
    } else if constexpr (IsAnyOf<T, bigfield_ct, goblin_field<Builder>>) {
        // Q: need to range constrain when Mega? Must be handled in Translator.
        // Cases 2 and 3: a bigfield/goblin_field element is reconstructed from low and high limbs.

        if constexpr (std::is_same_v<Builder, UltraCircuitBuilder>) {
            constrain_bigfield_limbs(fr_vec[0], fr_vec[1]);
        }

        return T(fr_vec[0], fr_vec[1]);
    } else if constexpr (IsAnyOf<T, bn254_element<Builder>, grumpkin_element<Builder>>) {
        // Case 4 and 5: Convert a vector of frs to a group element
        using basefield_ct = typename T::BaseField;

        constexpr size_t base_field_frs = expected_size / 2;

        basefield_ct x = convert_from_bn254_frs<Builder, basefield_ct>(fr_vec.subspan(0, base_field_frs));
        basefield_ct y = convert_from_bn254_frs<Builder, basefield_ct>(fr_vec.subspan(base_field_frs, base_field_frs));

        T out(x, y, check_point_at_infinity<Builder, T>(fr_vec));
        // Note that in the case of bn254 with Mega arithmetization, the check is delegated to ECCVM, see
        // `on_curve_check` in `ECCVMTranscriptRelationImpl`.
        out.validate_on_curve();
        return out;
    } else {
        // Array or Univariate
        T val;
        using element_type = typename T::value_type;
        const size_t scalar_frs = calc_num_bn254_frs<Builder, element_type>();

        size_t i = 0;
        for (auto& x : val) {
            x = convert_from_bn254_frs<Builder, element_type>(fr_vec.subspan(scalar_frs * i, scalar_frs));
            ++i;
        }
        return val;
    }
}

/**
 * @brief Conversion from transcript values to fr<Builder>s
 * @details We want to support the following types: bool, size_t, uint32_t, uint64_t, fr<Builder>, fq<Builder>,
 * bn254_element<Builder>, grumpkin_element<Builder,, bb::Univariate<FF, N>, std::array<FF,
 * N>, for FF = fr<Builder>/fq<Builder>, and N is arbitrary.
 * @tparam Builder
 * @tparam T
 * @param val
 * @return std::vector<fr<Builder>>
 */
template <typename Builder, typename T> std::vector<fr<Builder>> convert_to_bn254_frs(const T& val)
{
    if constexpr (IsAnyOf<T, fr<Builder>>) {
        std::vector<fr<Builder>> fr_vec{ val };
        return fr_vec;
    } else if constexpr (IsAnyOf<T, fq<Builder>>) {
        // Bigfield
        return convert_grumpkin_fr_to_bn254_frs(val);
    } else if constexpr (IsAnyOf<T, goblin_field<Builder>>) {
        return convert_goblin_fr_to_bn254_frs(val);
    } else if constexpr (IsAnyOf<T, bn254_element<Builder>, grumpkin_element<Builder>>) {
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1527): Consider handling point at infinity.
        using BaseField = T::BaseField;

        std::vector<fr<Builder>> fr_vec_x = convert_to_bn254_frs<Builder, BaseField>(val.x);
        std::vector<fr<Builder>> fr_vec_y = convert_to_bn254_frs<Builder, BaseField>(val.y);
        std::vector<fr<Builder>> fr_vec(fr_vec_x.begin(), fr_vec_x.end());
        fr_vec.insert(fr_vec.end(), fr_vec_y.begin(), fr_vec_y.end());
        return fr_vec;
    } else {
        // Array or Univariate
        std::vector<fr<Builder>> fr_vec;
        for (auto& x : val) {
            auto tmp_vec = convert_to_bn254_frs<Builder, typename T::value_type>(x);
            fr_vec.insert(fr_vec.end(), tmp_vec.begin(), tmp_vec.end());
        }
        return fr_vec;
    }
}

/**
 * @brief Deserialize an object of specified type from a buffer of field elements; update provided read count in place
 *
 * @tparam TargetType Type to reconstruct from buffer of field elements
 * @param builder
 * @param elements Buffer of field elements
 * @param num_frs_read Index at which to read into buffer
 */
template <typename TargetType, typename Builder>
TargetType deserialize_from_frs(std::span<fr<Builder>> elements, size_t& num_frs_read)
{
    constexpr size_t num_frs = calc_num_bn254_frs<Builder, TargetType>();
    BB_ASSERT_GTE(elements.size(), num_frs_read + num_frs);
    TargetType result = convert_from_bn254_frs<Builder, TargetType>(elements.subspan(num_frs_read, num_frs));
    num_frs_read += num_frs;
    return result;
}

} // namespace bb::stdlib::field_conversion
