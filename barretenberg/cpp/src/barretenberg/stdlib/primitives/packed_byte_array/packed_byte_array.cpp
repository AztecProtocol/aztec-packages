// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "packed_byte_array.hpp"

#include "../circuit_builders/circuit_builders.hpp"
#include "barretenberg/common/assert.hpp"

using namespace bb;

namespace bb::stdlib {
namespace {

template <typename Builder> Builder* get_context_from_fields(const std::vector<field_t<Builder>>& input)
{
    for (const auto& element : input) {
        if (element.get_context()) {
            return element.get_context();
        }
    }
    return nullptr;
}
} // namespace

template <typename Builder>
field_t<Builder> packed_byte_array<Builder>::compute_limb_from_bytes(const std::vector<field_ct>& input,
                                                                     size_t start_idx,
                                                                     size_t count,
                                                                     size_t bytes_per_input) const
{
    std::vector<field_ct> limb;
    for (size_t j = 0; j < count; ++j) {
        const uint64_t limb_shift = (BYTES_PER_ELEMENT - ((j + 1) * bytes_per_input)) << 3;
        limb.push_back(input[start_idx + j] * fr(uint256_t(1) << limb_shift));
    }
    return field_ct::accumulate(limb);
}

template <typename Builder>
field_t<Builder> packed_byte_array<Builder>::slice_byte_from_limb_value(const uint256_t& limb_value, size_t j) const
{
    const uint64_t bit_shift = BYTE_BIT_SHIFTS[j];
    const uint64_t byte_val = (limb_value >> bit_shift).data[0] & 0xff;

    return witness_t(context, byte_val);
};

// Construct an empty packed byte array of size
template <typename Builder>
packed_byte_array<Builder>::packed_byte_array(Builder* parent_context, const size_t n)
    : context(parent_context)
    , num_bytes(n)
    , num_limbs(compute_num_limbs(num_bytes))
    , limbs(std::vector<field_ct>(num_limbs))
{}

// Given a vector of fields, construct a packed byte array containing the limbs of size `bytes_per_input` that is not
// allowed to exceedd 16
// Any unsafe usage?
template <typename Builder>
packed_byte_array<Builder>::packed_byte_array(const std::vector<field_ct>& input, const size_t bytes_per_input)
    : context(get_context_from_fields(input))
    , num_bytes(bytes_per_input * input.size())
    , num_limbs(compute_num_limbs(num_bytes))
    , limbs(num_limbs)
{
    BB_ASSERT_LTE(bytes_per_input, BYTES_PER_ELEMENT);
    if (bytes_per_input > BYTES_PER_ELEMENT) {
        context->failure("packed_byte_array: called with `bytes_per_input > 16`");
    }

    const size_t inputs_per_limb = BYTES_PER_ELEMENT / bytes_per_input;
    const size_t full_limbs = num_limbs - 1;
    const size_t final_limb_inputs = input.size() - full_limbs * inputs_per_limb;

    // Process full limbs.
    for (size_t limb_idx = 0; limb_idx < full_limbs; ++limb_idx) {
        const size_t start = limb_idx * inputs_per_limb;
        limbs[limb_idx] = compute_limb_from_bytes(input, start, inputs_per_limb, bytes_per_input);
    }

    // Process final limb that might be incomplete.
    const size_t start = full_limbs * inputs_per_limb;
    limbs[num_limbs - 1] = compute_limb_from_bytes(input, start, final_limb_inputs, bytes_per_input);
}

// Given a vector of bytes, create a packed_byte_array combining bytes into limbs of size 16.
template <typename Builder>
packed_byte_array<Builder>::packed_byte_array(Builder* parent_context, const std::vector<uint8_t>& input)
    : context(parent_context)
    , num_bytes(input.size())
    , num_limbs(compute_num_limbs(num_bytes))

{
    std::vector<uint256_t> data(num_limbs);
    for (size_t i = 0; i < num_limbs; ++i) {
        data[i] = 0;
    }
    for (size_t i = 0; i < input.size(); ++i) {
        const size_t limb = i / BYTES_PER_ELEMENT;
        const size_t limb_byte = i % BYTES_PER_ELEMENT;

        data[limb] += uint256_t(input[i]) << BYTE_BIT_SHIFTS[limb_byte];
    }

    for (size_t i = 0; i < num_limbs; ++i) {
        // No range constraints?
        limbs.push_back(witness_t(context, fr(data[i])));
    }
}

template <typename Builder>
packed_byte_array<Builder>::packed_byte_array(const byte_array_ct& input)
    : context(input.get_context())
    , num_bytes(input.size())
    , num_limbs(compute_num_limbs(num_bytes))
    , limbs(num_limbs)
{
    const auto& bytes = input.bytes();

    // Process full 16-byte limbs
    for (size_t i = 0; i < num_limbs - 1; ++i) {
        limbs[i] = compute_limb_from_bytes(bytes, i * BYTES_PER_ELEMENT);
    }

    // Process the final limb that may be smaller than 16 bytes
    limbs[num_limbs - 1] = compute_limb_from_bytes(
        bytes, (num_limbs - 1) * BYTES_PER_ELEMENT, num_bytes - (num_limbs - 1) * BYTES_PER_ELEMENT);
}

template <typename Builder>
packed_byte_array<Builder>::packed_byte_array(Builder* parent_context, const std::string& input)
    : packed_byte_array(parent_context, std::vector<uint8_t>(input.begin(), input.end()))
{}

template <typename Builder>
packed_byte_array<Builder>::packed_byte_array(const packed_byte_array& other)
    : context(other.context)
    , num_bytes(other.num_bytes)
    , limbs(other.limbs.begin(), other.limbs.end())
{}

template <typename Builder>
packed_byte_array<Builder>::packed_byte_array(packed_byte_array&& other)
    : context(other.context)
    , num_bytes(other.num_bytes)
    , limbs(other.limbs.begin(), other.limbs.end())
{}

template <typename Builder>
packed_byte_array<Builder>& packed_byte_array<Builder>::operator=(const packed_byte_array& other)
{
    context = other.context;
    num_bytes = other.num_bytes;
    limbs = std::vector<field_ct>(other.limbs.begin(), other.limbs.end());
    return *this;
}

template <typename Builder> packed_byte_array<Builder>& packed_byte_array<Builder>::operator=(packed_byte_array&& other)
{
    context = other.context;
    num_bytes = other.num_bytes;
    limbs = std::vector<field_ct>(other.limbs.begin(), other.limbs.end());
    return *this;
}

// Convert to `byte_array`
template <typename Builder> packed_byte_array<Builder>::operator byte_array_ct() const
{
    std::vector<field_ct> bytes;
    const size_t num_limbs = limbs.size();

    // Lambda to extract bytes, constrain them, and assert reconstruction
    auto process_limb = [&](const field_ct& limb, size_t num_bytes_in_limb = BYTES_PER_ELEMENT) {
        const uint256_t limb_value(limb.get_value());
        std::vector<field_ct> accumulator;
        for (size_t j = 0; j < num_bytes_in_limb; ++j) {
            field_ct byte = slice_byte_from_limb_value(limb_value, j);
            bytes.emplace_back(byte);
            accumulator.push_back(byte * fr(uint256_t(1) << BYTE_BIT_SHIFTS[j]));
        }
        limb.assert_equal(field_ct::accumulate(accumulator));
    };

    // Process all full limbs
    for (size_t i = 0; i < num_limbs - 1; ++i) {
        process_limb(limbs[i]);
    }

    // Process final limb that may contain less than 16 bytes.
    const size_t bytes_in_last_limb = num_bytes - (num_limbs - 1) * BYTES_PER_ELEMENT;
    process_limb(limbs[num_limbs - 1], bytes_in_last_limb);

    return byte_array_ct(context, bytes);
}

template <typename Builder>
void packed_byte_array<Builder>::append(const field_ct& to_append, const size_t bytes_to_append)
{
    const size_t current_capacity = limbs.size() * BYTES_PER_ELEMENT;
    const size_t current_size = size();

    const size_t current_limb_space = current_capacity - current_size;

    const size_t num_bytes_for_current_limb = std::min(current_limb_space, bytes_to_append);

    const size_t num_bytes_for_new_limb = bytes_to_append - num_bytes_for_current_limb;

    const uint256_t append_value(to_append.get_value());

    const uint64_t start = (bytes_to_append - num_bytes_for_current_limb) * 8;
    const uint64_t end = bytes_to_append * 8;

    const uint256_t append_current = append_value.slice(start, end);
    const uint256_t append_next = append_value.slice(0, start);

    const uint64_t current_padding = (current_limb_space - num_bytes_for_current_limb) << 3;
    const uint64_t next_padding = (BYTES_PER_ELEMENT - num_bytes_for_new_limb) << 3;
    const bool is_constant = to_append.is_constant();

    field_ct to_current = is_constant ? field_ct(context, append_current) : witness_t(context, append_current);

    limbs[limbs.size() - 1] += (to_current * field_ct(context, uint256_t(1) << current_padding));

    field_ct reconstructed = to_current;
    if (num_bytes_for_new_limb > 0) {
        field_ct to_add = is_constant ? field_ct(context, append_next) : witness_t(context, append_next);
        limbs.emplace_back(to_add * field_ct(context, uint256_t(1) << next_padding));

        reconstructed += to_add * field_ct(context, uint256_t(1) << (num_bytes_for_current_limb * 8));
    }

    if (!is_constant) {
        // Is it enough without range constraints? Both summands are created out-of-circuit!
        reconstructed.assert_equal(to_append);
    }

    num_bytes += bytes_to_append;
}

// Is only called with bytes_per_slice = 4
// BYTES_PER_ELEMENT = 16
template <typename Builder>
std::vector<field_t<Builder>> packed_byte_array<Builder>::to_unverified_byte_slices(const size_t bytes_per_slice) const
{
    std::vector<field_ct> slices;
    for (size_t i = 0; i < limbs.size(); ++i) {
        uint256_t limb_value(limbs[i].get_value());
        const size_t bytes_in_limb = (i == limbs.size() - 1) ? num_bytes - (i * BYTES_PER_ELEMENT) : BYTES_PER_ELEMENT;
        const size_t num_slices = (bytes_in_limb / bytes_per_slice) + (bytes_in_limb % bytes_per_slice != 0);

        std::vector<field_ct> accumulator;
        for (size_t j = 0; j < num_slices; ++j) {
            const size_t bytes_in_slice =
                (j == num_slices - 1) ? bytes_in_limb - (j * bytes_per_slice) : bytes_per_slice;
            const uint64_t end = (BYTES_PER_ELEMENT - (j * bytes_in_slice)) << 3;
            const uint64_t start = (BYTES_PER_ELEMENT - ((j + 1) * bytes_in_slice)) << 3;

            const uint256_t slice_value = limb_value.slice(start, end);

            field_ct slice = !limbs[i].is_constant() ? witness_t(context, slice_value) : field_ct(context, slice_value);
            slices.push_back(slice);

            accumulator.push_back(slice * field_ct(uint256_t(1) << start));
        }

        limbs[i].assert_equal(field_ct::accumulate(accumulator));
    }
    return slices;
}

template <typename Builder> std::string packed_byte_array<Builder>::get_value() const
{
    std::string bytes(num_bytes, 0);
    for (size_t i = 0; i < limbs.size(); ++i) {
        const size_t bytes_in_limb = (i == limbs.size() - 1) ? num_bytes - (i * BYTES_PER_ELEMENT) : BYTES_PER_ELEMENT;
        uint256_t limb_value(limbs[i].get_value());

        for (size_t j = 0; j < bytes_in_limb; ++j) {
            const uint64_t end = (BYTES_PER_ELEMENT - (j)) << 3;
            const uint64_t start = (BYTES_PER_ELEMENT - ((j + 1))) << 3;
            const uint8_t slice = static_cast<uint8_t>(limb_value.slice(start, end).data[0]);
            bytes[i * BYTES_PER_ELEMENT + j] = static_cast<char>(slice);
        }
    }
    return bytes;
}

template class packed_byte_array<bb::UltraCircuitBuilder>;
template class packed_byte_array<bb::MegaCircuitBuilder>;

} // namespace bb::stdlib
