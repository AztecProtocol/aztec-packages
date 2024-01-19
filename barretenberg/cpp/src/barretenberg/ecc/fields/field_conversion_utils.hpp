#pragma once

#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/plonk/proof_system/constants.hpp"
#include "barretenberg/polynomials/univariate.hpp"

namespace bb::field_conversion_utils {

/**
 * @brief Decomposes a bb::fr into two 64-bit limbs. Helper function for
 * convert_barretenberg_frs_to_grumpkin_fr.
 *
 * @param field_val
 * @return std::array<uint64_t, 2>
 */
std::array<uint64_t, 2> decompose_bn254_fr_to_two_limbs(const bb::fr& field_val);

/**
 * @brief Converts 2 bb::fr elements to grumpkin::fr
 * @details Checks that each bb::fr must be at most 128 bits (to ensure no overflow), and decomposes each
 * bb::fr into two 64-bit limbs, and the 4 64-bit limbs form the grumpkin::fr
 * @param low_bits_in
 * @param high_bits_in
 * @return grumpkin::fr
 */
grumpkin::fr convert_bn254_frs_to_grumpkin_fr(const bb::fr& low_bits_in, const bb::fr& high_bits_in);

/**
 * @brief Converts grumpkin::fr to 2 bb::fr elements
 * @details Does the reverse of convert_bn254_frs_to_grumpkin_fr, by merging the two pairs of limbs back into the
 * 2 bb::fr elements.
 * @param input
 * @return std::array<bb::fr, 2>
 */
std::array<bb::fr, 2> convert_grumpkin_fr_to_bn254_frs(const grumpkin::fr& input);

/**
 * @brief Calculates the size of a types in terms of bb::frs
 * @details We want to suppor the following types: bool, size_t, uint32_t, uint64_t, bb::fr, grumpkin::fr,
 * curve::BN254::AffineElement, curve::Grumpkin::AffineElement, bb::Univariate<FF, N>, std::array<FF, N>, for
 * FF = bb::fr/grumpkin::fr, and N is arbitrary
 * @tparam T
 * @return constexpr size_t
 */
template <typename T> constexpr size_t calc_num_frs();

constexpr size_t calc_num_frs(bb::fr* /*unused*/)
{
    return 1;
}

constexpr size_t calc_num_frs(grumpkin::fr* /*unused*/)
{
    return 2;
}

template <std::integral T>
constexpr size_t calc_num_frs(T* /*unused*/) // TODO: check if std integral includes uint256 and uint512, those are too
                                             // big, and I guess bool works here
{
    return 1;
}

constexpr size_t calc_num_frs(curve::BN254::AffineElement* /*unused*/)
{
    return 2 * calc_num_frs<curve::BN254::BaseField>();
}

constexpr size_t calc_num_frs(curve::Grumpkin::AffineElement* /*unused*/)
{
    return 2 * calc_num_frs<curve::Grumpkin::BaseField>();
}

template <typename T, std::size_t N> constexpr size_t calc_num_frs(std::array<T, N>* /*unused*/)
{
    return N * calc_num_frs<T>();
}

template <typename T, std::size_t N> constexpr size_t calc_num_frs(bb::Univariate<T, N>* /*unused*/)
{
    return N * calc_num_frs<T>();
}

template <typename T> constexpr size_t calc_num_frs()
{
    return calc_num_frs(static_cast<T*>(nullptr));
}

/**
 * @brief Conversions from vector of bb::fr elements to transcript types.
 *
 * @tparam T
 * @param fr_vec
 * @return T
 */
template <typename T> T convert_from_bn254_frs(std::span<const bb::fr> fr_vec);

bool inline convert_from_bn254_frs(std::span<const bb::fr> fr_vec, bool* /*unused*/)
{
    ASSERT(fr_vec.size() == 1);
    return fr_vec[0] != 0;
}

template <std::integral T> T inline convert_from_bn254_frs(std::span<const bb::fr> fr_vec, T* /*unused*/)
{
    ASSERT(fr_vec.size() == 1);
    return static_cast<T>(fr_vec[0]);
}

bb::fr inline convert_from_bn254_frs(std::span<const bb::fr> fr_vec, bb::fr* /*unused*/)
{
    ASSERT(fr_vec.size() == 1);
    return fr_vec[0];
}

grumpkin::fr inline convert_from_bn254_frs(std::span<const bb::fr> fr_vec, grumpkin::fr* /*unused*/)
{
    ASSERT(fr_vec.size() == 2);
    return convert_bn254_frs_to_grumpkin_fr(fr_vec[0], fr_vec[1]);
}

curve::BN254::AffineElement inline convert_from_bn254_frs(std::span<const bb::fr> fr_vec,
                                                          curve::BN254::AffineElement* /*unused*/)
{
    curve::BN254::AffineElement val;
    val.x = convert_from_bn254_frs<grumpkin::fr>(fr_vec.subspan(0, 2));
    val.y = convert_from_bn254_frs<grumpkin::fr>(fr_vec.subspan(2, 2));
    return val;
}

curve::Grumpkin::AffineElement inline convert_from_bn254_frs(std::span<const bb::fr> fr_vec,
                                                             curve::Grumpkin::AffineElement* /*unused*/)
{
    ASSERT(fr_vec.size() == 2);
    curve::Grumpkin::AffineElement val;
    val.x = fr_vec[0];
    val.y = fr_vec[1];
    return val;
}

template <size_t N>
std::array<bb::fr, N> inline convert_from_bn254_frs(std::span<const bb::fr> fr_vec, std::array<bb::fr, N>* /*unused*/)
{
    std::array<bb::fr, N> val;
    for (size_t i = 0; i < N; ++i) {
        val[i] = fr_vec[i];
    }
    return val;
}

template <size_t N>
std::array<grumpkin::fr, N> inline convert_from_bn254_frs(std::span<const bb::fr> fr_vec,
                                                          std::array<grumpkin::fr, N>* /*unused*/)
{
    std::array<grumpkin::fr, N> val;
    for (size_t i = 0; i < N; ++i) {
        std::vector<bb::fr> fr_vec_tmp{ fr_vec[2 * i],
                                        fr_vec[2 * i + 1] }; // each pair of consecutive elements is a grumpkin::fr
        val[i] = convert_from_bn254_frs<grumpkin::fr>(fr_vec_tmp);
    }
    return val;
}

template <size_t N>
bb::Univariate<bb::fr, N> inline convert_from_bn254_frs(std::span<const bb::fr> fr_vec,
                                                        bb::Univariate<bb::fr, N>* /*unused*/)
{
    bb::Univariate<bb::fr, N> val;
    for (size_t i = 0; i < N; ++i) {
        val.evaluations[i] = fr_vec[i];
    }
    return val;
}

template <size_t N>
bb::Univariate<grumpkin::fr, N> inline convert_from_bn254_frs(std::span<const bb::fr> fr_vec,
                                                              bb::Univariate<grumpkin::fr, N>* /*unused*/)
{
    bb::Univariate<grumpkin::fr, N> val;
    for (size_t i = 0; i < N; ++i) {
        std::vector<bb::fr> fr_vec_tmp{ fr_vec[2 * i], fr_vec[2 * i + 1] };
        val.evaluations[i] = convert_from_bn254_frs<grumpkin::fr>(fr_vec_tmp);
    }
    return val;
}

template <typename T> T inline convert_from_bn254_frs(std::span<const bb::fr> fr_vec)
{
    return convert_from_bn254_frs(fr_vec, static_cast<T*>(nullptr));
}

/**
 * @brief Conversion from transcript values to bb::frs
 *
 * @tparam T
 * @param val
 * @return std::vector<bb::fr>
 */
template <std::integral T> std::vector<bb::fr> inline convert_to_bn254_frs(const T& val)
{
    std::vector<bb::fr> fr_vec{ val };
    return fr_vec;
}

std::vector<bb::fr> inline convert_to_bn254_frs(const grumpkin::fr& val)
{
    auto fr_arr = convert_grumpkin_fr_to_bn254_frs(val);
    std::vector<bb::fr> fr_vec(fr_arr.begin(), fr_arr.end());
    return fr_vec;
}

std::vector<bb::fr> inline convert_to_bn254_frs(const bb::fr& val)
{
    std::vector<bb::fr> fr_vec{ val };
    return fr_vec;
}

std::vector<bb::fr> inline convert_to_bn254_frs(const curve::BN254::AffineElement& val)
{
    auto fr_vec_x = convert_to_bn254_frs(val.x);
    auto fr_vec_y = convert_to_bn254_frs(val.y);
    std::vector<bb::fr> fr_vec(fr_vec_x.begin(), fr_vec_x.end());
    fr_vec.insert(fr_vec.end(), fr_vec_y.begin(), fr_vec_y.end());
    return fr_vec;
}

std::vector<bb::fr> inline convert_to_bn254_frs(const curve::Grumpkin::AffineElement& val)
{
    auto fr_vec_x = convert_to_bn254_frs(val.x);
    auto fr_vec_y = convert_to_bn254_frs(val.y);
    std::vector<bb::fr> fr_vec(fr_vec_x.begin(), fr_vec_x.end());
    fr_vec.insert(fr_vec.end(), fr_vec_y.begin(), fr_vec_y.end());
    return fr_vec;
}

template <size_t T> std::vector<bb::fr> inline convert_to_bn254_frs(const std::array<bb::fr, T>& val)
{
    std::vector<bb::fr> fr_vec(val.begin(), val.end());
    return fr_vec;
}

template <size_t T> std::vector<bb::fr> inline convert_to_bn254_frs(const std::array<grumpkin::fr, T>& val)
{
    std::vector<bb::fr> fr_vec;
    for (size_t i = 0; i < T; ++i) {
        auto tmp_vec = convert_to_bn254_frs(val[i]);
        fr_vec.insert(fr_vec.end(), tmp_vec.begin(), tmp_vec.end());
    }
    return fr_vec;
}

template <size_t T> std::vector<bb::fr> inline convert_to_bn254_frs(const bb::Univariate<bb::fr, T>& val)
{
    std::vector<bb::fr> fr_vec;
    for (size_t i = 0; i < T; ++i) {
        auto tmp_vec = convert_to_bn254_frs(val.evaluations[i]);
        fr_vec.insert(fr_vec.end(), tmp_vec.begin(), tmp_vec.end());
    }
    return fr_vec;
}

template <size_t T> std::vector<bb::fr> inline convert_to_bn254_frs(const bb::Univariate<grumpkin::fr, T>& val)
{
    std::vector<bb::fr> fr_vec;
    for (size_t i = 0; i < T; ++i) {
        auto tmp_vec = convert_to_bn254_frs(val.evaluations[i]);
        fr_vec.insert(fr_vec.end(), tmp_vec.begin(), tmp_vec.end());
    }
    return fr_vec;
}

template <typename AllValues> std::vector<bb::fr> inline convert_to_bn254_frs(const AllValues& val)
{
    auto data = val.get_all();
    std::vector<bb::fr> fr_vec;
    for (auto& item : data) {
        auto tmp_vec = convert_to_bn254_frs(item);
        fr_vec.insert(fr_vec.end(), tmp_vec.begin(), tmp_vec.end());
    }
    return fr_vec;
}

// now convert_from_bn254_frs

} // namespace bb::field_conversion_utils