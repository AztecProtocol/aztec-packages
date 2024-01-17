#pragma once

#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/plonk/proof_system/constants.hpp"
#include "barretenberg/polynomials/univariate.hpp"

namespace barretenberg {
// convert bn254::frs to grumpkin::fr

static constexpr uint64_t NUM_CONVERSION_LIMB_BITS = 64;

std::array<uint64_t, 2> inline decompose_bn254_fr_to_two_limbs(const barretenberg::fr& field_val)
{
    ASSERT(field_val < (uint256_t(1) << (2 * NUM_CONVERSION_LIMB_BITS))); // should be 128 bits, technically 127 or less
    // split bn254_fr into two 64 bit limbs
    constexpr uint256_t LIMB_MASK = (uint256_t(1) << NUM_CONVERSION_LIMB_BITS) - 1;
    const uint256_t value = field_val;
    const uint64_t low = static_cast<uint64_t>(value & LIMB_MASK);
    const uint64_t hi = static_cast<uint64_t>(value >> NUM_CONVERSION_LIMB_BITS);
    ASSERT(static_cast<uint256_t>(low) + (static_cast<uint256_t>(hi) << NUM_CONVERSION_LIMB_BITS) == value);

    // const size_t lo_bits = NUM_CONVERSION_LIMB_BITS;
    // const size_t hi_bits = num_limb_bits - NUM_CONVERSION_LIMB_BITS;
    // range_constrain_two_ limbs(low_idx, hi_idx, lo_bits, hi_bits); needed in stdlib version of this

    return std::array<uint64_t, 2>{ low, hi };
}

// circuit form
// template <typename Arithmetization>
// std::array<uint32_t, 2> UltraCircuitBuilder_<Arithmetization>::decompose_bn254_fr_to_two_limbs(
//     const uint32_t limb_idx, const size_t num_limb_bits)
// {
//     ASSERT(uint256_t(this->get_variable_reference(limb_idx)) < (uint256_t(1) << num_limb_bits));
//     constexpr FF LIMB_MASK = (uint256_t(1) << DEFAULT_NON_NATIVE_FIELD_LIMB_BITS) - 1;
//     const uint256_t value = this->get_variable(limb_idx);
//     const uint256_t low = value & LIMB_MASK;
//     const uint256_t hi = value >> DEFAULT_NON_NATIVE_FIELD_LIMB_BITS;
//     ASSERT(low + (hi << DEFAULT_NON_NATIVE_FIELD_LIMB_BITS) == value);

//     const uint32_t low_idx = this->add_variable(low);
//     const uint32_t hi_idx = this->add_variable(hi);

//     ASSERT(num_limb_bits > DEFAULT_NON_NATIVE_FIELD_LIMB_BITS);
//     const size_t lo_bits = DEFAULT_NON_NATIVE_FIELD_LIMB_BITS;
//     const size_t hi_bits = num_limb_bits - DEFAULT_NON_NATIVE_FIELD_LIMB_BITS;
//     range_constrain_two_limbs(low_idx, hi_idx, lo_bits, hi_bits);

//     return std::array<uint32_t, 2>{ low_idx, hi_idx };
// }

// convert barretenberg::frs to grumpkin::fr
grumpkin::fr inline convert_barretenberg_fr_to_grumpkin_fr(const barretenberg::fr& low_bits_in,
                                                           const barretenberg::fr& high_bits_in)
{
    // TODO: figure out can_overflow, maximum_bitlength
    ASSERT(uint256_t(low_bits_in) < (uint256_t(1) << (NUM_CONVERSION_LIMB_BITS * 2)));
    ASSERT(uint256_t(high_bits_in) < (uint256_t(1) << (NUM_CONVERSION_LIMB_BITS * 2)));
    auto low_bit_decomp = decompose_bn254_fr_to_two_limbs(low_bits_in);
    uint256_t tmp;
    tmp.data[0] = low_bit_decomp[0];
    tmp.data[1] = low_bit_decomp[1];
    auto high_bit_decomp = decompose_bn254_fr_to_two_limbs(high_bits_in);
    tmp.data[2] = high_bit_decomp[0];
    tmp.data[3] = high_bit_decomp[1];
    grumpkin::fr result(tmp);
    return result;
}

// convert grumpkin::fr to barretenberg::frs
std::array<barretenberg::fr, 2> inline convert_grumpkin_fr_to_barretenberg_frs(const grumpkin::fr& input)
{
    auto tmp = static_cast<uint256_t>(input);
    std::array<barretenberg::fr, 2> result;
    result[0] = static_cast<uint256_t>(tmp.data[0]) + (static_cast<uint256_t>(tmp.data[1]) << NUM_CONVERSION_LIMB_BITS);
    result[1] = static_cast<uint256_t>(tmp.data[2]) + (static_cast<uint256_t>(tmp.data[3]) << NUM_CONVERSION_LIMB_BITS);
    return result;
}

// template <typename Builder, typename T>
// bigfield<Builder, T>::bigfield(const field_t<Builder>& low_bits_in,
//                                const field_t<Builder>& high_bits_in,
//                                const bool can_overflow,
//                                const size_t maximum_bitlength)
// {
//     ASSERT((can_overflow == true && maximum_bitlength == 0) ||
//            (can_overflow == false && (maximum_bitlength == 0 || maximum_bitlength > (3 * NUM_LIMB_BITS))));

//     // Check that the values of two parts are within specified bounds
//     ASSERT(uint256_t(low_bits_in.get_value()) < (uint256_t(1) << (NUM_LIMB_BITS * 2)));
//     ASSERT(uint256_t(high_bits_in.get_value()) < (uint256_t(1) << (NUM_LIMB_BITS * 2)));

//     context = low_bits_in.context == nullptr ? high_bits_in.context : low_bits_in.context;
//     field_t<Builder> limb_0(context);
//     field_t<Builder> limb_1(context);
//     field_t<Builder> limb_2(context);
//     field_t<Builder> limb_3(context);
//     if (low_bits_in.witness_index != IS_CONSTANT) {
//         std::vector<uint32_t> low_accumulator;
//         if constexpr (HasPlookup<Builder>) {
//             // MERGE NOTE: this was the if constexpr block introduced in ecebe7643
//             const auto limb_witnesses =
//                 context->decompose_non_native_field_double_width_limb(low_bits_in.normalize().witness_index);
//             limb_0.witness_index = limb_witnesses[0];
//             limb_1.witness_index = limb_witnesses[1];
//             field_t<Builder>::evaluate_linear_identity(low_bits_in, -limb_0, -limb_1 * shift_1, field_t<Builder>(0));

//             // // Enforce that low_bits_in indeed only contains 2*NUM_LIMB_BITS bits
//             // low_accumulator = context->decompose_into_default_range(low_bits_in.witness_index,
//             //                                                         static_cast<size_t>(NUM_LIMB_BITS * 2));
//             // // If this doesn't hold we're using a default plookup range size that doesn't work well with the limb
//             // size
//             // // here
//             // ASSERT(low_accumulator.size() % 2 == 0);
//             // size_t mid_index = low_accumulator.size() / 2 - 1;
//             // limb_0.witness_index = low_accumulator[mid_index]; // Q:safer to just slice this from low_bits_in?
//             // limb_1 = (low_bits_in - limb_0) * shift_right_1;
//         } else {
//             size_t mid_index;
//             low_accumulator = context->decompose_into_base4_accumulators(
//                 low_bits_in.witness_index, static_cast<size_t>(NUM_LIMB_BITS * 2), "bigfield: low_bits_in too
//                 large.");
//             mid_index = static_cast<size_t>((NUM_LIMB_BITS / 2) - 1);
//             // Range constraint returns an array of partial sums, midpoint will happen to hold the big limb value
//             limb_1.witness_index = low_accumulator[mid_index];
//             // We can get the first half bits of low_bits_in from the variables we already created
//             limb_0 = (low_bits_in - (limb_1 * shift_1));
//         }
//     } else {
//         uint256_t slice_0 = uint256_t(low_bits_in.additive_constant).slice(0, NUM_LIMB_BITS);
//         uint256_t slice_1 = uint256_t(low_bits_in.additive_constant).slice(NUM_LIMB_BITS, 2 * NUM_LIMB_BITS);
//         limb_0 = field_t(context, barretenberg::fr(slice_0));
//         limb_1 = field_t(context, barretenberg::fr(slice_1));
//     }

//     // If we wish to continue working with this element with lazy reductions - i.e. not moding out again after each
//     // addition we apply a more limited range - 2^s for smallest s such that p<2^s (this is the case can_overflow ==
//     // false)
//     uint64_t num_last_limb_bits = (can_overflow) ? NUM_LIMB_BITS : NUM_LAST_LIMB_BITS;

//     // if maximum_bitlength is set, this supercedes can_overflow
//     if (maximum_bitlength > 0) {
//         ASSERT(maximum_bitlength > 3 * NUM_LIMB_BITS);
//         num_last_limb_bits = maximum_bitlength - (3 * NUM_LIMB_BITS);
//     }
//     // We create the high limb values similar to the low limb ones above
//     const uint64_t num_high_limb_bits = NUM_LIMB_BITS + num_last_limb_bits;
//     if (high_bits_in.witness_index != IS_CONSTANT) {

//         std::vector<uint32_t> high_accumulator;
//         if constexpr (HasPlookup<Builder>) {
//             const auto limb_witnesses = context->decompose_non_native_field_double_width_limb(
//                 high_bits_in.normalize().witness_index, (size_t)num_high_limb_bits);
//             limb_2.witness_index = limb_witnesses[0];
//             limb_3.witness_index = limb_witnesses[1];
//             field_t<Builder>::evaluate_linear_identity(high_bits_in, -limb_2, -limb_3 * shift_1,
//             field_t<Builder>(0));

//         } else {
//             high_accumulator = context->decompose_into_base4_accumulators(high_bits_in.witness_index,
//                                                                           static_cast<size_t>(num_high_limb_bits),
//                                                                           "bigfield: high_bits_in too large.");
//             limb_3.witness_index = high_accumulator[static_cast<size_t>((num_last_limb_bits / 2) - 1)];
//             limb_2 = (high_bits_in - (limb_3 * shift_1));
//         }
//     } else {
//         uint256_t slice_2 = uint256_t(high_bits_in.additive_constant).slice(0, NUM_LIMB_BITS);
//         uint256_t slice_3 = uint256_t(high_bits_in.additive_constant).slice(NUM_LIMB_BITS, num_high_limb_bits);
//         limb_2 = field_t(context, barretenberg::fr(slice_2));
//         limb_3 = field_t(context, barretenberg::fr(slice_3));
//     }
//     binary_basis_limbs[0] = Limb(limb_0, DEFAULT_MAXIMUM_LIMB);
//     binary_basis_limbs[1] = Limb(limb_1, DEFAULT_MAXIMUM_LIMB);
//     binary_basis_limbs[2] = Limb(limb_2, DEFAULT_MAXIMUM_LIMB);
//     if (maximum_bitlength > 0) {
//         uint256_t max_limb_value = (uint256_t(1) << (maximum_bitlength - (3 * NUM_LIMB_BITS))) - 1;
//         binary_basis_limbs[3] = Limb(limb_3, max_limb_value);
//     } else {
//         binary_basis_limbs[3] =
//             Limb(limb_3, can_overflow ? DEFAULT_MAXIMUM_LIMB : DEFAULT_MAXIMUM_MOST_SIGNIFICANT_LIMB);
//     }
//     prime_basis_limb = low_bits_in + (high_bits_in * shift_2);
// }

/* types are

uint32_t
uint64_t
barretenberg::fr
grumpkin::fr
curve::BN254::AffineElement
curve::Grumpkin::AffineElement
barretenberg::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH>
std::array<FF, NUM_ALL_ENTITIES>, depends on num_all_entities

*/

/**
 * @brief Calculates the size of a types in terms of barretenberg::frs
 *
 * @tparam T
 * @return constexpr size_t
 */
template <typename T> constexpr size_t calc_num_frs()
{
    if constexpr (std::is_same_v<T, grumpkin::fr>) {
        return 2;
    } else if constexpr (std::is_same_v<T, barretenberg::fr> || std::is_same_v<T, uint32_t> ||
                         std::is_same_v<T, uint64_t> || std::is_same_v<T, size_t>) {
        return 1;
    } else {
        return static_cast<size_t>(-1);
    }
    // TODO: address the else
}
/**
 * @brief Calculates the size of a templated types in terms of barretenberg::frs
 * @details

 * @tparam T
 * @return constexpr size_t
 */
template <template <class U, size_t TT> class T, class U, size_t TT> constexpr size_t calc_num_frs()
{
    if constexpr (std::is_same_v<T<U, TT>, std::array<barretenberg::fr, TT>>) {
        return TT * calc_num_frs<barretenberg::fr, TT>();
    } else if constexpr (std::is_same_v<T<U, TT>, std::array<grumpkin::fr, TT>>) {
        return TT * calc_num_frs<grumpkin::fr, TT>();
    } else if constexpr (std::is_same_v<T<U, TT>, curve::BN254::AffineElement>) {
        return 2 * calc_num_frs<barretenberg::fr, TT>();
    } else if constexpr (std::is_same_v<T<U, TT>, curve::Grumpkin::AffineElement>) {
        return 2 * calc_num_frs<grumpkin::fr, TT>();
    } else if constexpr (std::is_same_v<T<U, TT>, barretenberg::Univariate<barretenberg::fr, TT>>) {
        return TT * calc_num_frs<barretenberg::fr, TT>();
    } else if constexpr (std::is_same_v<T<U, TT>, barretenberg::Univariate<grumpkin::fr, TT>>) {
        return TT * calc_num_frs<grumpkin::fr, TT>();
    } else {
        return static_cast<size_t>(-1);
    }
}

template <std::integral T> std::vector<barretenberg::fr> inline convert_to_bn254_frs(const T& val)
{
    std::vector<barretenberg::fr> fr_vec{ val };
    return fr_vec;
}

template <typename T> T inline convert_from_bn254_frs(const std::span<barretenberg::fr> fr_vec)
{
    // TODO: merge this with calc_num_frs()
    if constexpr (std::is_same_v<T, unsigned int>) {
        return uint32_t(fr_vec[0]);
    } else if constexpr (std::is_integral_v<T> || std::is_same_v<T, barretenberg::fr>) {
        T val = fr_vec[0];
        return val;
    } else if constexpr (std::is_same_v<T, grumpkin::fr>) {
        return convert_barretenberg_fr_to_grumpkin_fr(fr_vec[0], fr_vec[1]);
    } else if constexpr (std::is_same_v<T, curve::BN254::AffineElement>) {
        curve::BN254::AffineElement val;
        val.x = convert_from_bn254_frs<grumpkin::fr>(fr_vec);
        val.y = convert_from_bn254_frs<grumpkin::fr>(fr_vec);
        return val;
    } else if constexpr (std::is_same_v<T, curve::Grumpkin::AffineElement>) {
        curve::Grumpkin::AffineElement val;
        val.x = fr_vec[0];
        val.y = fr_vec[1];
    }
}

template <template <class U, size_t TT> class T, class U, size_t TT>
constexpr T<U, TT> convert_from_bn254_frs(const std::span<barretenberg::fr> fr_vec)
{
    if constexpr (std::is_same_v<T<U, TT>, barretenberg::Univariate<barretenberg::fr, TT>>) {
        barretenberg::Univariate<barretenberg::fr, TT> val;
        for (size_t i = 0; i < TT; ++i) {
            val.data[i] = fr_vec[i];
        }
        return val;
    } else if constexpr (std::is_same_v<T<U, TT>, barretenberg::Univariate<grumpkin::fr, TT>>) {
        barretenberg::Univariate<grumpkin::fr, TT> val;
        for (size_t i = 0; i < TT; ++i) {
            std::vector<barretenberg::fr> fr_vec_tmp{ fr_vec[2 * i], fr_vec[2 * i + 1] };
            val.data[i] = convert_from_bn254_frs<grumpkin::fr>(fr_vec_tmp);
        }
        return val;
    } else if constexpr (std::is_same_v<T<U, TT>, std::array<barretenberg::fr, TT>>) {
        std::array<barretenberg::fr, TT> val;
        for (size_t i = 0; i < TT; ++i) {
            val[i] = fr_vec[i];
        }
        return val;
    } else if constexpr (std::is_same_v<T<U, TT>, std::array<grumpkin::fr, TT>>) {
        std::array<grumpkin::fr, TT> val;
        for (size_t i = 0; i < TT; ++i) {
            std::vector<barretenberg::fr> fr_vec_tmp{ fr_vec[2 * i], fr_vec[2 * i + 1] };
            val[i] = convert_from_bn254_frs<grumpkin::fr>(fr_vec_tmp);
        }
        return val;
    } else {
        return static_cast<size_t>(-1);
    }

    return 0; // TODO: address this case somehow, should never happen
}

std::vector<barretenberg::fr> inline convert_to_bn254_frs(const grumpkin::fr& val)
{
    auto fr_arr = convert_grumpkin_fr_to_barretenberg_frs(val);
    std::vector<barretenberg::fr> fr_vec(fr_arr.begin(), fr_arr.end());
    return fr_vec;
}

std::vector<barretenberg::fr> inline convert_to_bn254_frs(const barretenberg::fr& val)
{
    std::vector<barretenberg::fr> fr_vec{ val };
    return fr_vec;
}

std::vector<barretenberg::fr> inline convert_to_bn254_frs(const curve::BN254::AffineElement& val)
{
    auto fr_vec_x = convert_to_bn254_frs(val.x);
    auto fr_vec_y = convert_to_bn254_frs(val.y);
    std::vector<barretenberg::fr> fr_vec(fr_vec_x.begin(), fr_vec_x.end());
    fr_vec.insert(fr_vec.end(), fr_vec_y.begin(), fr_vec_y.end());
    return fr_vec;
}

std::vector<barretenberg::fr> inline convert_to_bn254_frs(const curve::Grumpkin::AffineElement& val)
{
    auto fr_vec_x = convert_to_bn254_frs(val.x);
    auto fr_vec_y = convert_to_bn254_frs(val.y);
    std::vector<barretenberg::fr> fr_vec(fr_vec_x.begin(), fr_vec_x.end());
    fr_vec.insert(fr_vec.end(), fr_vec_y.begin(), fr_vec_y.end());
    return fr_vec;
}

template <size_t T>
std::vector<barretenberg::fr> inline convert_to_bn254_frs(const std::array<barretenberg::fr, T>& val)
{
    std::vector<barretenberg::fr> fr_vec(val.begin(), val.end());
    return fr_vec;
}

template <size_t T> std::vector<barretenberg::fr> inline convert_to_bn254_frs(const std::array<grumpkin::fr, T>& val)
{
    std::vector<barretenberg::fr> fr_vec;
    for (size_t i = 0; i < T; ++i) {
        auto tmp_vec = convert_to_bn254_frs(val[i]);
        fr_vec.insert(fr_vec.end(), tmp_vec.begin(), tmp_vec.end());
    }
    return fr_vec;
}

template <size_t T>
std::vector<barretenberg::fr> inline convert_to_bn254_frs(const barretenberg::Univariate<barretenberg::fr, T>& val)
{
    std::vector<barretenberg::fr> fr_vec;
    for (size_t i = 0; i < T; ++i) {
        auto tmp_vec = convert_to_bn254_frs(val.evaluations[i]);
        fr_vec.insert(fr_vec.end(), tmp_vec.begin(), tmp_vec.end());
    }
    return fr_vec;
}

template <size_t T>
std::vector<barretenberg::fr> inline convert_to_bn254_frs(const barretenberg::Univariate<grumpkin::fr, T>& val)
{
    std::vector<barretenberg::fr> fr_vec;
    for (size_t i = 0; i < T; ++i) {
        auto tmp_vec = convert_to_bn254_frs(val.evaluations[i]);
        fr_vec.insert(fr_vec.end(), tmp_vec.begin(), tmp_vec.end());
    }
    return fr_vec;
}

template <typename AllValues> std::vector<barretenberg::fr> inline convert_to_bn254_frs(const AllValues& val)
{
    auto data = val.get_all();
    std::vector<barretenberg::fr> fr_vec;
    for (auto& item : data) {
        auto tmp_vec = convert_to_bn254_frs(item);
        fr_vec.insert(fr_vec.end(), tmp_vec.begin(), tmp_vec.end());
    }
    return fr_vec;
}

// now convert_from_bn254_frs

} // namespace barretenberg