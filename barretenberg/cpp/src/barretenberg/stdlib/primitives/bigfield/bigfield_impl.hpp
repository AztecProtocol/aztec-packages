// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/zip_view.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/numeric/uintx/uintx.hpp"
#include <cstdint>
#include <tuple>

#include "../circuit_builders/circuit_builders.hpp"
#include "bigfield.hpp"

#include "../bit_array/bit_array.hpp"
#include "../field/field.hpp"
#include "barretenberg/transcript/origin_tag.hpp"

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
    ASSERT(low_bits_in.is_constant() == high_bits_in.is_constant());
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
    if (!low_bits_in.is_constant()) {
        // Decompose the low bits into 2 limbs and range constrain them.
        const auto limb_witnesses =
            context->decompose_non_native_field_double_width_limb(low_bits_in.get_normalized_witness_index());
        limb_0.witness_index = limb_witnesses[0];
        limb_1.witness_index = limb_witnesses[1];
        field_t<Builder>::evaluate_linear_identity(low_bits_in, -limb_0, -limb_1 * shift_1, field_t<Builder>(0));
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
    if (!high_bits_in.is_constant()) {
        // Decompose the high bits into 2 limbs and range constrain them.
        const auto limb_witnesses = context->decompose_non_native_field_double_width_limb(
            high_bits_in.get_normalized_witness_index(), (size_t)num_high_limb_bits);
        limb_2.witness_index = limb_witnesses[0];
        limb_3.witness_index = limb_witnesses[1];
        field_t<Builder>::evaluate_linear_identity(high_bits_in, -limb_2, -limb_3 * shift_1, field_t<Builder>(0));
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
    auto new_tag = OriginTag(low_bits_in.tag, high_bits_in.tag);
    set_origin_tag(new_tag);
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
    ctx->create_big_add_gate({ limb_1.get_normalized_witness_index(),
                               limb_2.get_normalized_witness_index(),
                               limb_3.get_normalized_witness_index(),
                               prime_limb.get_normalized_witness_index(),
                               shift_1,
                               shift_2,
                               shift_3,
                               -1,
                               0 },
                             true);
    // NOTE(https://github.com/AztecProtocol/barretenberg/issues/879): Optimisation opportunity to use a single gate
    // (and remove dummy gate). Currently, dummy gate is necessary for preceeding big add gate as these gates fall in
    // the arithmetic block. More details on the linked Github issue.
    ctx->create_dummy_gate(
        ctx->blocks.arithmetic, ctx->zero_idx, ctx->zero_idx, ctx->zero_idx, limb_0.get_normalized_witness_index());

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
    ctx->range_constrain_two_limbs(limb_0.get_normalized_witness_index(),
                                   limb_1.get_normalized_witness_index(),
                                   (size_t)NUM_LIMB_BITS,
                                   (size_t)NUM_LIMB_BITS);
    ctx->range_constrain_two_limbs(limb_2.get_normalized_witness_index(),
                                   limb_3.get_normalized_witness_index(),
                                   (size_t)NUM_LIMB_BITS,
                                   (size_t)num_last_limb_bits);

    // Mark the element as coming out of nowhere
    result.set_free_witness_tag();

    return result;
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

        const uint256_t hi_nibble_shift = uint256_t(1) << 4;
        const field_t<Builder> sum = lo_nibble + (hi_nibble * hi_nibble_shift);
        sum.assert_equal(split_byte);
        return std::make_pair(lo_nibble, hi_nibble);
    };

    const auto reconstruct_two_limbs = [&split_byte_into_nibbles](Builder* ctx,
                                                                  const field_t<Builder>& hi_bytes,
                                                                  const field_t<Builder>& lo_bytes,
                                                                  const field_t<Builder>& split_byte) {
        const auto [lo_nibble, hi_nibble] = split_byte_into_nibbles(ctx, split_byte);

        const uint256_t hi_bytes_shift = uint256_t(1) << 4;
        const uint256_t lo_nibble_shift = uint256_t(1) << 64;
        field_t<Builder> hi_limb = hi_nibble + hi_bytes * hi_bytes_shift;
        field_t<Builder> lo_limb = lo_bytes + lo_nibble * lo_nibble_shift;
        return std::make_pair(lo_limb, hi_limb);
    };
    Builder* ctx = bytes.get_context();

    // The input bytes are interpreted as a 256-bit integer, which is split into 4 limbs as follows:
    //
    //                       overlap byte                                      overlap byte
    //                            ↓                                                  ↓
    // [ b31 b30  ...  b25 b24 | b23 | b22 b21  ...  b16 b15 | b14  b13 ... b8 b7 | b06 | b5 b4  ...  b1 b0 ]
    // |--------------------------|--------------------------|-----------------------|----------------------|
    // ↑         68 bits          ↑         68 bits          ↑         68 bits       ↑         52 bits      ↑
    // [         limb l0          |         limb l1          |         limb l2       |         limb l3      ]
    //
    const field_t<Builder> hi_8_bytes(bytes.slice(0, 6));
    const field_t<Builder> mid_split_byte(bytes.slice(6, 1));
    const field_t<Builder> mid_8_bytes(bytes.slice(7, 8));

    const field_t<Builder> lo_8_bytes(bytes.slice(15, 8));
    const field_t<Builder> lo_split_byte(bytes.slice(23, 1));
    const field_t<Builder> lolo_8_bytes(bytes.slice(24, 8));

    const auto [limb0, limb1] = reconstruct_two_limbs(ctx, lo_8_bytes, lolo_8_bytes, lo_split_byte);
    const auto [limb2, limb3] = reconstruct_two_limbs(ctx, hi_8_bytes, mid_8_bytes, mid_split_byte);

    const auto res = bigfield::unsafe_construct_from_limbs(limb0, limb1, limb2, limb3, true);

    const auto num_last_limb_bits = 256 - (NUM_LIMB_BITS * 3);
    res.binary_basis_limbs[3].maximum_value = (uint64_t(1) << num_last_limb_bits);
    *this = res;
    set_origin_tag(bytes.get_origin_tag());
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

template <typename Builder, typename T>
bigfield<Builder, T> bigfield<Builder, T>::add_to_lower_limb(const field_t<Builder>& other,
                                                             uint256_t other_maximum_value) const
{
    reduction_check();
    ASSERT((uint512_t(other_maximum_value) + uint512_t(binary_basis_limbs[0].maximum_value)) <=
           uint512_t(get_maximum_unreduced_limb_value()));
    // needed cause a constant doesn't have a valid context
    Builder* ctx = context ? context : other.context;

    if (is_constant() && other.is_constant()) {
        return bigfield(ctx, uint256_t((get_value() + uint256_t(other.get_value())) % modulus_u512));
    }

    bigfield result;
    // If the original value is constant, we have to reinitialize the higher limbs to be witnesses when adding a witness
    if (is_constant()) {
        auto context = other.context;
        for (size_t i = 1; i < 4; i++) {
            // Construct a witness element from the original constant limb
            result.binary_basis_limbs[i] =
                Limb(field_t<Builder>::from_witness(context, binary_basis_limbs[i].element.get_value()),
                     binary_basis_limbs[i].maximum_value);
            // Ensure it is fixed
            result.binary_basis_limbs[i].element.fix_witness();
            result.context = ctx;
        }
    } else {

        // if this element is a witness, then all limbs will be witnesses
        result = *this;
    }
    result.binary_basis_limbs[0].maximum_value = binary_basis_limbs[0].maximum_value + other_maximum_value;

    result.binary_basis_limbs[0].element = binary_basis_limbs[0].element + other;
    result.prime_basis_limb = prime_basis_limb + other;
    result.set_origin_tag(OriginTag(get_origin_tag(), other.tag));
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
        auto result = bigfield(ctx, uint256_t((get_value() + other.get_value()) % modulus_u512));
        result.set_origin_tag(OriginTag(get_origin_tag(), other.get_origin_tag()));
        return result;
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

    // If both the elements are witnesses, we use an optimised addition trick that uses 4 gates instead of 5.
    //
    // Naively, we would need 5 gates to add two bigfield elements: 4 gates to add the binary basis limbs and
    // 1 gate to add the prime basis limbs.
    //
    // In the optimised version, we fit 15 witnesses into 4 gates (4 + 4 + 4 + 3 = 15), and we add the prime basis limbs
    // and one of the binary basis limbs in the first gate.
    // gate 1: z.limb_0 = x.limb_0 + y.limb_0  &&  z.prime_limb = x.prime_limb + y.prime_limb
    // gate 2: z.limb_1 = x.limb_1 + y.limb_1
    // gate 3: z.limb_2 = x.limb_2 + y.limb_2
    // gate 4: z.limb_3 = x.limb_3 + y.limb_3
    //
    bool both_witness = !is_constant() && !other.is_constant();
    bool both_prime_limb_multiplicative_constant_one =
        (prime_basis_limb.multiplicative_constant == 1 && other.prime_basis_limb.multiplicative_constant == 1);
    if (both_prime_limb_multiplicative_constant_one && both_witness) {
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
        limbconst =
            limbconst ||
            (prime_basis_limb.get_witness_index() ==
             other.prime_basis_limb.get_witness_index()); // We are comparing if the bigfield elements are exactly the
                                                          // same object, so we compare the unnormalized witness indices
        if (!limbconst) {
            // Extract witness indices and multiplicative constants for binary basis limbs
            std::array<std::pair<uint32_t, bb::fr>, NUM_LIMBS> x_scaled;
            std::array<std::pair<uint32_t, bb::fr>, NUM_LIMBS> y_scaled;
            std::array<bb::fr, NUM_LIMBS> c_adds;

            for (size_t i = 0; i < NUM_LIMBS; ++i) {
                const auto& x_limb = binary_basis_limbs[i].element;
                const auto& y_limb = other.binary_basis_limbs[i].element;

                x_scaled[i] = { x_limb.witness_index, x_limb.multiplicative_constant };
                y_scaled[i] = { y_limb.witness_index, y_limb.multiplicative_constant };
                c_adds[i] = bb::fr(x_limb.additive_constant + y_limb.additive_constant);
            }

            // Extract witness indices for prime basis limb
            uint32_t x_prime(prime_basis_limb.witness_index);
            uint32_t y_prime(other.prime_basis_limb.witness_index);
            bb::fr c_prime(prime_basis_limb.additive_constant + other.prime_basis_limb.additive_constant);

            const auto output_witnesses =
                ctx->evaluate_non_native_field_addition({ x_scaled[0], y_scaled[0], c_adds[0] },
                                                        { x_scaled[1], y_scaled[1], c_adds[1] },
                                                        { x_scaled[2], y_scaled[2], c_adds[2] },
                                                        { x_scaled[3], y_scaled[3], c_adds[3] },
                                                        { x_prime, y_prime, c_prime });

            result.binary_basis_limbs[0].element = field_t<Builder>::from_witness_index(ctx, output_witnesses[0]);
            result.binary_basis_limbs[1].element = field_t<Builder>::from_witness_index(ctx, output_witnesses[1]);
            result.binary_basis_limbs[2].element = field_t<Builder>::from_witness_index(ctx, output_witnesses[2]);
            result.binary_basis_limbs[3].element = field_t<Builder>::from_witness_index(ctx, output_witnesses[3]);
            result.prime_basis_limb = field_t<Builder>::from_witness_index(ctx, output_witnesses[4]);
            result.set_origin_tag(OriginTag(get_origin_tag(), other.get_origin_tag()));
            return result;
        }
    }

    // If one of the elements is a constant or its prime limb does not have a multiplicative constant of 1, we
    // use the standard addition method. This will not use additional gates because field addition with one constant
    // does not require any additional gates.
    result.binary_basis_limbs[0].element = binary_basis_limbs[0].element + other.binary_basis_limbs[0].element;
    result.binary_basis_limbs[1].element = binary_basis_limbs[1].element + other.binary_basis_limbs[1].element;
    result.binary_basis_limbs[2].element = binary_basis_limbs[2].element + other.binary_basis_limbs[2].element;
    result.binary_basis_limbs[3].element = binary_basis_limbs[3].element + other.binary_basis_limbs[3].element;
    result.prime_basis_limb = prime_basis_limb + other.prime_basis_limb;

    result.set_origin_tag(OriginTag(get_origin_tag(), other.get_origin_tag()));
    return result;
}

template <typename Builder, typename T>
bigfield<Builder, T> bigfield<Builder, T>::add_two(const bigfield& add_a, const bigfield& add_b) const
{
    reduction_check();
    add_a.reduction_check();
    add_b.reduction_check();

    Builder* ctx = (context == nullptr) ? (add_a.context == nullptr ? add_b.context : add_a.context) : context;

    if (is_constant() && add_a.is_constant() && add_b.is_constant()) {
        auto result = bigfield(ctx, uint256_t((get_value() + add_a.get_value() + add_b.get_value()) % modulus_u512));
        result.set_origin_tag(OriginTag(this->get_origin_tag(), add_a.get_origin_tag(), add_b.get_origin_tag()));
        return result;
    }

    bigfield result(ctx);
    result.binary_basis_limbs[0].maximum_value = binary_basis_limbs[0].maximum_value +
                                                 add_a.binary_basis_limbs[0].maximum_value +
                                                 add_b.binary_basis_limbs[0].maximum_value;
    result.binary_basis_limbs[1].maximum_value = binary_basis_limbs[1].maximum_value +
                                                 add_a.binary_basis_limbs[1].maximum_value +
                                                 add_b.binary_basis_limbs[1].maximum_value;
    result.binary_basis_limbs[2].maximum_value = binary_basis_limbs[2].maximum_value +
                                                 add_a.binary_basis_limbs[2].maximum_value +
                                                 add_b.binary_basis_limbs[2].maximum_value;
    result.binary_basis_limbs[3].maximum_value = binary_basis_limbs[3].maximum_value +
                                                 add_a.binary_basis_limbs[3].maximum_value +
                                                 add_b.binary_basis_limbs[3].maximum_value;

    result.binary_basis_limbs[0].element =
        binary_basis_limbs[0].element.add_two(add_a.binary_basis_limbs[0].element, add_b.binary_basis_limbs[0].element);
    result.binary_basis_limbs[1].element =
        binary_basis_limbs[1].element.add_two(add_a.binary_basis_limbs[1].element, add_b.binary_basis_limbs[1].element);
    result.binary_basis_limbs[2].element =
        binary_basis_limbs[2].element.add_two(add_a.binary_basis_limbs[2].element, add_b.binary_basis_limbs[2].element);
    result.binary_basis_limbs[3].element =
        binary_basis_limbs[3].element.add_two(add_a.binary_basis_limbs[3].element, add_b.binary_basis_limbs[3].element);
    result.prime_basis_limb = prime_basis_limb.add_two(add_a.prime_basis_limb, add_b.prime_basis_limb);
    result.set_origin_tag(OriginTag(this->get_origin_tag(), add_a.get_origin_tag(), add_b.get_origin_tag()));
    return result;
}

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

        auto result = bigfield(ctx, uint256_t(out.lo));
        result.set_origin_tag(OriginTag(get_origin_tag(), other.get_origin_tag()));
        return result;
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
    uint1024_t constant_to_add_factor =
        (uint1024_t(limb_3_maximum_value) << (NUM_LIMB_BITS * 3)) / uint1024_t(modulus_u512) + uint1024_t(1);
    uint512_t constant_to_add = constant_to_add_factor.lo * modulus_u512;

    /**
     * Step 3: Compute offset terms t0, t1, t2, t3 that we add to our result to ensure each limb is positive
     *
     * t3 represents the value we are BORROWING from constant_to_add.limb[3]
     * t2, t1, t0 are the terms we will ADD to constant_to_add.limb[2], constant_to_add.limb[1],
     *constant_to_add.limb[0]
     *
     * Borrow propagation table:
     * ┌───────┬─────────────────────────────────┬──────────────────────────────────┐
     * │ Limb  │ Value received FROM next limb   │ Value given TO previous limb     │
     * ├───────┼─────────────────────────────────┼──────────────────────────────────┤
     * │   0   │ 2^limb_0_borrow_shift           │ 0                                │
     * │   1   │ 2^limb_1_borrow_shift           │ 2^(limb_0_borrow_shift - L)      │
     * │   2   │ 2^limb_2_borrow_shift           │ 2^(limb_1_borrow_shift - L)      │
     * │   3   │ 0                               │ 2^(limb_2_borrow_shift - L)      │
     * └───────┴─────────────────────────────────┴──────────────────────────────────┘
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
     * Compute the limbs of `constant_to_add`, including our offset terms t0, t1, t2, t3 that ensure each result
     *limb is positive
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

    bool both_witness = !is_constant() && !other.is_constant();
    bool both_prime_limb_multiplicative_constant_one =
        (prime_basis_limb.multiplicative_constant == 1 && other.prime_basis_limb.multiplicative_constant == 1);
    if (both_prime_limb_multiplicative_constant_one && both_witness) {
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
        limbconst = limbconst ||
                    (prime_basis_limb.witness_index ==
                     other.prime_basis_limb.witness_index); // We are checking if this is and identical element, so we
                                                            // need to compare the actual indices, not normalized ones
        if (!limbconst) {
            // Extract witness indices and multiplicative constants for binary basis limbs
            std::array<std::pair<uint32_t, bb::fr>, NUM_LIMBS> x_scaled;
            std::array<std::pair<uint32_t, bb::fr>, NUM_LIMBS> y_scaled;
            std::array<bb::fr, NUM_LIMBS> c_diffs;

            for (size_t i = 0; i < NUM_LIMBS; ++i) {
                const auto& x_limb = result.binary_basis_limbs[i].element;
                const auto& y_limb = other.binary_basis_limbs[i].element;

                x_scaled[i] = { x_limb.witness_index, x_limb.multiplicative_constant };
                y_scaled[i] = { y_limb.witness_index, y_limb.multiplicative_constant };
                c_diffs[i] = bb::fr(x_limb.additive_constant - y_limb.additive_constant);
            }

            // Extract witness indices for prime basis limb
            uint32_t x_prime(prime_basis_limb.witness_index);
            uint32_t y_prime(other.prime_basis_limb.witness_index);
            bb::fr c_prime(prime_basis_limb.additive_constant - other.prime_basis_limb.additive_constant);
            uint512_t constant_to_add_mod_native = (constant_to_add) % prime_basis.modulus;
            c_prime += bb::fr(constant_to_add_mod_native.lo);

            const auto output_witnesses =
                ctx->evaluate_non_native_field_subtraction({ x_scaled[0], y_scaled[0], c_diffs[0] },
                                                           { x_scaled[1], y_scaled[1], c_diffs[1] },
                                                           { x_scaled[2], y_scaled[2], c_diffs[2] },
                                                           { x_scaled[3], y_scaled[3], c_diffs[3] },
                                                           { x_prime, y_prime, c_prime });

            result.binary_basis_limbs[0].element = field_t<Builder>::from_witness_index(ctx, output_witnesses[0]);
            result.binary_basis_limbs[1].element = field_t<Builder>::from_witness_index(ctx, output_witnesses[1]);
            result.binary_basis_limbs[2].element = field_t<Builder>::from_witness_index(ctx, output_witnesses[2]);
            result.binary_basis_limbs[3].element = field_t<Builder>::from_witness_index(ctx, output_witnesses[3]);
            result.prime_basis_limb = field_t<Builder>::from_witness_index(ctx, output_witnesses[4]);

            result.set_origin_tag(OriginTag(get_origin_tag(), other.get_origin_tag()));
            return result;
        }
    }

    result.binary_basis_limbs[0].element -= other.binary_basis_limbs[0].element;
    result.binary_basis_limbs[1].element -= other.binary_basis_limbs[1].element;
    result.binary_basis_limbs[2].element -= other.binary_basis_limbs[2].element;
    result.binary_basis_limbs[3].element -= other.binary_basis_limbs[3].element;

    /**
     * Compute the prime basis limb of the result
     **/
    uint512_t constant_to_add_mod_native = (constant_to_add) % prime_basis.modulus;
    field_t prime_basis_to_add(ctx, bb::fr(constant_to_add_mod_native.lo));
    result.prime_basis_limb = prime_basis_limb + prime_basis_to_add;
    result.prime_basis_limb -= other.prime_basis_limb;
    return result;
}

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
        remainder.set_origin_tag(OriginTag(get_origin_tag(), other.get_origin_tag()));
        return remainder;
    } else {
        // when writing a*b = q*p + r we wish to enforce r<2^s for smallest s such that p<2^s
        // hence the second constructor call is with can_overflow=false. This will allow using r in more additions
        // mod 2^t without needing to apply the mod, where t=4*NUM_LIMB_BITS

        // Check if the product overflows CRT or the quotient can't be contained in a range proof and reduce
        // accordingly
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

    remainder.set_origin_tag(OriginTag(get_origin_tag(), other.get_origin_tag()));
    return remainder;
}

