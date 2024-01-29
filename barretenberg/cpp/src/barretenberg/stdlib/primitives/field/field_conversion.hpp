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

template <typename Builder>
std::array<fr<Builder>, 2> decompose_bn254_fr_to_two_limbs(Builder& builder, const fr<Builder>& f)
{
    ASSERT(uint256_t(f.get_value()) < (uint256_t(1) << (2 * NUM_CONVERSION_LIMB_BITS))); // should be 128 bits or less
    constexpr uint256_t LIMB_MASK =
        (uint256_t(1) << NUM_CONVERSION_LIMB_BITS) - 1; // split bn254_fr into two 64 bit limbs
    constexpr uint256_t shift = (uint256_t(1) << NUM_CONVERSION_LIMB_BITS);
    const uint256_t value = f.get_value();
    const uint256_t low_val = static_cast<uint256_t>(value & LIMB_MASK);
    const uint256_t hi_val = static_cast<uint256_t>(value >> NUM_CONVERSION_LIMB_BITS);

    fr<Builder> low{ witness_t<Builder>(&builder, low_val) };
    fr<Builder> hi{ witness_t<Builder>(&builder, hi_val) };
    // range constrain both to 64 bits
    builder.range_constrain_two_limbs(
        low.witness_index, hi.witness_index, NUM_CONVERSION_LIMB_BITS, NUM_CONVERSION_LIMB_BITS);

    ASSERT(static_cast<uint256_t>(low_val) + (static_cast<uint256_t>(hi_val) << NUM_CONVERSION_LIMB_BITS) == value);
    // checks this decomposition low + hi * 2^64 = value with an add gate
    fr<Builder>::evaluate_linear_identity(low, hi * shift, -f, fr<Builder>(0));

    return std::array<fr<Builder>, 2>{ low, hi };
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

template <typename Builder>
fq<Builder> convert_bn254_frs_to_grumpkin_fr(Builder& builder,
                                             const fr<Builder>& low_bits_in,
                                             const fr<Builder>& high_bits_in)
{
    // range constrain low_bits_in and high_bits_in?
    auto low_bit_decomp = decompose_bn254_fr_to_two_limbs(builder, low_bits_in);

    auto high_bit_decomp = decompose_bn254_fr_to_two_limbs(builder, high_bits_in);
    // construct the bigfield
    fq<Builder> result(low_bit_decomp[0], low_bit_decomp[1], high_bit_decomp[0], high_bit_decomp[1]);
    return result;
}

template <typename Builder>
fr<Builder> convert_challenge(const Builder& /*unused*/, const fr<Builder>& f, fr<Builder>* /*unused*/)
{
    return f;
}

template <typename Builder>
fq<Builder> convert_challenge(Builder& builder, const fr<Builder>& f, fq<Builder>* /*unused*/)
{
    constexpr uint64_t NUM_CONVERSION_TWO_LIMB_BITS = 2 * NUM_CONVERSION_LIMB_BITS;
    constexpr uint256_t shift = (uint256_t(1) << NUM_CONVERSION_TWO_LIMB_BITS);
    // split f into low_bits_in and high_bits_in
    constexpr uint256_t LIMB_MASK = shift - 1; // mask for upper 128 bits
    const uint256_t value = f;
    const uint256_t low_val = static_cast<uint256_t>(value & LIMB_MASK);
    const uint256_t hi_val = static_cast<uint256_t>(value >> NUM_CONVERSION_TWO_LIMB_BITS);

    fr<Builder> low{ witness_t<Builder>(&builder, low_val) };
    fr<Builder> hi{ witness_t<Builder>(&builder, hi_val) };
    // range constrain both to 64 bits
    builder.range_constrain_two_limbs(
        low.witness_index, hi.witness_index, NUM_CONVERSION_TWO_LIMB_BITS, NUM_CONVERSION_TWO_LIMB_BITS);

    ASSERT(static_cast<uint256_t>(low_val) + (static_cast<uint256_t>(hi_val) << NUM_CONVERSION_TWO_LIMB_BITS) == value);
    // checks this decomposition low + hi * 2^64 = value with an add gate
    fr<Builder>::evaluate_linear_identity(low, hi * shift, -f, fr<Builder>(0));

    return convert_bn254_frs_to_grumpkin_fr(builder, low, hi);
}

template <typename Builder, typename T> T convert_challenge(Builder& builder, const fr<Builder>& challenge)
{
    return convert_challenge(builder, challenge, static_cast<T*>(nullptr));
}

// template <typename Builder, typename T>
// bigfield<Builder, T>::bigfield(const fr<Builder>& low_bits_in,
//                                const fr<Builder>& high_bits_in,
//                                const bool can_overflow,
//                                const size_t maximum_bitlength)
// {
//     ASSERT((can_overflow == true && maximum_bitlength == 0) ||
//            (can_overflow == false && (maximum_bitlength == 0 || maximum_bitlength > (3 * NUM_LIMB_BITS))));

//     // Check that the values of two parts are within specified bounds
//     ASSERT(uint256_t(low_bits_in.get_value()) < (uint256_t(1) << (NUM_LIMB_BITS * 2)));
//     ASSERT(uint256_t(high_bits_in.get_value()) < (uint256_t(1) << (NUM_LIMB_BITS * 2)));

//     context = low_bits_in.context == nullptr ? high_bits_in.context : low_bits_in.context;
//     fr<Builder> limb_0(context);
//     fr<Builder> limb_1(context);
//     fr<Builder> limb_2(context);
//     fr<Builder> limb_3(context);
//     if (low_bits_in.witness_index != IS_CONSTANT) {
//         std::vector<uint32_t> low_accumulator;
//         if constexpr (HasPlookup<Builder>) {
//             // MERGE NOTE: this was the if constexpr block introduced in ecebe7643
//             const auto limb_witnesses =
//                 context->decompose_non_native_field_double_width_limb(low_bits_in.normalize().witness_index);
//             limb_0.witness_index = limb_witnesses[0];
//             limb_1.witness_index = limb_witnesses[1];
//             fr<Builder>::evaluate_linear_identity(low_bits_in, -limb_0, -limb_1 * shift_1, fr<Builder>(0));

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
//         limb_0 = field_t(context, fr<Builder>(slice_0));
//         limb_1 = field_t(context, fr<Builder>(slice_1));
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
//             fr<Builder>::evaluate_linear_identity(high_bits_in, -limb_2, -limb_3 * shift_1,
//             fr<Builder>(0));

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
//         limb_2 = field_t(context, fr<Builder>(slice_2));
//         limb_3 = field_t(context, fr<Builder>(slice_3));
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

template <typename Builder> std::array<fr<Builder>, 2> convert_grumpkin_fr_to_bn254_frs(const fq<Builder>& input)
{
    fr<Builder> shift(static_cast<uint256_t>(1) << NUM_CONVERSION_LIMB_BITS); // TODO (maybe this should be 68???)
    std::array<fr<Builder>, 2> result;
    result[0] = input.binary_basis_limbs[0].element + (input.binary_basis_limbs[1].element * shift);
    result[1] = input.binary_basis_limbs[2].element + (input.binary_basis_limbs[3].element * shift);
    auto tmp1 = result[0].get_value();
    auto tmp2 = result[1].get_value();
    tmp1 + tmp2;
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
template <typename T> constexpr size_t calc_num_frs();

template <typename Builder> constexpr size_t calc_num_frs(fr<Builder>* /*unused*/)
{
    return 1;
}

template <typename Builder> constexpr size_t calc_num_frs(fq<Builder>* /*unused*/)
{
    return 2;
}

template <typename Builder> constexpr size_t calc_num_frs(bn254_element<Builder>* /*unused*/)
{
    return 2 * calc_num_frs<fq<Builder>>();
}

// constexpr size_t calc_num_frs(curve::Grumpkin::AffineElement* /*unused*/)
// {
//     return 2 * calc_num_frs<typename stdlib::grumpkin<Builder>::BaseField>();
// }

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
 * @brief Conversions from vector of fr<Builder> elements to transcript types.
 * @details We want to support the following types: fr<Builder>, fq<Builder>,
 * bn254_element<Builder>, bb::Univariate<FF, N>, std::array<FF, N>, for
 * FF = fr<Builder> or fq<Builder>, and N is arbitrary
 * @tparam T
 * @param fr_vec
 * @return T
 */
template <typename Builder, typename T> T convert_from_bn254_frs(Builder& builder, std::span<const fr<Builder>> fr_vec);

// template <typename Builder>
// bool inline convert_from_bn254_frs(Builder& builder, std::span<const fr<Builder>> fr_vec, bool* /*unused*/)
// {
//     ASSERT(fr_vec.size() == 1);
//     return fr_vec[0] != 0;
// }

// template <std::integral T> T inline convert_from_bn254_frs(Builder& builder, std::span<const fr<Builder>>
// fr_vec, T*
// /*unused*/)
// {
//     ASSERT(fr_vec.size() == 1);
//     return static_cast<T>(fr_vec[0]);
// }

template <typename Builder>
fr<Builder> inline convert_from_bn254_frs(const Builder& /*unused*/,
                                          std::span<const fr<Builder>> fr_vec,
                                          fr<Builder>* /*unused*/)
{
    ASSERT(fr_vec.size() == 1);
    return fr_vec[0];
}

template <typename Builder>
fq<Builder> inline convert_from_bn254_frs(Builder& builder,
                                          std::span<const fr<Builder>> fr_vec,
                                          fq<Builder>* /*unused*/)
{
    ASSERT(fr_vec.size() == 2);
    return convert_bn254_frs_to_grumpkin_fr(builder, fr_vec[0], fr_vec[1]);
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
// template <std::integral T> std::vector<fr<Builder>> inline convert_to_bn254_frs(const T& val)
// {
//     std::vector<fr<Builder>> fr_vec{ val };
//     return fr_vec;
// }

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

// TODO: why is this needed here but not for the other 3 functions?
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