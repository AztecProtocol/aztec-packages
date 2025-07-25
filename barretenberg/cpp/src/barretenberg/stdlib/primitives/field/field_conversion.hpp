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

static constexpr uint64_t NUM_LIMB_BITS = NUM_LIMB_BITS_IN_FIELD_SIMULATION;
static constexpr uint64_t TOTAL_BITS = 254;

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
    std::vector<fr<Builder>> result(2);
    result[0] = input.limbs[0];
    result[1] = input.limbs[1];
    return result;
}

template <typename Builder> inline std::vector<fr<Builder>> convert_grumpkin_fr_to_bn254_frs(const fq<Builder>& input)
{
    fr<Builder> shift(static_cast<uint256_t>(1) << NUM_LIMB_BITS);
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
    } else if constexpr (IsAnyOf<T, fq<Builder>> || IsAnyOf<T, goblin_field<Builder>>) {
        return Bn254FqParams::NUM_BN254_SCALARS;
    } else if constexpr (IsAnyOf<T, bn254_element<Builder>>) {
        using BaseField = bn254_element<Builder>::BaseField;
        return 2 * calc_num_bn254_frs<Builder, BaseField>();
    } else if constexpr (IsAnyOf<T, grumpkin_element<Builder>>) {
        return 2 * calc_num_bn254_frs<Builder, fr<Builder>>();
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
 * @todo https://github.com/AztecProtocol/barretenberg/issues/1065  optimise validate_on_curve and check points
 * reconstructed from the transcript
 */
template <typename Builder, typename T> T convert_from_bn254_frs(Builder& builder, std::span<const fr<Builder>> fr_vec)
{
    if constexpr (IsAnyOf<T, fr<Builder>>) {
        BB_ASSERT_EQ(fr_vec.size(), 1U);
        return fr_vec[0];
    } else if constexpr (IsAnyOf<T, fq<Builder>>) {
        BB_ASSERT_EQ(fr_vec.size(), 2U);
        fq<Builder> result(fr_vec[0], fr_vec[1]);
        return result;
    } else if constexpr (IsAnyOf<T, goblin_field<Builder>>) {
        BB_ASSERT_EQ(fr_vec.size(), 2U);
        goblin_field<Builder> result(fr_vec[0], fr_vec[1]);
        return result;
    } else if constexpr (IsAnyOf<T, bn254_element<Builder>>) {
        using BaseField = bn254_element<Builder>::BaseField;
        constexpr size_t BASE_FIELD_SCALAR_SIZE = calc_num_bn254_frs<Builder, BaseField>();
        BB_ASSERT_EQ(fr_vec.size(), 2 * BASE_FIELD_SCALAR_SIZE);
        bn254_element<Builder> result;

        result.x = convert_from_bn254_frs<Builder, BaseField>(builder, fr_vec.subspan(0, BASE_FIELD_SCALAR_SIZE));
        result.y = convert_from_bn254_frs<Builder, BaseField>(
            builder, fr_vec.subspan(BASE_FIELD_SCALAR_SIZE, BASE_FIELD_SCALAR_SIZE));

        // We have a convention that the group element is at infinity if both x/y coordinates are 0.
        // We also know that all bn254 field elements are 136-bit scalars.
        // Therefore we can do a cheap "iszero" check by checking the vector sum is 0
        fr<Builder> sum;
        for (size_t i = 0; i < BASE_FIELD_SCALAR_SIZE; i += 1) {
            sum = sum.add_two(fr_vec[2 * i], fr_vec[2 * i + 1]);
        }
        result.set_point_at_infinity(sum.is_zero());
        return result;
    } else if constexpr (IsAnyOf<T, grumpkin_element<Builder>>) {
        using BaseField = fr<Builder>;
        constexpr size_t BASE_FIELD_SCALAR_SIZE = calc_num_bn254_frs<Builder, BaseField>();
        BB_ASSERT_EQ(fr_vec.size(), 2 * BASE_FIELD_SCALAR_SIZE);
        fr<Builder> x =
            convert_from_bn254_frs<Builder, fr<Builder>>(builder, fr_vec.subspan(0, BASE_FIELD_SCALAR_SIZE));
        fr<Builder> y = convert_from_bn254_frs<Builder, fr<Builder>>(
            builder, fr_vec.subspan(BASE_FIELD_SCALAR_SIZE, BASE_FIELD_SCALAR_SIZE));
        grumpkin_element<Builder> result(x, y, x.is_zero() && y.is_zero());
        return result;
    } else {
        // Array or Univariate
        T val;
        constexpr size_t FieldScalarSize = calc_num_bn254_frs<Builder, typename T::value_type>();
        BB_ASSERT_EQ(fr_vec.size(), FieldScalarSize * std::tuple_size<T>::value);
        size_t i = 0;
        for (auto& x : val) {
            x = convert_from_bn254_frs<Builder, typename T::value_type>(
                builder, fr_vec.subspan(FieldScalarSize * i, FieldScalarSize));
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
        return convert_grumpkin_fr_to_bn254_frs(val);
    } else if constexpr (IsAnyOf<T, goblin_field<Builder>>) {
        return convert_goblin_fr_to_bn254_frs(val);
    } else if constexpr (IsAnyOf<T, bn254_element<Builder>>) {
        using BaseField = bn254_element<Builder>::BaseField;
        auto fr_vec_x = convert_to_bn254_frs<Builder, BaseField>(val.x);
        auto fr_vec_y = convert_to_bn254_frs<Builder, BaseField>(val.y);
        std::vector<fr<Builder>> fr_vec(fr_vec_x.begin(), fr_vec_x.end());
        fr_vec.insert(fr_vec.end(), fr_vec_y.begin(), fr_vec_y.end());
        return fr_vec;
    } else if constexpr (IsAnyOf<T, grumpkin_element<Builder>>) {
        using BaseField = fr<Builder>;
        auto fr_vec_x = convert_to_bn254_frs<Builder, BaseField>(val.x);
        auto fr_vec_y = convert_to_bn254_frs<Builder, BaseField>(val.y);
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
TargetType deserialize_from_frs(Builder& builder, std::span<fr<Builder>> elements, size_t& num_frs_read)
{
    size_t num_frs = calc_num_bn254_frs<Builder, TargetType>();
    BB_ASSERT_GTE(elements.size(), num_frs_read + num_frs);
    TargetType result = convert_from_bn254_frs<Builder, TargetType>(builder, elements.subspan(num_frs_read, num_frs));
    num_frs_read += num_frs;
    return result;
}

} // namespace bb::stdlib::field_conversion