template <typename Builder, typename T>
bigfield<Builder, T> bigfield<Builder, T>::operator/(const bigfield& other) const
{

    return internal_div({ *this }, other, true);
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

    bigfield acc = terms[0];
    for (size_t i = 1; i < (terms.size() + 1) / 2; i++) {
        acc = acc.add_two(terms[2 * i - 1], terms[2 * i]);
    }
    if ((terms.size() & 1) == 0) {
        acc += terms[terms.size() - 1];
    }
    return acc;
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
    ASSERT(numerators.size() < MAXIMUM_SUMMAND_COUNT);
    if (numerators.size() == 0) {
        return bigfield<Builder, T>(denominator.get_context(), uint256_t(0));
    }

    denominator.reduction_check();
    Builder* ctx = denominator.context;
    uint512_t numerator_values(0);
    bool numerator_constant = true;
    OriginTag tag = denominator.get_origin_tag();
    for (const auto& numerator_element : numerators) {
        ctx = (ctx == nullptr) ? numerator_element.get_context() : ctx;
        numerator_element.reduction_check();
        numerator_values += numerator_element.get_value();
        numerator_constant = numerator_constant && (numerator_element.is_constant());
        tag = OriginTag(tag, numerator_element.get_origin_tag());
    }

    // a / b = c
    // => c * b = a mod p
    const uint1024_t left = uint1024_t(numerator_values);
    const uint1024_t right = uint1024_t(denominator.get_value());
    const uint1024_t modulus(target_basis.modulus);
    // We don't want to trigger the uint assert
    uint512_t inverse_value(0);
    if (right.lo != uint512_t(0)) {
        inverse_value = right.lo.invmod(target_basis.modulus).lo;
    }
    uint1024_t inverse_1024(inverse_value);
    inverse_value = ((left * inverse_1024) % modulus).lo;

    const uint1024_t quotient_1024 =
        (uint1024_t(inverse_value) * right + unreduced_zero().get_value() - left) / modulus;
    const uint512_t quotient_value = quotient_1024.lo;

    bigfield inverse;
    bigfield quotient;
    if (numerator_constant && denominator.is_constant()) {
        inverse = bigfield(ctx, uint256_t(inverse_value));
        inverse.set_origin_tag(tag);
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

    inverse.set_origin_tag(tag);
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

template <typename Builder, typename T>
bigfield<Builder, T> bigfield<Builder, T>::div_without_denominator_check(const bigfield& denominator)
{
    return internal_div({ *this }, denominator, false);
}

/**
 * Div method with constraints for denominator!=0.
 *
 * Similar to operator/ but numerator can be linear sum of multiple elements
 **/
template <typename Builder, typename T>
bigfield<Builder, T> bigfield<Builder, T>::div_check_denominator_nonzero(const std::vector<bigfield>& numerators,
                                                                         const bigfield& denominator)
{
    return internal_div(numerators, denominator, true);
}

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
    remainder.set_origin_tag(get_origin_tag());
    return remainder;
}

template <typename Builder, typename T>
bigfield<Builder, T> bigfield<Builder, T>::sqradd(const std::vector<bigfield>& to_add) const
{
    ASSERT(to_add.size() <= MAXIMUM_SUMMAND_COUNT);
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
            // Merge tags
            OriginTag new_tag = get_origin_tag();
            for (auto& element : to_add) {
                new_tag = OriginTag(new_tag, element.get_origin_tag());
            }
            remainder.set_origin_tag(new_tag);
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
    OriginTag new_tag = get_origin_tag();
    for (auto& element : to_add) {
        new_tag = OriginTag(new_tag, element.get_origin_tag());
    }
    remainder.set_origin_tag(new_tag);
    unsafe_evaluate_square_add(*this, to_add, quotient, remainder);
    return remainder;
}

template <typename Builder, typename T> bigfield<Builder, T> bigfield<Builder, T>::pow(const uint32_t exponent) const
{
    // Just return one immediately
    if (exponent == 0) {
        return bigfield(uint256_t(1));
    }

    // If this is a constant, compute result directly
    if (is_constant()) {
        auto base_val = get_value();
        uint512_t result_val = 1;
        uint512_t base = base_val % modulus_u512;
        uint32_t shifted_exponent = exponent;

        // Fast modular exponentiation
        while (shifted_exponent > 0) {
            if (shifted_exponent & 1) {
                result_val = (uint1024_t(result_val) * uint1024_t(base) % uint1024_t(modulus_u512)).lo;
            }
            base = (uint1024_t(base) * uint1024_t(base) % uint1024_t(modulus_u512)).lo;
            shifted_exponent >>= 1;
        }
        return bigfield(this->context, uint256_t(result_val.lo));
    }

    bool accumulator_initialized = false;
    bigfield accumulator;
    bigfield running_power = *this;
    uint32_t shifted_exponent = exponent;

    // Square and multiply
    while (shifted_exponent != 0) {
        if (shifted_exponent & 1) {
            if (!accumulator_initialized) {
                accumulator = running_power;
                accumulator_initialized = true;
            } else {
                accumulator *= running_power;
            }
        }
        shifted_exponent >>= 1;

        // Only square if there are more bits to process.
        // It is important to avoid squaring in the final iteration as it otherwise results in
        // unwanted gates and variables in the circuit.
        if (shifted_exponent != 0) {
            running_power = running_power.sqr();
        }
    }
    return accumulator;
}

template <typename Builder, typename T>
bigfield<Builder, T> bigfield<Builder, T>::madd(const bigfield& to_mul, const std::vector<bigfield>& to_add) const
{
    ASSERT(to_add.size() <= MAXIMUM_SUMMAND_COUNT);
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

    // We need to manually propagate the origin tag
    OriginTag new_tag = OriginTag(get_origin_tag(), to_mul.get_origin_tag());
    for (auto& element : to_add) {
        new_tag = OriginTag(new_tag, element.get_origin_tag());
    }
    remainder.set_origin_tag(new_tag);
    quotient.set_origin_tag(new_tag);
    unsafe_evaluate_multiply_add(*this, to_mul, to_add, quotient, { remainder });

    return remainder;
}

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
    ASSERT(mul_left.size() == mul_right.size());
    ASSERT(to_add.size() <= MAXIMUM_SUMMAND_COUNT);
    ASSERT(mul_left.size() <= MAXIMUM_SUMMAND_COUNT);

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

        auto compare_update_tuples = [](std::tuple<uint1024_t, size_t, size_t>& left_element,
                                        std::tuple<uint1024_t, size_t, size_t>& right_element) {
            return std::get<0>(left_element) > std::get<0>(right_element);
        };

        // Now we loop through, reducing 1 element each time. This is costly in code, but allows us to use fewer
        // gates

        while (reduction_required) {
            // Compute the possible reduction updates
            compute_updates(maximum_value_updates, mul_left, mul_right, number_of_products);

            // Sort the vector, larger values first
            std::sort(maximum_value_updates.begin(), maximum_value_updates.end(), compare_update_tuples);

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

            for (size_t i = 0; i < number_of_products; i++) {
                max_values_left[i] = mul_left[i].get_maximum_value();
                max_values_right[i] = mul_right[i].get_maximum_value();
            }
            reduction_required = std::get<0>(
                get_quotient_reduction_info(max_values_left, max_values_right, to_add, { DEFAULT_MAXIMUM_REMAINDER }));
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
    ASSERT(mul_left.size() <= MAXIMUM_SUMMAND_COUNT);
    ASSERT(to_add.size() <= MAXIMUM_SUMMAND_COUNT);

    std::vector<bigfield> mutable_mul_left(mul_left);
    std::vector<bigfield> mutable_mul_right(mul_right);

    const size_t number_of_products = mul_left.size();

    const uint1024_t modulus(target_basis.modulus);
    uint1024_t worst_case_product_sum(0);
    uint1024_t add_right_constant_sum(0);

    // First we do all constant optimizations
    bool add_constant = true;
    std::vector<bigfield> new_to_add;

    OriginTag new_tag{};
    // Merge all tags. Do it in pairs (logically a submitted value can be masked by a challenge)
    for (auto [left_element, right_element] : zip_view(mul_left, mul_right)) {
        new_tag = OriginTag(new_tag, OriginTag(left_element.get_origin_tag(), right_element.get_origin_tag()));
    }
    for (auto& element : to_add) {
        new_tag = OriginTag(new_tag, element.get_origin_tag());
    }

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
            auto result = bigfield(ctx, uint256_t(remainder_1024.lo.lo));
            result.set_origin_tag(new_tag);
            return result;
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
            result.set_origin_tag(new_tag);
            return result;
        }
    }

    // Now that we know that there is at least 1 non-constant multiplication, we can start estimating reductions.
    ASSERT(ctx != nullptr);

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

    // We've collapsed all constants, checked if we can compute the sum of products in the worst case, time to check
    // if we need to reduce something
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
        // Ultra's bigfield custom gates
        remainder.convert_constant_to_fixed_witness(ctx);
    } else {
        remainder = create_from_u512_as_witness(ctx, remainder_value);
    }

    // We need to manually propagate the origin tag
    quotient.set_origin_tag(new_tag);
    remainder.set_origin_tag(new_tag);

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
    ASSERT(to_add.size() <= MAXIMUM_SUMMAND_COUNT);
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
    // Check the basics
    ASSERT(mul_left.size() == mul_right.size());
    ASSERT(divisor.get_value() != 0);

    OriginTag new_tag = divisor.get_origin_tag();
    for (auto [left_element, right_element] : zip_view(mul_left, mul_right)) {
        new_tag = OriginTag(new_tag, OriginTag(left_element.get_origin_tag(), right_element.get_origin_tag()));
    }
    for (auto& element : to_sub) {
        new_tag = OriginTag(new_tag, element.get_origin_tag());
    }
    // Gett he context
    Builder* ctx = divisor.context;
    if (ctx == NULL) {
        for (auto& el : mul_left) {
            if (el.context != NULL) {
                ctx = el.context;
                break;
            }
        }
    }
    if (ctx == NULL) {
        for (auto& el : mul_right) {
            if (el.context != NULL) {
                ctx = el.context;
                break;
            }
        }
    }
    if (ctx == NULL) {
        for (auto& el : to_sub) {
            if (el.context != NULL) {
                ctx = el.context;
                break;
            }
        }
    }
    const size_t num_multiplications = mul_left.size();
    native product_native = 0;
    bool products_constant = true;

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
        auto result = bigfield(ctx, uint256_t(result_value.lo.lo));
        result.set_origin_tag(new_tag);
        return result;
    }

    ASSERT(ctx != NULL);
    // Create the result witness
    bigfield result = create_from_u512_as_witness(ctx, result_value.lo);

    // We need to manually propagate the origin tag
    result.set_origin_tag(new_tag);

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
        auto result = *this;
        if (predicate.get_value()) {
            ASSERT(get_value() < modulus_u512);
            uint512_t out_val = (modulus_u512 - get_value()) % modulus_u512;
            result = bigfield(ctx, out_val.lo);
        }
        result.set_origin_tag(OriginTag(get_origin_tag(), predicate.get_origin_tag()));
        return result;
    }
    reduction_check();

    // We want to check:
    // predicate = 1 ==> (0 - *this)
    // predicate = 0 ==> *this
    //
    // We just use the conditional_assign method to do this as it costs the same number of gates as computing
    // p * (0 - *this) + (1 - p) * (*this)
    //
    bigfield<Builder, T> negative_this = zero() - *this;
    bigfield<Builder, T> result = bigfield<Builder, T>::conditional_assign(predicate, negative_this, *this);

    return result;
}

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

    // For each limb, we must select:
    // `this` is predicate == 0
    // `other` is predicate == 1
    //
    // The conditional assign in field works as follows: conditional_assign(predicate, lhs, rhs)
    // predicate == 0 ==> lhs
    // predicate == 1 ==> rhs
    //
    field_ct binary_limb_0 =
        field_ct::conditional_assign(predicate, other.binary_basis_limbs[0].element, binary_basis_limbs[0].element);
    field_ct binary_limb_1 =
        field_ct::conditional_assign(predicate, other.binary_basis_limbs[1].element, binary_basis_limbs[1].element);
    field_ct binary_limb_2 =
        field_ct::conditional_assign(predicate, other.binary_basis_limbs[2].element, binary_basis_limbs[2].element);
    field_ct binary_limb_3 =
        field_ct::conditional_assign(predicate, other.binary_basis_limbs[3].element, binary_basis_limbs[3].element);
    field_ct prime_limb = field_ct::conditional_assign(predicate, other.prime_basis_limb, prime_basis_limb);

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
    result.set_origin_tag(OriginTag(get_origin_tag(), other.get_origin_tag(), predicate.tag));
    return result;
}

