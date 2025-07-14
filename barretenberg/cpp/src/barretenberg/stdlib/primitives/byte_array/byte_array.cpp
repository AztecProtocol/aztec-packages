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
 * @brief Create a byte_array of length `num_bits` out of a field element.
 *
 * @details The length of the byte array will default to 32 bytes, but shorter lengths can be specified.
 * If a shorter length is used, the circuit will NOT truncate the input to fit the reduced length.
 * Instead, the circuit adds constraints that VALIDATE the input is smaller than the specified length
 * e.g. if this constructor is used on a 16-bit input witness, where `num_bytes` is 1, the resulting proof will fail.
 *
 *
 * # Description of circuit
 *
 * Our field element is `input`. Say the byte vector provided by the prover consists of bits b0,...,b255. These bits
 * are used to construct the corresponding `reconstructed`value
 *      `reconstructed` = `reconstructed_lo` + `reconstructed_hi`:= \sum_{i=0}^{8num_bytes-1} 2^{i}b_{i},
 * where `reconstructed_lo` is a field element representing the low 16 bytes of `input`, and `reconstructed_hi` is the
 * high 16-bit limb shifted by 2^128.
 * `reconstructed` is copy constrained to be equal to `input`. However, more constraints are needed
 * in general.
 *
 * Let r = bb::fr::modulus. For later applications, we want to ensure that the prover must pass the bit
 * decomposition of the standard representative of the mod r residue class containing `input`, which is to say that we
 * want to show that the actual integer value of `reconstructed` lies in [0, ..., r-1].
 * By the formula for `reconstructed`, we do not have to worry about wrapping the modulus if num_bytes < 32 or, in the
 * default case, if the `input` fits into 31 bytes.
 *
 * Suppose now that num_bytes is 32. We would like to show that r - 1 -  reconstructed >= 0 as integers, but this
 * cannot be done inside of uint256_t since `reconstructed` value can be any uint256_t, hence its negative is not
 * constrained to lie in any proper subset. We therefore split it and `r-1` into two smaller limbs and make comparisons
 * using range constraints in uint256_t.
 *
 *  We separate the problem of imposing that reconstructed <= r - 1 into two cases.
 *
 *      Case 0: When s_lo <  reconstructed_lo, we must impose that reconstructed_hi <  s_hi, i.e., s_hi - v_hi - 2 > 0.
 *      Case 1:      s_lo >= reconstructed_lo, we must impose that reconstructed_hi =< s_hi, i.e.  s_hi - v_hi - 1 > 0.
 *
 * To unify these cases, we introduce a predicate that distinguishes them. Consider the expression s_lo - v_lo. As an
 * integer, this lies in [-2^128+1, 2^128-1], with Case 0 corresponding to the numbers < 0. Shifting to
 *      diff_lo :=  s_lo - reconstructed_lo + 2^128,
 * Case 0 corresponds to the range [1, 2^128-1]. We see that the 129th bit of diff_lo exactly indicates Case 1.
 * Extracting the 129th bit denoted `diff_lo_hi` and adding it to reconstructed_hi, we have a uniform
 * constraint to apply. Namely, setting
 *      overlap := 1 - diff_overlap_lo_hi
 * and
 *      diff_hi := s_hi - reconstructed_hi - overlap,
 * range constraining y_hi to 128 bits imposes validator < r.
 */
