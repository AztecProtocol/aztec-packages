// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "byte_array.hpp"

#include <bitset>

#include "../circuit_builders/circuit_builders.hpp"

using namespace bb;

namespace bb::stdlib {

// ULTRA: Further merging with

template <typename Builder>
byte_array<Builder>::byte_array(Builder* parent_context)
    : context(parent_context)
{}

template <typename Builder>
byte_array<Builder>::byte_array(Builder* parent_context, const size_t n)
    : context(parent_context)
    , values(std::vector<field_t<Builder>>(n))
{}

template <typename Builder>
byte_array<Builder>::byte_array(Builder* parent_context, const std::string& input)
    : byte_array(parent_context, std::vector<uint8_t>(input.begin(), input.end()))
{}

/**
 * @brief Create a byte array out of a vector of uint8_t bytes.
 *
 * @warning This constructor will instantiate each byte as a circuit witness, NOT a circuit constant.
 * Do not use this method if the input needs to be hardcoded for a specific circuit
 **/
template <typename Builder>
byte_array<Builder>::byte_array(Builder* parent_context, std::vector<uint8_t> const& input)
    : context(parent_context)
    , values(input.size())
{
    for (size_t i = 0; i < input.size(); ++i) {
        uint8_t c = input[i];
        field_t<Builder> value(witness_t(context, (uint64_t)c));
        value.create_range_constraint(8, "byte_array: vector entry larger than 1 byte.");
        values[i] = value;
    }
    set_free_witness_tag();
}

/**
 * @brief Create a byte_array out of a field element.
 *
 * @details The length of the byte array will default to 32 bytes, but shorter lengths can be specified.
 * If a shorter length is used, the circuit will NOT truncate the input to fit the reduced length.
 * Instead, the circuit adds constraints that VALIDATE the input is smaller than the specified length
 *
 * e.g. if this constructor is used on a 16-bit input witness, where `num_bytes` is 1, the resulting proof will fail.
 *
 *
 * # Description of circuit
 *
 * Our field element is `input`. Say the byte vector provided by the prover consists of bits b0,...,b255. These bits
 * are used to construct the corresponding uint256_t validator := \sum_{i=0}^{8num_bytes-1} 2^{i}b_{i}, and `validator`
 * is copy constrained to be equal to `input`. However, more constraints are needed in general.
 *
 * Let r = bb::fr::modulus. For later applications, we want to ensure that the prover must pass the bit
 * decomposition of the standard representative of the mod r residue class containing `input`, which is to say that we
 * want to show `validator` lies in [0, ..., r-1]. By the formula for `validator`, we do not have to worry about it
 * wrapping the modulus if num_bytes < 32 or, in the default case, if the `input` fits into 31 bytes.
 *
 * Suppose now that num_bytes is 32. We would like to show that r - validator lies > 0 as integers, but this
 * cannot be done inside of uint256_t since `validator` can be any uint256_t, hence its negative is not constrained to
 * lie in any proper subset. We therefore split it and `r-1` into two smaller limbs and make comparisons using range
 * constraints in uint256_t (shifting r to turn a `>` into a `>=`).
 *
 * By the construction of `validator`, it is easy to extract its top 16 bytes shifted_high_limb = 2^{128}v_hi, so that
 * one gets a decomposition by computing v_lo := validator - 2^{128}v_hi.  We separate the problem of imposing that
 * validator <= r - 1 into two cases.
 *
 *      Case 0: When s_lo < v_lo, we must impose that v_hi < s_hi, i.e., s_hi - v_hi - 1 >= 0.
 *      Case 1:           >=                               =<            s_hi - v_hi     >= 0.
 *
 * To unify these cases, we need a predicate that distinguishes them, and we need to use this to effect a shift of 1 or
 * 0 in v_hi, as the case may be. We build this now. Consider the expression s_lo - v_lo. As an integer, this lies in
 * [-2^128+1, 2^128-1], with Case 0 corresponding to the numbers < 0. Shifting to
 *      y_lo :=  s_lo - v_lo + 2^128,
 * Case 0 corresponds to the range [1, 2^128-1]. We see that the 129th bit of y_lo exactly indicates the case.
 * Extracting this (and the 130th bit, which is always 0, for convenience) and adding it to v_hi, we have a uniform
 * constraint to apply. Namely, setting
 *      y_overlap := 1 - (top quad of y_lo regarded as a 130-bit integer)
 * and
 *      y_hi := s_hi - v_hi - y_overlap,
 * range constrianing y_hi to 128 bits imposes validator < r.
 */
template <typename Builder> byte_array<Builder>::byte_array(const field_t<Builder>& input, const size_t num_bytes)
{
    ASSERT(num_bytes <= 32);
    uint256_t value = input.get_value();
    values.resize(num_bytes);
    context = input.get_context();
    if (input.is_constant()) {
        for (size_t i = 0; i < num_bytes; ++i) {
            values[i] = bb::fr(value.slice((num_bytes - i - 1) * 8, (num_bytes - i) * 8));
        }
    } else {
        constexpr bb::fr byte_shift(256);
        field_t<Builder> validator(context, 0);

        field_t<Builder> shifted_high_limb(context, 0); // will be set to 2^128v_hi if `i` reaches 15.
        for (size_t i = 0; i < num_bytes; ++i) {
            bb::fr byte_val = value.slice((num_bytes - i - 1) * 8, (num_bytes - i) * 8);
            field_t<Builder> byte = witness_t(context, byte_val);
            byte.create_range_constraint(8, "byte_array: byte extraction failed.");
            bb::fr scaling_factor_value = byte_shift.pow(static_cast<uint64_t>(num_bytes - 1 - i));
            field_t<Builder> scaling_factor(context, scaling_factor_value);
            // TODO(https://github.com/AztecProtocol/barretenberg/issues/1082): Addition could be optimized
            validator = validator + (scaling_factor * byte);
            values[i] = byte;
            if (i == 15) {
                shifted_high_limb = field_t<Builder>(validator);
            }
        }
        validator.assert_equal(input);

        // constrain validator to be < r
        if (num_bytes == 32) {
            constexpr uint256_t modulus_minus_one = fr::modulus - 1;
            const fr s_lo = modulus_minus_one.slice(0, 128);
            const fr s_hi = modulus_minus_one.slice(128, 256);
            const fr shift = fr(uint256_t(1) << 128);
            field_t<Builder> y_lo = (-validator) + (s_lo + shift);

            field_t<Builder> y_overlap;
            if constexpr (HasPlookup<Builder>) {
                // carve out the 2 high bits from (y_lo + shifted_high_limb) and instantiate as y_overlap
                const uint256_t y_lo_value = y_lo.get_value() + shifted_high_limb.get_value();
                const uint256_t y_overlap_value = y_lo_value >> 128;
                y_overlap = witness_t<Builder>(context, y_overlap_value);
                y_overlap.create_range_constraint(2, "byte_array: y_overlap is not a quad");
                field_t<Builder> y_remainder =
                    y_lo.add_two(shifted_high_limb, -(y_overlap * field_t<Builder>(uint256_t(1ULL) << 128)));
                y_remainder.create_range_constraint(128, "byte_array: y_remainder doesn't fit in 128 bits.");
                y_overlap = -(y_overlap - 1);
            } else {
                // defining input_lo = validator - shifted_high_limb, we're checking s_lo + shift - input_lo is
                // non-negative.
                y_lo += shifted_high_limb;
                // The range constraint imposed here already holds implicitly. We only do this to get the top quad.
                const auto low_accumulators = context->decompose_into_base4_accumulators(
                    y_lo.normalize().witness_index, 130, "byte_array: normalized y_lo too large.");
                y_overlap = -(field_t<Builder>::from_witness_index(context, low_accumulators[0]) - 1);
            }
            // define input_hi = shifted_high_limb/shift. We know input_hi is max 128 bits, and we're checking
            // s_hi - (input_hi + borrow) is non-negative
            field_t<Builder> y_hi = -(shifted_high_limb / shift) + (s_hi);
            y_hi -= y_overlap;
            y_hi.create_range_constraint(128, "byte_array: y_hi doesn't fit in 128 bits.");
        }
    }
    set_origin_tag(input.tag);
}

template <typename Builder>
byte_array<Builder>::byte_array(const safe_uint_t<Builder>& input, const size_t num_bytes)
    : byte_array(input.value, num_bytes)
{
    set_origin_tag(input.get_origin_tag());
}

template <typename Builder>
byte_array<Builder>::byte_array(Builder* parent_context, bytes_t const& input)
    : context(parent_context)
    , values(input)
{}

template <typename Builder>
byte_array<Builder>::byte_array(Builder* parent_context, bytes_t&& input)
    : context(parent_context)
    , values(input)
{}

template <typename Builder> byte_array<Builder>::byte_array(const byte_array& other)
{
    context = other.context;
    std::copy(other.values.begin(), other.values.end(), std::back_inserter(values));
}

template <typename Builder> byte_array<Builder>::byte_array(byte_array&& other)
{
    context = other.context;
    values = std::move(other.values);
}

template <typename Builder> byte_array<Builder>& byte_array<Builder>::operator=(const byte_array& other)
{
    context = other.context;
    values = std::vector<field_t<Builder>>();
    std::copy(other.values.begin(), other.values.end(), std::back_inserter(values));
    return *this;
}

template <typename Builder> byte_array<Builder>& byte_array<Builder>::operator=(byte_array&& other)
{
    context = other.context;
    values = std::move(other.values);
    return *this;
}

/**
 * @brief Convert a byte array into a field element.
 *
 * @details The byte array is represented as a big integer, that is then converted into a field element.
 * The transformation is only injective if the byte array is < 32 bytes.
 * Larger byte arrays can still be cast to a single field element, but the value will wrap around the circuit
 *modulus
 **/
template <typename Builder> byte_array<Builder>::operator field_t<Builder>() const
{
    const size_t bytes = values.size();
    bb::fr shift(256);
    field_t<Builder> result(context, bb::fr(0));
    for (size_t i = 0; i < values.size(); ++i) {
        field_t<Builder> temp(values[i]);
        bb::fr scaling_factor_value = shift.pow(static_cast<uint64_t>(bytes - 1 - i));
        field_t<Builder> scaling_factor(values[i].context, scaling_factor_value);
        result = result + (scaling_factor * temp);
    }
    result.set_origin_tag(get_origin_tag());
    return result.normalize();
}

template <typename Builder> byte_array<Builder>& byte_array<Builder>::write(byte_array const& other)
{
    values.insert(values.end(), other.bytes().begin(), other.bytes().end());
    return *this;
}

template <typename Builder> byte_array<Builder>& byte_array<Builder>::write_at(byte_array const& other, size_t index)
{
    ASSERT(index + other.values.size() <= values.size());
    for (size_t i = 0; i < other.values.size(); i++) {
        values[i + index] = other.values[i];
    }
    return *this;
}

template <typename Builder> byte_array<Builder> byte_array<Builder>::slice(size_t offset) const
{
    ASSERT(offset < values.size());
    return byte_array(context, bytes_t(values.begin() + (long)(offset), values.end()));
}

/**
 * @brief Slice `length` bytes from the byte array, starting at `offset`. Does not add any constraints
 * @details Note that the syntax here differs for the syntax used for slicing uint256_t's.
 **/
template <typename Builder> byte_array<Builder> byte_array<Builder>::slice(size_t offset, size_t length) const
{
    ASSERT(offset < values.size());
    // it's <= cause vector constructor doesn't include end point
    ASSERT(length <= values.size() - offset);
    auto start = values.begin() + (long)(offset);
    auto end = values.begin() + (long)((offset + length));
    return byte_array(context, bytes_t(start, end));
}

/**
 * @brief Reverse the bytes in the byte array
 **/
template <typename Builder> byte_array<Builder> byte_array<Builder>::reverse() const
{
    bytes_t bytes(values.size());
    size_t offset = bytes.size() - 1;
    for (size_t i = 0; i < bytes.size(); i += 1, offset -= 1) {
        bytes[offset] = values[i];
    }
    return byte_array(context, bytes);
}

template <typename Builder> std::vector<uint8_t> byte_array<Builder>::get_value() const
{
    size_t length = values.size();
    size_t num = (length);
    std::vector<uint8_t> bytes(num, 0);
    for (size_t i = 0; i < length; ++i) {
        bytes[i] = static_cast<uint8_t>(uint256_t(values[i].get_value()).data[0]);
    }
    return bytes;
}

template <typename Builder> std::string byte_array<Builder>::get_string() const
{
    auto v = get_value();
    return std::string(v.begin(), v.end());
}

/**
 * @brief Extract a bit from the byte array.
 *
 * @details get_bit treats the array as a little-endian integer
 * e.g. get_bit(1) corresponds to the second bit in the last, 'least significant' byte in the array.
 *
 **/
template <typename Builder> bool_t<Builder> byte_array<Builder>::get_bit(size_t index_reversed) const
{
    const size_t index = (values.size() * 8) - index_reversed - 1;
    const auto slice = split_byte(index);

    return slice.bit;
}

/**
 * @brief Set a bit in the byte array
 *
 * @details set_bit treats the array as a little-endian integer
 * e.g. set_bit(0) will set the first bit in the last, 'least significant' byte in the array
 *
 * For example, if we have a 64-byte array filled with zeroes, `set_bit(0, true)` will set `values[63]` to 1,
 *              and set_bit(511, true) will set `values[0]` to 128
 *
 * Previously we did not reverse the bit index, but we have modified the behavior to be consistent with `get_bit`
 *
 * The rationale behind reversing the bit index is so that we can more naturally contain integers inside byte arrays
 *and perform bit manipulation
 **/
template <typename Builder> void byte_array<Builder>::set_bit(size_t index_reversed, bool_t<Builder> const& new_bit)
{
    const size_t index = (values.size() * 8) - index_reversed - 1;
    const auto slice = split_byte(index);
    const size_t byte_index = index / 8UL;
    const size_t bit_index = 7UL - (index % 8UL);

    field_t<Builder> scaled_new_bit = field_t<Builder>(new_bit) * bb::fr(uint256_t(1) << bit_index);
    scaled_new_bit.set_origin_tag(new_bit.get_origin_tag());
    const auto new_value = slice.low.add_two(slice.high, scaled_new_bit).normalize();
    values[byte_index] = new_value;
}

/**
 * @brief Split a byte at the target bit index, return [low slice, high slice, isolated bit]
 *
 * @details This is a private method used by `get_bit` and `set_bit`
 **/
template <typename Builder>
typename byte_array<Builder>::byte_slice byte_array<Builder>::split_byte(const size_t index) const
{
    const size_t byte_index = index / 8UL;
    const auto byte = values[byte_index];
    const size_t bit_index = 7UL - (index % 8UL);

    const uint64_t value = uint256_t(byte.get_value()).data[0];
    const uint64_t bit_value = (value >> static_cast<uint64_t>(bit_index)) & 1ULL;

    const uint64_t num_low_bits = static_cast<uint64_t>(bit_index);
    const uint64_t num_high_bits = 7ULL - num_low_bits;
    const uint64_t low_value = value & ((1ULL << num_low_bits) - 1ULL);
    const uint64_t high_value = (bit_index == 7) ? 0ULL : (value >> (8 - num_high_bits));

    if (byte.is_constant()) {
        field_t<Builder> low(context, low_value);
        field_t<Builder> shifted_high(context, high_value * (uint64_t(1) << (8ULL - num_high_bits)));
        bool_t<Builder> bit(context, static_cast<bool>(bit_value));
        auto tag = values[byte_index].get_origin_tag();
        low.set_origin_tag(tag);
        shifted_high.set_origin_tag(tag);
        bit.set_origin_tag(tag);
        return { low, shifted_high, bit };
    }
    field_t<Builder> low = witness_t<Builder>(context, low_value);
    field_t<Builder> high = witness_t<Builder>(context, high_value);
    bool_t<Builder> bit = witness_t<Builder>(context, static_cast<bool>(bit_value));

    low.set_origin_tag(values[byte_index].get_origin_tag());
    high.set_origin_tag(values[byte_index].get_origin_tag());
    bit.set_origin_tag(values[byte_index].get_origin_tag());

    if (num_low_bits > 0) {
        low.create_range_constraint(static_cast<size_t>(num_low_bits), "byte_array: low bits split off incorrectly.");
    } else {
        low.assert_equal(0);
    }

    if (num_high_bits > 0) {
        high.create_range_constraint(static_cast<size_t>(num_high_bits),
                                     "byte_array: high bits split off incorrectly.");
    } else {
        high.assert_equal(0);
    }

    field_t<Builder> scaled_high = high * bb::fr(uint256_t(1) << (8ULL - num_high_bits));
    field_t<Builder> scaled_bit = field_t<Builder>(bit) * bb::fr(uint256_t(1) << bit_index);
    field_t<Builder> result = low.add_two(scaled_high, scaled_bit);
    result.assert_equal(byte);

    auto tag = values[byte_index].get_origin_tag();
    low.set_origin_tag(tag);
    scaled_high.set_origin_tag(tag);
    bit.set_origin_tag(tag);

    return { low, scaled_high, bit };
}

template class byte_array<bb::UltraCircuitBuilder>;
template class byte_array<bb::MegaCircuitBuilder>;

} // namespace bb::stdlib