/**
 * @brief Validate whether two bigfield elements are equal to each other
 * @details To evaluate whether `(a == b)`, we use result boolean `r` to evaluate the following logic:
 *          (n.b all algebra involving bigfield elements is done in the bigfield)
 *              1. If `r == 1` , `a - b == 0`
 *              2. If `r == 0`, `a - b` posesses an inverse `I` i.e. `(a - b) * I - 1 == 0`
 *          We efficiently evaluate this logic by evaluating a single expression `(a - b)*X = Y`
 *          We use conditional assignment logic to define `X, Y` to be the following:
 *              If `r == 1` then `X = 1, Y = 0`
 *              If `r == 0` then `X = I, Y = 1`
 *          This allows us to evaluate `operator==` using only 1 bigfield multiplication operation.
 *          We can check the product equals 0 or 1 by directly evaluating the binary basis/prime basis limbs of Y.
 *          i.e. if `r == 1` then `(a - b)*X` should have 0 for all limb values
 *               if `r == 0` then `(a - b)*X` should have 1 in the least significant binary basis limb and 0
 * elsewhere
 * @tparam Builder
 * @tparam T
 * @param other
 * @return bool_t<Builder>
 */
template <typename Builder, typename T> bool_t<Builder> bigfield<Builder, T>::operator==(const bigfield& other) const
{
    Builder* ctx = context ? context : other.get_context();
    auto lhs = get_value() % modulus_u512;
    auto rhs = other.get_value() % modulus_u512;
    bool is_equal_raw = (lhs == rhs);
    if (is_constant() && other.is_constant()) {
        return is_equal_raw;
    }

    // The context should not be null at this point.
    ASSERT(ctx != NULL);
    bool_t<Builder> is_equal = witness_t<Builder>(ctx, is_equal_raw);

    // We need to manually propagate the origin tag
    is_equal.set_origin_tag(OriginTag(get_origin_tag(), other.get_origin_tag()));

    bigfield diff = (*this) - other;
    native diff_native = native((diff.get_value() % modulus_u512).lo);
    native inverse_native = is_equal_raw ? 0 : diff_native.invert();

    bigfield inverse = bigfield::from_witness(ctx, inverse_native);

    // We need to manually propagate the origin tag
    inverse.set_origin_tag(OriginTag(get_origin_tag(), other.get_origin_tag()));

    bigfield multiplicand = bigfield::conditional_assign(is_equal, one(), inverse);

    bigfield product = diff * multiplicand;

    field_t result = field_t<Builder>::conditional_assign(is_equal, 0, 1);

    product.prime_basis_limb.assert_equal(result);
    product.binary_basis_limbs[0].element.assert_equal(result);
    product.binary_basis_limbs[1].element.assert_equal(0);
    product.binary_basis_limbs[2].element.assert_equal(0);
    product.binary_basis_limbs[3].element.assert_equal(0);
    is_equal.set_origin_tag(OriginTag(get_origin_tag(), other.get_origin_tag()));
    return is_equal;
}