template <typename Builder>
byte_array<Builder>::byte_array(const field_t<Builder>& input,
                                const size_t num_bytes,
                                std::optional<uint256_t> test_val)
{
    using field_t = field_t<Builder>;

    static constexpr size_t max_num_bytes = 32;
    static constexpr size_t midpoint = max_num_bytes / 2;
    constexpr uint256_t one(1);

    ASSERT(num_bytes <= max_num_bytes);
    // If a test 256-bit is injected, use it to create a byte decomposition.
    const uint256_t value = test_val.has_value() ? *test_val : static_cast<uint256_t>(input.get_value());

    values.resize(num_bytes);

    // To optimize the computation of the reconstructed_hi  and reconstructed_lo, we use the `field_t::accumulate`
    // method.
    std::vector<field_t> accumulator_lo;
    std::vector<field_t> accumulator_hi;

    context = input.get_context();

    for (size_t i = 0; i < num_bytes; ++i) {

        size_t bit_start = (num_bytes - i - 1) * 8;
        size_t bit_end = bit_start + 8;
        const field_t scaling_factor = one << bit_start;

        // Extract the current byte
        const bb::fr byte_val = value.slice(bit_start, bit_end);
        // Ensure that current `byte_array` element is a witness iff input is a witness and that it is range
        // constrained.
        field_t byte = input.is_constant() ? field_t(byte_val) : witness_t(context, byte_val);
        byte.create_range_constraint(8, "byte_array: byte extraction failed.");
        values[i] = byte;

        if (i < midpoint) {
            accumulator_hi.push_back(scaling_factor * byte);
        } else {
            accumulator_lo.push_back(scaling_factor * byte);
        }
    }

    // Reconstruct the high and low limbs of input from the byte decomposition
    const field_t reconstructed_lo = field_t::accumulate(accumulator_lo);
    const field_t reconstructed_hi = field_t::accumulate(accumulator_hi);

    // Ensure that the reconstruction succeeded
    input.assert_equal(reconstructed_hi + reconstructed_lo);

    // Handle the case when the decomposition is not unique
    if (num_bytes == 32) {
        // For a modulus `r`, split `r - 1` into limbs
        constexpr uint256_t modulus_minus_one = fr::modulus - 1;
        constexpr uint256_t s_lo = modulus_minus_one.slice(0, 128);
        constexpr uint256_t s_hi = modulus_minus_one.slice(128, 256);
        const uint256_t shift = uint256_t(1) << 128;

        // Ensure that `(r - 1).lo + 2 ^ 128 - reconstructed_lo` is a 129 bit integer by slicing it into a 128- and 1-
        // bit chunks.
        const field_t diff_lo = -reconstructed_lo + s_lo + shift;
        const uint256_t diff_lo_value = -value + static_cast<uint256_t>(reconstructed_hi.get_value()) + s_lo + shift;

        // Extract the "borrow" bit
        const uint256_t diff_lo_hi_value = (diff_lo_value >> 128);
        const field_t diff_lo_hi =
            input.is_constant() ? field_t(diff_lo_hi_value) : witness_t<Builder>(context, diff_lo_hi_value);
        diff_lo_hi.create_range_constraint(1, "byte_array: y_overlap is not a bit");

        // Extract first 128 bits of `diff_lo`
        const uint256_t lo_mask = shift - 1;
        const uint256_t lo = diff_lo_value & lo_mask;
        const field_t diff_lo_lo = input.is_constant() ? field_t(lo) : witness_t(context, lo);
        diff_lo_lo.create_range_constraint(128, "byte_array: y_remainder doesn't fit in 128 bits.");

        // Both chunks were computed out-of-circuit - need to constrain. The range constraints above ensure that
        // they are not overlapping.
        diff_lo.assert_equal(diff_lo_lo + diff_lo_hi * shift);

        const field_t overlap = -diff_lo_hi + 1;
        // Ensure that (r - 1).hi  - reconstructed_hi/shift - overlap is positive.
        const field_t diff_hi = (-reconstructed_hi / shift).add_two(s_hi, -overlap);
        diff_hi.create_range_constraint(128, "byte_array: y_hi doesn't fit in 128 bits.");
    }

    set_origin_tag(input.tag);
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
 * modulus
 **/
template <typename Builder> byte_array<Builder>::operator field_t<Builder>() const
{
    const size_t bytes = values.size();
    ASSERT(bytes < 32);
    static constexpr uint256_t one(1);
    std::vector<field_t<Builder>> scaled_values;

    for (size_t i = 0; i < bytes; ++i) {
        const field_t<Builder> scaling_factor(one << (8 * (bytes - i - 1)));
        scaled_values.push_back(values[i] * scaling_factor);
    }

    return field_t<Builder>::accumulate(scaled_values);
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
