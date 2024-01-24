#pragma once

#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/numeric/uintx/uintx.hpp"
#include <tuple>

#include "../circuit_builders/circuit_builders.hpp"

#include "../bit_array/bit_array.hpp"
#include "../field/field.hpp"

namespace bb::stdlib {

template <typename Builder, typename T>
bigfield<Builder, T>::bigfield(Builder* parent_context)
    : context(parent_context)
    , binary_basis_limbs{ Limb(bb::fr(0)), Limb(bb::fr(0)), Limb(bb::fr(0)), Limb(bb::fr(0)) }
    , prime_basis_limb(context, 0)
{}

template <typename Builder, typename T>
bigfield<Builder, T>::bigfield(Builder* parent_context, const uint256_t& value)
    : context(parent_context)
    , binary_basis_limbs{ Limb(bb::fr(value.slice(0, NUM_LIMB_BITS))),
                          Limb(bb::fr(value.slice(NUM_LIMB_BITS, NUM_LIMB_BITS * 2))),
                          Limb(bb::fr(value.slice(NUM_LIMB_BITS * 2, NUM_LIMB_BITS * 3))),
                          Limb(bb::fr(value.slice(NUM_LIMB_BITS * 3, NUM_LIMB_BITS * 4))) }
    , prime_basis_limb(context, value)
{
    ASSERT(value < modulus);
}

template <typename Builder, typename T>
bigfield<Builder, T>::bigfield(const field_t<Builder>& low_bits_in,
                               const field_t<Builder>& high_bits_in,
                               const bool can_overflow,
                               const size_t maximum_bitlength)
{
    ASSERT((can_overflow == true && maximum_bitlength == 0) ||
           (can_overflow == false && (maximum_bitlength == 0 || maximum_bitlength > (3 * NUM_LIMB_BITS))));

    // Check that the values of two parts are within specified bounds
    ASSERT(uint256_t(low_bits_in.get_value()) < (uint256_t(1) << (NUM_LIMB_BITS * 2)));
    ASSERT(uint256_t(high_bits_in.get_value()) < (uint256_t(1) << (NUM_LIMB_BITS * 2)));

    context = low_bits_in.context == nullptr ? high_bits_in.context : low_bits_in.context;
    field_t<Builder> limb_0(context);
    field_t<Builder> limb_1(context);
    field_t<Builder> limb_2(context);
    field_t<Builder> limb_3(context);
    if (low_bits_in.witness_index != IS_CONSTANT) {
        std::vector<uint32_t> low_accumulator;
        if constexpr (HasPlookup<Builder>) {
            // MERGE NOTE: this was the if constexpr block introduced in ecebe7643
            const auto limb_witnesses =
                context->decompose_non_native_field_double_width_limb(low_bits_in.normalize().witness_index);
            limb_0.witness_index = limb_witnesses[0];
            limb_1.witness_index = limb_witnesses[1];
            field_t<Builder>::evaluate_linear_identity(low_bits_in, -limb_0, -limb_1 * shift_1, field_t<Builder>(0));

            // // Enforce that low_bits_in indeed only contains 2*NUM_LIMB_BITS bits
            // low_accumulator = context->decompose_into_default_range(low_bits_in.witness_index,
            //                                                         static_cast<size_t>(NUM_LIMB_BITS * 2));
            // // If this doesn't hold we're using a default plookup range size that doesn't work well with the limb
            // size
            // // here
            // ASSERT(low_accumulator.size() % 2 == 0);
            // size_t mid_index = low_accumulator.size() / 2 - 1;
            // limb_0.witness_index = low_accumulator[mid_index]; // Q:safer to just slice this from low_bits_in?
            // limb_1 = (low_bits_in - limb_0) * shift_right_1;
        } else {
            size_t mid_index;
            low_accumulator = context->decompose_into_base4_accumulators(
                low_bits_in.witness_index, static_cast<size_t>(NUM_LIMB_BITS * 2), "bigfield: low_bits_in too large.");
            mid_index = static_cast<size_t>((NUM_LIMB_BITS / 2) - 1);
            // Range constraint returns an array of partial sums, midpoint will happen to hold the big limb value
            limb_1.witness_index = low_accumulator[mid_index];
            // We can get the first half bits of low_bits_in from the variables we already created
            limb_0 = (low_bits_in - (limb_1 * shift_1));
        }
    } else {
        uint256_t slice_0 = uint256_t(low_bits_in.additive_constant).slice(0, NUM_LIMB_BITS);
        uint256_t slice_1 = uint256_t(low_bits_in.additive_constant).slice(NUM_LIMB_BITS, 2 * NUM_LIMB_BITS);
        limb_0 = field_t(context, bb::fr(slice_0));
        limb_1 = field_t(context, bb::fr(slice_1));
    }

    // If we wish to continue working with this element with lazy reductions - i.e. not moding out again after each
    // addition we apply a more limited range - 2^s for smallest s such that p<2^s (this is the case can_overflow ==
    // false)
    uint64_t num_last_limb_bits = (can_overflow) ? NUM_LIMB_BITS : NUM_LAST_LIMB_BITS;

    // if maximum_bitlength is set, this supercedes can_overflow
    if (maximum_bitlength > 0) {
        ASSERT(maximum_bitlength > 3 * NUM_LIMB_BITS);
        num_last_limb_bits = maximum_bitlength - (3 * NUM_LIMB_BITS);
    }
    // We create the high limb values similar to the low limb ones above
    const uint64_t num_high_limb_bits = NUM_LIMB_BITS + num_last_limb_bits;
    if (high_bits_in.witness_index != IS_CONSTANT) {

        std::vector<uint32_t> high_accumulator;
        if constexpr (HasPlookup<Builder>) {
            const auto limb_witnesses = context->decompose_non_native_field_double_width_limb(
                high_bits_in.normalize().witness_index, (size_t)num_high_limb_bits);
            limb_2.witness_index = limb_witnesses[0];
            limb_3.witness_index = limb_witnesses[1];
            field_t<Builder>::evaluate_linear_identity(high_bits_in, -limb_2, -limb_3 * shift_1, field_t<Builder>(0));

        } else {
            high_accumulator = context->decompose_into_base4_accumulators(high_bits_in.witness_index,
                                                                          static_cast<size_t>(num_high_limb_bits),
                                                                          "bigfield: high_bits_in too large.");
            limb_3.witness_index = high_accumulator[static_cast<size_t>((num_last_limb_bits / 2) - 1)];
            limb_2 = (high_bits_in - (limb_3 * shift_1));
        }
    } else {
        uint256_t slice_2 = uint256_t(high_bits_in.additive_constant).slice(0, NUM_LIMB_BITS);
        uint256_t slice_3 = uint256_t(high_bits_in.additive_constant).slice(NUM_LIMB_BITS, num_high_limb_bits);
        limb_2 = field_t(context, bb::fr(slice_2));
        limb_3 = field_t(context, bb::fr(slice_3));
    }
    binary_basis_limbs[0] = Limb(limb_0, DEFAULT_MAXIMUM_LIMB);
    binary_basis_limbs[1] = Limb(limb_1, DEFAULT_MAXIMUM_LIMB);
    binary_basis_limbs[2] = Limb(limb_2, DEFAULT_MAXIMUM_LIMB);
    if (maximum_bitlength > 0) {
        uint256_t max_limb_value = (uint256_t(1) << (maximum_bitlength - (3 * NUM_LIMB_BITS))) - 1;
        binary_basis_limbs[3] = Limb(limb_3, max_limb_value);
    } else {
        binary_basis_limbs[3] =
            Limb(limb_3, can_overflow ? DEFAULT_MAXIMUM_LIMB : DEFAULT_MAXIMUM_MOST_SIGNIFICANT_LIMB);
    }
    prime_basis_limb = low_bits_in + (high_bits_in * shift_2);
}

template <typename Builder, typename T>
bigfield<Builder, T>::bigfield(const bigfield& other)
    : context(other.context)
    , binary_basis_limbs{ other.binary_basis_limbs[0],
                          other.binary_basis_limbs[1],
                          other.binary_basis_limbs[2],
                          other.binary_basis_limbs[3] }
    , prime_basis_limb(other.prime_basis_limb)
{}

template <typename Builder, typename T>
bigfield<Builder, T>::bigfield(bigfield&& other)
    : context(other.context)
    , binary_basis_limbs{ other.binary_basis_limbs[0],
                          other.binary_basis_limbs[1],
                          other.binary_basis_limbs[2],
                          other.binary_basis_limbs[3] }
    , prime_basis_limb(other.prime_basis_limb)
{}

/**
 * @brief Creates a bigfield element from a uint512_t.
 * Bigfield element is constructed as a witness and not a circuit constant
 *
 * @param ctx
 * @param value
 * @param can_overflow Can the input value have more than log2(modulus) bits?
 * @param maximum_bitlength Provide the explicit maximum bitlength if known. Otherwise bigfield max value will be either
 * log2(modulus) bits iff can_overflow = false, or (4 * NUM_LIMB_BITS) iff can_overflow = true
 * @return bigfield<Builder, T>
 *
 * @details This method is 1 gate more efficient than constructing from 2 field_ct elements.
 */
template <typename Builder, typename T>
bigfield<Builder, T> bigfield<Builder, T>::create_from_u512_as_witness(Builder* ctx,
                                                                       const uint512_t& value,
                                                                       const bool can_overflow,
                                                                       const size_t maximum_bitlength)
{
    ASSERT((can_overflow == true && maximum_bitlength == 0) ||
           (can_overflow == false && (maximum_bitlength == 0 || maximum_bitlength > (3 * NUM_LIMB_BITS))));
    std::array<uint256_t, 4> limbs;
    limbs[0] = value.slice(0, NUM_LIMB_BITS).lo;
    limbs[1] = value.slice(NUM_LIMB_BITS, NUM_LIMB_BITS * 2).lo;
    limbs[2] = value.slice(NUM_LIMB_BITS * 2, NUM_LIMB_BITS * 3).lo;
    limbs[3] = value.slice(NUM_LIMB_BITS * 3, NUM_LIMB_BITS * 4).lo;

    if constexpr (HasPlookup<Builder>) {
        field_t<Builder> limb_0(ctx);
        field_t<Builder> limb_1(ctx);
        field_t<Builder> limb_2(ctx);
        field_t<Builder> limb_3(ctx);
        field_t<Builder> prime_limb(ctx);
        limb_0.witness_index = ctx->add_variable(bb::fr(limbs[0]));
        limb_1.witness_index = ctx->add_variable(bb::fr(limbs[1]));
        limb_2.witness_index = ctx->add_variable(bb::fr(limbs[2]));
        limb_3.witness_index = ctx->add_variable(bb::fr(limbs[3]));
        prime_limb.witness_index = ctx->add_variable(limb_0.get_value() + limb_1.get_value() * shift_1 +
                                                     limb_2.get_value() * shift_2 + limb_3.get_value() * shift_3);
        // evaluate prime basis limb with addition gate that taps into the 4th wire in the next gate
        ctx->create_big_add_gate({ limb_1.witness_index,
                                   limb_2.witness_index,
                                   limb_3.witness_index,
                                   prime_limb.witness_index,
                                   shift_1,
                                   shift_2,
                                   shift_3,
                                   -1,
                                   0 },
                                 true);

        uint64_t num_last_limb_bits = (can_overflow) ? NUM_LIMB_BITS : NUM_LAST_LIMB_BITS;

        bigfield result(ctx);
        result.binary_basis_limbs[0] = Limb(limb_0, DEFAULT_MAXIMUM_LIMB);
        result.binary_basis_limbs[1] = Limb(limb_1, DEFAULT_MAXIMUM_LIMB);
        result.binary_basis_limbs[2] = Limb(limb_2, DEFAULT_MAXIMUM_LIMB);
        result.binary_basis_limbs[3] =
            Limb(limb_3, can_overflow ? DEFAULT_MAXIMUM_LIMB : DEFAULT_MAXIMUM_MOST_SIGNIFICANT_LIMB);

        // if maximum_bitlength is set, this supercedes can_overflow
        if (maximum_bitlength > 0) {
            ASSERT(maximum_bitlength > 3 * NUM_LIMB_BITS);
            num_last_limb_bits = maximum_bitlength - (3 * NUM_LIMB_BITS);
            uint256_t max_limb_value = (uint256_t(1) << num_last_limb_bits) - 1;
            result.binary_basis_limbs[3].maximum_value = max_limb_value;
        }
        result.prime_basis_limb = prime_limb;
        ctx->range_constrain_two_limbs(
            limb_0.witness_index, limb_1.witness_index, (size_t)NUM_LIMB_BITS, (size_t)NUM_LIMB_BITS);
        ctx->range_constrain_two_limbs(
            limb_2.witness_index, limb_3.witness_index, (size_t)NUM_LIMB_BITS, (size_t)num_last_limb_bits);

        return result;
    } else {
        return bigfield(witness_t(ctx, fr(limbs[0] + limbs[1] * shift_1)),
                        witness_t(ctx, fr(limbs[2] + limbs[3] * shift_1)),
                        can_overflow,
                        maximum_bitlength);
    }
}

template <typename Builder, typename T> bigfield<Builder, T>::bigfield(const byte_array<Builder>& bytes)
{
    ASSERT(bytes.size() == 32); // we treat input as a 256-bit big integer
    const auto split_byte_into_nibbles = [](Builder* ctx, const field_t<Builder>& split_byte) {
        const uint64_t byte_val = uint256_t(split_byte.get_value()).data[0];
        const uint64_t lo_nibble_val = byte_val & 15ULL;
        const uint64_t hi_nibble_val = byte_val >> 4;

        const field_t<Builder> lo_nibble(witness_t<Builder>(ctx, lo_nibble_val));
        const field_t<Builder> hi_nibble(witness_t<Builder>(ctx, hi_nibble_val));
        lo_nibble.create_range_constraint(4, "bigfield: lo_nibble too large");
        hi_nibble.create_range_constraint(4, "bigfield: hi_nibble too large");

        const field_t<Builder> sum = lo_nibble + (hi_nibble * 16);
        sum.assert_equal(split_byte);
        return std::make_pair<field_t<Builder>, field_t<Builder>>((field_t<Builder>)lo_nibble,
                                                                  (field_t<Builder>)hi_nibble);
    };

    const auto reconstruct_two_limbs = [&split_byte_into_nibbles](Builder* ctx,
                                                                  const field_t<Builder>& hi_bytes,
                                                                  const field_t<Builder>& lo_bytes,
                                                                  const field_t<Builder>& split_byte) {
        const auto [lo_nibble, hi_nibble] = split_byte_into_nibbles(ctx, split_byte);

        field_t<Builder> hi_limb = hi_nibble + hi_bytes * 16;
        field_t<Builder> lo_limb = lo_bytes + lo_nibble * field_t<Builder>(ctx, uint256_t(1) << 64);
        return std::make_pair<field_t<Builder>, field_t<Builder>>((field_t<Builder>)lo_limb, (field_t<Builder>)hi_limb);
    };
    Builder* ctx = bytes.get_context();

    const field_t<Builder> hi_8_bytes(bytes.slice(0, 6));
    const field_t<Builder> mid_split_byte(bytes.slice(6, 1));
    const field_t<Builder> mid_8_bytes(bytes.slice(7, 8));

    const field_t<Builder> lo_8_bytes(bytes.slice(15, 8));
    const field_t<Builder> lo_split_byte(bytes.slice(23, 1));
    const field_t<Builder> lolo_8_bytes(bytes.slice(24, 8));

    const auto [limb0, limb1] = reconstruct_two_limbs(ctx, lo_8_bytes, lolo_8_bytes, lo_split_byte);
    const auto [limb2, limb3] = reconstruct_two_limbs(ctx, hi_8_bytes, mid_8_bytes, mid_split_byte);

    const auto res = bigfield(limb0, limb1, limb2, limb3, true);

    const auto num_last_limb_bits = 256 - (NUM_LIMB_BITS * 3);
    res.binary_basis_limbs[3].maximum_value = (uint64_t(1) << num_last_limb_bits);
    *this = res;
}

template <typename Builder, typename T> bigfield<Builder, T>& bigfield<Builder, T>::operator=(const bigfield& other)
{
    context = other.context;
    binary_basis_limbs[0] = other.binary_basis_limbs[0];
    binary_basis_limbs[1] = other.binary_basis_limbs[1];
    binary_basis_limbs[2] = other.binary_basis_limbs[2];
    binary_basis_limbs[3] = other.binary_basis_limbs[3];
    prime_basis_limb = other.prime_basis_limb;
    return *this;
}

template <typename Builder, typename T> bigfield<Builder, T>& bigfield<Builder, T>::operator=(bigfield&& other)
{
    context = other.context;
    binary_basis_limbs[0] = other.binary_basis_limbs[0];
    binary_basis_limbs[1] = other.binary_basis_limbs[1];
    binary_basis_limbs[2] = other.binary_basis_limbs[2];
    binary_basis_limbs[3] = other.binary_basis_limbs[3];
    prime_basis_limb = other.prime_basis_limb;
    return *this;
}

template <typename Builder, typename T> uint512_t bigfield<Builder, T>::get_value() const
{
    uint512_t t0 = uint256_t(binary_basis_limbs[0].element.get_value());
    uint512_t t1 = uint256_t(binary_basis_limbs[1].element.get_value());
    uint512_t t2 = uint256_t(binary_basis_limbs[2].element.get_value());
    uint512_t t3 = uint256_t(binary_basis_limbs[3].element.get_value());
    return t0 + (t1 << (NUM_LIMB_BITS)) + (t2 << (2 * NUM_LIMB_BITS)) + (t3 << (3 * NUM_LIMB_BITS));
}

template <typename Builder, typename T> uint512_t bigfield<Builder, T>::get_maximum_value() const
{
    uint512_t t0 = uint512_t(binary_basis_limbs[0].maximum_value);
    uint512_t t1 = uint512_t(binary_basis_limbs[1].maximum_value) << NUM_LIMB_BITS;
    uint512_t t2 = uint512_t(binary_basis_limbs[2].maximum_value) << (NUM_LIMB_BITS * 2);
    uint512_t t3 = uint512_t(binary_basis_limbs[3].maximum_value) << (NUM_LIMB_BITS * 3);
    return t0 + t1 + t2 + t3;
}

/**
 * @brief Add a field element to the lower limb. CAUTION (the element has to be constrained before using this function)
 *
 * @details Sometimes we need to add a small constrained value to a bigfield element (for example, a boolean value), but
 * we don't want to construct a full bigfield element for that as it would take too many gates. If the maximum value of
 * the field element being added is small enough, we can simply add it to the lowest limb and increase its maximum
 * value. That will create 2 additional constraints instead of 5/3 needed to add 2 bigfield elements and several needed
 * to construct a bigfield element.
 *
 * @tparam Builder Builder
 * @tparam T Field Parameters
 * @param other Field element that will be added to the lower
 * @param other_maximum_value The maximum value of other
 * @return bigfield<Builder, T> Result
 */
template <typename Builder, typename T>
bigfield<Builder, T> bigfield<Builder, T>::add_to_lower_limb(const field_t<Builder>& other,
                                                             uint256_t other_maximum_value) const
{
    reduction_check();
    ASSERT((other_maximum_value + binary_basis_limbs[0].maximum_value) <= get_maximum_unreduced_limb_value());
    // needed cause a constant doesn't have a valid context
    Builder* ctx = context ? context : other.context;

    if (is_constant() && other.is_constant()) {
        return bigfield(ctx, uint256_t((get_value() + uint256_t(other.get_value())) % modulus_u512));
    }
    bigfield result = *this;
    result.binary_basis_limbs[0].maximum_value = binary_basis_limbs[0].maximum_value + other_maximum_value;

    result.binary_basis_limbs[0].element = binary_basis_limbs[0].element + other;
    result.prime_basis_limb = prime_basis_limb + other;
    return result;
}

template <typename Builder, typename T>
bigfield<Builder, T> bigfield<Builder, T>::operator+(const bigfield& other) const
{
    reduction_check();
    other.reduction_check();
    // needed cause a constant doesn't have a valid context
    Builder* ctx = context ? context : other.context;

    if (is_constant() && other.is_constant()) {
        return bigfield(ctx, uint256_t((get_value() + other.get_value()) % modulus_u512));
    }
    bigfield result(ctx);
    result.binary_basis_limbs[0].maximum_value =
        binary_basis_limbs[0].maximum_value + other.binary_basis_limbs[0].maximum_value;
    result.binary_basis_limbs[1].maximum_value =
        binary_basis_limbs[1].maximum_value + other.binary_basis_limbs[1].maximum_value;
    result.binary_basis_limbs[2].maximum_value =
        binary_basis_limbs[2].maximum_value + other.binary_basis_limbs[2].maximum_value;
    result.binary_basis_limbs[3].maximum_value =
        binary_basis_limbs[3].maximum_value + other.binary_basis_limbs[3].maximum_value;

    if constexpr (HasPlookup<Builder>) {
        if (prime_basis_limb.multiplicative_constant == 1 && other.prime_basis_limb.multiplicative_constant == 1 &&
            !is_constant() && !other.is_constant()) {
            bool limbconst = binary_basis_limbs[0].element.is_constant();
            limbconst = limbconst || binary_basis_limbs[1].element.is_constant();
            limbconst = limbconst || binary_basis_limbs[2].element.is_constant();
            limbconst = limbconst || binary_basis_limbs[3].element.is_constant();
            limbconst = limbconst || prime_basis_limb.is_constant();
            limbconst = limbconst || other.binary_basis_limbs[0].element.is_constant();
            limbconst = limbconst || other.binary_basis_limbs[1].element.is_constant();
            limbconst = limbconst || other.binary_basis_limbs[2].element.is_constant();
            limbconst = limbconst || other.binary_basis_limbs[3].element.is_constant();
            limbconst = limbconst || other.prime_basis_limb.is_constant();
            limbconst = limbconst || (prime_basis_limb.witness_index == other.prime_basis_limb.witness_index);
            if (!limbconst) {
                std::pair<uint32_t, bb::fr> x0{ binary_basis_limbs[0].element.witness_index,
                                                binary_basis_limbs[0].element.multiplicative_constant };
                std::pair<uint32_t, bb::fr> x1{ binary_basis_limbs[1].element.witness_index,
                                                binary_basis_limbs[1].element.multiplicative_constant };
                std::pair<uint32_t, bb::fr> x2{ binary_basis_limbs[2].element.witness_index,
                                                binary_basis_limbs[2].element.multiplicative_constant };
                std::pair<uint32_t, bb::fr> x3{ binary_basis_limbs[3].element.witness_index,
                                                binary_basis_limbs[3].element.multiplicative_constant };
                std::pair<uint32_t, bb::fr> y0{ other.binary_basis_limbs[0].element.witness_index,
                                                other.binary_basis_limbs[0].element.multiplicative_constant };
                std::pair<uint32_t, bb::fr> y1{ other.binary_basis_limbs[1].element.witness_index,
                                                other.binary_basis_limbs[1].element.multiplicative_constant };
                std::pair<uint32_t, bb::fr> y2{ other.binary_basis_limbs[2].element.witness_index,
                                                other.binary_basis_limbs[2].element.multiplicative_constant };
                std::pair<uint32_t, bb::fr> y3{ other.binary_basis_limbs[3].element.witness_index,
                                                other.binary_basis_limbs[3].element.multiplicative_constant };
                bb::fr c0(binary_basis_limbs[0].element.additive_constant +
                          other.binary_basis_limbs[0].element.additive_constant);
                bb::fr c1(binary_basis_limbs[1].element.additive_constant +
                          other.binary_basis_limbs[1].element.additive_constant);
                bb::fr c2(binary_basis_limbs[2].element.additive_constant +
                          other.binary_basis_limbs[2].element.additive_constant);
                bb::fr c3(binary_basis_limbs[3].element.additive_constant +
                          other.binary_basis_limbs[3].element.additive_constant);

                uint32_t xp(prime_basis_limb.witness_index);
                uint32_t yp(other.prime_basis_limb.witness_index);
                bb::fr cp(prime_basis_limb.additive_constant + other.prime_basis_limb.additive_constant);

                const auto output_witnesses = ctx->evaluate_non_native_field_addition(
                    { x0, y0, c0 }, { x1, y1, c1 }, { x2, y2, c2 }, { x3, y3, c3 }, { xp, yp, cp });
                result.binary_basis_limbs[0].element = field_t<Builder>::from_witness_index(ctx, output_witnesses[0]);
                result.binary_basis_limbs[1].element = field_t<Builder>::from_witness_index(ctx, output_witnesses[1]);
                result.binary_basis_limbs[2].element = field_t<Builder>::from_witness_index(ctx, output_witnesses[2]);
                result.binary_basis_limbs[3].element = field_t<Builder>::from_witness_index(ctx, output_witnesses[3]);
                result.prime_basis_limb = field_t<Builder>::from_witness_index(ctx, output_witnesses[4]);
                return result;
            }
        }
    }

    result.binary_basis_limbs[0].element = binary_basis_limbs[0].element + other.binary_basis_limbs[0].element;
    result.binary_basis_limbs[1].element = binary_basis_limbs[1].element + other.binary_basis_limbs[1].element;
    result.binary_basis_limbs[2].element = binary_basis_limbs[2].element + other.binary_basis_limbs[2].element;
    result.binary_basis_limbs[3].element = binary_basis_limbs[3].element + other.binary_basis_limbs[3].element;
    result.prime_basis_limb = prime_basis_limb + other.prime_basis_limb;
    return result;
}

// to make sure we don't go to negative values, add p before subtracting other
/**
 * Subtraction operator.
 *
 * Like operator+, we use lazy reduction techniques to save on field reductions.
 *
 * Instead of computing `*this - other`, we compute offset X and compute:
 * `*this + X - other`
 * This ensures we do not underflow!
 *
 * Offset `X` will be a multiple of our bigfield modulus `p`
 *
 * i.e `X = m * p`
 *
 * It is NOT enough to ensure that the integer value of `*this + X - other` does not underflow.
 * We must ALSO ensure that each LIMB of the result does not underflow
 *
 * We must compute the MINIMUM value of `m` that ensures that none of the bigfield limbs will underflow!
 *
 * i.e. We must compute the MINIMUM value of `m` such that, for each limb `i`, the following result is positive:
 *
 * *this.limb[i] + X.limb[i] - other.limb[i]
 **/
template <typename Builder, typename T>
bigfield<Builder, T> bigfield<Builder, T>::operator-(const bigfield& other) const
{
    Builder* ctx = context ? context : other.context;
    reduction_check();
    other.reduction_check();

    if (is_constant() && other.is_constant()) {
        uint512_t left = get_value() % modulus_u512;
        uint512_t right = other.get_value() % modulus_u512;
        uint512_t out = (left + modulus_u512 - right) % modulus_u512;
        return bigfield(ctx, uint256_t(out.lo));
    }

    if (other.is_constant()) {
        uint512_t right = other.get_value() % modulus_u512;
        uint512_t neg_right = (modulus_u512 - right) % modulus_u512;
        return operator+(bigfield(ctx, uint256_t(neg_right.lo)));
    }

    /**
     * Plookup bigfield subtractoin
     *
     * We have a special addition gate we can toggle, that will compute: (w_1 + w_4 - w_4_omega + q_arith = 0)
     * This is in addition to the regular addition gate
     *
     * We can arrange our wires in memory like this:
     *
     *   |  1  |  2  |  3  |  4  |
     *   |-----|-----|-----|-----|
     *   | b.p | a.0 | b.0 | c.p | (b.p + c.p - a.p = 0) AND (a.0 - b.0 - c.0 = 0)
     *   | a.p | a.1 | b.1 | c.0 | (a.1 - b.1 - c.1 = 0)
     *   | a.2 | b.2 | c.2 | c.1 | (a.2 - b.2 - c.2 = 0)
     *   | a.3 | b.3 | c.3 | --- | (a.3 - b.3 - c.3 = 0)
     *
     **/

    bigfield result(ctx);

    /**
     * Step 1: For each limb compute the MAXIMUM value we will have to borrow from the next significant limb
     *
     * i.e. if we assume that `*this = 0` and `other = other.maximum_value`, how many bits do we need to borrow from
     * the next significant limb to ensure each limb value is positive?
     *
     * N.B. for this segment `maximum_value` really refers to maximum NEGATIVE value of the result
     **/
    uint256_t limb_0_maximum_value = other.binary_basis_limbs[0].maximum_value;

    // Compute maximum shift factor for limb_0
    uint64_t limb_0_borrow_shift = std::max(limb_0_maximum_value.get_msb() + 1, NUM_LIMB_BITS);

    // Compute the maximum negative value of limb_1, including the bits limb_0 may need to borrow
    uint256_t limb_1_maximum_value =
        other.binary_basis_limbs[1].maximum_value + (uint256_t(1) << (limb_0_borrow_shift - NUM_LIMB_BITS));

    // repeat the above for the remaining limbs
    uint64_t limb_1_borrow_shift = std::max(limb_1_maximum_value.get_msb() + 1, NUM_LIMB_BITS);
    uint256_t limb_2_maximum_value =
        other.binary_basis_limbs[2].maximum_value + (uint256_t(1) << (limb_1_borrow_shift - NUM_LIMB_BITS));
    uint64_t limb_2_borrow_shift = std::max(limb_2_maximum_value.get_msb() + 1, NUM_LIMB_BITS);

    uint256_t limb_3_maximum_value =
        other.binary_basis_limbs[3].maximum_value + (uint256_t(1) << (limb_2_borrow_shift - NUM_LIMB_BITS));

    /**
     * Step 2: Compute the constant value `X = m * p` we must add to the result to ensure EVERY limb is >= 0
     *
     * We need to find a value `X` where `X.limb[3] > limb_3_maximum_value`.
     * As long as the above holds, we can borrow bits from X.limb[3] to ensure less significant limbs are positive
     *
     * Start by setting constant_to_add = p
     **/
    uint512_t constant_to_add = modulus_u512;
    // add a large enough multiple of p to not get negative result in subtraction
    while (constant_to_add.slice(NUM_LIMB_BITS * 3, NUM_LIMB_BITS * 4).lo <= limb_3_maximum_value) {
        constant_to_add += modulus_u512;
    }

    /**
     * Step 3: Compute offset terms t0, t1, t2, t3 that we add to our result to ensure each limb is positive
     *
     * t3 represents the value we are BORROWING from constant_to_add.limb[3]
     * t2, t1, t0 are the terms we will ADD to constant_to_add.limb[2], constant_to_add.limb[1], constant_to_add.limb[0]
     *
     * i.e. The net value we add to `constant_to_add` is 0. We must ensure that:
     * t3 = t0 + (t1 << NUM_LIMB_BITS) + (t2 << NUM_LIMB_BITS * 2)
     *
     * e.g. the value we borrow to produce t0 is subtracted from t1,
     *      the value we borrow from t1 is subtracted from t2
     *      the value we borrow from t2 is equal to t3
     **/
    uint256_t t0(uint256_t(1) << limb_0_borrow_shift);
    uint256_t t1((uint256_t(1) << limb_1_borrow_shift) - (uint256_t(1) << (limb_0_borrow_shift - NUM_LIMB_BITS)));
    uint256_t t2((uint256_t(1) << limb_2_borrow_shift) - (uint256_t(1) << (limb_1_borrow_shift - NUM_LIMB_BITS)));
    uint256_t t3(uint256_t(1) << (limb_2_borrow_shift - NUM_LIMB_BITS));

    /**
     * Compute the limbs of `constant_to_add`, including our offset terms t0, t1, t2, t3 that ensure each result limb is
     *positive
     **/
    uint256_t to_add_0 = uint256_t(constant_to_add.slice(0, NUM_LIMB_BITS)) + t0;
    uint256_t to_add_1 = uint256_t(constant_to_add.slice(NUM_LIMB_BITS, NUM_LIMB_BITS * 2)) + t1;
    uint256_t to_add_2 = uint256_t(constant_to_add.slice(NUM_LIMB_BITS * 2, NUM_LIMB_BITS * 3)) + t2;
    uint256_t to_add_3 = uint256_t(constant_to_add.slice(NUM_LIMB_BITS * 3, NUM_LIMB_BITS * 4)) - t3;

    /**
     * Update the maximum possible value of the result. We assume here that (*this.value) = 0
     **/
    result.binary_basis_limbs[0].maximum_value = binary_basis_limbs[0].maximum_value + to_add_0;
    result.binary_basis_limbs[1].maximum_value = binary_basis_limbs[1].maximum_value + to_add_1;
    result.binary_basis_limbs[2].maximum_value = binary_basis_limbs[2].maximum_value + to_add_2;
    result.binary_basis_limbs[3].maximum_value = binary_basis_limbs[3].maximum_value + to_add_3;

    /**
     * Compute the binary basis limbs of our result
     **/
    result.binary_basis_limbs[0].element = binary_basis_limbs[0].element + bb::fr(to_add_0);
    result.binary_basis_limbs[1].element = binary_basis_limbs[1].element + bb::fr(to_add_1);
    result.binary_basis_limbs[2].element = binary_basis_limbs[2].element + bb::fr(to_add_2);
    result.binary_basis_limbs[3].element = binary_basis_limbs[3].element + bb::fr(to_add_3);

    if constexpr (HasPlookup<Builder>) {
        if (prime_basis_limb.multiplicative_constant == 1 && other.prime_basis_limb.multiplicative_constant == 1 &&
            !is_constant() && !other.is_constant()) {
            bool limbconst = result.binary_basis_limbs[0].element.is_constant();
            limbconst = limbconst || result.binary_basis_limbs[1].element.is_constant();
            limbconst = limbconst || result.binary_basis_limbs[2].element.is_constant();
            limbconst = limbconst || result.binary_basis_limbs[3].element.is_constant();
            limbconst = limbconst || prime_basis_limb.is_constant();
            limbconst = limbconst || other.binary_basis_limbs[0].element.is_constant();
            limbconst = limbconst || other.binary_basis_limbs[1].element.is_constant();
            limbconst = limbconst || other.binary_basis_limbs[2].element.is_constant();
            limbconst = limbconst || other.binary_basis_limbs[3].element.is_constant();
            limbconst = limbconst || other.prime_basis_limb.is_constant();
            limbconst = limbconst || (prime_basis_limb.witness_index == other.prime_basis_limb.witness_index);
            if (!limbconst) {
                std::pair<uint32_t, bb::fr> x0{ result.binary_basis_limbs[0].element.witness_index,
                                                binary_basis_limbs[0].element.multiplicative_constant };
                std::pair<uint32_t, bb::fr> x1{ result.binary_basis_limbs[1].element.witness_index,
                                                binary_basis_limbs[1].element.multiplicative_constant };
                std::pair<uint32_t, bb::fr> x2{ result.binary_basis_limbs[2].element.witness_index,
                                                binary_basis_limbs[2].element.multiplicative_constant };
                std::pair<uint32_t, bb::fr> x3{ result.binary_basis_limbs[3].element.witness_index,
                                                binary_basis_limbs[3].element.multiplicative_constant };
                std::pair<uint32_t, bb::fr> y0{ other.binary_basis_limbs[0].element.witness_index,
                                                other.binary_basis_limbs[0].element.multiplicative_constant };
                std::pair<uint32_t, bb::fr> y1{ other.binary_basis_limbs[1].element.witness_index,
                                                other.binary_basis_limbs[1].element.multiplicative_constant };
                std::pair<uint32_t, bb::fr> y2{ other.binary_basis_limbs[2].element.witness_index,
                                                other.binary_basis_limbs[2].element.multiplicative_constant };
                std::pair<uint32_t, bb::fr> y3{ other.binary_basis_limbs[3].element.witness_index,
                                                other.binary_basis_limbs[3].element.multiplicative_constant };
                bb::fr c0(result.binary_basis_limbs[0].element.additive_constant -
                          other.binary_basis_limbs[0].element.additive_constant);
                bb::fr c1(result.binary_basis_limbs[1].element.additive_constant -
                          other.binary_basis_limbs[1].element.additive_constant);
                bb::fr c2(result.binary_basis_limbs[2].element.additive_constant -
                          other.binary_basis_limbs[2].element.additive_constant);
                bb::fr c3(result.binary_basis_limbs[3].element.additive_constant -
                          other.binary_basis_limbs[3].element.additive_constant);

                uint32_t xp(prime_basis_limb.witness_index);
                uint32_t yp(other.prime_basis_limb.witness_index);
                bb::fr cp(prime_basis_limb.additive_constant - other.prime_basis_limb.additive_constant);
                uint512_t constant_to_add_mod_p = (constant_to_add) % prime_basis.modulus;
                cp += bb::fr(constant_to_add_mod_p.lo);

                const auto output_witnesses = ctx->evaluate_non_native_field_subtraction(
                    { x0, y0, c0 }, { x1, y1, c1 }, { x2, y2, c2 }, { x3, y3, c3 }, { xp, yp, cp });

                result.binary_basis_limbs[0].element = field_t<Builder>::from_witness_index(ctx, output_witnesses[0]);
                result.binary_basis_limbs[1].element = field_t<Builder>::from_witness_index(ctx, output_witnesses[1]);
                result.binary_basis_limbs[2].element = field_t<Builder>::from_witness_index(ctx, output_witnesses[2]);
                result.binary_basis_limbs[3].element = field_t<Builder>::from_witness_index(ctx, output_witnesses[3]);
                result.prime_basis_limb = field_t<Builder>::from_witness_index(ctx, output_witnesses[4]);
                return result;
            }
        }
    }

    result.binary_basis_limbs[0].element -= other.binary_basis_limbs[0].element;
    result.binary_basis_limbs[1].element -= other.binary_basis_limbs[1].element;
    result.binary_basis_limbs[2].element -= other.binary_basis_limbs[2].element;
    result.binary_basis_limbs[3].element -= other.binary_basis_limbs[3].element;

    /**
     * Compute the prime basis limb of the result
     **/
    uint512_t constant_to_add_mod_p = (constant_to_add) % prime_basis.modulus;
    field_t prime_basis_to_add(ctx, bb::fr(constant_to_add_mod_p.lo));
    result.prime_basis_limb = prime_basis_limb + prime_basis_to_add;
    result.prime_basis_limb -= other.prime_basis_limb;
    return result;
}

/**
 * Evaluate a non-native field multiplication: (a * b = c mod p) where p == target_basis.modulus
 *
 * We compute quotient term `q` and remainder `c` and evaluate that:
 *
 * a * b - q * p - c = 0 mod modulus_u512 (binary basis modulus, currently 2**272)
 * a * b - q * p - c = 0 mod circuit modulus
 **/
template <typename Builder, typename T>
bigfield<Builder, T> bigfield<Builder, T>::operator*(const bigfield& other) const
{
    // First we do basic reduction checks of individual elements
    reduction_check();
    other.reduction_check();
    Builder* ctx = context ? context : other.context;
    // Now we can actually compute the quotient and remainder values
    const auto [quotient_value, remainder_value] = compute_quotient_remainder_values(*this, other, {});
    bigfield remainder;
    bigfield quotient;
    // If operands are constant, define result as a constant value and return
    if (is_constant() && other.is_constant()) {
        remainder = bigfield(ctx, uint256_t(remainder_value.lo));
        return remainder;
    } else {
        // when writing a*b = q*p + r we wish to enforce r<2^s for smallest s such that p<2^s
        // hence the second constructor call is with can_overflow=false. This will allow using r in more additions mod
        // 2^t without needing to apply the mod, where t=4*NUM_LIMB_BITS

        // Check if the product overflows CRT or the quotient can't be contained in a range proof and reduce accordingly
        auto [reduction_required, num_quotient_bits] =
            get_quotient_reduction_info({ get_maximum_value() }, { other.get_maximum_value() }, {});
        if (reduction_required) {
            if (get_maximum_value() > other.get_maximum_value()) {
                self_reduce();
            } else {
                other.self_reduce();
            }
            return (*this).operator*(other);
        }
        quotient = create_from_u512_as_witness(ctx, quotient_value, false, num_quotient_bits);
        remainder = create_from_u512_as_witness(ctx, remainder_value);
    };

    // Call `evaluate_multiply_add` to validate the correctness of our computed quotient and remainder
    unsafe_evaluate_multiply_add(*this, other, {}, quotient, { remainder });
    return remainder;
}

/**
 * Division operator. Doesn't create constraints for b!=0, which can lead to vulnerabilities. If you need a safer
 *variant use div_check_denominator_nonzero.
 *
 * To evaluate (a / b = c mod p), we instead evaluate (c * b = a mod p).
 **/
template <typename Builder, typename T>
bigfield<Builder, T> bigfield<Builder, T>::operator/(const bigfield& other) const
{

    return internal_div({ *this }, other, false);
}
/**
 * @brief Create constraints for summing these terms
 *
 * @tparam Builder
 * @tparam T
 * @param terms
 * @return The sum of terms
 */
template <typename Builder, typename T>
bigfield<Builder, T> bigfield<Builder, T>::sum(const std::vector<bigfield>& terms)
{
    ASSERT(terms.size() > 0);

    if (terms.size() == 1) {
        return terms[0];
    }
    std::vector<bigfield> halved;
    for (size_t i = 0; i < terms.size() / 2; i++) {
        halved.push_back(terms[2 * i] + terms[2 * i + 1]);
    }
    if (terms.size() & 1) {
        halved.push_back(terms[terms.size() - 1]);
    }
    return sum(halved);
}

/**
 * Division of a sum with an optional check if divisor is zero. Should not be used outside of class.
 *
 * @param numerators Vector of numerators
 * @param denominator Denominator
 * @param check_for_zero If the zero check should be enabled
 *
 * @return The result of division
 * */
template <typename Builder, typename T>
bigfield<Builder, T> bigfield<Builder, T>::internal_div(const std::vector<bigfield>& numerators,
                                                        const bigfield& denominator,
                                                        bool check_for_zero)
{
    if (numerators.size() == 0) {
        return bigfield<Builder, T>(denominator.get_context(), uint256_t(0));
    }

    denominator.reduction_check();
    Builder* ctx = denominator.context;
    uint512_t numerator_values(0);
    bool numerator_constant = true;
    for (const auto& numerator_element : numerators) {
        ctx = (ctx == nullptr) ? numerator_element.get_context() : ctx;
        numerator_element.reduction_check();
        numerator_values += numerator_element.get_value();
        numerator_constant = numerator_constant && (numerator_element.is_constant());
    }

    // a / b = c
    // => c * b = a mod p
    const uint1024_t left = uint1024_t(numerator_values);
    const uint1024_t right = uint1024_t(denominator.get_value());
    const uint1024_t modulus(target_basis.modulus);
    uint512_t inverse_value = right.lo.invmod(target_basis.modulus).lo;
    uint1024_t inverse_1024(inverse_value);
    inverse_value = ((left * inverse_1024) % modulus).lo;

    const uint1024_t quotient_1024 =
        (uint1024_t(inverse_value) * right + unreduced_zero().get_value() - left) / modulus;
    const uint512_t quotient_value = quotient_1024.lo;

    bigfield inverse;
    bigfield quotient;
    if (numerator_constant && denominator.is_constant()) {
        inverse = bigfield(ctx, uint256_t(inverse_value));
        return inverse;
    } else {
        // We only add the check if the result is non-constant
        std::vector<uint1024_t> numerator_max;
        for (const auto& n : numerators) {
            numerator_max.push_back(n.get_maximum_value());
        }

        auto [reduction_required, num_quotient_bits] =
            get_quotient_reduction_info({ static_cast<uint512_t>(DEFAULT_MAXIMUM_REMAINDER) },
                                        { denominator.get_maximum_value() },
                                        { unreduced_zero() },
                                        numerator_max);
        if (reduction_required) {

            denominator.self_reduce();
            return internal_div(numerators, denominator, check_for_zero);
        }
        // We do this after the quotient check, since this creates gates and we don't want to do this twice
        if (check_for_zero) {
            denominator.assert_is_not_equal(zero());
        }

        quotient = create_from_u512_as_witness(ctx, quotient_value, false, num_quotient_bits);
        inverse = create_from_u512_as_witness(ctx, inverse_value);
    }

    unsafe_evaluate_multiply_add(denominator, inverse, { unreduced_zero() }, quotient, numerators);
    return inverse;
}

/**
 * Div method without constraining denominator!=0.
 *
 * Similar to operator/ but numerator can be linear sum of multiple elements
 *
 **/
template <typename Builder, typename T>
bigfield<Builder, T> bigfield<Builder, T>::div_without_denominator_check(const std::vector<bigfield>& numerators,
                                                                         const bigfield& denominator)
{
    return internal_div(numerators, denominator, false);
}

/**
 * Div method with constraints for denominator!=0.
 *
 * Similar to operator/ but numerator can be linear sum of multiple elements
 *
 * TODO: After we create a mechanism for easy updating of witnesses, create a test with proof check
 **/
template <typename Builder, typename T>
bigfield<Builder, T> bigfield<Builder, T>::div_check_denominator_nonzero(const std::vector<bigfield>& numerators,
                                                                         const bigfield& denominator)
{
    return internal_div(numerators, denominator, true);
}
/**
 * Compute a * a = c mod p
 *
 * Slightly cheaper than operator* for StandardPlonk
 **/
template <typename Builder, typename T> bigfield<Builder, T> bigfield<Builder, T>::sqr() const
{
    reduction_check();
    Builder* ctx = context;

    const auto [quotient_value, remainder_value] = compute_quotient_remainder_values(*this, *this, {});

    bigfield remainder;
    bigfield quotient;
    if (is_constant()) {
        remainder = bigfield(ctx, uint256_t(remainder_value.lo));
        return remainder;
    } else {

        auto [reduction_required, num_quotient_bits] = get_quotient_reduction_info(
            { get_maximum_value() }, { get_maximum_value() }, {}, { DEFAULT_MAXIMUM_REMAINDER });
        if (reduction_required) {
            self_reduce();
            return sqr();
        }

        quotient = create_from_u512_as_witness(ctx, quotient_value, false, num_quotient_bits);
        remainder = create_from_u512_as_witness(ctx, remainder_value);
    };

    unsafe_evaluate_square_add(*this, {}, quotient, remainder);
    return remainder;
}

/**
 * Compute a * a + ...to_add = b mod p
 *
 * We can chain multiple additions to a square/multiply with a single quotient/remainder.
 *
 * Chaining the additions here is cheaper than calling operator+ because we can combine some gates in
 *`evaluate_multiply_add`
 **/
template <typename Builder, typename T>
bigfield<Builder, T> bigfield<Builder, T>::sqradd(const std::vector<bigfield>& to_add) const
{
    reduction_check();

    Builder* ctx = context;

    uint512_t add_values(0);
    bool add_constant = true;
    for (const auto& add_element : to_add) {
        add_element.reduction_check();
        add_values += add_element.get_value();
        add_constant = add_constant && (add_element.is_constant());
    }

    const uint1024_t left(get_value());
    const uint1024_t right(get_value());
    const uint1024_t add_right(add_values);
    const uint1024_t modulus(target_basis.modulus);

    bigfield remainder;
    bigfield quotient;
    if (is_constant()) {
        if (add_constant) {

            const auto [quotient_1024, remainder_1024] = (left * right + add_right).divmod(modulus);
            remainder = bigfield(ctx, uint256_t(remainder_1024.lo.lo));
            return remainder;
        } else {

            const auto [quotient_1024, remainder_1024] = (left * right).divmod(modulus);
            std::vector<bigfield> new_to_add;
            for (auto& add_element : to_add) {
                new_to_add.push_back(add_element);
            }

            new_to_add.push_back(bigfield(ctx, remainder_1024.lo.lo));
            return sum(new_to_add);
        }
    } else {

        // Check the quotient fits the range proof
        auto [reduction_required, num_quotient_bits] = get_quotient_reduction_info(
            { get_maximum_value() }, { get_maximum_value() }, to_add, { DEFAULT_MAXIMUM_REMAINDER });

        if (reduction_required) {
            self_reduce();
            return sqradd(to_add);
        }
        const auto [quotient_1024, remainder_1024] = (left * right + add_right).divmod(modulus);
        uint512_t quotient_value = quotient_1024.lo;
        uint256_t remainder_value = remainder_1024.lo.lo;

        quotient = create_from_u512_as_witness(ctx, quotient_value, false, num_quotient_bits);
        remainder = create_from_u512_as_witness(ctx, remainder_value);
    };
    unsafe_evaluate_square_add(*this, to_add, quotient, remainder);
    return remainder;
}

/**
 * Compute a * b + ...to_add = c mod p
 *
 * @param to_mul Bigfield element to multiply by
 * @param to_add Vector of elements to add
 *
 * @return New bigfield elment c
 **/
template <typename Builder, typename T>
bigfield<Builder, T> bigfield<Builder, T>::madd(const bigfield& to_mul, const std::vector<bigfield>& to_add) const
{
    Builder* ctx = context ? context : to_mul.context;
    reduction_check();
    to_mul.reduction_check();

    uint512_t add_values(0);
    bool add_constant = true;

    for (const auto& add_element : to_add) {
        add_element.reduction_check();
        add_values += add_element.get_value();
        add_constant = add_constant && (add_element.is_constant());
    }

    const uint1024_t left(get_value());
    const uint1024_t mul_right(to_mul.get_value());
    const uint1024_t add_right(add_values);
    const uint1024_t modulus(target_basis.modulus);

    const auto [quotient_1024, remainder_1024] = (left * mul_right + add_right).divmod(modulus);

    const uint512_t quotient_value = quotient_1024.lo;
    const uint512_t remainder_value = remainder_1024.lo;

    bigfield remainder;
    bigfield quotient;
    if (is_constant() && to_mul.is_constant() && add_constant) {
        remainder = bigfield(ctx, uint256_t(remainder_value.lo));
        return remainder;
    } else {

        auto [reduction_required, num_quotient_bits] = get_quotient_reduction_info(
            { get_maximum_value() }, { to_mul.get_maximum_value() }, to_add, { DEFAULT_MAXIMUM_REMAINDER });
        if (reduction_required) {
            if (get_maximum_value() > to_mul.get_maximum_value()) {
                self_reduce();
            } else {
                to_mul.self_reduce();
            }
            return (*this).madd(to_mul, to_add);
        }
        quotient = create_from_u512_as_witness(ctx, quotient_value, false, num_quotient_bits);
        remainder = create_from_u512_as_witness(ctx, remainder_value);
    };
    unsafe_evaluate_multiply_add(*this, to_mul, to_add, quotient, { remainder });
    return remainder;
}

// MERGENOTE: Implementing dual_madd in terms of mult_madd following #729

/**
 * @brief Performs individual reductions on the supplied elements as well as more complex reductions to prevent CRT
 * modulus overflow and to fit the quotient inside the range proof
 *
 *
 * @tparam Builder builder
 * @tparam T basefield
 * @param mul_left
 * @param mul_right
 * @param to_add
 */
template <typename Builder, typename T>
void bigfield<Builder, T>::perform_reductions_for_mult_madd(std::vector<bigfield>& mul_left,
                                                            std::vector<bigfield>& mul_right,
                                                            const std::vector<bigfield>& to_add)
{
    const size_t number_of_products = mul_left.size();
    // Get the maximum values of elements
    std::vector<uint512_t> max_values_left;
    std::vector<uint512_t> max_values_right;

    max_values_left.reserve(number_of_products);
    max_values_right.reserve(number_of_products);
    // Do regular reduction checks for all elements
    for (auto& left_element : mul_left) {
        left_element.reduction_check();
        max_values_left.emplace_back(left_element.get_maximum_value());
    }

    for (auto& right_element : mul_right) {
        right_element.reduction_check();
        max_values_right.emplace_back(right_element.get_maximum_value());
    }

    // Perform CRT checks for the whole evaluation
    // 1. Check if we can overflow CRT modulus
    // 2. Check if the quotient actually fits in our range proof.
    // 3. If we haven't passed one of the checks, reduce accordingly, starting with the largest product

    // We only get the bitlength of range proof if there is no reduction
    bool reduction_required;
    reduction_required = std::get<0>(
        get_quotient_reduction_info(max_values_left, max_values_right, to_add, { DEFAULT_MAXIMUM_REMAINDER }));

    if (reduction_required) {

        // We are out of luck and have to reduce the elements to keep the intermediate result below CRT modulus
        // For that we need to compute the maximum update - how much reducing each element is going to update the
        // quotient.
        // Contents of the tuple: | Qmax_before-Qmax_after | product number | argument number |
        std::vector<std::tuple<uint1024_t, size_t, size_t>> maximum_value_updates;

        // We use this lambda function before the loop and in the loop itself
        // It computes the maximum value update from reduction of each element
        auto compute_updates = [](std::vector<std::tuple<uint1024_t, size_t, size_t>>& maxval_updates,
                                  std::vector<bigfield>& m_left,
                                  std::vector<bigfield>& m_right,
                                  size_t number_of_products) {
            maxval_updates.resize(0);
            maxval_updates.reserve(number_of_products * 2);
            // Compute all reduction differences
            for (size_t i = 0; i < number_of_products; i++) {
                uint1024_t original_left = static_cast<uint1024_t>(m_left[i].get_maximum_value());
                uint1024_t original_right = static_cast<uint1024_t>(m_right[i].get_maximum_value());
                uint1024_t original_product = original_left * original_right;
                if (m_left[i].is_constant()) {
                    // If the multiplicand is constant, we can't reduce it, so the update is 0.
                    maxval_updates.emplace_back(std::tuple<uint1024_t, size_t, size_t>(0, i, 0));
                } else {
                    uint1024_t new_product = DEFAULT_MAXIMUM_REMAINDER * original_right;
                    if (new_product > original_product) {
                        throw_or_abort("bigfield: This should never happen");
                    }
                    maxval_updates.emplace_back(
                        std::tuple<uint1024_t, size_t, size_t>(original_product - new_product, i, 0));
                }
                if (m_right[i].is_constant()) {
                    // If the multiplicand is constant, we can't reduce it, so the update is 0.
                    maxval_updates.emplace_back(std::tuple<uint1024_t, size_t, size_t>(0, i, 1));
                } else {
                    uint1024_t new_product = DEFAULT_MAXIMUM_REMAINDER * original_left;
                    if (new_product > original_product) {
                        throw_or_abort("bigfield: This should never happen");
                    }
                    maxval_updates.emplace_back(
                        std::tuple<uint1024_t, size_t, size_t>(original_product - new_product, i, 1));
                }
            }
        };

        // Compute the possible reduction updates
        compute_updates(maximum_value_updates, mul_left, mul_right, number_of_products);
        auto compare_update_tuples = [](std::tuple<uint1024_t, size_t, size_t>& left_element,
                                        std::tuple<uint1024_t, size_t, size_t>& right_element) {
            return std::get<0>(left_element) > std::get<0>(right_element);
        };

        // Sort the vector, larger values first
        std::sort(maximum_value_updates.begin(), maximum_value_updates.end(), compare_update_tuples);
        // Now we loop through, reducing 1 element each time. This is costly in code, but allows us to use fewer
        // gates

        while (reduction_required) {

            // We choose the largest update
            auto [update_size, largest_update_product_index, multiplicand_index] = maximum_value_updates[0];
            if (!update_size) {
                throw_or_abort("bigfield: Can't reduce further");
            }
            // Reduce the larger of the multiplicands that compose the product
            if (multiplicand_index == 0) {
                mul_left[largest_update_product_index].self_reduce();
            } else {
                mul_right[largest_update_product_index].self_reduce();
            }

            reduction_required = std::get<0>(
                get_quotient_reduction_info(max_values_left, max_values_right, to_add, { DEFAULT_MAXIMUM_REMAINDER }));

            compute_updates(maximum_value_updates, mul_left, mul_right, number_of_products);

            for (size_t i = 0; i < number_of_products; i++) {
                max_values_left[i] = mul_left[i].get_maximum_value();
                max_values_right[i] = mul_right[i].get_maximum_value();
            }

            // Sort the the vector
            std::sort(maximum_value_updates.begin(), maximum_value_updates.end(), compare_update_tuples);
        }
        // Now we have reduced everything exactly to the point of no overflow. There is probably a way to use even
        // fewer reductions, but for now this will suffice.
    }
}

/**
 * Evaluate the sum of products and additional values safely.
 *
 * @param mul_left Vector of bigfield multiplicands
 * @param mul_right Vector of bigfield multipliers
 * @param to_add Vector of bigfield elements to add to the sum of products
 *
 * @return A reduced value that is the sum of all products and to_add values
 * */
template <typename Builder, typename T>
bigfield<Builder, T> bigfield<Builder, T>::mult_madd(const std::vector<bigfield>& mul_left,
                                                     const std::vector<bigfield>& mul_right,
                                                     const std::vector<bigfield>& to_add,
                                                     bool fix_remainder_to_zero)
{
    ASSERT(mul_left.size() == mul_right.size());

    std::vector<bigfield> mutable_mul_left(mul_left);
    std::vector<bigfield> mutable_mul_right(mul_right);

    const size_t number_of_products = mul_left.size();

    const uint1024_t modulus(target_basis.modulus);
    uint1024_t worst_case_product_sum(0);
    uint1024_t add_right_constant_sum(0);

    // First we do all constant optimizations
    bool add_constant = true;
    std::vector<bigfield> new_to_add;

    for (const auto& add_element : to_add) {
        add_element.reduction_check();
        if (add_element.is_constant()) {
            add_right_constant_sum += uint1024_t(add_element.get_value());
        } else {
            add_constant = false;
            new_to_add.push_back(add_element);
        }
    }

    // Compute the product sum
    // Optimize constant use
    uint1024_t sum_of_constant_products(0);
    std::vector<bigfield> new_input_left;
    std::vector<bigfield> new_input_right;
    bool product_sum_constant = true;
    for (size_t i = 0; i < number_of_products; i++) {
        if (mutable_mul_left[i].is_constant() && mutable_mul_right[i].is_constant()) {
            // If constant, just add to the sum
            sum_of_constant_products +=
                uint1024_t(mutable_mul_left[i].get_value()) * uint1024_t(mutable_mul_right[i].get_value());
        } else {
            // If not, add to nonconstant sum and remember the elements
            new_input_left.push_back(mutable_mul_left[i]);
            new_input_right.push_back(mutable_mul_right[i]);
            product_sum_constant = false;
        }
    }

    Builder* ctx = nullptr;
    // Search through all multiplicands on the left
    for (auto& el : mutable_mul_left) {
        if (el.context) {
            ctx = el.context;
            break;
        }
    }
    // And on the right
    if (!ctx) {
        for (auto& el : mutable_mul_right) {
            if (el.context) {
                ctx = el.context;
                break;
            }
        }
    }
    if (product_sum_constant) {
        if (add_constant) {
            // Simply return the constant, no need unsafe_multiply_add
            const auto [quotient_1024, remainder_1024] =
                (sum_of_constant_products + add_right_constant_sum).divmod(modulus);
            ASSERT(!fix_remainder_to_zero || remainder_1024 == 0);
            return bigfield(ctx, uint256_t(remainder_1024.lo.lo));
        } else {
            const auto [quotient_1024, remainder_1024] =
                (sum_of_constant_products + add_right_constant_sum).divmod(modulus);
            uint256_t remainder_value = remainder_1024.lo.lo;
            bigfield result;
            if (remainder_value == uint256_t(0)) {
                // No need to add extra term to new_to_add
                result = sum(new_to_add);
            } else {
                // Add the constant term
                new_to_add.push_back(bigfield(ctx, uint256_t(remainder_value)));
                result = sum(new_to_add);
            }
            if (fix_remainder_to_zero) {
                result.self_reduce();
                result.assert_equal(zero());
            }
            return result;
        }
    }

    // Now that we know that there is at least 1 non-constant multiplication, we can start estimating reductions, etc

    // Compute the constant term we're adding
    const auto [_, constant_part_remainder_1024] = (sum_of_constant_products + add_right_constant_sum).divmod(modulus);
    const uint256_t constant_part_remainder_256 = constant_part_remainder_1024.lo.lo;

    if (constant_part_remainder_256 != uint256_t(0)) {
        new_to_add.push_back(bigfield(ctx, constant_part_remainder_256));
    }
    // Compute added sum
    uint1024_t add_right_final_sum(0);
    uint1024_t add_right_maximum(0);
    for (const auto& add_element : new_to_add) {
        // Technically not needed, but better to leave just in case
        add_element.reduction_check();
        add_right_final_sum += uint1024_t(add_element.get_value());

        add_right_maximum += uint1024_t(add_element.get_maximum_value());
    }
    const size_t final_number_of_products = new_input_left.size();

    // We need to check if it is possible to reduce the products enough
    worst_case_product_sum = uint1024_t(final_number_of_products) * uint1024_t(DEFAULT_MAXIMUM_REMAINDER) *
                             uint1024_t(DEFAULT_MAXIMUM_REMAINDER);

    // Check that we can actually reduce the products enough, this assert will probably never get triggered
    ASSERT((worst_case_product_sum + add_right_maximum) < get_maximum_crt_product());

    // We've collapsed all constants, checked if we can compute the sum of products in the worst case, time to check if
    // we need to reduce something
    perform_reductions_for_mult_madd(new_input_left, new_input_right, new_to_add);
    uint1024_t sum_of_products_final(0);
    for (size_t i = 0; i < final_number_of_products; i++) {
        sum_of_products_final += uint1024_t(new_input_left[i].get_value()) * uint1024_t(new_input_right[i].get_value());
    }

    // Get the number of range proof bits for the quotient
    const size_t num_quotient_bits = get_quotient_max_bits({ DEFAULT_MAXIMUM_REMAINDER });

    // Compute the quotient and remainder
    const auto [quotient_1024, remainder_1024] = (sum_of_products_final + add_right_final_sum).divmod(modulus);

    // If we are establishing an identity and the remainder has to be zero, we need to check, that it actually is

    if (fix_remainder_to_zero) {
        // This is not the only check. Circuit check is coming later :)
        ASSERT(remainder_1024.lo == uint512_t(0));
    }
    const uint512_t quotient_value = quotient_1024.lo;
    const uint512_t remainder_value = remainder_1024.lo;

    bigfield remainder;
    bigfield quotient;
    // Constrain quotient to mitigate CRT overflow attacks
    quotient = create_from_u512_as_witness(ctx, quotient_value, false, num_quotient_bits);

    if (fix_remainder_to_zero) {
        remainder = zero();
        // remainder needs to be defined as wire value and not selector values to satisfy
        // UltraPlonk's bigfield custom gates
        remainder.convert_constant_to_fixed_witness(ctx);
    } else {
        remainder = create_from_u512_as_witness(ctx, remainder_value);
    }

    unsafe_evaluate_multiple_multiply_add(new_input_left, new_input_right, new_to_add, quotient, { remainder });

    return remainder;
}

/**
 * Compute (left_a * right_a) + (left_b * right_b) + ...to_add = c mod p
 *
 * This is cheaper than two multiplication operations, as the above only requires one quotient/remainder
 **/
template <typename Builder, typename T>
bigfield<Builder, T> bigfield<Builder, T>::dual_madd(const bigfield& left_a,
                                                     const bigfield& right_a,
                                                     const bigfield& left_b,
                                                     const bigfield& right_b,
                                                     const std::vector<bigfield>& to_add)
{
    left_a.reduction_check();
    right_a.reduction_check();
    left_b.reduction_check();
    right_b.reduction_check();

    std::vector<bigfield> mul_left = { left_a, left_b };
    std::vector<bigfield> mul_right = { right_a, right_b };

    return mult_madd(mul_left, mul_right, to_add);
}

/**
 * multiply, subtract, divide.
 * This method computes:
 *
 * result = -(\sum{mul_left[i] * mul_right[i]} + ...to_add) / divisor
 *
 * Algorithm is constructed in this way to ensure that all computed terms are positive
 *
 * i.e. we evaluate:
 * result * divisor + (\sum{mul_left[i] * mul_right[i]) + ...to_add) = 0
 *
 * It is critical that ALL the terms on the LHS are positive to eliminate the possiblity of underflows
 * when calling `evaluate_multiple_multiply_add`
 *
 * only requires one quotient and remainder + overflow limbs
 *
 * We proxy this to mult_madd, so it only requires one quotient and remainder + overflow limbs
 **/
template <typename Builder, typename T>
bigfield<Builder, T> bigfield<Builder, T>::msub_div(const std::vector<bigfield>& mul_left,
                                                    const std::vector<bigfield>& mul_right,
                                                    const bigfield& divisor,
                                                    const std::vector<bigfield>& to_sub,
                                                    bool enable_divisor_nz_check)
{
    Builder* ctx = divisor.context;

    const size_t num_multiplications = mul_left.size();
    native product_native = 0;
    bool products_constant = true;

    // Check the basics
    ASSERT(mul_left.size() == mul_right.size());
    ASSERT(divisor.get_value() != 0);

    // This check is optional, because it is heavy and often we don't need it at all
    if (enable_divisor_nz_check) {
        divisor.assert_is_not_equal(zero());
    }

    // Compute the sum of products
    for (size_t i = 0; i < num_multiplications; ++i) {
        const native mul_left_native(uint512_t(mul_left[i].get_value() % modulus_u512).lo);
        const native mul_right_native(uint512_t(mul_right[i].get_value() % modulus_u512).lo);
        product_native += (mul_left_native * -mul_right_native);
        products_constant = products_constant && mul_left[i].is_constant() && mul_right[i].is_constant();
    }

    // Compute the sum of to_sub
    native sub_native(0);
    bool sub_constant = true;
    for (const auto& sub : to_sub) {
        sub_native += (uint512_t(sub.get_value() % modulus_u512).lo);
        sub_constant = sub_constant && sub.is_constant();
    }

    native divisor_native(uint512_t(divisor.get_value() % modulus_u512).lo);

    // Compute the result
    const native result_native = (product_native - sub_native) / divisor_native;

    const uint1024_t result_value = uint1024_t(uint512_t(static_cast<uint256_t>(result_native)));

    // If everything is constant, then we just return the constant
    if (sub_constant && products_constant && divisor.is_constant()) {
        return bigfield(ctx, uint256_t(result_value.lo.lo));
    }

    // Create the result witness
    bigfield result = create_from_u512_as_witness(ctx, result_value.lo);

    std::vector<bigfield> eval_left{ result };
    std::vector<bigfield> eval_right{ divisor };
    for (const auto& in : mul_left) {
        eval_left.emplace_back(in);
    }
    for (const auto& in : mul_right) {
        eval_right.emplace_back(in);
    }

    mult_madd(eval_left, eval_right, to_sub, true);
    return result;
}

template <typename Builder, typename T>
bigfield<Builder, T> bigfield<Builder, T>::conditional_negate(const bool_t<Builder>& predicate) const
{
    Builder* ctx = context ? context : predicate.context;

    if (is_constant() && predicate.is_constant()) {
        if (predicate.get_value()) {
            uint512_t out_val = (modulus_u512 - get_value()) % modulus_u512;
            return bigfield(ctx, out_val.lo);
        }
        return *this;
    }
    reduction_check();

    uint256_t limb_0_maximum_value = binary_basis_limbs[0].maximum_value;
    uint64_t limb_0_borrow_shift = std::max(limb_0_maximum_value.get_msb() + 1, NUM_LIMB_BITS);
    uint256_t limb_1_maximum_value =
        binary_basis_limbs[1].maximum_value + (uint256_t(1) << (limb_0_borrow_shift - NUM_LIMB_BITS));
    uint64_t limb_1_borrow_shift = std::max(limb_1_maximum_value.get_msb() + 1, NUM_LIMB_BITS);
    uint256_t limb_2_maximum_value =
        binary_basis_limbs[2].maximum_value + (uint256_t(1) << (limb_1_borrow_shift - NUM_LIMB_BITS));
    uint64_t limb_2_borrow_shift = std::max(limb_2_maximum_value.get_msb() + 1, NUM_LIMB_BITS);

    uint256_t limb_3_maximum_value =
        binary_basis_limbs[3].maximum_value + (uint256_t(1) << (limb_2_borrow_shift - NUM_LIMB_BITS));

    // uint256_t comparison_maximum = uint256_t(modulus_u512.slice(NUM_LIMB_BITS * 3, NUM_LIMB_BITS * 4));
    // uint256_t additive_term = comparison_maximum;
    // TODO: This is terribly inefficient. We should change it.
    uint512_t constant_to_add = modulus_u512;
    while (constant_to_add.slice(NUM_LIMB_BITS * 3, NUM_LIMB_BITS * 4).lo <= limb_3_maximum_value) {
        constant_to_add += modulus_u512;
    }

    uint256_t t0(uint256_t(1) << limb_0_borrow_shift);
    uint256_t t1((uint256_t(1) << limb_1_borrow_shift) - (uint256_t(1) << (limb_0_borrow_shift - NUM_LIMB_BITS)));
    uint256_t t2((uint256_t(1) << limb_2_borrow_shift) - (uint256_t(1) << (limb_1_borrow_shift - NUM_LIMB_BITS)));
    uint256_t t3(uint256_t(1) << (limb_2_borrow_shift - NUM_LIMB_BITS));

    uint256_t to_add_0_u256 = uint256_t(constant_to_add.slice(0, NUM_LIMB_BITS));
    uint256_t to_add_1_u256 = uint256_t(constant_to_add.slice(NUM_LIMB_BITS, NUM_LIMB_BITS * 2));
    uint256_t to_add_2_u256 = uint256_t(constant_to_add.slice(NUM_LIMB_BITS * 2, NUM_LIMB_BITS * 3));
    uint256_t to_add_3_u256 = uint256_t(constant_to_add.slice(NUM_LIMB_BITS * 3, NUM_LIMB_BITS * 4));

    bb::fr to_add_0(t0 + to_add_0_u256);
    bb::fr to_add_1(t1 + to_add_1_u256);
    bb::fr to_add_2(t2 + to_add_2_u256);
    bb::fr to_add_3(to_add_3_u256 - t3);

    // we either return current value if predicate is false, or (limb_i - value) if predicate is true
    // (1 - predicate) * value + predicate * (limb_i - value)
    // = predicate * (limb_i - 2 * value) + value
    bb::fr two(2);

    field_t limb_0 = static_cast<field_t<Builder>>(predicate).madd(-(binary_basis_limbs[0].element * two) + to_add_0,
                                                                   binary_basis_limbs[0].element);
    field_t limb_1 = static_cast<field_t<Builder>>(predicate).madd(-(binary_basis_limbs[1].element * two) + to_add_1,
                                                                   binary_basis_limbs[1].element);
    field_t limb_2 = static_cast<field_t<Builder>>(predicate).madd(-(binary_basis_limbs[2].element * two) + to_add_2,
                                                                   binary_basis_limbs[2].element);
    field_t limb_3 = static_cast<field_t<Builder>>(predicate).madd(-(binary_basis_limbs[3].element * two) + to_add_3,
                                                                   binary_basis_limbs[3].element);

    uint256_t max_limb_0 = binary_basis_limbs[0].maximum_value + to_add_0_u256 + t0;
    uint256_t max_limb_1 = binary_basis_limbs[1].maximum_value + to_add_1_u256 + t1;
    uint256_t max_limb_2 = binary_basis_limbs[2].maximum_value + to_add_2_u256 + t2;
    uint256_t max_limb_3 = binary_basis_limbs[3].maximum_value + to_add_3_u256 - t3;

    bigfield result(ctx);
    result.binary_basis_limbs[0] = Limb(limb_0, max_limb_0);
    result.binary_basis_limbs[1] = Limb(limb_1, max_limb_1);
    result.binary_basis_limbs[2] = Limb(limb_2, max_limb_2);
    result.binary_basis_limbs[3] = Limb(limb_3, max_limb_3);

    uint512_t constant_to_add_mod_p = constant_to_add % prime_basis.modulus;
    field_t prime_basis_to_add(ctx, bb::fr(constant_to_add_mod_p.lo));
    result.prime_basis_limb =
        static_cast<field_t<Builder>>(predicate).madd(-(prime_basis_limb * two) + prime_basis_to_add, prime_basis_limb);

    return result;
}

/**
 * @brief Create an element which is equal to either this or other based on the predicate
 *
 * @tparam Builder
 * @tparam T
 * @param other The other bigfield element
 * @param predicate Predicate controlling the result (0 for this, 1 for the other)
 * @return Resulting element
 */
template <typename Builder, typename T>
bigfield<Builder, T> bigfield<Builder, T>::conditional_select(const bigfield& other,
                                                              const bool_t<Builder>& predicate) const
{
    if (is_constant() && other.is_constant() && predicate.is_constant()) {
        if (predicate.get_value()) {
            return other;
        }
        return *this;
    }
    Builder* ctx = context ? context : (other.context ? other.context : predicate.context);

    // TODO: use field_t::conditional_assign method
    field_t binary_limb_0 = static_cast<field_t<Builder>>(predicate).madd(
        other.binary_basis_limbs[0].element - binary_basis_limbs[0].element, binary_basis_limbs[0].element);
    field_t binary_limb_1 = static_cast<field_t<Builder>>(predicate).madd(
        other.binary_basis_limbs[1].element - binary_basis_limbs[1].element, binary_basis_limbs[1].element);
    field_t binary_limb_2 = static_cast<field_t<Builder>>(predicate).madd(
        other.binary_basis_limbs[2].element - binary_basis_limbs[2].element, binary_basis_limbs[2].element);
    field_t binary_limb_3 = static_cast<field_t<Builder>>(predicate).madd(
        other.binary_basis_limbs[3].element - binary_basis_limbs[3].element, binary_basis_limbs[3].element);
    field_t prime_limb =
        static_cast<field_t<Builder>>(predicate).madd(other.prime_basis_limb - prime_basis_limb, prime_basis_limb);

    bigfield result(ctx);
    // the maximum of the maximal values of elements is large enough
    result.binary_basis_limbs[0] =
        Limb(binary_limb_0, std::max(binary_basis_limbs[0].maximum_value, other.binary_basis_limbs[0].maximum_value));
    result.binary_basis_limbs[1] =
        Limb(binary_limb_1, std::max(binary_basis_limbs[1].maximum_value, other.binary_basis_limbs[1].maximum_value));
    result.binary_basis_limbs[2] =
        Limb(binary_limb_2, std::max(binary_basis_limbs[2].maximum_value, other.binary_basis_limbs[2].maximum_value));
    result.binary_basis_limbs[3] =
        Limb(binary_limb_3, std::max(binary_basis_limbs[3].maximum_value, other.binary_basis_limbs[3].maximum_value));
    result.prime_basis_limb = prime_limb;
    return result;
}

/**
 * REDUCTION CHECK
 *
 * When performing bigfield operations, we need to ensure the maximum value is less than:
 *      sqrt(2^{272} * native_modulus)
 *
 * We also need to ensure each binary basis limb is less than the maximum limb value
 *
 * This prevents our field arithmetic from overflowing the native modulus boundary, whilst ensuring we can
 * still use the chinese remainder theorem to validate field multiplications with a reduced number of range checks
 *
 * @param num_products The number of products a*b in the parent function that calls the reduction check. Needed to
 *limit overflow
 **/
template <typename Builder, typename T> void bigfield<Builder, T>::reduction_check(const size_t num_products) const
{

    if (is_constant()) { // this seems not a reduction check, but actually computing the reduction
                         // TODO THIS IS UGLY WHY CAN'T WE JUST DO (*THIS) = REDUCED?
        uint256_t reduced_value = (get_value() % modulus_u512).lo;
        bigfield reduced(context, uint256_t(reduced_value));
        binary_basis_limbs[0] = reduced.binary_basis_limbs[0];
        binary_basis_limbs[1] = reduced.binary_basis_limbs[1];
        binary_basis_limbs[2] = reduced.binary_basis_limbs[2];
        binary_basis_limbs[3] = reduced.binary_basis_limbs[3];
        prime_basis_limb = reduced.prime_basis_limb;
        return;
    }

    uint256_t maximum_limb_value = get_maximum_unreduced_limb_value();
    bool limb_overflow_test_0 = binary_basis_limbs[0].maximum_value > maximum_limb_value;
    bool limb_overflow_test_1 = binary_basis_limbs[1].maximum_value > maximum_limb_value;
    bool limb_overflow_test_2 = binary_basis_limbs[2].maximum_value > maximum_limb_value;
    bool limb_overflow_test_3 = binary_basis_limbs[3].maximum_value > maximum_limb_value;
    if (get_maximum_value() > get_maximum_unreduced_value(num_products) || limb_overflow_test_0 ||
        limb_overflow_test_1 || limb_overflow_test_2 || limb_overflow_test_3) {
        self_reduce();
    }
}

// create a version with mod 2^t element part in [0,p-1]
// After reducing to size 2^s, we check (p-1)-a is non-negative as integer.
// We perform subtraction using carries on blocks of size 2^b. The operations inside the blocks are done mod r
// Including the effect of carries the operation inside each limb is in the range [-2^b-1,2^{b+1}]
// Assuming this values are all distinct mod r, which happens e.g. if r/2>2^{b+1}, then if all limb values are
// non-negative at the end of subtraction, we know the subtraction result is positive as integers and a<p
template <typename Builder, typename T> void bigfield<Builder, T>::assert_is_in_field() const
{
    // Warning: this assumes we have run circuit construction at least once in debug mode where large non reduced
    // constants are allowed via ASSERT
    if (is_constant()) {
        return;
    }

    self_reduce(); // this method in particular enforces limb vals are <2^b - needed for logic described above
    uint256_t value = get_value().lo;
    // TODO:make formal assert that modulus<=256 bits
    constexpr uint256_t modulus_minus_one = modulus_u512.lo - 1;

    constexpr uint256_t modulus_minus_one_0 = modulus_minus_one.slice(0, NUM_LIMB_BITS);
    constexpr uint256_t modulus_minus_one_1 = modulus_minus_one.slice(NUM_LIMB_BITS, NUM_LIMB_BITS * 2);
    constexpr uint256_t modulus_minus_one_2 = modulus_minus_one.slice(NUM_LIMB_BITS * 2, NUM_LIMB_BITS * 3);
    constexpr uint256_t modulus_minus_one_3 = modulus_minus_one.slice(NUM_LIMB_BITS * 3, NUM_LIMB_BITS * 4);

    bool borrow_0_value = value.slice(0, NUM_LIMB_BITS) > modulus_minus_one_0;
    bool borrow_1_value =
        (value.slice(NUM_LIMB_BITS, NUM_LIMB_BITS * 2) + uint256_t(borrow_0_value)) > (modulus_minus_one_1);
    bool borrow_2_value =
        (value.slice(NUM_LIMB_BITS * 2, NUM_LIMB_BITS * 3) + uint256_t(borrow_1_value)) > (modulus_minus_one_2);

    field_t<Builder> modulus_0(context, modulus_minus_one_0);
    field_t<Builder> modulus_1(context, modulus_minus_one_1);
    field_t<Builder> modulus_2(context, modulus_minus_one_2);
    field_t<Builder> modulus_3(context, modulus_minus_one_3);
    bool_t<Builder> borrow_0(witness_t<Builder>(context, borrow_0_value));
    bool_t<Builder> borrow_1(witness_t<Builder>(context, borrow_1_value));
    bool_t<Builder> borrow_2(witness_t<Builder>(context, borrow_2_value));
    // The way we use borrows here ensures that we are checking that modulus - binary_basis > 0.
    // We check that the result in each limb is > 0.
    // If the modulus part in this limb is smaller, we simply borrow the value from the higher limb.
    // The prover can rearrange the borrows the way they like. The important thing is that the borrows are
    // constrained.
    field_t<Builder> r0 = modulus_0 - binary_basis_limbs[0].element + static_cast<field_t<Builder>>(borrow_0) * shift_1;
    field_t<Builder> r1 = modulus_1 - binary_basis_limbs[1].element +
                          static_cast<field_t<Builder>>(borrow_1) * shift_1 - static_cast<field_t<Builder>>(borrow_0);
    field_t<Builder> r2 = modulus_2 - binary_basis_limbs[2].element +
                          static_cast<field_t<Builder>>(borrow_2) * shift_1 - static_cast<field_t<Builder>>(borrow_1);
    field_t<Builder> r3 = modulus_3 - binary_basis_limbs[3].element - static_cast<field_t<Builder>>(borrow_2);
    r0 = r0.normalize();
    r1 = r1.normalize();
    r2 = r2.normalize();
    r3 = r3.normalize();
    if constexpr (HasPlookup<Builder>) {
        context->decompose_into_default_range(r0.witness_index, static_cast<size_t>(NUM_LIMB_BITS));
        context->decompose_into_default_range(r1.witness_index, static_cast<size_t>(NUM_LIMB_BITS));
        context->decompose_into_default_range(r2.witness_index, static_cast<size_t>(NUM_LIMB_BITS));
        context->decompose_into_default_range(r3.witness_index, static_cast<size_t>(NUM_LIMB_BITS));
    } else {
        context->decompose_into_base4_accumulators(
            r0.witness_index, static_cast<size_t>(NUM_LIMB_BITS), "bigfield: assert_is_in_field range constraint 1.");
        context->decompose_into_base4_accumulators(
            r1.witness_index, static_cast<size_t>(NUM_LIMB_BITS), "bigfield: assert_is_in_field range constraint 2.");
        context->decompose_into_base4_accumulators(
            r2.witness_index, static_cast<size_t>(NUM_LIMB_BITS), "bigfield: assert_is_in_field range constraint 3.");
        context->decompose_into_base4_accumulators(
            r3.witness_index, static_cast<size_t>(NUM_LIMB_BITS), "bigfield: assert_is_in_field range constraint 4.");
    }
}

template <typename Builder, typename T> void bigfield<Builder, T>::assert_less_than(const uint256_t upper_limit) const
{
    // TODO(kesha): Merge this with assert_is_in_field
    // Warning: this assumes we have run circuit construction at least once in debug mode where large non reduced
    // constants are allowed via ASSERT
    if (is_constant()) {
        return;
    }
    ASSERT(upper_limit != 0);
    // The circuit checks that limit - this >= 0, so if we are doing a less_than comparison, we need to subtract 1 from
    // the limit
    uint256_t strict_upper_limit = upper_limit - uint256_t(1);
    self_reduce(); // this method in particular enforces limb vals are <2^b - needed for logic described above
    uint256_t value = get_value().lo;

    const uint256_t upper_limit_value_0 = strict_upper_limit.slice(0, NUM_LIMB_BITS);
    const uint256_t upper_limit_value_1 = strict_upper_limit.slice(NUM_LIMB_BITS, NUM_LIMB_BITS * 2);
    const uint256_t upper_limit_value_2 = strict_upper_limit.slice(NUM_LIMB_BITS * 2, NUM_LIMB_BITS * 3);
    const uint256_t upper_limit_value_3 = strict_upper_limit.slice(NUM_LIMB_BITS * 3, NUM_LIMB_BITS * 4);

    bool borrow_0_value = value.slice(0, NUM_LIMB_BITS) > upper_limit_value_0;
    bool borrow_1_value =
        (value.slice(NUM_LIMB_BITS, NUM_LIMB_BITS * 2) + uint256_t(borrow_0_value)) > (upper_limit_value_1);
    bool borrow_2_value =
        (value.slice(NUM_LIMB_BITS * 2, NUM_LIMB_BITS * 3) + uint256_t(borrow_1_value)) > (upper_limit_value_2);

    field_t<Builder> upper_limit_0(context, upper_limit_value_0);
    field_t<Builder> upper_limit_1(context, upper_limit_value_1);
    field_t<Builder> upper_limit_2(context, upper_limit_value_2);
    field_t<Builder> upper_limit_3(context, upper_limit_value_3);
    bool_t<Builder> borrow_0(witness_t<Builder>(context, borrow_0_value));
    bool_t<Builder> borrow_1(witness_t<Builder>(context, borrow_1_value));
    bool_t<Builder> borrow_2(witness_t<Builder>(context, borrow_2_value));
    // The way we use borrows here ensures that we are checking that upper_limit - binary_basis > 0.
    // We check that the result in each limb is > 0.
    // If the modulus part in this limb is smaller, we simply borrow the value from the higher limb.
    // The prover can rearrange the borrows the way they like. The important thing is that the borrows are
    // constrained.
    field_t<Builder> r0 =
        upper_limit_0 - binary_basis_limbs[0].element + static_cast<field_t<Builder>>(borrow_0) * shift_1;
    field_t<Builder> r1 = upper_limit_1 - binary_basis_limbs[1].element +
                          static_cast<field_t<Builder>>(borrow_1) * shift_1 - static_cast<field_t<Builder>>(borrow_0);
    field_t<Builder> r2 = upper_limit_2 - binary_basis_limbs[2].element +
                          static_cast<field_t<Builder>>(borrow_2) * shift_1 - static_cast<field_t<Builder>>(borrow_1);
    field_t<Builder> r3 = upper_limit_3 - binary_basis_limbs[3].element - static_cast<field_t<Builder>>(borrow_2);
    r0 = r0.normalize();
    r1 = r1.normalize();
    r2 = r2.normalize();
    r3 = r3.normalize();
    if constexpr (Builder::CIRCUIT_TYPE == CircuitType::ULTRA) {
        context->decompose_into_default_range(r0.witness_index, static_cast<size_t>(NUM_LIMB_BITS));
        context->decompose_into_default_range(r1.witness_index, static_cast<size_t>(NUM_LIMB_BITS));
        context->decompose_into_default_range(r2.witness_index, static_cast<size_t>(NUM_LIMB_BITS));
        context->decompose_into_default_range(r3.witness_index, static_cast<size_t>(NUM_LIMB_BITS));
    } else {
        context->decompose_into_base4_accumulators(
            r0.witness_index, static_cast<size_t>(NUM_LIMB_BITS), "bigfield: assert_less_than range constraint 1.");
        context->decompose_into_base4_accumulators(
            r1.witness_index, static_cast<size_t>(NUM_LIMB_BITS), "bigfield: assert_less_than range constraint 2.");
        context->decompose_into_base4_accumulators(
            r2.witness_index, static_cast<size_t>(NUM_LIMB_BITS), "bigfield: assert_less_than range constraint 3.");
        context->decompose_into_base4_accumulators(
            r3.witness_index, static_cast<size_t>(NUM_LIMB_BITS), "bigfield: assert_less_than range constraint 4.");
    }
}

// check elements are equal mod p by proving their integer difference is a multiple of p.
// This relies on the minus operator for a-b increasing a by a multiple of p large enough so diff is non-negative
template <typename Builder, typename T> void bigfield<Builder, T>::assert_equal(const bigfield& other) const
{
    Builder* ctx = this->context ? this->context : other.context;

    if (is_constant() && other.is_constant()) {
        std::cerr << "bigfield: calling assert equal on 2 CONSTANT bigfield elements...is this intended?" << std::endl;
        return;
    } else if (other.is_constant()) {
        // evaluate a strict equality - make sure *this is reduced first, or an honest prover
        // might not be able to satisfy these constraints.
        field_t<Builder> t0 = (binary_basis_limbs[0].element - other.binary_basis_limbs[0].element);
        field_t<Builder> t1 = (binary_basis_limbs[1].element - other.binary_basis_limbs[1].element);
        field_t<Builder> t2 = (binary_basis_limbs[2].element - other.binary_basis_limbs[2].element);
        field_t<Builder> t3 = (binary_basis_limbs[3].element - other.binary_basis_limbs[3].element);
        field_t<Builder> t4 = (prime_basis_limb - other.prime_basis_limb);
        t0.assert_is_zero();
        t1.assert_is_zero();
        t2.assert_is_zero();
        t3.assert_is_zero();
        t4.assert_is_zero();
        return;
    } else if (is_constant()) {
        other.assert_equal(*this);
        return;
    }

    bigfield diff = *this - other;
    const uint512_t diff_val = diff.get_value();
    const uint512_t modulus(target_basis.modulus);

    const auto [quotient_512, remainder_512] = (diff_val).divmod(modulus);
    if (remainder_512 != 0)
        std::cerr << "bigfield: remainder not zero!" << std::endl;
    ASSERT(remainder_512 == 0);
    bigfield quotient;

    const size_t num_quotient_bits = get_quotient_max_bits({ 0 });
    quotient = bigfield(witness_t(ctx, fr(quotient_512.slice(0, NUM_LIMB_BITS * 2).lo)),
                        witness_t(ctx, fr(quotient_512.slice(NUM_LIMB_BITS * 2, NUM_LIMB_BITS * 4).lo)),
                        false,
                        num_quotient_bits);
    unsafe_evaluate_multiply_add(diff, { one() }, {}, quotient, { zero() });
}

// construct a proof that points are different mod p, when they are different mod r
// WARNING: This method doesn't have perfect completeness - for points equal mod r (or with certain difference kp
// mod r) but different mod p, you can't construct a proof. The chances of an honest prover running afoul of this
// condition are extremely small (TODO: compute probability) Note also that the number of constraints depends on how
// much the values have overflown beyond p e.g. due to an addition chain The function is based on the following.
// Suppose a-b = 0 mod p. Then a-b = k*p for k in a range [-R,L] such that L*p>= a, R*p>=b. And also a-b = k*p mod r
// for such k. Thus we can verify a-b is non-zero mod p by taking the product of such values (a-b-kp) and showing
// it's non-zero mod r
template <typename Builder, typename T> void bigfield<Builder, T>::assert_is_not_equal(const bigfield& other) const
{
    // Why would we use this for 2 constants? Turns out, in biggroup
    const auto get_overload_count = [target_modulus = modulus_u512](const uint512_t& maximum_value) {
        uint512_t target = target_modulus;
        size_t overload_count = 0;
        while (target < maximum_value) {
            ++overload_count;
            target += target_modulus;
        }
        return overload_count;
    };
    const size_t lhs_overload_count = get_overload_count(get_maximum_value());
    const size_t rhs_overload_count = get_overload_count(other.get_maximum_value());

    // if (a == b) then (a == b mod n)
    // to save gates, we only check that (a == b mod n)

    // if numeric val of a = a' + p.q
    // we want to check (a' + p.q == b mod n)
    const field_t<Builder> base_diff = prime_basis_limb - other.prime_basis_limb;
    auto diff = base_diff;
    field_t<Builder> prime_basis(get_context(), modulus);
    field_t<Builder> prime_basis_accumulator = prime_basis;
    // Each loop iteration adds 1 gate
    // (prime_basis and prime_basis accumulator are constant so only the * operator adds a gate)
    for (size_t i = 0; i < lhs_overload_count; ++i) {
        diff = diff * (base_diff - prime_basis_accumulator);
        prime_basis_accumulator += prime_basis;
    }
    prime_basis_accumulator = prime_basis;
    for (size_t i = 0; i < rhs_overload_count; ++i) {
        diff = diff * (base_diff + prime_basis_accumulator);
        prime_basis_accumulator += prime_basis;
    }
    diff.assert_is_not_zero();
}

// We reduce an element's mod 2^t representation (t=4*NUM_LIMB_BITS) to size 2^s for smallest s with 2^s>p
// This is much cheaper than actually reducing mod p and suffices for addition chains (where we just need not to
// overflow 2^t) We also reduce any "spillage" inside the first 3 limbs, so that their range is NUM_LIMB_BITS and
// not larger
template <typename Builder, typename T> void bigfield<Builder, T>::self_reduce() const
{
    // Warning: this assumes we have run circuit construction at least once in debug mode where large non reduced
    // constants are disallowed via ASSERT
    if (is_constant()) {
        return;
    }
    // TODO: handle situation where some limbs are constant and others are not constant
    const auto [quotient_value, remainder_value] = get_value().divmod(target_basis.modulus);

    bigfield quotient(context);

    uint512_t maximum_quotient_size = get_maximum_value() / target_basis.modulus;
    uint64_t maximum_quotient_bits = maximum_quotient_size.get_msb() + 1;
    if ((maximum_quotient_bits & 1ULL) == 1ULL) {
        ++maximum_quotient_bits;
    }
    // TODO: implicit assumption here - NUM_LIMB_BITS large enough for all the quotient
    uint32_t quotient_limb_index = context->add_variable(bb::fr(quotient_value.lo));
    field_t<Builder> quotient_limb = field_t<Builder>::from_witness_index(context, quotient_limb_index);
    if constexpr (HasPlookup<Builder>) {
        context->decompose_into_default_range(quotient_limb.witness_index, static_cast<size_t>(maximum_quotient_bits));
    } else {
        context->decompose_into_base4_accumulators(quotient_limb.witness_index,
                                                   static_cast<size_t>(maximum_quotient_bits),
                                                   "bigfield: quotient_limb too large.");
    }

    ASSERT((uint1024_t(1) << maximum_quotient_bits) * uint1024_t(modulus_u512) + DEFAULT_MAXIMUM_REMAINDER <
           get_maximum_crt_product());
    quotient.binary_basis_limbs[0] = Limb(quotient_limb, uint256_t(1) << maximum_quotient_bits);
    quotient.binary_basis_limbs[1] = Limb(field_t<Builder>::from_witness_index(context, context->zero_idx), 0);
    quotient.binary_basis_limbs[2] = Limb(field_t<Builder>::from_witness_index(context, context->zero_idx), 0);
    quotient.binary_basis_limbs[3] = Limb(field_t<Builder>::from_witness_index(context, context->zero_idx), 0);
    quotient.prime_basis_limb = quotient_limb;
    // this constructor with can_overflow=false will enforce remainder of size<2^s
    bigfield remainder = bigfield(
        witness_t(context, fr(remainder_value.slice(0, NUM_LIMB_BITS * 2).lo)),
        witness_t(context, fr(remainder_value.slice(NUM_LIMB_BITS * 2, NUM_LIMB_BITS * 3 + NUM_LAST_LIMB_BITS).lo)));

    unsafe_evaluate_multiply_add(*this, one(), {}, quotient, { remainder });
    binary_basis_limbs[0] =
        remainder.binary_basis_limbs[0]; // Combination of const method and mutable variables is good practice?
    binary_basis_limbs[1] = remainder.binary_basis_limbs[1];
    binary_basis_limbs[2] = remainder.binary_basis_limbs[2];
    binary_basis_limbs[3] = remainder.binary_basis_limbs[3];
    prime_basis_limb = remainder.prime_basis_limb;
} // namespace stdlib

/**
 * Evaluate a multiply add identity with several added elements and several remainders
 *
 * i.e:
 *
 * input_left*input_to_mul + (to_add[0]..to_add[-1]) - input_quotient*modulus -
 * (input_remainders[0]+..+input_remainders[-1]) = 0 (mod CRT)
 *
 * See detailed explanation at https://hackmd.io/LoEG5nRHQe-PvstVaD51Yw?view
 *
 * THIS FUNCTION IS UNSAFE TO USE IN CIRCUITS AS IT DOES NOT PROTECT AGAINST CRT OVERFLOWS.
 * */
template <typename Builder, typename T>
void bigfield<Builder, T>::unsafe_evaluate_multiply_add(const bigfield& input_left,
                                                        const bigfield& input_to_mul,
                                                        const std::vector<bigfield>& to_add,
                                                        const bigfield& input_quotient,
                                                        const std::vector<bigfield>& input_remainders)
{

    std::vector<bigfield> remainders(input_remainders);
    bigfield left = input_left;
    bigfield to_mul = input_to_mul;
    bigfield quotient = input_quotient;

    Builder* ctx = left.context ? left.context : to_mul.context;

    uint512_t max_b0 = (left.binary_basis_limbs[1].maximum_value * to_mul.binary_basis_limbs[0].maximum_value);
    max_b0 += (neg_modulus_limbs_u256[1] * quotient.binary_basis_limbs[0].maximum_value);
    uint512_t max_b1 = (left.binary_basis_limbs[0].maximum_value * to_mul.binary_basis_limbs[1].maximum_value);
    max_b1 += (neg_modulus_limbs_u256[0] * quotient.binary_basis_limbs[1].maximum_value);
    uint512_t max_c0 = (left.binary_basis_limbs[1].maximum_value * to_mul.binary_basis_limbs[1].maximum_value);
    max_c0 += (neg_modulus_limbs_u256[1] * quotient.binary_basis_limbs[1].maximum_value);
    uint512_t max_c1 = (left.binary_basis_limbs[2].maximum_value * to_mul.binary_basis_limbs[0].maximum_value);
    max_c1 += (neg_modulus_limbs_u256[2] * quotient.binary_basis_limbs[0].maximum_value);
    uint512_t max_c2 = (left.binary_basis_limbs[0].maximum_value * to_mul.binary_basis_limbs[2].maximum_value);
    max_c2 += (neg_modulus_limbs_u256[0] * quotient.binary_basis_limbs[2].maximum_value);
    uint512_t max_d0 = (left.binary_basis_limbs[3].maximum_value * to_mul.binary_basis_limbs[0].maximum_value);
    max_d0 += (neg_modulus_limbs_u256[3] * quotient.binary_basis_limbs[0].maximum_value);
    uint512_t max_d1 = (left.binary_basis_limbs[2].maximum_value * to_mul.binary_basis_limbs[1].maximum_value);
    max_d1 += (neg_modulus_limbs_u256[2] * quotient.binary_basis_limbs[1].maximum_value);
    uint512_t max_d2 = (left.binary_basis_limbs[1].maximum_value * to_mul.binary_basis_limbs[2].maximum_value);
    max_d2 += (neg_modulus_limbs_u256[1] * quotient.binary_basis_limbs[2].maximum_value);
    uint512_t max_d3 = (left.binary_basis_limbs[0].maximum_value * to_mul.binary_basis_limbs[3].maximum_value);
    max_d3 += (neg_modulus_limbs_u256[0] * quotient.binary_basis_limbs[3].maximum_value);

    uint512_t max_r0 = left.binary_basis_limbs[0].maximum_value * to_mul.binary_basis_limbs[0].maximum_value;
    max_r0 += (neg_modulus_limbs_u256[0] * quotient.binary_basis_limbs[0].maximum_value);

    const uint512_t max_r1 = max_b0 + max_b1;
    const uint512_t max_r2 = max_c0 + max_c1 + max_c2;
    const uint512_t max_r3 = max_d0 + max_d1 + max_d2 + max_d3;

    uint512_t max_a0(0);
    uint512_t max_a1(0);
    for (size_t i = 0; i < to_add.size(); ++i) {
        max_a0 += to_add[i].binary_basis_limbs[0].maximum_value +
                  (to_add[i].binary_basis_limbs[1].maximum_value << NUM_LIMB_BITS);
        max_a1 += to_add[i].binary_basis_limbs[2].maximum_value +
                  (to_add[i].binary_basis_limbs[3].maximum_value << NUM_LIMB_BITS);
    }
    const uint512_t max_lo = max_r0 + (max_r1 << NUM_LIMB_BITS) + max_a0;
    const uint512_t max_hi = max_r2 + (max_r3 << NUM_LIMB_BITS) + max_a1;

    uint64_t max_lo_bits = (max_lo.get_msb() + 1);
    uint64_t max_hi_bits = max_hi.get_msb() + 1;
    if ((max_lo_bits & 1ULL) == 1ULL) {
        ++max_lo_bits;
    }
    if ((max_hi_bits & 1ULL) == 1ULL) {
        ++max_hi_bits;
    }

    if constexpr (HasPlookup<Builder>) {
        // The plookup custom bigfield gate requires inputs are witnesses.
        // If we're using constant values, instantiate them as circuit variables
        const auto convert_constant_to_fixed_witness = [ctx](const bigfield& input) {
            bigfield output(input);
            output.prime_basis_limb = field_t<Builder>::from_witness_index(
                ctx, ctx->put_constant_variable(input.prime_basis_limb.get_value()));
            output.binary_basis_limbs[0].element = field_t<Builder>::from_witness_index(
                ctx, ctx->put_constant_variable(input.binary_basis_limbs[0].element.get_value()));
            output.binary_basis_limbs[1].element = field_t<Builder>::from_witness_index(
                ctx, ctx->put_constant_variable(input.binary_basis_limbs[1].element.get_value()));
            output.binary_basis_limbs[2].element = field_t<Builder>::from_witness_index(
                ctx, ctx->put_constant_variable(input.binary_basis_limbs[2].element.get_value()));
            output.binary_basis_limbs[3].element = field_t<Builder>::from_witness_index(
                ctx, ctx->put_constant_variable(input.binary_basis_limbs[3].element.get_value()));
            output.context = ctx;
            return output;
        };
        if (left.is_constant()) {
            left = convert_constant_to_fixed_witness(left);
        }
        if (to_mul.is_constant()) {
            to_mul = convert_constant_to_fixed_witness(to_mul);
        }
        if (quotient.is_constant()) {
            quotient = convert_constant_to_fixed_witness(quotient);
        }
        if (remainders[0].is_constant()) {
            remainders[0] = convert_constant_to_fixed_witness(remainders[0]);
        }

        std::vector<field_t<Builder>> limb_0_accumulator{ remainders[0].binary_basis_limbs[0].element };
        std::vector<field_t<Builder>> limb_2_accumulator{ remainders[0].binary_basis_limbs[2].element };
        std::vector<field_t<Builder>> prime_limb_accumulator{ remainders[0].prime_basis_limb };
        for (size_t i = 1; i < remainders.size(); ++i) {
            limb_0_accumulator.emplace_back(remainders[i].binary_basis_limbs[0].element);
            limb_0_accumulator.emplace_back(remainders[i].binary_basis_limbs[1].element * shift_1);
            limb_2_accumulator.emplace_back(remainders[i].binary_basis_limbs[2].element);
            limb_2_accumulator.emplace_back(remainders[i].binary_basis_limbs[3].element * shift_1);
            prime_limb_accumulator.emplace_back(remainders[i].prime_basis_limb);
        }
        for (const auto& add : to_add) {
            limb_0_accumulator.emplace_back(-add.binary_basis_limbs[0].element);
            limb_0_accumulator.emplace_back(-add.binary_basis_limbs[1].element * shift_1);
            limb_2_accumulator.emplace_back(-add.binary_basis_limbs[2].element);
            limb_2_accumulator.emplace_back(-add.binary_basis_limbs[3].element * shift_1);
            prime_limb_accumulator.emplace_back(-add.prime_basis_limb);
        }

        const auto& t0 = remainders[0].binary_basis_limbs[1].element;
        const auto& t1 = remainders[0].binary_basis_limbs[3].element;
        bool needs_normalize = (t0.additive_constant != 0 || t0.multiplicative_constant != 1);
        needs_normalize = needs_normalize || (t1.additive_constant != 0 || t1.multiplicative_constant != 1);

        if (needs_normalize) {
            limb_0_accumulator.emplace_back(remainders[0].binary_basis_limbs[1].element * shift_1);
            limb_2_accumulator.emplace_back(remainders[0].binary_basis_limbs[3].element * shift_1);
        }

        field_t<Builder> remainder_limbs[4]{
            field_t<Builder>::accumulate(limb_0_accumulator),
            needs_normalize ? field_t<Builder>::from_witness_index(ctx, ctx->zero_idx)
                            : remainders[0].binary_basis_limbs[1].element,
            field_t<Builder>::accumulate(limb_2_accumulator),
            needs_normalize ? field_t<Builder>::from_witness_index(ctx, ctx->zero_idx)
                            : remainders[0].binary_basis_limbs[3].element,
        };
        field_t<Builder> remainder_prime_limb = field_t<Builder>::accumulate(prime_limb_accumulator);

        bb::non_native_field_witnesses<bb::fr> witnesses{
            {
                left.binary_basis_limbs[0].element.normalize().witness_index,
                left.binary_basis_limbs[1].element.normalize().witness_index,
                left.binary_basis_limbs[2].element.normalize().witness_index,
                left.binary_basis_limbs[3].element.normalize().witness_index,
                left.prime_basis_limb.witness_index,
            },
            {
                to_mul.binary_basis_limbs[0].element.normalize().witness_index,
                to_mul.binary_basis_limbs[1].element.normalize().witness_index,
                to_mul.binary_basis_limbs[2].element.normalize().witness_index,
                to_mul.binary_basis_limbs[3].element.normalize().witness_index,
                to_mul.prime_basis_limb.witness_index,
            },
            {
                quotient.binary_basis_limbs[0].element.normalize().witness_index,
                quotient.binary_basis_limbs[1].element.normalize().witness_index,
                quotient.binary_basis_limbs[2].element.normalize().witness_index,
                quotient.binary_basis_limbs[3].element.normalize().witness_index,
                quotient.prime_basis_limb.witness_index,
            },
            {
                remainder_limbs[0].normalize().witness_index,
                remainder_limbs[1].normalize().witness_index,
                remainder_limbs[2].normalize().witness_index,
                remainder_limbs[3].normalize().witness_index,
                remainder_prime_limb.witness_index,
            },
            { neg_modulus_limbs[0], neg_modulus_limbs[1], neg_modulus_limbs[2], neg_modulus_limbs[3] },
            modulus,
        };
        // N.B. this method also evaluates the prime field component of the non-native field mul
        const auto [lo_idx, hi_idx] = ctx->evaluate_non_native_field_multiplication(witnesses, false);

        bb::fr neg_prime = -bb::fr(uint256_t(target_basis.modulus));
        field_t<Builder>::evaluate_polynomial_identity(left.prime_basis_limb,
                                                       to_mul.prime_basis_limb,
                                                       quotient.prime_basis_limb * neg_prime,
                                                       -remainder_prime_limb);

        field_t lo = field_t<Builder>::from_witness_index(ctx, lo_idx);
        field_t hi = field_t<Builder>::from_witness_index(ctx, hi_idx);
        const uint64_t carry_lo_msb = max_lo_bits - (2 * NUM_LIMB_BITS);
        const uint64_t carry_hi_msb = max_hi_bits - (2 * NUM_LIMB_BITS);

        // if both the hi and lo output limbs have less than 70 bits, we can use our custom
        // limb accumulation gate (accumulates 2 field elements, each composed of 5 14-bit limbs, in 3 gates)
        if (carry_lo_msb <= 70 && carry_hi_msb <= 70) {
            ctx->range_constrain_two_limbs(
                hi.witness_index, lo.witness_index, size_t(carry_lo_msb), size_t(carry_hi_msb));
        } else {
            ctx->decompose_into_default_range(hi.normalize().witness_index, carry_hi_msb);
            ctx->decompose_into_default_range(lo.normalize().witness_index, carry_lo_msb);
        }
    } else {
        const field_t b0 = left.binary_basis_limbs[1].element.madd(
            to_mul.binary_basis_limbs[0].element, quotient.binary_basis_limbs[1].element * neg_modulus_limbs[0]);
        const field_t b1 = left.binary_basis_limbs[0].element.madd(
            to_mul.binary_basis_limbs[1].element, quotient.binary_basis_limbs[0].element * neg_modulus_limbs[1]);
        const field_t c0 = left.binary_basis_limbs[1].element.madd(
            to_mul.binary_basis_limbs[1].element, quotient.binary_basis_limbs[1].element * neg_modulus_limbs[1]);
        const field_t c1 = left.binary_basis_limbs[2].element.madd(
            to_mul.binary_basis_limbs[0].element, quotient.binary_basis_limbs[2].element * neg_modulus_limbs[0]);
        const field_t c2 = left.binary_basis_limbs[0].element.madd(
            to_mul.binary_basis_limbs[2].element, quotient.binary_basis_limbs[0].element * neg_modulus_limbs[2]);
        const field_t d0 = left.binary_basis_limbs[3].element.madd(
            to_mul.binary_basis_limbs[0].element, quotient.binary_basis_limbs[3].element * neg_modulus_limbs[0]);
        const field_t d1 = left.binary_basis_limbs[2].element.madd(
            to_mul.binary_basis_limbs[1].element, quotient.binary_basis_limbs[2].element * neg_modulus_limbs[1]);
        const field_t d2 = left.binary_basis_limbs[1].element.madd(
            to_mul.binary_basis_limbs[2].element, quotient.binary_basis_limbs[1].element * neg_modulus_limbs[2]);
        const field_t d3 = left.binary_basis_limbs[0].element.madd(
            to_mul.binary_basis_limbs[3].element, quotient.binary_basis_limbs[0].element * neg_modulus_limbs[3]);

        // We wish to show that left*right - quotient*remainder = 0 mod 2^t, we do this by collecting the limb products
        // into two separate variables - carry_lo and carry_hi, which are still small enough not to wrap mod r
        // Their first t/2 bits will equal, respectively, the first and second t/2 bits of the expresssion
        // Thus it will suffice to check that each of them begins with t/2 zeroes. We do this by in fact assigning
        // to these variables those expressions divided by 2^{t/2}. Since we have bounds on their ranage that are
        // smaller than r, We can range check the divisions by the original range bounds divided by 2^{t/2}

        const field_t r0 = left.binary_basis_limbs[0].element.madd(
            to_mul.binary_basis_limbs[0].element, quotient.binary_basis_limbs[0].element * neg_modulus_limbs[0]);

        field_t r1 = b0.add_two(b1, -remainders[0].binary_basis_limbs[1].element);
        const field_t r2 = c0.add_two(c1, c2);
        const field_t r3 = d0 + d1.add_two(d2, d3);

        field_t carry_lo_0 = r0 * shift_right_2;
        field_t carry_lo_1 = r1 * (shift_1 * shift_right_2);
        field_t carry_lo_2 = -(remainders[0].binary_basis_limbs[0].element * shift_right_2);
        field_t carry_lo = carry_lo_0.add_two(carry_lo_1, carry_lo_2);
        for (const auto& add_element : to_add) {
            carry_lo = carry_lo.add_two(add_element.binary_basis_limbs[0].element * shift_right_2,
                                        add_element.binary_basis_limbs[1].element * (shift_1 * shift_right_2));
        }
        for (size_t i = 1; i < remainders.size(); ++i) {
            carry_lo = carry_lo.add_two(-remainders[i].binary_basis_limbs[0].element * shift_right_2,
                                        -remainders[i].binary_basis_limbs[1].element * (shift_1 * shift_right_2));
        }
        field_t t1 = carry_lo.add_two(-remainders[0].binary_basis_limbs[2].element,
                                      -(remainders[0].binary_basis_limbs[3].element * shift_1));
        field_t carry_hi_0 = r2 * shift_right_2;
        field_t carry_hi_1 = r3 * (shift_1 * shift_right_2);
        field_t carry_hi_2 = t1 * shift_right_2;
        field_t carry_hi = carry_hi_0.add_two(carry_hi_1, carry_hi_2);

        for (const auto& add_element : to_add) {
            carry_hi = carry_hi.add_two(add_element.binary_basis_limbs[2].element * shift_right_2,
                                        add_element.binary_basis_limbs[3].element * (shift_1 * shift_right_2));
        }
        for (size_t i = 1; i < remainders.size(); ++i) {
            carry_hi = carry_hi.add_two(-remainders[i].binary_basis_limbs[2].element * shift_right_2,
                                        -remainders[i].binary_basis_limbs[3].element * (shift_1 * shift_right_2));
        }
        bb::fr neg_prime = -bb::fr(uint256_t(target_basis.modulus));

        field_t<Builder> linear_terms(ctx, bb::fr(0));
        if (to_add.size() >= 2) {
            for (size_t i = 0; i < to_add.size(); i += 2) {
                linear_terms = linear_terms.add_two(to_add[i].prime_basis_limb, to_add[i + 1].prime_basis_limb);
            }
        }
        if ((to_add.size() & 1UL) == 1UL) {
            linear_terms += to_add[to_add.size() - 1].prime_basis_limb;
        }
        if (remainders.size() >= 2) {
            for (size_t i = 0; i < (remainders.size() >> 1); i += 1) {
                linear_terms =
                    linear_terms.add_two(-remainders[2 * i].prime_basis_limb, -remainders[2 * i + 1].prime_basis_limb);
            }
        }
        if ((remainders.size() & 1UL) == 1UL) {
            linear_terms += -remainders[remainders.size() - 1].prime_basis_limb;
        }
        // This is where we show our identity is zero mod r (to use CRT we show it's zero mod r and mod 2^t)
        field_t<Builder>::evaluate_polynomial_identity(
            left.prime_basis_limb, to_mul.prime_basis_limb, quotient.prime_basis_limb * neg_prime, linear_terms);

        const uint64_t carry_lo_msb = max_lo_bits - (2 * NUM_LIMB_BITS);
        const uint64_t carry_hi_msb = max_hi_bits - (2 * NUM_LIMB_BITS);

        const bb::fr carry_lo_shift(uint256_t(uint256_t(1) << carry_lo_msb));
        if ((carry_hi_msb + carry_lo_msb) < field_t<Builder>::modulus.get_msb()) {
            field_t carry_combined = carry_lo + (carry_hi * carry_lo_shift);
            carry_combined = carry_combined.normalize();
            const auto accumulators = ctx->decompose_into_base4_accumulators(
                carry_combined.witness_index,
                static_cast<size_t>(carry_lo_msb + carry_hi_msb),
                "bigfield: carry_combined too large in unsafe_evaluate_multiply_add.");
            field_t<Builder> accumulator_midpoint =
                field_t<Builder>::from_witness_index(ctx, accumulators[static_cast<size_t>((carry_hi_msb / 2) - 1)]);
            carry_hi.assert_equal(accumulator_midpoint, "bigfield multiply range check failed");
        } else {
            carry_lo = carry_lo.normalize();
            carry_hi = carry_hi.normalize();
            ctx->decompose_into_base4_accumulators(carry_lo.witness_index,
                                                   static_cast<size_t>(carry_lo_msb),
                                                   "bigfield: carry_lo too large in unsafe_evaluate_multiply_add.");
            ctx->decompose_into_base4_accumulators(carry_hi.witness_index,
                                                   static_cast<size_t>(carry_hi_msb),
                                                   "bigfield: carry_hi too large in unsafe_evaluate_multiply_add.");
        }
    }
}
/**
 * Evaluate a quadratic relation involving multiple multiplications
 *
 * i.e. evalaute:
 *
 * (left_0 * right_0) + ... + (left_n-1 * right_n-1) + ...to_add - (input_quotient * q + ...input_remainders) = 0
 *
 * This method supports multiple "remainders" because, when evaluating divisions, some of these remainders are terms
 * We're subtracting from our product (see msub_div for more details)
 *
 * The above quadratic relation can be evaluated using only a single quotient/remainder term.
 *
 * Params:
 *
 * `input_left`: left multiplication operands
 * `input_right` : right multiplication operands
 * `to_add` : vector of elements to add to the product
 * `input_quotient` : quotient
 * `input_remainders` : vector of remainders
 *
 * THIS METHOD IS UNSAFE TO USE IN CIRCUITS DIRECTLY AS IT LACKS OVERFLOW CHECKS.
 **/
template <typename Builder, typename T>
void bigfield<Builder, T>::unsafe_evaluate_multiple_multiply_add(const std::vector<bigfield>& input_left,
                                                                 const std::vector<bigfield>& input_right,
                                                                 const std::vector<bigfield>& to_add,
                                                                 const bigfield& input_quotient,
                                                                 const std::vector<bigfield>& input_remainders)
{

    std::vector<bigfield> remainders(input_remainders);
    std::vector<bigfield> left(input_left);
    std::vector<bigfield> right(input_right);
    bigfield quotient = input_quotient;
    const size_t num_multiplications = input_left.size();

    Builder* ctx = input_left[0].context ? input_left[0].context : input_right[0].context;

    const auto get_product_maximum = [](const bigfield& left, const bigfield& right) {
        uint512_t max_b0_inner = (left.binary_basis_limbs[1].maximum_value * right.binary_basis_limbs[0].maximum_value);
        uint512_t max_b1_inner = (left.binary_basis_limbs[0].maximum_value * right.binary_basis_limbs[1].maximum_value);
        uint512_t max_c0_inner = (left.binary_basis_limbs[1].maximum_value * right.binary_basis_limbs[1].maximum_value);
        uint512_t max_c1_inner = (left.binary_basis_limbs[2].maximum_value * right.binary_basis_limbs[0].maximum_value);
        uint512_t max_c2_inner = (left.binary_basis_limbs[0].maximum_value * right.binary_basis_limbs[2].maximum_value);
        uint512_t max_d0_inner = (left.binary_basis_limbs[3].maximum_value * right.binary_basis_limbs[0].maximum_value);
        uint512_t max_d1_inner = (left.binary_basis_limbs[2].maximum_value * right.binary_basis_limbs[1].maximum_value);
        uint512_t max_d2_inner = (left.binary_basis_limbs[1].maximum_value * right.binary_basis_limbs[2].maximum_value);
        uint512_t max_d3_inner = (left.binary_basis_limbs[0].maximum_value * right.binary_basis_limbs[3].maximum_value);
        uint512_t max_r0_inner = left.binary_basis_limbs[0].maximum_value * right.binary_basis_limbs[0].maximum_value;

        const uint512_t max_r1_inner = max_b0_inner + max_b1_inner;
        const uint512_t max_r2_inner = max_c0_inner + max_c1_inner + max_c2_inner;
        const uint512_t max_r3_inner = max_d0_inner + max_d1_inner + max_d2_inner + max_d3_inner;
        const uint512_t max_lo_temp = max_r0_inner + (max_r1_inner << NUM_LIMB_BITS);
        const uint512_t max_hi_temp = max_r2_inner + (max_r3_inner << NUM_LIMB_BITS);
        return std::pair<uint512_t, uint512_t>(max_lo_temp, max_hi_temp);
    };

    /**
     * Step 1: Compute the maximum potential value of our product limbs
     *
     * max_lo = maximum value of limb products that span the range 0 - 2^{3t}
     * max_hi = maximum value of limb products that span the range 2^{2t} - 2^{5t}
     * (t = NUM_LIMB_BITS)
     **/
    uint512_t max_lo = 0;
    uint512_t max_hi = 0;

    // Compute max values of quotient product limb products
    uint512_t max_b0 = (neg_modulus_limbs_u256[1] * quotient.binary_basis_limbs[0].maximum_value);
    uint512_t max_b1 = (neg_modulus_limbs_u256[0] * quotient.binary_basis_limbs[1].maximum_value);
    uint512_t max_c0 = (neg_modulus_limbs_u256[1] * quotient.binary_basis_limbs[1].maximum_value);
    uint512_t max_c1 = (neg_modulus_limbs_u256[2] * quotient.binary_basis_limbs[0].maximum_value);
    uint512_t max_c2 = (neg_modulus_limbs_u256[0] * quotient.binary_basis_limbs[2].maximum_value);
    uint512_t max_d0 = (neg_modulus_limbs_u256[3] * quotient.binary_basis_limbs[0].maximum_value);
    uint512_t max_d1 = (neg_modulus_limbs_u256[2] * quotient.binary_basis_limbs[1].maximum_value);
    uint512_t max_d2 = (neg_modulus_limbs_u256[1] * quotient.binary_basis_limbs[2].maximum_value);
    uint512_t max_d3 = (neg_modulus_limbs_u256[0] * quotient.binary_basis_limbs[3].maximum_value);

    // max_r0 = terms from 0 - 2^2t
    // max_r1 = terms from 2^t - 2^3t
    // max_r2 = terms from 2^2t - 2^4t
    // max_r3 = terms from 2^3t - 2^5t
    uint512_t max_r0 = (neg_modulus_limbs_u256[0] * quotient.binary_basis_limbs[0].maximum_value);
    max_r0 += (neg_modulus_limbs_u256[0] * quotient.binary_basis_limbs[0].maximum_value);
    const uint512_t max_r1 = max_b0 + max_b1;
    const uint512_t max_r2 = max_c0 + max_c1 + max_c2;
    const uint512_t max_r3 = max_d0 + max_d1 + max_d2 + max_d3;

    // update max_lo, max_hi with quotient limb product terms.
    max_lo += max_r0 + (max_r1 << NUM_LIMB_BITS);
    max_hi += max_r2 + (max_r3 << NUM_LIMB_BITS);

    // Compute maximum value of addition terms in `to_add` and add to max_lo, max_hi
    uint512_t max_a0(0);
    uint512_t max_a1(0);
    for (size_t i = 0; i < to_add.size(); ++i) {
        max_a0 += to_add[i].binary_basis_limbs[0].maximum_value +
                  (to_add[i].binary_basis_limbs[1].maximum_value << NUM_LIMB_BITS);
        max_a1 += to_add[i].binary_basis_limbs[2].maximum_value +
                  (to_add[i].binary_basis_limbs[3].maximum_value << NUM_LIMB_BITS);
    }
    max_lo += max_a0;
    max_hi += max_a1;

    // Compute the maximum value of our multiplication products and add to max_lo, max_hi
    for (size_t i = 0; i < num_multiplications; ++i) {
        const auto [product_lo, product_hi] = get_product_maximum(left[i], right[i]);
        max_lo += product_lo;
        max_hi += product_hi;
    }

    // Compute the maximum number of bits in `max_lo` and `max_hi` - this defines the range constraint values we
    // will need to apply to validate our product
    uint64_t max_lo_bits = (max_lo.get_msb() + 1);
    uint64_t max_hi_bits = max_hi.get_msb() + 1;
    // TurboPlonk range checks only work for even bit ranges, so make sure these values are even
    // TODO: This neccessary anymore? TurboPlonk range checks now work with odd bit ranges...
    if ((max_lo_bits & 1ULL) == 1ULL) {
        ++max_lo_bits;
    }
    if ((max_hi_bits & 1ULL) == 1ULL) {
        ++max_hi_bits;
    }

    if constexpr (HasPlookup<Builder>) {
        // The plookup custom bigfield gate requires inputs are witnesses.
        // If we're using constant values, instantiate them as circuit variables

        const auto convert_constant_to_fixed_witness = [ctx](const bigfield& input) {
            bigfield output(input);
            output.prime_basis_limb = field_t<Builder>::from_witness_index(
                ctx, ctx->put_constant_variable(input.prime_basis_limb.get_value()));
            output.binary_basis_limbs[0].element = field_t<Builder>::from_witness_index(
                ctx, ctx->put_constant_variable(input.binary_basis_limbs[0].element.get_value()));
            output.binary_basis_limbs[1].element = field_t<Builder>::from_witness_index(
                ctx, ctx->put_constant_variable(input.binary_basis_limbs[1].element.get_value()));
            output.binary_basis_limbs[2].element = field_t<Builder>::from_witness_index(
                ctx, ctx->put_constant_variable(input.binary_basis_limbs[2].element.get_value()));
            output.binary_basis_limbs[3].element = field_t<Builder>::from_witness_index(
                ctx, ctx->put_constant_variable(input.binary_basis_limbs[3].element.get_value()));
            output.context = ctx;
            return output;
        };

        // evalaute a nnf mul and add into existing lohi output for our extra product terms
        // we need to add the result of (left_b * right_b) into lo_1_idx and hi_1_idx
        // our custom gate evaluates: ((a * b) + (q * neg_modulus) - r) / 2^{136} = lo + hi * 2^{136}
        // where q is a 'quotient' bigfield and neg_modulus is defined by selector polynomial values
        // The custom gate costs 7 constraints, which is cheaper than computing `a * b` using multiplication +
        // addition gates But....we want to obtain `left_a * right_b + lo_1 + hi_1 * 2^{136} = lo + hi * 2^{136}` If
        // we set `neg_modulus = [2^{136}, 0, 0, 0]` and `q = [lo_1, 0, hi_1, 0]`, then we will add `lo_1` into
        // `lo`, and `lo_1/2^{136} + hi_1` into `hi`. we can then subtract off `lo_1/2^{136}` from `hi`, by setting
        // `r = [0, 0, lo_1, 0]` This saves us 2 addition gates as we don't have to add together the outputs of two
        // calls to `evaluate_non_native_field_multiplication`
        std::vector<field_t<Builder>> limb_0_accumulator;
        std::vector<field_t<Builder>> limb_2_accumulator;
        std::vector<field_t<Builder>> prime_limb_accumulator;

        for (size_t i = 0; i < num_multiplications; ++i) {
            if (i == 0 && left[0].is_constant()) {
                left[0] = convert_constant_to_fixed_witness(left[0]);
            }
            if (i == 0 && right[0].is_constant()) {
                right[0] = convert_constant_to_fixed_witness(right[0]);
            }
            if (i > 0 && left[i].is_constant()) {
                left[i] = convert_constant_to_fixed_witness(left[i]);
            }
            if (i > 0 && right[i].is_constant()) {
                right[i] = convert_constant_to_fixed_witness(right[i]);
            }

            if (i > 0) {
                bb::non_native_field_witnesses<bb::fr> mul_witnesses = {
                    {
                        left[i].binary_basis_limbs[0].element.normalize().witness_index,
                        left[i].binary_basis_limbs[1].element.normalize().witness_index,
                        left[i].binary_basis_limbs[2].element.normalize().witness_index,
                        left[i].binary_basis_limbs[3].element.normalize().witness_index,
                        left[i].prime_basis_limb.witness_index,
                    },
                    {
                        right[i].binary_basis_limbs[0].element.normalize().witness_index,
                        right[i].binary_basis_limbs[1].element.normalize().witness_index,
                        right[i].binary_basis_limbs[2].element.normalize().witness_index,
                        right[i].binary_basis_limbs[3].element.normalize().witness_index,
                        right[i].prime_basis_limb.witness_index,
                    },
                    {
                        ctx->zero_idx,
                        ctx->zero_idx,
                        ctx->zero_idx,
                        ctx->zero_idx,
                        ctx->zero_idx,
                    },
                    {
                        ctx->zero_idx,
                        ctx->zero_idx,
                        ctx->zero_idx,
                        ctx->zero_idx,
                        ctx->zero_idx,
                    },
                    { 0, 0, 0, 0 },
                    modulus,
                };

                const auto [lo_2_idx, hi_2_idx] = ctx->queue_partial_non_native_field_multiplication(mul_witnesses);

                field_t<Builder> lo_2 = field_t<Builder>::from_witness_index(ctx, lo_2_idx);
                field_t<Builder> hi_2 = field_t<Builder>::from_witness_index(ctx, hi_2_idx);

                limb_0_accumulator.emplace_back(-lo_2);
                limb_2_accumulator.emplace_back(-hi_2);
                prime_limb_accumulator.emplace_back(-(left[i].prime_basis_limb * right[i].prime_basis_limb));
            }
        }
        if (quotient.is_constant()) {
            quotient = convert_constant_to_fixed_witness(quotient);
        }

        bool no_remainders = remainders.size() == 0;
        if (!no_remainders) {
            limb_0_accumulator.emplace_back(remainders[0].binary_basis_limbs[0].element);
            limb_2_accumulator.emplace_back(remainders[0].binary_basis_limbs[2].element);
            prime_limb_accumulator.emplace_back(remainders[0].prime_basis_limb);
        }
        for (size_t i = 1; i < remainders.size(); ++i) {
            limb_0_accumulator.emplace_back(remainders[i].binary_basis_limbs[0].element);
            limb_0_accumulator.emplace_back(remainders[i].binary_basis_limbs[1].element * shift_1);
            limb_2_accumulator.emplace_back(remainders[i].binary_basis_limbs[2].element);
            limb_2_accumulator.emplace_back(remainders[i].binary_basis_limbs[3].element * shift_1);
            prime_limb_accumulator.emplace_back(remainders[i].prime_basis_limb);
        }
        for (const auto& add : to_add) {
            limb_0_accumulator.emplace_back(-add.binary_basis_limbs[0].element);
            limb_0_accumulator.emplace_back(-add.binary_basis_limbs[1].element * shift_1);
            limb_2_accumulator.emplace_back(-add.binary_basis_limbs[2].element);
            limb_2_accumulator.emplace_back(-add.binary_basis_limbs[3].element * shift_1);
            prime_limb_accumulator.emplace_back(-add.prime_basis_limb);
        }

        field_t<Builder> accumulated_lo = field_t<Builder>::accumulate(limb_0_accumulator);
        field_t<Builder> accumulated_hi = field_t<Builder>::accumulate(limb_2_accumulator);
        if (accumulated_lo.is_constant()) {
            accumulated_lo =
                field_t<Builder>::from_witness_index(ctx, ctx->put_constant_variable(accumulated_lo.get_value()));
        }
        if (accumulated_hi.is_constant()) {
            accumulated_hi =
                field_t<Builder>::from_witness_index(ctx, ctx->put_constant_variable(accumulated_hi.get_value()));
        }
        field_t<Builder> remainder1 = no_remainders ? field_t<Builder>::from_witness_index(ctx, ctx->zero_idx)
                                                    : remainders[0].binary_basis_limbs[1].element;
        if (remainder1.is_constant()) {
            remainder1 = field_t<Builder>::from_witness_index(ctx, ctx->put_constant_variable(remainder1.get_value()));
        }
        field_t<Builder> remainder3 = no_remainders ? field_t<Builder>::from_witness_index(ctx, ctx->zero_idx)
                                                    : remainders[0].binary_basis_limbs[3].element;
        if (remainder3.is_constant()) {
            remainder3 = field_t<Builder>::from_witness_index(ctx, ctx->put_constant_variable(remainder3.get_value()));
        }
        field_t<Builder> remainder_limbs[4]{
            accumulated_lo,
            remainder1,
            accumulated_hi,
            remainder3,
        };
        field_t<Builder> remainder_prime_limb = field_t<Builder>::accumulate(prime_limb_accumulator);

        bb::non_native_field_witnesses<bb::fr> witnesses{
            {
                left[0].binary_basis_limbs[0].element.normalize().witness_index,
                left[0].binary_basis_limbs[1].element.normalize().witness_index,
                left[0].binary_basis_limbs[2].element.normalize().witness_index,
                left[0].binary_basis_limbs[3].element.normalize().witness_index,
                left[0].prime_basis_limb.normalize().witness_index,
            },
            {
                right[0].binary_basis_limbs[0].element.normalize().witness_index,
                right[0].binary_basis_limbs[1].element.normalize().witness_index,
                right[0].binary_basis_limbs[2].element.normalize().witness_index,
                right[0].binary_basis_limbs[3].element.normalize().witness_index,
                right[0].prime_basis_limb.normalize().witness_index,
            },
            {
                quotient.binary_basis_limbs[0].element.normalize().witness_index,
                quotient.binary_basis_limbs[1].element.normalize().witness_index,
                quotient.binary_basis_limbs[2].element.normalize().witness_index,
                quotient.binary_basis_limbs[3].element.normalize().witness_index,
                quotient.prime_basis_limb.normalize().witness_index,
            },
            {
                remainder_limbs[0].normalize().witness_index,
                remainder_limbs[1].normalize().witness_index,
                remainder_limbs[2].normalize().witness_index,
                remainder_limbs[3].normalize().witness_index,
                remainder_prime_limb.normalize().witness_index,
            },
            { neg_modulus_limbs[0], neg_modulus_limbs[1], neg_modulus_limbs[2], neg_modulus_limbs[3] },
            modulus,
        };

        const auto [lo_1_idx, hi_1_idx] = ctx->evaluate_non_native_field_multiplication(witnesses, false);

        bb::fr neg_prime = -bb::fr(uint256_t(target_basis.modulus));

        field_t<Builder>::evaluate_polynomial_identity(left[0].prime_basis_limb,
                                                       right[0].prime_basis_limb,
                                                       quotient.prime_basis_limb * neg_prime,
                                                       -remainder_prime_limb);

        field_t lo = field_t<Builder>::from_witness_index(ctx, lo_1_idx);
        field_t hi = field_t<Builder>::from_witness_index(ctx, hi_1_idx);

        const uint64_t carry_lo_msb = max_lo_bits - (2 * NUM_LIMB_BITS);
        const uint64_t carry_hi_msb = max_hi_bits - (2 * NUM_LIMB_BITS);

        // if both the hi and lo output limbs have less than 70 bits, we can use our custom
        // limb accumulation gate (accumulates 2 field elements, each composed of 5 14-bit limbs, in 3 gates)
        if (carry_lo_msb <= 70 && carry_hi_msb <= 70) {
            ctx->range_constrain_two_limbs(
                hi.witness_index, lo.witness_index, (size_t)carry_lo_msb, (size_t)carry_hi_msb);
        } else {
            ctx->decompose_into_default_range(hi.normalize().witness_index, carry_hi_msb);
            ctx->decompose_into_default_range(lo.normalize().witness_index, carry_lo_msb);
        }
        /*  NOTE TO AUDITOR: An extraneous block
               if constexpr (HasPlookup<Builder>) {
                   carry_lo = carry_lo.normalize();
                   carry_hi = carry_hi.normalize();
                   ctx->decompose_into_default_range(carry_lo.witness_index, static_cast<size_t>(carry_lo_msb));
                   ctx->decompose_into_default_range(carry_hi.witness_index, static_cast<size_t>(carry_hi_msb));
               }
            was removed from the the `else` block below. See  the conversation at
               https://github.com/AztecProtocol/aztec2-internal/pull/1023
            We should make sure that no constraint like this is needed but missing (e.g., an equivalent constraint
            was just imposed?). */
    } else {
        field_t b0 = left[0].binary_basis_limbs[1].element.madd(
            right[0].binary_basis_limbs[0].element, quotient.binary_basis_limbs[1].element * neg_modulus_limbs[0]);
        field_t b1 = left[0].binary_basis_limbs[0].element.madd(
            right[0].binary_basis_limbs[1].element, quotient.binary_basis_limbs[0].element * neg_modulus_limbs[1]);
        field_t c0 = left[0].binary_basis_limbs[1].element.madd(
            right[0].binary_basis_limbs[1].element, quotient.binary_basis_limbs[1].element * neg_modulus_limbs[1]);
        field_t c1 = left[0].binary_basis_limbs[2].element.madd(
            right[0].binary_basis_limbs[0].element, quotient.binary_basis_limbs[2].element * neg_modulus_limbs[0]);
        field_t c2 = left[0].binary_basis_limbs[0].element.madd(
            right[0].binary_basis_limbs[2].element, quotient.binary_basis_limbs[0].element * neg_modulus_limbs[2]);
        field_t d0 = left[0].binary_basis_limbs[3].element.madd(
            right[0].binary_basis_limbs[0].element, quotient.binary_basis_limbs[3].element * neg_modulus_limbs[0]);
        field_t d1 = left[0].binary_basis_limbs[2].element.madd(
            right[0].binary_basis_limbs[1].element, quotient.binary_basis_limbs[2].element * neg_modulus_limbs[1]);
        field_t d2 = left[0].binary_basis_limbs[1].element.madd(
            right[0].binary_basis_limbs[2].element, quotient.binary_basis_limbs[1].element * neg_modulus_limbs[2]);
        field_t d3 = left[0].binary_basis_limbs[0].element.madd(
            right[0].binary_basis_limbs[3].element, quotient.binary_basis_limbs[0].element * neg_modulus_limbs[3]);

        /**
         * Compute "limb accumulators"
         * `limb_0_accumulator` contains contributions in the range 0 - 2^{3t}
         * `limb_2_accumulator` contains contributiosn in the range 2^{2t} - 2^{5t} (t = MAX_NUM_LIMB_BITS)
         * Actual range will vary a few bits because of lazy reduction techniques
         *
         * We store these values in an "accumulator" vector in order to efficiently add them into a sum.
         * i.e. limb_0 =- field_t::accumulate(limb_0_accumulator)
         * This costs us fewer gates than addition operations because we can add 2 values into a sum in a single
         * custom gate.
         **/

        std::vector<field_t<Builder>> limb_0_accumulator;
        std::vector<field_t<Builder>> limb_2_accumulator;
        std::vector<field_t<Builder>> prime_limb_accumulator;

        // Add remaining products into the limb accumulators.
        // We negate the product values because the accumulator values itself will be negated
        // TODO: why do we do this double negation exactly? seems a bit pointless. I think it stems from the fact
        // that the accumulators originaly tracked the remainder term (which is negated)

        for (size_t i = 1; i < num_multiplications; ++i) {
            field_t lo_2 = left[i].binary_basis_limbs[0].element * right[i].binary_basis_limbs[0].element;
            lo_2 = left[i].binary_basis_limbs[1].element.madd(right[i].binary_basis_limbs[0].element * shift_1, lo_2);
            lo_2 = left[i].binary_basis_limbs[0].element.madd(right[i].binary_basis_limbs[1].element * shift_1, lo_2);
            field_t hi_2 = left[i].binary_basis_limbs[1].element * right[i].binary_basis_limbs[1].element;
            hi_2 = left[i].binary_basis_limbs[2].element.madd(right[i].binary_basis_limbs[0].element, hi_2);
            hi_2 = left[i].binary_basis_limbs[0].element.madd(right[i].binary_basis_limbs[2].element, hi_2);
            hi_2 = left[i].binary_basis_limbs[3].element.madd(right[i].binary_basis_limbs[0].element * shift_1, hi_2);
            hi_2 = left[i].binary_basis_limbs[2].element.madd(right[i].binary_basis_limbs[1].element * shift_1, hi_2);
            hi_2 = left[i].binary_basis_limbs[1].element.madd(right[i].binary_basis_limbs[2].element * shift_1, hi_2);
            hi_2 = left[i].binary_basis_limbs[0].element.madd(right[i].binary_basis_limbs[3].element * shift_1, hi_2);

            limb_0_accumulator.emplace_back(-lo_2);
            limb_2_accumulator.emplace_back(-hi_2);
            prime_limb_accumulator.emplace_back(-(left[i].prime_basis_limb * right[i].prime_basis_limb));
        }
        // add cached products into the limb accumulators.
        // We negate the cache values because the accumulator values itself will be negated
        // TODO: why do we do this double negation exactly? seems a bit pointless. I think it stems from the fact
        // that the accumulators originaly tracked the remainder term (which is negated)

        // Update the accumulators with the remainder terms. First check we actually have remainder terms!
        //(not present when we're checking a product is 0 mod p). See `assert_is_in_field`

        bool no_remainders = remainders.size() == 0;
        if (!no_remainders) {
            limb_0_accumulator.emplace_back(remainders[0].binary_basis_limbs[0].element);
            limb_2_accumulator.emplace_back(remainders[0].binary_basis_limbs[2].element);
            prime_limb_accumulator.emplace_back(remainders[0].prime_basis_limb);
        }
        for (size_t i = 1; i < remainders.size(); ++i) {
            limb_0_accumulator.emplace_back(remainders[i].binary_basis_limbs[0].element);
            limb_0_accumulator.emplace_back(remainders[i].binary_basis_limbs[1].element * shift_1);
            limb_2_accumulator.emplace_back(remainders[i].binary_basis_limbs[2].element);
            limb_2_accumulator.emplace_back(remainders[i].binary_basis_limbs[3].element * shift_1);
            prime_limb_accumulator.emplace_back(remainders[i].prime_basis_limb);
        }
        for (const auto& add : to_add) {
            limb_0_accumulator.emplace_back(-add.binary_basis_limbs[0].element);
            limb_0_accumulator.emplace_back(-add.binary_basis_limbs[1].element * shift_1);
            limb_2_accumulator.emplace_back(-add.binary_basis_limbs[2].element);
            limb_2_accumulator.emplace_back(-add.binary_basis_limbs[3].element * shift_1);
            prime_limb_accumulator.emplace_back(-add.prime_basis_limb);
        }

        field_t<Builder> accumulated_lo = field_t<Builder>::accumulate(limb_0_accumulator);
        field_t<Builder> accumulated_hi = field_t<Builder>::accumulate(limb_2_accumulator);
        if (accumulated_lo.is_constant()) {
            accumulated_lo =
                field_t<Builder>::from_witness_index(ctx, ctx->put_constant_variable(accumulated_lo.get_value()));
        }
        if (accumulated_hi.is_constant()) {
            accumulated_hi =
                field_t<Builder>::from_witness_index(ctx, ctx->put_constant_variable(accumulated_hi.get_value()));
        }
        field_t<Builder> remainder1 = no_remainders ? field_t<Builder>::from_witness_index(ctx, ctx->zero_idx)
                                                    : remainders[0].binary_basis_limbs[1].element;
        if (remainder1.is_constant()) {
            remainder1 = field_t<Builder>::from_witness_index(ctx, ctx->put_constant_variable(remainder1.get_value()));
        }
        field_t<Builder> remainder3 = no_remainders ? field_t<Builder>::from_witness_index(ctx, ctx->zero_idx)
                                                    : remainders[0].binary_basis_limbs[3].element;
        if (remainder3.is_constant()) {
            remainder3 = field_t<Builder>::from_witness_index(ctx, ctx->put_constant_variable(remainder3.get_value()));
        }
        field_t<Builder> remainder_limbs[4]{
            accumulated_lo,
            remainder1,
            accumulated_hi,
            remainder3,
        };
        field_t<Builder> remainder_prime_limb = field_t<Builder>::accumulate(prime_limb_accumulator);

        // We wish to show that left*right - quotient*remainder = 0 mod 2^t, we do this by collecting the limb
        // products into two separate variables - carry_lo and carry_hi, which are still small enough not to wrap
        // mod r Their first t/2 bits will equal, respectively, the first and second t/2 bits of the expresssion
        // Thus it will suffice to check that each of them begins with t/2 zeroes. We do this by in fact assigning
        // to these variables those expressions divided by 2^{t/2}. Since we have bounds on their ranage that are
        // smaller than r, We can range check the divisions by the original range bounds divided by 2^{t/2}

        field_t r0 = left[0].binary_basis_limbs[0].element.madd(
            right[0].binary_basis_limbs[0].element, quotient.binary_basis_limbs[0].element * neg_modulus_limbs[0]);
        field_t r1 = b0.add_two(b1, -remainder_limbs[1]);
        const field_t r2 = c0.add_two(c1, c2);
        const field_t r3 = d0 + d1.add_two(d2, d3);

        field_t carry_lo_0 = r0 * shift_right_2;
        field_t carry_lo_1 = r1 * (shift_1 * shift_right_2);
        field_t carry_lo_2 = -(remainder_limbs[0] * shift_right_2);
        field_t carry_lo = carry_lo_0.add_two(carry_lo_1, carry_lo_2);

        field_t t1 = carry_lo.add_two(-remainder_limbs[2], -(remainder_limbs[3] * shift_1));
        field_t carry_hi_0 = r2 * shift_right_2;
        field_t carry_hi_1 = r3 * (shift_1 * shift_right_2);
        field_t carry_hi_2 = t1 * shift_right_2;
        field_t carry_hi = carry_hi_0.add_two(carry_hi_1, carry_hi_2);

        bb::fr neg_prime = -bb::fr(uint256_t(target_basis.modulus));

        field_t<Builder> linear_terms(ctx, bb::fr(0));

        linear_terms += -remainder_prime_limb;

        // This is where we show our identity is zero mod r (to use CRT we show it's zero mod r and mod 2^t)
        field_t<Builder>::evaluate_polynomial_identity(
            left[0].prime_basis_limb, right[0].prime_basis_limb, quotient.prime_basis_limb * neg_prime, linear_terms);

        const uint64_t carry_lo_msb = max_lo_bits - (2 * NUM_LIMB_BITS);
        const uint64_t carry_hi_msb = max_hi_bits - (2 * NUM_LIMB_BITS);

        const bb::fr carry_lo_shift(uint256_t(uint256_t(1) << carry_lo_msb));

        if constexpr (HasPlookup<Builder>) {
            carry_lo = carry_lo.normalize();
            carry_hi = carry_hi.normalize();
            ctx->decompose_into_default_range(carry_lo.witness_index, static_cast<size_t>(carry_lo_msb));
            ctx->decompose_into_default_range(carry_hi.witness_index, static_cast<size_t>(carry_hi_msb));

        } else {
            if ((carry_hi_msb + carry_lo_msb) < field_t<Builder>::modulus.get_msb()) {
                field_t carry_combined = carry_lo + (carry_hi * carry_lo_shift);
                carry_combined = carry_combined.normalize();
                const auto accumulators = ctx->decompose_into_base4_accumulators(
                    carry_combined.witness_index,
                    static_cast<size_t>(carry_lo_msb + carry_hi_msb),
                    "bigfield: carry_combined too large in unsafe_evaluate_multiple_multiply_add.");
                field_t<Builder> accumulator_midpoint = field_t<Builder>::from_witness_index(
                    ctx, accumulators[static_cast<size_t>((carry_hi_msb / 2) - 1)]);
                carry_hi.assert_equal(accumulator_midpoint, "bigfield multiply range check failed");
            } else {
                carry_lo = carry_lo.normalize();
                carry_hi = carry_hi.normalize();
                ctx->decompose_into_base4_accumulators(
                    carry_lo.witness_index,
                    static_cast<size_t>(carry_lo_msb),
                    "bigfield: carry_lo too large in unsafe_evaluate_multiple_multiply_add.");
                ctx->decompose_into_base4_accumulators(
                    carry_hi.witness_index,
                    static_cast<size_t>(carry_hi_msb),
                    "bigfield: carry_hi too large in unsafe_evaluate_multiple_multiply_add.");
            }
        }
    }
}

template <typename Builder, typename T>
void bigfield<Builder, T>::unsafe_evaluate_square_add(const bigfield& left,
                                                      const std::vector<bigfield>& to_add,
                                                      const bigfield& quotient,
                                                      const bigfield& remainder)
{
    if (HasPlookup<Builder>) {
        unsafe_evaluate_multiply_add(left, left, to_add, quotient, { remainder });
        return;
    }
    Builder* ctx = left.context == nullptr ? quotient.context : left.context;

    uint512_t max_b0 = (left.binary_basis_limbs[1].maximum_value * left.binary_basis_limbs[0].maximum_value);
    max_b0 += (neg_modulus_limbs_u256[1] << NUM_LIMB_BITS);
    max_b0 += max_b0;
    uint512_t max_c0 = (left.binary_basis_limbs[1].maximum_value * left.binary_basis_limbs[1].maximum_value);
    max_c0 += (neg_modulus_limbs_u256[1] << NUM_LIMB_BITS);
    uint512_t max_c1 = (left.binary_basis_limbs[2].maximum_value * left.binary_basis_limbs[0].maximum_value);
    max_c1 += (neg_modulus_limbs_u256[2] << NUM_LIMB_BITS);
    max_c1 += max_c1;
    uint512_t max_d0 = (left.binary_basis_limbs[3].maximum_value * left.binary_basis_limbs[0].maximum_value);
    max_d0 += (neg_modulus_limbs_u256[3] << NUM_LIMB_BITS);
    max_d0 += max_d0;
    uint512_t max_d1 = (left.binary_basis_limbs[2].maximum_value * left.binary_basis_limbs[1].maximum_value);
    max_d1 += (neg_modulus_limbs_u256[2] << NUM_LIMB_BITS);
    max_d1 += max_d1;

    uint512_t max_r0 = left.binary_basis_limbs[0].maximum_value * left.binary_basis_limbs[0].maximum_value;
    max_r0 += (neg_modulus_limbs_u256[0] << NUM_LIMB_BITS);

    const uint512_t max_r1 = max_b0;
    const uint512_t max_r2 = max_c0 + max_c1;
    const uint512_t max_r3 = max_d0 + max_d1;

    uint512_t max_a0(0);
    uint512_t max_a1(1);
    for (size_t i = 0; i < to_add.size(); ++i) {
        max_a0 += to_add[i].binary_basis_limbs[0].maximum_value +
                  (to_add[i].binary_basis_limbs[1].maximum_value << NUM_LIMB_BITS);
        max_a1 += to_add[i].binary_basis_limbs[2].maximum_value +
                  (to_add[i].binary_basis_limbs[3].maximum_value << NUM_LIMB_BITS);
    }
    const uint512_t max_lo = max_r0 + (max_r1 << NUM_LIMB_BITS) + max_a0;
    const uint512_t max_hi = max_r2 + (max_r3 << NUM_LIMB_BITS) + max_a1;

    uint64_t max_lo_bits = max_lo.get_msb() + 1;
    uint64_t max_hi_bits = max_hi.get_msb() + 1;
    if ((max_lo_bits & 1ULL) == 1ULL) {
        ++max_lo_bits;
    }
    if ((max_hi_bits & 1ULL) == 1ULL) {
        ++max_hi_bits;
    }

    field_t half(ctx, bb::fr(2).invert());
    field_t two(ctx, bb::fr(2));
    field_t b_quotient_0 = (quotient.binary_basis_limbs[1].element * neg_modulus_limbs[0]);
    field_t b_quotient_1 = (quotient.binary_basis_limbs[0].element * neg_modulus_limbs[1]);

    field_t c_quotient_0 = (quotient.binary_basis_limbs[2].element * neg_modulus_limbs[0]);
    field_t c_quotient_1 = (quotient.binary_basis_limbs[0].element * neg_modulus_limbs[2]);

    field_t d_quotient_0 = (quotient.binary_basis_limbs[3].element * neg_modulus_limbs[0]);
    field_t d_quotient_1 = (quotient.binary_basis_limbs[1].element * neg_modulus_limbs[2]);
    field_t d_quotient_2 = (quotient.binary_basis_limbs[0].element * neg_modulus_limbs[3]);
    field_t d_quotient_3 = (quotient.binary_basis_limbs[2].element * neg_modulus_limbs[1]);

    const field_t b0 =
        two * left.binary_basis_limbs[1].element.madd(left.binary_basis_limbs[0].element, b_quotient_0 * half);

    const field_t c0 = left.binary_basis_limbs[1].element.madd(
        left.binary_basis_limbs[1].element, quotient.binary_basis_limbs[1].element * neg_modulus_limbs[1]);
    const field_t c1 =
        two * left.binary_basis_limbs[2].element.madd(left.binary_basis_limbs[0].element, c_quotient_0 * half);

    const field_t d0 =
        two * left.binary_basis_limbs[3].element.madd(left.binary_basis_limbs[0].element, d_quotient_0 * half);

    const field_t d1 =
        two * left.binary_basis_limbs[2].element.madd(left.binary_basis_limbs[1].element, d_quotient_1 * half);

    const field_t r0 = left.binary_basis_limbs[0].element.madd(
        left.binary_basis_limbs[0].element, quotient.binary_basis_limbs[0].element * neg_modulus_limbs[0]);

    const field_t r1 = b0.add_two(b_quotient_1, -remainder.binary_basis_limbs[1].element);
    const field_t r2 = c0.add_two(c_quotient_1, c1);
    const field_t r3 = d0.add_two(d_quotient_2, d1) + d_quotient_3;

    field_t carry_lo_0 = r0 * shift_right_2;
    field_t carry_lo_1 = r1 * (shift_1 * shift_right_2);
    field_t carry_lo_2 = -(remainder.binary_basis_limbs[0].element * shift_right_2);
    field_t carry_lo = carry_lo_0.add_two(carry_lo_1, carry_lo_2);

    for (const auto& add_element : to_add) {
        carry_lo = carry_lo.add_two(add_element.binary_basis_limbs[0].element * shift_right_2,
                                    add_element.binary_basis_limbs[1].element * (shift_1 * shift_right_2));
    }

    field_t t1 = carry_lo.add_two(-remainder.binary_basis_limbs[2].element,
                                  -(remainder.binary_basis_limbs[3].element * shift_1));
    field_t carry_hi_0 = r2 * shift_right_2;
    field_t carry_hi_1 = r3 * (shift_1 * shift_right_2);
    field_t carry_hi_2 = t1 * shift_right_2;
    field_t carry_hi = carry_hi_0.add_two(carry_hi_1, carry_hi_2);

    for (const auto& add_element : to_add) {
        carry_hi = carry_hi.add_two(add_element.binary_basis_limbs[2].element * shift_right_2,
                                    add_element.binary_basis_limbs[3].element * (shift_1 * shift_right_2));
    }

    bb::fr neg_prime = -bb::fr(uint256_t(target_basis.modulus));
    field_t<Builder> linear_terms = -remainder.prime_basis_limb;
    if (to_add.size() >= 2) {
        for (size_t i = 0; i < to_add.size() / 2; i += 1) {
            linear_terms = linear_terms.add_two(to_add[2 * i].prime_basis_limb, to_add[2 * i + 1].prime_basis_limb);
        }
    }
    if ((to_add.size() & 1UL) == 1UL) {
        linear_terms += to_add[to_add.size() - 1].prime_basis_limb;
    }
    field_t<Builder>::evaluate_polynomial_identity(
        left.prime_basis_limb, left.prime_basis_limb, quotient.prime_basis_limb * neg_prime, linear_terms);

    const uint64_t carry_lo_msb = max_lo_bits - (2 * NUM_LIMB_BITS);
    const uint64_t carry_hi_msb = max_hi_bits - (2 * NUM_LIMB_BITS);

    const bb::fr carry_lo_shift(uint256_t(uint256_t(1) << carry_lo_msb));
    if constexpr (HasPlookup<Builder>) {
        carry_lo = carry_lo.normalize();
        carry_hi = carry_hi.normalize();
        ctx->decompose_into_default_range(carry_lo.witness_index, static_cast<size_t>(carry_lo_msb));
        ctx->decompose_into_default_range(carry_hi.witness_index, static_cast<size_t>(carry_hi_msb));

    } else {
        if ((carry_hi_msb + carry_lo_msb) < field_t<Builder>::modulus.get_msb()) {
            field_t carry_combined = carry_lo + (carry_hi * carry_lo_shift);
            carry_combined = carry_combined.normalize();
            const auto accumulators = ctx->decompose_into_base4_accumulators(
                carry_combined.witness_index,
                static_cast<size_t>(carry_lo_msb + carry_hi_msb),
                "bigfield: carry_combined too large in unsafe_evaluate_square_add.");
            field_t<Builder> accumulator_midpoint =
                field_t<Builder>::from_witness_index(ctx, accumulators[static_cast<size_t>((carry_hi_msb / 2) - 1)]);
            carry_hi.assert_equal(accumulator_midpoint, "bigfield multiply range check failed");
        } else {
            carry_lo = carry_lo.normalize();
            carry_hi = carry_hi.normalize();
            ctx->decompose_into_base4_accumulators(carry_lo.witness_index,
                                                   static_cast<size_t>(carry_lo_msb),
                                                   "bigfield: carry_lo too large in unsafe_evaluate_square_add.");
            ctx->decompose_into_base4_accumulators(carry_hi.witness_index,
                                                   static_cast<size_t>(carry_hi_msb),
                                                   "bigfield: carry_hi too large in unsafe_evaluate_square_add");
        }
    }
}

template <typename Builder, typename T>
std::pair<uint512_t, uint512_t> bigfield<Builder, T>::compute_quotient_remainder_values(
    const bigfield& a, const bigfield& b, const std::vector<bigfield>& to_add)
{
    uint512_t add_values(0);
    for (const auto& add_element : to_add) {
        add_element.reduction_check();
        add_values += add_element.get_value();
    }

    const uint1024_t left(a.get_value());
    const uint1024_t right(b.get_value());
    const uint1024_t add_right(add_values);
    const uint1024_t modulus(target_basis.modulus);

    const auto [quotient_1024, remainder_1024] = (left * right + add_right).divmod(modulus);

    return { quotient_1024.lo, remainder_1024.lo };
}

template <typename Builder, typename T>
uint512_t bigfield<Builder, T>::compute_maximum_quotient_value(const std::vector<uint512_t>& as,
                                                               const std::vector<uint512_t>& bs,
                                                               const std::vector<uint512_t>& to_add)
{
    ASSERT(as.size() == bs.size());
    uint512_t add_values(0);
    for (const auto& add_element : to_add) {
        add_values += add_element;
    }
    uint1024_t product_sum(0);
    for (size_t i = 0; i < as.size(); i++) {
        product_sum += uint1024_t(as[i]) * uint1024_t(bs[i]);
    }
    const uint1024_t add_right(add_values);
    const uint1024_t modulus(target_basis.modulus);

    const auto [quotient_1024, remainder_1024] = (product_sum + add_right).divmod(modulus);

    return quotient_1024.lo;
}
template <typename Builder, typename T>
std::pair<bool, size_t> bigfield<Builder, T>::get_quotient_reduction_info(const std::vector<uint512_t>& as_max,
                                                                          const std::vector<uint512_t>& bs_max,
                                                                          const std::vector<bigfield>& to_add,
                                                                          const std::vector<uint1024_t>& remainders_max)
{
    ASSERT(as_max.size() == bs_max.size());
    // Check if the product sum can overflow CRT modulus
    if (mul_product_overflows_crt_modulus(as_max, bs_max, to_add)) {
        return std::pair<bool, size_t>(true, 0);
    }
    const size_t num_quotient_bits = get_quotient_max_bits(remainders_max);
    std::vector<uint512_t> to_add_max;
    for (auto& added_element : to_add) {
        to_add_max.push_back(added_element.get_maximum_value());
    }
    // Get maximum value of quotient
    const uint512_t maximum_quotient = compute_maximum_quotient_value(as_max, bs_max, to_add_max);

    // Check if the quotient can fit into the range proof
    if (maximum_quotient >= (uint512_t(1) << num_quotient_bits)) {
        return std::pair<bool, size_t>(true, 0);
    }
    return std::pair<bool, size_t>(false, num_quotient_bits);
}

} // namespace bb::stdlib