template <typename Builder, typename T> void bigfield<Builder, T>::reduction_check() const
{
    if (is_constant()) {
        uint256_t reduced_value = (get_value() % modulus_u512).lo;
        bigfield reduced(context, uint256_t(reduced_value));
        // Save tags
        const auto origin_tags = std::vector({ binary_basis_limbs[0].element.get_origin_tag(),
                                               binary_basis_limbs[1].element.get_origin_tag(),
                                               binary_basis_limbs[2].element.get_origin_tag(),
                                               binary_basis_limbs[3].element.get_origin_tag(),
                                               prime_basis_limb.get_origin_tag() });

        // Directly assign to mutable members (avoiding assignment operator)
        binary_basis_limbs[0] = reduced.binary_basis_limbs[0];
        binary_basis_limbs[1] = reduced.binary_basis_limbs[1];
        binary_basis_limbs[2] = reduced.binary_basis_limbs[2];
        binary_basis_limbs[3] = reduced.binary_basis_limbs[3];
        prime_basis_limb = reduced.prime_basis_limb;

        // Preserve origin tags (useful in simulator)
        binary_basis_limbs[0].element.set_origin_tag(origin_tags[0]);
        binary_basis_limbs[1].element.set_origin_tag(origin_tags[1]);
        binary_basis_limbs[2].element.set_origin_tag(origin_tags[2]);
        binary_basis_limbs[3].element.set_origin_tag(origin_tags[3]);
        prime_basis_limb.set_origin_tag(origin_tags[4]);
        return;
    }

    uint256_t maximum_unreduced_limb_value = get_maximum_unreduced_limb_value();
    bool limb_overflow_test_0 = binary_basis_limbs[0].maximum_value > maximum_unreduced_limb_value;
    bool limb_overflow_test_1 = binary_basis_limbs[1].maximum_value > maximum_unreduced_limb_value;
    bool limb_overflow_test_2 = binary_basis_limbs[2].maximum_value > maximum_unreduced_limb_value;
    bool limb_overflow_test_3 = binary_basis_limbs[3].maximum_value > maximum_unreduced_limb_value;
    if (get_maximum_value() > get_maximum_unreduced_value() || limb_overflow_test_0 || limb_overflow_test_1 ||
        limb_overflow_test_2 || limb_overflow_test_3) {
        self_reduce();
    }
}

