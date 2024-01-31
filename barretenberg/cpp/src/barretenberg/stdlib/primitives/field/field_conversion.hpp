#pragma once

#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"

namespace bb::stdlib::field_conversion {

template <typename Builder> using fr = field_t<Builder>;
template <typename Builder> using fq = bigfield<Builder, bb::Bn254FqParams>;
template <typename Builder> using bn254_element = element<Builder, fq<Builder>, fr<Builder>, curve::BN254::Group>;

static constexpr uint64_t NUM_CONVERSION_LIMB_BITS = 68;
static constexpr uint64_t TOTAL_BITS = 254;

template <typename Builder>
fr<Builder> convert_challenge(const Builder& /*unused*/, const fr<Builder>& f, fr<Builder>* /*unused*/)
{
    return f;
}

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

template <typename Builder, typename T> T convert_challenge(Builder& builder, const fr<Builder>& challenge)
{
    return convert_challenge(builder, challenge, static_cast<T*>(nullptr));
}

template <typename Builder> std::array<fr<Builder>, 2> convert_grumpkin_fr_to_bn254_frs(const fq<Builder>& input)
{
    fr<Builder> shift(static_cast<uint256_t>(1) << NUM_CONVERSION_LIMB_BITS);
    std::array<fr<Builder>, 2> result;
    result[0] = input.binary_basis_limbs[0].element + (input.binary_basis_limbs[1].element * shift);
    result[1] = input.binary_basis_limbs[2].element + (input.binary_basis_limbs[3].element * shift);
    return result;
}
/**
 * @brief Calculates the size of a types (in their native form) in terms of fr<Builder>s
 * @details We want to support the following types: fr<Builder>, fq<Builder>,
 * bn254_element<Builder>, bb::Univariate<FF, N>, std::array<FF, N>, for
 * FF = fr<Builder> or fq<Builder>, and N is arbitrary
 * @tparam T
 * @return constexpr size_t
 */
template <typename T> constexpr size_t calc_num_bn254_frs();

template <typename Builder> constexpr size_t calc_num_bn254_frs(fr<Builder>* /*unused*/)
{
    return 1;
}

template <typename Builder> constexpr size_t calc_num_bn254_frs(fq<Builder>* /*unused*/)
{
    return 2;
}

template <typename Builder> constexpr size_t calc_num_bn254_frs(bn254_element<Builder>* /*unused*/)
{
    return 2 * calc_num_bn254_frs<fq<Builder>>();
}

// TODO: possibly need for eccvm recursive verifier
// constexpr size_t calc_num_bn254_frs(curve::Grumpkin::AffineElement* /*unused*/)
// {
//     return 2 * calc_num_bn254_frs<typename stdlib::grumpkin<Builder>::BaseField>();
// }

template <typename T, std::size_t N> constexpr size_t calc_num_bn254_frs(std::array<T, N>* /*unused*/)
{
    return N * calc_num_bn254_frs<T>();
}

template <typename T, std::size_t N> constexpr size_t calc_num_bn254_frs(bb::Univariate<T, N>* /*unused*/)
{
    return N * calc_num_bn254_frs<T>();
}

template <typename T> constexpr size_t calc_num_bn254_frs()
{
    return calc_num_bn254_frs(static_cast<T*>(nullptr));
}

/**
 * @brief Conversions from vector of fr<Builder> elements to transcript types.
 * @details We want to support the following types: fr<Builder>, fq<Builder>,
 * bn254_element<Builder>, bb::Univariate<FF, N>, std::array<FF, N>, for
 * FF = fr<Builder> or fq<Builder>, and N is arbitrary
 * @tparam T
 * @param fr_vec
 * @return T
 */
template <typename Builder, typename T> T convert_from_bn254_frs(Builder& builder, std::span<const fr<Builder>> fr_vec);

template <typename Builder>
fr<Builder> inline convert_from_bn254_frs(const Builder& /*unused*/,
                                          std::span<const fr<Builder>> fr_vec,
                                          fr<Builder>* /*unused*/)
{
    ASSERT(fr_vec.size() == 1);
    return fr_vec[0];
}

template <typename Builder>
fq<Builder> inline convert_from_bn254_frs(const Builder& /*unused*/,
                                          std::span<const fr<Builder>> fr_vec,
                                          fq<Builder>* /*unused*/)
{
    ASSERT(fr_vec.size() == 2);
    bigfield<Builder, bb::Bn254FqParams> result(fr_vec[0], fr_vec[1], 0, 0);
    return result;
}

template <typename Builder>
bn254_element<Builder> inline convert_from_bn254_frs(Builder& builder,
                                                     std::span<const fr<Builder>> fr_vec,
                                                     bn254_element<Builder>* /*unused*/)
{
    bn254_element<Builder> val;
    val.x = convert_from_bn254_frs<Builder, fq<Builder>>(builder, fr_vec.subspan(0, 2));
    val.y = convert_from_bn254_frs<Builder, fq<Builder>>(builder, fr_vec.subspan(2, 2));
    return val;
}

// template <typename Builder>
// curve::Grumpkin::AffineElement inline convert_from_bn254_frs(Builder& builder, std::span<const fr<Builder>>,
//                                                              curve::Grumpkin::AffineElement* /*unused*/)
// {
//     ASSERT(fr_vec.size() == 2);
//     curve::Grumpkin::AffineElement val;
//     val.x = fr_vec[0];
//     val.y = fr_vec[1];
//     return val;
// }

template <typename Builder, size_t N>
std::array<fr<Builder>, N> inline convert_from_bn254_frs(const Builder& /*unused*/,
                                                         std::span<const fr<Builder>> fr_vec,
                                                         std::array<fr<Builder>, N>* /*unused*/)
{
    std::array<fr<Builder>, N> val;
    for (size_t i = 0; i < N; ++i) {
        val[i] = fr_vec[i];
    }
    return val;
}

template <typename Builder, size_t N>
std::array<fq<Builder>, N> inline convert_from_bn254_frs(Builder& builder,
                                                         std::span<const fr<Builder>> fr_vec,
                                                         std::array<fq<Builder>, N>* /*unused*/)
{
    std::array<fq<Builder>, N> val;
    for (size_t i = 0; i < N; ++i) {
        std::vector<fr<Builder>> fr_vec_tmp{ fr_vec[2 * i],
                                             fr_vec[2 * i + 1] }; // each pair of consecutive elements is a fq<Builder>
        val[i] = convert_from_bn254_frs<Builder, fq<Builder>>(builder, fr_vec_tmp);
    }
    return val;
}

template <typename Builder, size_t N>
bb::Univariate<fr<Builder>, N> inline convert_from_bn254_frs(const Builder& /*unused*/,
                                                             std::span<const fr<Builder>> fr_vec,
                                                             bb::Univariate<fr<Builder>, N>* /*unused*/)
{
    bb::Univariate<fr<Builder>, N> val;
    for (size_t i = 0; i < N; ++i) {
        val.evaluations[i] = fr_vec[i];
    }
    return val;
}

template <typename Builder, size_t N>
bb::Univariate<fq<Builder>, N> inline convert_from_bn254_frs(Builder& builder,
                                                             std::span<const fr<Builder>> fr_vec,
                                                             bb::Univariate<fq<Builder>, N>* /*unused*/)
{
    bb::Univariate<fq<Builder>, N> val;
    for (size_t i = 0; i < N; ++i) {
        std::vector<fr<Builder>> fr_vec_tmp{ fr_vec[2 * i], fr_vec[2 * i + 1] };
        val.evaluations[i] = convert_from_bn254_frs<Builder, fq<Builder>>(builder, fr_vec_tmp);
    }
    return val;
}

template <typename Builder, typename T>
T inline convert_from_bn254_frs(Builder& builder, std::span<const fr<Builder>> fr_vec)
{
    return convert_from_bn254_frs(builder, fr_vec, static_cast<T*>(nullptr));
}

/**
 * @brief Conversion from transcript values to fr<Builder>s
 * @details We want to support the following types: bool, size_t, uint32_t, uint64_t, fr<Builder>, fq<Builder>,
 * bn254_element<Builder>, curve::Grumpkin::AffineElement, bb::Univariate<FF, N>, std::array<FF,
 * N>, for FF = fr<Builder>/fq<Builder>, and N is arbitrary.
 * @tparam T
 * @param val
 * @return std::vector<fr<Builder>>
 */
template <typename Builder> std::vector<fr<Builder>> inline convert_to_bn254_frs(const fq<Builder>& val)
{
    auto fr_arr = convert_grumpkin_fr_to_bn254_frs(val);
    std::vector<fr<Builder>> fr_vec(fr_arr.begin(), fr_arr.end());
    return fr_vec;
}

template <typename Builder> std::vector<fr<Builder>> inline convert_to_bn254_frs(const fr<Builder>& val)
{
    std::vector<fr<Builder>> fr_vec{ val };
    return fr_vec;
}

template <typename Builder> std::vector<fr<Builder>> inline convert_to_bn254_frs(const bn254_element<Builder>& val)
{
    auto fr_vec_x = convert_to_bn254_frs(val.x);
    auto fr_vec_y = convert_to_bn254_frs(val.y);
    std::vector<fr<Builder>> fr_vec(fr_vec_x.begin(), fr_vec_x.end());
    fr_vec.insert(fr_vec.end(), fr_vec_y.begin(), fr_vec_y.end());
    return fr_vec;
}

// TODO: may need for eccvm rec verifier
// template <typename Builder>
// std::vector<fr<Builder>> inline convert_to_bn254_frs(const curve::Grumpkin::AffineElement& val)
// {
//     auto fr_vec_x = convert_to_bn254_frs(val.x);
//     auto fr_vec_y = convert_to_bn254_frs(val.y);
//     std::vector<fr<Builder>> fr_vec(fr_vec_x.begin(), fr_vec_x.end());
//     fr_vec.insert(fr_vec.end(), fr_vec_y.begin(), fr_vec_y.end());
//     return fr_vec;
// }

template <typename Builder, size_t N>
std::vector<fr<Builder>> inline convert_to_bn254_frs(const std::array<fr<Builder>, N>& val)
{
    std::vector<fr<Builder>> fr_vec(val.begin(), val.end());
    return fr_vec;
}

template <typename Builder, size_t N>
std::vector<fr<Builder>> inline convert_to_bn254_frs(const std::array<fq<Builder>, N>& val)
{
    std::vector<fr<Builder>> fr_vec;
    for (size_t i = 0; i < N; ++i) {
        auto tmp_vec = convert_to_bn254_frs(val[i]);
        fr_vec.insert(fr_vec.end(), tmp_vec.begin(), tmp_vec.end());
    }
    return fr_vec;
}

template <typename Builder, size_t N>
std::vector<fr<Builder>> inline convert_to_bn254_frs(const bb::Univariate<fr<Builder>, N>& val)
{
    std::vector<fr<Builder>> fr_vec;
    for (size_t i = 0; i < N; ++i) {
        auto tmp_vec = convert_to_bn254_frs(val.evaluations[i]);
        fr_vec.insert(fr_vec.end(), tmp_vec.begin(), tmp_vec.end());
    }
    return fr_vec;
}

template <typename Builder, size_t N>
std::vector<fr<Builder>> inline convert_to_bn254_frs(const bb::Univariate<fq<Builder>, N>& val)
{
    std::vector<fr<Builder>> fr_vec;
    for (size_t i = 0; i < N; ++i) {
        auto tmp_vec = convert_to_bn254_frs(val.evaluations[i]);
        fr_vec.insert(fr_vec.end(), tmp_vec.begin(), tmp_vec.end());
    }
    return fr_vec;
}

// TODO: possibly remove this annoying asymmetry - AllValues vs std::array<fr<Builder>, N>
template <typename Builder, typename AllValues>
std::vector<fr<Builder>> inline convert_to_bn254_frs(const AllValues& val)
{
    auto data = val.get_all();
    std::vector<fr<Builder>> fr_vec;
    for (auto& item : data) {
        auto tmp_vec = convert_to_bn254_frs(item);
        fr_vec.insert(fr_vec.end(), tmp_vec.begin(), tmp_vec.end());
    }
    return fr_vec;
}

} // namespace bb::stdlib::field_conversion