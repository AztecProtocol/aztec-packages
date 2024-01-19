#pragma once

namespace proof_system::plonk::stdlib {

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
//         limb_0 = field_t(context, bb::fr(slice_0));
//         limb_1 = field_t(context, bb::fr(slice_1));
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
//         limb_2 = field_t(context, bb::fr(slice_2));
//         limb_3 = field_t(context, bb::fr(slice_3));
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

} // namespace proof_system::plonk::stdlib