template <typename Builder, typename T> void bigfield<Builder, T>::sanity_check() const
{

    uint256_t prohibited_limb_value = get_prohibited_limb_value();
    bool limb_overflow_test_0 = binary_basis_limbs[0].maximum_value > prohibited_limb_value;
    bool limb_overflow_test_1 = binary_basis_limbs[1].maximum_value > prohibited_limb_value;
    bool limb_overflow_test_2 = binary_basis_limbs[2].maximum_value > prohibited_limb_value;
    bool limb_overflow_test_3 = binary_basis_limbs[3].maximum_value > prohibited_limb_value;
    // max_val < sqrt(2^T * n)
    // Note this is a static assertion, so it is not checked at runtime
    ASSERT(!(get_maximum_value() > get_prohibited_value() || limb_overflow_test_0 || limb_overflow_test_1 ||
             limb_overflow_test_2 || limb_overflow_test_3));
}

// Underneath performs assert_less_than(modulus)
// create a version with mod 2^t element part in [0,p-1]
// After reducing to size 2^s, we check (p-1)-a is non-negative as integer.
// We perform subtraction using carries on blocks of size 2^b. The operations inside the blocks are done mod r
// Including the effect of carries the operation inside each limb is in the range [-2^b-1,2^{b+1}]
// Assuming this values are all distinct mod r, which happens e.g. if r/2>2^{b+1}, then if all limb values are
// non-negative at the end of subtraction, we know the subtraction result is positive as integers and a<p
template <typename Builder, typename T> void bigfield<Builder, T>::assert_is_in_field() const
{
    assert_less_than(modulus);
}

template <typename Builder, typename T> void bigfield<Builder, T>::assert_less_than(const uint256_t upper_limit) const
{
    // Warning: this assumes we have run circuit construction at least once in debug mode where large non reduced
    // constants are NOT allowed via ASSERT
    if (is_constant()) {
        ASSERT(get_value() < static_cast<uint512_t>(upper_limit));
        return;
    }

    ASSERT(upper_limit != 0);
    // The circuit checks that limit - this >= 0, so if we are doing a less_than comparison, we need to subtract 1
    // from the limit
    uint256_t strict_upper_limit = upper_limit - uint256_t(1);
    self_reduce(); // this method in particular enforces limb vals are <2^b - needed for logic described above
    uint256_t value = get_value().lo;

    const uint256_t upper_limit_value_0 = strict_upper_limit.slice(0, NUM_LIMB_BITS);
    const uint256_t upper_limit_value_1 = strict_upper_limit.slice(NUM_LIMB_BITS, NUM_LIMB_BITS * 2);
    const uint256_t upper_limit_value_2 = strict_upper_limit.slice(NUM_LIMB_BITS * 2, NUM_LIMB_BITS * 3);
    const uint256_t upper_limit_value_3 = strict_upper_limit.slice(NUM_LIMB_BITS * 3, NUM_LIMB_BITS * 4);

    const uint256_t val_0 = value.slice(0, NUM_LIMB_BITS);
    const uint256_t val_1 = value.slice(NUM_LIMB_BITS, NUM_LIMB_BITS * 2);
    const uint256_t val_2 = value.slice(NUM_LIMB_BITS * 2, NUM_LIMB_BITS * 3);

    bool borrow_0_value = val_0 > upper_limit_value_0;
    bool borrow_1_value = (val_1 + uint256_t(borrow_0_value)) > (upper_limit_value_1);
    bool borrow_2_value = (val_2 + uint256_t(borrow_1_value)) > (upper_limit_value_2);

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
    context->decompose_into_default_range(r0.get_normalized_witness_index(), static_cast<size_t>(NUM_LIMB_BITS));
    context->decompose_into_default_range(r1.get_normalized_witness_index(), static_cast<size_t>(NUM_LIMB_BITS));
    context->decompose_into_default_range(r2.get_normalized_witness_index(), static_cast<size_t>(NUM_LIMB_BITS));
    context->decompose_into_default_range(r3.get_normalized_witness_index(), static_cast<size_t>(NUM_LIMB_BITS));
}

// check elements are equal mod p by proving their integer difference is a multiple of p.
// This relies on the minus operator for a-b increasing a by a multiple of p large enough so diff is non-negative
// When one of the elements is a constant and another is a witness we check equality of limbs, so if the witness
// bigfield element is in an unreduced form, it needs to be reduced first. We don't have automatice reduced form
// detection for now, so it is up to the circuit writer to detect this
template <typename Builder, typename T> void bigfield<Builder, T>::assert_equal(const bigfield& other) const
{
    Builder* ctx = this->context ? this->context : other.context;
    (void)OriginTag(get_origin_tag(), other.get_origin_tag());
    if (is_constant() && other.is_constant()) {
        std::cerr << "bigfield: calling assert equal on 2 CONSTANT bigfield elements...is this intended?" << std::endl;
        ASSERT(get_value() == other.get_value()); // We expect constants to be less than the target modulus
        return;
    } else if (other.is_constant()) {
        // NOTE(https://github.com/AztecProtocol/barretenberg/issues/998): This can lead to a situation where
        // an honest prover cannot satisfy the constraints, because `this` is not reduced, but `other` is, i.e.,
        // `this` = kp + r  and  `other` = r
        // where k is a positive integer. In such a case, the prover cannot satisfy the constraints
        // because the limb-differences would not be 0 mod r. Therefore, an honest prover needs to make sure that
        // `this` is reduced before calling this method. Also `other` should never be greater than the modulus by
        // design. As a precaution, we assert that the circuit-constant `other` is less than the modulus.
        ASSERT(other.get_value() < modulus_u512);
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
    } else {

        bigfield diff = *this - other;
        const uint512_t diff_val = diff.get_value();
        const uint512_t modulus(target_basis.modulus);

        const auto [quotient_512, remainder_512] = (diff_val).divmod(modulus);
        if (remainder_512 != 0) {
            std::cerr << "bigfield: remainder not zero!" << std::endl;
        }
        bigfield quotient;

        const size_t num_quotient_bits = get_quotient_max_bits({ 0 });
        quotient = bigfield(witness_t(ctx, fr(quotient_512.slice(0, NUM_LIMB_BITS * 2).lo)),
                            witness_t(ctx, fr(quotient_512.slice(NUM_LIMB_BITS * 2, NUM_LIMB_BITS * 4).lo)),
                            false,
                            num_quotient_bits);
        unsafe_evaluate_multiply_add(diff, { one() }, {}, quotient, { zero() });
    }
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
        while (target <= maximum_value) {
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
    OriginTag new_tag = get_origin_tag();
    const auto [quotient_value, remainder_value] = get_value().divmod(target_basis.modulus);

    bigfield quotient(context);

    uint512_t maximum_quotient_size = get_maximum_value() / target_basis.modulus;
    uint64_t maximum_quotient_bits = maximum_quotient_size.get_msb() + 1;
    if ((maximum_quotient_bits & 1ULL) == 1ULL) {
        ++maximum_quotient_bits;
    }

    ASSERT(maximum_quotient_bits <= NUM_LIMB_BITS);
    uint32_t quotient_limb_index = context->add_variable(bb::fr(quotient_value.lo));
    field_t<Builder> quotient_limb = field_t<Builder>::from_witness_index(context, quotient_limb_index);
    context->decompose_into_default_range(quotient_limb.get_normalized_witness_index(),
                                          static_cast<size_t>(maximum_quotient_bits));

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
    set_origin_tag(new_tag);
} // namespace stdlib

template <typename Builder, typename T>
void bigfield<Builder, T>::unsafe_evaluate_multiply_add(const bigfield& input_left,
                                                        const bigfield& input_to_mul,
                                                        const std::vector<bigfield>& to_add,
                                                        const bigfield& input_quotient,
                                                        const std::vector<bigfield>& input_remainders)
{

    ASSERT(to_add.size() <= MAXIMUM_SUMMAND_COUNT);
    ASSERT(input_remainders.size() <= MAXIMUM_SUMMAND_COUNT);
    // Sanity checks
    input_left.sanity_check();
    input_to_mul.sanity_check();
    input_quotient.sanity_check();
    for (auto& el : to_add) {
        el.sanity_check();
    }
    for (auto& el : input_remainders) {
        el.sanity_check();
    }

    std::vector<bigfield> remainders(input_remainders);

    bigfield left = input_left;
    bigfield to_mul = input_to_mul;
    bigfield quotient = input_quotient;

    Builder* ctx = left.context ? left.context : to_mul.context;

    // Compute the maximum value of the product of the two inputs: max(a * b)
    uint512_t max_ab_lo(0);
    uint512_t max_ab_hi(0);
    std::tie(max_ab_lo, max_ab_hi) = compute_partial_schoolbook_multiplication(left.get_binary_basis_limb_maximums(),
                                                                               to_mul.get_binary_basis_limb_maximums());

    // Compute the maximum value of the product of the quotient and neg_modulus: max(q * p')
    uint512_t max_q_neg_p_lo(0);
    uint512_t max_q_neg_p_hi(0);
    std::tie(max_q_neg_p_lo, max_q_neg_p_hi) =
        compute_partial_schoolbook_multiplication(neg_modulus_limbs_u256, quotient.get_binary_basis_limb_maximums());

    // Compute the maximum value that needs to be borrowed from the hi limbs to the lo limb.
    // Check the README for the explanation of the borrow.
    uint256_t max_remainders_lo(0);
    for (const auto& remainder : input_remainders) {
        max_remainders_lo += remainder.binary_basis_limbs[0].maximum_value +
                             (remainder.binary_basis_limbs[1].maximum_value << NUM_LIMB_BITS);
    }
    uint256_t borrow_lo_value = max_remainders_lo >> (2 * NUM_LIMB_BITS);
    field_t<Builder> borrow_lo(ctx, bb::fr(borrow_lo_value));

    uint512_t max_a0(0);
    uint512_t max_a1(0);
    for (size_t i = 0; i < to_add.size(); ++i) {
        max_a0 += to_add[i].binary_basis_limbs[0].maximum_value +
                  (to_add[i].binary_basis_limbs[1].maximum_value << NUM_LIMB_BITS);
        max_a1 += to_add[i].binary_basis_limbs[2].maximum_value +
                  (to_add[i].binary_basis_limbs[3].maximum_value << NUM_LIMB_BITS);
    }
    const uint512_t max_lo = max_ab_lo + max_q_neg_p_lo + max_remainders_lo + max_a0;
    const uint512_t max_lo_carry = max_lo >> (2 * NUM_LIMB_BITS);
    const uint512_t max_hi = max_ab_hi + max_q_neg_p_hi + max_a1 + max_lo_carry;

    uint64_t max_lo_bits = (max_lo.get_msb() + 1);
    uint64_t max_hi_bits = max_hi.get_msb() + 1;

    uint64_t carry_lo_msb = max_lo_bits - (2 * NUM_LIMB_BITS);
    uint64_t carry_hi_msb = max_hi_bits - (2 * NUM_LIMB_BITS);

    if (max_lo_bits < (2 * NUM_LIMB_BITS)) {
        carry_lo_msb = 0;
    }
    if (max_hi_bits < (2 * NUM_LIMB_BITS)) {
        carry_hi_msb = 0;
    }

    // The custom bigfield multiplication gate requires inputs are witnesses.
    // If we're using constant values, instantiate them as circuit variables
    //
    // Explanation:
    // The bigfield multiplication gate expects witnesses and disallows circuit constants
    // because allowing circuit constants would lead to complex circuit logic to support
    // different combinations of constant and witness inputs. Particularly, bigfield multiplication
    // gate enforces constraints of the form: a * b - q * p + r = 0, where:
    //
    // input left  a = (a3 || a2 || a1 || a0)
    // input right b = (b3 || b2 || b1 || b0)
    // quotient    q = (q3 || q2 || q1 || q0)
    // remainder   r = (r3 || r2 || r1 || r0)
    //
    // | a1 | b1 | r0 | lo_0 | <-- product gate 1: check lo_0
    // | a0 | b0 | a3 | b3   |
    // | a2 | b2 | r3 | hi_0 |
    // | a1 | b1 | r2 | hi_1 |
    //
    // Example constaint: lo_0 = (a1 * b0 + a0 * b1) * 2^b   + (a0 * b0)   - r0
    //                 ==>  w4 = (w1 * w'2 + w'1 * w2) * 2^b + (w'1 * w'2) - w3
    //
    // If a, b both are witnesses, this special gate performs 3 field multiplications per gate.
    // If b was a constant, then we would need to no field multiplications, but instead update the
    // the limbs of a with multiplicative and additive constants. This just makes the circuit logic
    // more complex, so we disallow constants. If there are constants, we convert them to fixed witnesses (at the
    // expense of 1 extra gate per constant).
    //
    const auto convert_constant_to_fixed_witness = [ctx](const bigfield& input) {
        bigfield output(input);
        output.prime_basis_limb =
            field_t<Builder>::from_witness_index(ctx, ctx->put_constant_variable(input.prime_basis_limb.get_value()));
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

    bb::non_native_multiplication_witnesses<bb::fr> witnesses{
        left.get_binary_basis_limb_witness_indices(),
        to_mul.get_binary_basis_limb_witness_indices(),
        quotient.get_binary_basis_limb_witness_indices(),
        {
            remainder_limbs[0].get_normalized_witness_index(),
            remainder_limbs[1].get_normalized_witness_index(),
            remainder_limbs[2].get_normalized_witness_index(),
            remainder_limbs[3].get_normalized_witness_index(),
        },
        { neg_modulus_limbs[0], neg_modulus_limbs[1], neg_modulus_limbs[2], neg_modulus_limbs[3] },
    };

    // N.B. this method DOES NOT evaluate the prime field component of the non-native field mul
    const auto [lo_idx, hi_idx] = ctx->evaluate_non_native_field_multiplication(witnesses);

    bb::fr neg_prime = -bb::fr(uint256_t(target_basis.modulus));
    field_t<Builder>::evaluate_polynomial_identity(
        left.prime_basis_limb, to_mul.prime_basis_limb, quotient.prime_basis_limb * neg_prime, -remainder_prime_limb);

    field_t lo = field_t<Builder>::from_witness_index(ctx, lo_idx) + borrow_lo;
    field_t hi = field_t<Builder>::from_witness_index(ctx, hi_idx);

    // if both the hi and lo output limbs have less than 70 bits, we can use our custom
    // limb accumulation gate (accumulates 2 field elements, each composed of 5 14-bit limbs, in 3 gates)
    if (carry_lo_msb <= 70 && carry_hi_msb <= 70) {
        ctx->range_constrain_two_limbs(hi.get_normalized_witness_index(),
                                       lo.get_normalized_witness_index(),
                                       size_t(carry_hi_msb),
                                       size_t(carry_lo_msb));
    } else {
        ctx->decompose_into_default_range(hi.get_normalized_witness_index(), carry_hi_msb);
        ctx->decompose_into_default_range(lo.get_normalized_witness_index(), carry_lo_msb);
    }
}

template <typename Builder, typename T>
void bigfield<Builder, T>::unsafe_evaluate_multiple_multiply_add(const std::vector<bigfield>& input_left,
                                                                 const std::vector<bigfield>& input_right,
                                                                 const std::vector<bigfield>& to_add,
                                                                 const bigfield& input_quotient,
                                                                 const std::vector<bigfield>& input_remainders)
{
    ASSERT(input_left.size() == input_right.size());
    ASSERT(input_left.size() <= MAXIMUM_SUMMAND_COUNT);
    ASSERT(to_add.size() <= MAXIMUM_SUMMAND_COUNT);
    ASSERT(input_remainders.size() <= MAXIMUM_SUMMAND_COUNT);

    ASSERT(input_left.size() == input_right.size() && input_left.size() < 1024);
    // Sanity checks
    bool is_left_constant = true;
    for (auto& el : input_left) {
        el.sanity_check();
        is_left_constant &= el.is_constant();
    }
    bool is_right_constant = true;
    for (auto& el : input_right) {
        el.sanity_check();
        is_right_constant &= el.is_constant();
    }
    for (auto& el : to_add) {
        el.sanity_check();
    }
    input_quotient.sanity_check();
    for (auto& el : input_remainders) {
        el.sanity_check();
    }

    // We must have at least one left or right multiplicand as witnesses.
    ASSERT(!is_left_constant || !is_right_constant);

    std::vector<bigfield> remainders(input_remainders);
    std::vector<bigfield> left(input_left);
    std::vector<bigfield> right(input_right);
    bigfield quotient = input_quotient;
    const size_t num_multiplications = input_left.size();

    // Fetch the context
    Builder* ctx = nullptr;
    for (const auto& el : input_left) {
        if (el.context) {
            ctx = el.context;
            break;
        }
    }
    if (ctx == nullptr) {
        for (const auto& el : input_right) {
            if (el.context) {
                ctx = el.context;
                break;
            }
        }
    }
    ASSERT(ctx != nullptr);

    /**
     * Step 1: Compute the maximum potential value of our product limbs
     *
     * max_lo = maximum value of limb products that span the range 0 - 2^{3t}
     * max_hi = maximum value of limb products that span the range 2^{2t} - 2^{5t}
     * (t = NUM_LIMB_BITS)
     **/
    uint512_t max_lo = 0;
    uint512_t max_hi = 0;

    // Compute the maximum value that needs to be borrowed from the hi limbs to the lo limb.
    // Check the README for the explanation of the borrow.
    uint256_t max_remainders_lo(0);
    for (const auto& remainder : input_remainders) {
        max_remainders_lo += remainder.binary_basis_limbs[0].maximum_value +
                             (remainder.binary_basis_limbs[1].maximum_value << NUM_LIMB_BITS);
    }
    uint256_t borrow_lo_value = max_remainders_lo >> (2 * NUM_LIMB_BITS);
    field_t<Builder> borrow_lo(ctx, bb::fr(borrow_lo_value));

    // Compute the maximum value of the quotient times modulus.
    const auto [max_q_neg_p_lo, max_q_neg_p_hi] =
        compute_partial_schoolbook_multiplication(neg_modulus_limbs_u256, quotient.get_binary_basis_limb_maximums());

    // update max_lo, max_hi with quotient limb product terms.
    max_lo += max_q_neg_p_lo + max_remainders_lo;
    max_hi += max_q_neg_p_hi;

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
        const auto [product_lo, product_hi] = compute_partial_schoolbook_multiplication(
            left[i].get_binary_basis_limb_maximums(), right[i].get_binary_basis_limb_maximums());
        max_lo += product_lo;
        max_hi += product_hi;
    }

    const uint512_t max_lo_carry = max_lo >> (2 * NUM_LIMB_BITS);
    max_hi += max_lo_carry;
    // Compute the maximum number of bits in `max_lo` and `max_hi` - this defines the range constraint values we
    // will need to apply to validate our product
    uint64_t max_lo_bits = (max_lo.get_msb() + 1);
    uint64_t max_hi_bits = max_hi.get_msb() + 1;

    // The custom bigfield multiplication gate requires inputs are witnesses.
    // If we're using constant values, instantiate them as circuit variables
    //
    // Explanation:
    // The bigfield multiplication gate expects witnesses and disallows circuit constants
    // because allowing circuit constants would lead to complex circuit logic to support
    // different combinations of constant and witness inputs. Particularly, bigfield multiplication
    // gate enforces constraints of the form: a * b - q * p + r = 0, where:
    //
    // input left  a = (a3 || a2 || a1 || a0)
    // input right b = (b3 || b2 || b1 || b0)
    // quotient    q = (q3 || q2 || q1 || q0)
    // remainder   r = (r3 || r2 || r1 || r0)
    //
    // | a1 | b1 | r0 | lo_0 | <-- product gate 1: check lo_0
    // | a0 | b0 | a3 | b3   |
    // | a2 | b2 | r3 | hi_0 |
    // | a1 | b1 | r2 | hi_1 |
    //
    // Example constaint: lo_0 = (a1 * b0 + a0 * b1) * 2^b   + (a0 * b0)   - r0
    //                 ==>  w4 = (w1 * w'2 + w'1 * w2) * 2^b + (w'1 * w'2) - w3
    //
    // If a, b both are witnesses, this special gate performs 3 field multiplications per gate.
    // If b was a constant, then we would need to no field multiplications, but instead update the
    // the limbs of a with multiplicative and additive constants. This just makes the circuit logic
    // more complex, so we disallow constants. If there are constants, we convert them to fixed witnesses (at the
    // expense of 1 extra gate per constant).
    //
    const auto convert_constant_to_fixed_witness = [ctx](const bigfield& input) {
        ASSERT(input.is_constant());
        bigfield output(input);
        output.prime_basis_limb =
            field_t<Builder>::from_witness_index(ctx, ctx->put_constant_variable(input.prime_basis_limb.get_value()));
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
        if (left[i].is_constant()) {
            left[i] = convert_constant_to_fixed_witness(left[i]);
        }
        if (right[i].is_constant()) {
            right[i] = convert_constant_to_fixed_witness(right[i]);
        }

        if (i > 0) {
            bb::non_native_partial_multiplication_witnesses<bb::fr> mul_witnesses = {
                left[i].get_binary_basis_limb_witness_indices(),
                right[i].get_binary_basis_limb_witness_indices(),
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

    bb::non_native_multiplication_witnesses<bb::fr> witnesses{
        left[0].get_binary_basis_limb_witness_indices(),
        right[0].get_binary_basis_limb_witness_indices(),
        quotient.get_binary_basis_limb_witness_indices(),
        {
            remainder_limbs[0].get_normalized_witness_index(),
            remainder_limbs[1].get_normalized_witness_index(),
            remainder_limbs[2].get_normalized_witness_index(),
            remainder_limbs[3].get_normalized_witness_index(),
        },
        { neg_modulus_limbs[0], neg_modulus_limbs[1], neg_modulus_limbs[2], neg_modulus_limbs[3] },
    };

    const auto [lo_1_idx, hi_1_idx] = ctx->evaluate_non_native_field_multiplication(witnesses);

    bb::fr neg_prime = -bb::fr(uint256_t(target_basis.modulus));

    field_t<Builder>::evaluate_polynomial_identity(left[0].prime_basis_limb,
                                                   right[0].prime_basis_limb,
                                                   quotient.prime_basis_limb * neg_prime,
                                                   -remainder_prime_limb);

    field_t lo = field_t<Builder>::from_witness_index(ctx, lo_1_idx) + borrow_lo;
    field_t hi = field_t<Builder>::from_witness_index(ctx, hi_1_idx);

    uint64_t carry_lo_msb = max_lo_bits - (2 * NUM_LIMB_BITS);
    uint64_t carry_hi_msb = max_hi_bits - (2 * NUM_LIMB_BITS);

    if (max_lo_bits < (2 * NUM_LIMB_BITS)) {
        carry_lo_msb = 0;
    }
    if (max_hi_bits < (2 * NUM_LIMB_BITS)) {
        carry_hi_msb = 0;
    }

    // if both the hi and lo output limbs have less than 70 bits, we can use our custom
    // limb accumulation gate (accumulates 2 field elements, each composed of 5 14-bit limbs, in 3 gates)
    if (carry_lo_msb <= 70 && carry_hi_msb <= 70) {
        ctx->range_constrain_two_limbs(hi.get_normalized_witness_index(),
                                       lo.get_normalized_witness_index(),
                                       (size_t)carry_hi_msb,
                                       (size_t)carry_lo_msb);
    } else {
        ctx->decompose_into_default_range(hi.get_normalized_witness_index(), carry_hi_msb);
        ctx->decompose_into_default_range(lo.get_normalized_witness_index(), carry_lo_msb);
    }
}

template <typename Builder, typename T>
void bigfield<Builder, T>::unsafe_evaluate_square_add(const bigfield& left,
                                                      const std::vector<bigfield>& to_add,
                                                      const bigfield& quotient,
                                                      const bigfield& remainder)
{
    ASSERT(to_add.size() <= MAXIMUM_SUMMAND_COUNT);

    // Suppose input is:
    // x = (x3 || x2 || x1 || x0)
    //
    // x * x = (x0 * x0) +
    //         (2 • x0 * x1) • 2^b +
    //         (2 • x0 * x2 + x1 * x1) • 2^{2b} +
    //         (2 • x0 * x3 + 2 • x1 * x2) • 2^{3b}.
    //
    // We need 6 multiplications to compute the above, which can be computed using two custom multiplication gates.
    // Since each custom bigfield gate can compute 3, we can compute the above using 2 custom multiplication gates
    // (as against 3 gates if we used the current bigfield multiplication gate).
    // We however avoid this optimization for now and end up using the existing bigfield multiplication gate.
    //
    unsafe_evaluate_multiply_add(left, left, to_add, quotient, { remainder });
}

template <typename Builder, typename T>
std::pair<uint512_t, uint512_t> bigfield<Builder, T>::compute_quotient_remainder_values(
    const bigfield& a, const bigfield& b, const std::vector<bigfield>& to_add)
{
    ASSERT(to_add.size() <= MAXIMUM_SUMMAND_COUNT);

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
    ASSERT(to_add.size() <= MAXIMUM_SUMMAND_COUNT);

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

    ASSERT(to_add.size() <= MAXIMUM_SUMMAND_COUNT);
    ASSERT(as_max.size() <= MAXIMUM_SUMMAND_COUNT);
    ASSERT(remainders_max.size() <= MAXIMUM_SUMMAND_COUNT);

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

template <typename Builder, typename T>
std::pair<uint512_t, uint512_t> bigfield<Builder, T>::compute_partial_schoolbook_multiplication(
    const std::array<uint256_t, NUM_LIMBS>& a_limbs, const std::array<uint256_t, NUM_LIMBS>& b_limbs)
{
    const uint512_t b0_inner = (a_limbs[1] * b_limbs[0]);
    const uint512_t b1_inner = (a_limbs[0] * b_limbs[1]);
    const uint512_t c0_inner = (a_limbs[1] * b_limbs[1]);
    const uint512_t c1_inner = (a_limbs[2] * b_limbs[0]);
    const uint512_t c2_inner = (a_limbs[0] * b_limbs[2]);
    const uint512_t d0_inner = (a_limbs[3] * b_limbs[0]);
    const uint512_t d1_inner = (a_limbs[2] * b_limbs[1]);
    const uint512_t d2_inner = (a_limbs[1] * b_limbs[2]);
    const uint512_t d3_inner = (a_limbs[0] * b_limbs[3]);

    const uint512_t r0_inner = (a_limbs[0] * b_limbs[0]);                 // c0 := a0 * b0
    const uint512_t r1_inner = b0_inner + b1_inner;                       // c1 := a1 * b0 + a0 * b1
    const uint512_t r2_inner = c0_inner + c1_inner + c2_inner;            // c2 := a2 * b0 + a1 * b1 + a0 * b2
    const uint512_t r3_inner = d0_inner + d1_inner + d2_inner + d3_inner; // c3 := a3 * b0 + a2 * b1 + a1 * b2 + a0 * b3
    const uint512_t lo_val = r0_inner + (r1_inner << NUM_LIMB_BITS);      // lo := c0 + c1 * 2^b
    const uint512_t hi_val = r2_inner + (r3_inner << NUM_LIMB_BITS);      // hi := c2 + c3 * 2^b
    return std::pair<uint512_t, uint512_t>(lo_val, hi_val);
}

} // namespace bb::stdlib
