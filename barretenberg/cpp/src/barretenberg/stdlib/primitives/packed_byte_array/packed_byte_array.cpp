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
packed_byte_array<Builder>::packed_byte_array(Builder* parent_context, const size_t n)
    : context(parent_context)
    , num_bytes(n)
{
    const size_t num_elements = num_bytes / BYTES_PER_ELEMENT + (num_bytes % BYTES_PER_ELEMENT != 0);
    limbs = std::vector<field_ct>(num_elements);
}

template <typename Builder>
packed_byte_array<Builder>::packed_byte_array(const std::vector<field_ct>& input, const size_t bytes_per_input)
    : context(get_context_from_fields(input))
    , num_bytes(bytes_per_input * input.size())
{
    BB_ASSERT_LTE(bytes_per_input, BYTES_PER_ELEMENT);
    if (bytes_per_input > BYTES_PER_ELEMENT) {
        context->failure("packed_byte_array: called `packed_byte_array` constructor with `bytes_per_input > 16 bytes");
    }

    // TODO HANDLE CASE WHERE bytes_per_input > BYTES_PER_ELEMENT (and not 32)
    const size_t inputs_per_limb = BYTES_PER_ELEMENT / bytes_per_input;

    const size_t num_elements = num_bytes / BYTES_PER_ELEMENT + (num_bytes % BYTES_PER_ELEMENT != 0);
    for (size_t i = 0; i < num_elements; ++i) {
        field_ct limb(context, 0);
        if (uint256_t(limb.get_value()).get_msb() >= 128) {
            context->failure("packed_byte_array: input field element to `packed_byte_array` is >16 bytes!");
        }
        const size_t num_inputs = (i == num_elements - 1) ? (input.size() - (i * inputs_per_limb)) : inputs_per_limb;
        for (size_t j = 0; j < num_inputs; ++j) {
            const uint64_t limb_shift = (BYTES_PER_ELEMENT - ((j + 1) * bytes_per_input)) << 3;
            limb += input[i * inputs_per_limb + j] * field_ct(context, uint256_t(1) << limb_shift);
        }
        limbs.push_back(limb);
    }
}

template <typename Builder>
packed_byte_array<Builder>::packed_byte_array(Builder* parent_context, const std::vector<uint8_t>& input)
    : context(parent_context)
    , num_bytes(input.size())
{
    const size_t num_elements = num_bytes / BYTES_PER_ELEMENT + (num_bytes % BYTES_PER_ELEMENT != 0);
    std::vector<uint256_t> data(num_elements);
    for (size_t i = 0; i < num_elements; ++i) {
        data[i] = 0;
    }
    for (size_t i = 0; i < input.size(); ++i) {
        const size_t limb = i / BYTES_PER_ELEMENT;
        const size_t limb_byte = i % BYTES_PER_ELEMENT;
        const uint64_t limb_shift = (BYTES_PER_ELEMENT - 1U - static_cast<uint64_t>(limb_byte)) << 3;

        data[limb] += uint256_t(input[i]) << limb_shift;
    }

    for (size_t i = 0; i < num_elements; ++i) {
        limbs.push_back(witness_t(context, fr(data[i])));
    }
}

template <typename Builder>
packed_byte_array<Builder>::packed_byte_array(const byte_array_ct& input)
    : context(input.get_context())
    , num_bytes(input.size())
{
    const size_t num_elements = num_bytes / BYTES_PER_ELEMENT + (num_bytes % BYTES_PER_ELEMENT != 0);

    const auto& bytes = input.bytes();

    for (size_t i = 0; i < num_elements; ++i) {
        const size_t bytes_in_element = (i == num_elements - 1) ? num_bytes - i * BYTES_PER_ELEMENT : BYTES_PER_ELEMENT;
        field_ct limb(context, 0);
        for (size_t j = 0; j < bytes_in_element; ++j) {
            const uint64_t shift = static_cast<uint64_t>(BYTES_PER_ELEMENT - 1 - j) * 8;
            limb += field_ct(bytes[i * BYTES_PER_ELEMENT + j]) * field_ct(context, uint256_t(1) << shift);
        }
        limbs.push_back(limb);
    }
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

template <typename Builder> packed_byte_array<Builder>::operator byte_array_ct() const
{
    std::vector<field_ct> bytes;

    for (size_t i = 0; i < limbs.size(); ++i) {
        const size_t bytes_in_limb = (i == limbs.size() - 1) ? num_bytes - (i * BYTES_PER_ELEMENT) : BYTES_PER_ELEMENT;
        field_ct accumulator(context, 0);
        uint256_t limb_value(limbs[i].get_value());
        for (size_t j = 0; j < bytes_in_limb; ++j) {
            const uint64_t bit_shift = (BYTES_PER_ELEMENT - 1 - j) * 8;
            uint64_t byte_val = (limb_value >> bit_shift).data[0] & (uint64_t)(255);
            field_ct byte(witness_t(context, fr(byte_val)));
            byte.create_range_constraint(8);
            accumulator += (field_ct(byte) * field_ct(context, uint256_t(1) << bit_shift));
            bytes.emplace_back(byte);
        }
        accumulator.assert_equal(limbs[i]);
    }
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
    bool is_constant = to_append.witness_index == IS_CONSTANT;

    field_ct to_current;
    to_current = is_constant ? field_ct(context, append_current) : witness_t(context, append_current);
    limbs[limbs.size() - 1] += (to_current * field_ct(context, uint256_t(1) << current_padding));

    field_ct reconstructed = to_current;
    if (num_bytes_for_new_limb > 0) {
        field_ct to_add;
        to_add = is_constant ? field_ct(context, append_next) : witness_t(context, append_next);
        limbs.emplace_back(to_add * field_ct(context, uint256_t(1) << next_padding));

        reconstructed += to_add * field_ct(context, uint256_t(1) << uint256_t(num_bytes_for_current_limb * 8));
    }

    if (!is_constant) {
        reconstructed.assert_equal(to_append);
    }

    num_bytes += bytes_to_append;
}

template <typename Builder>
std::vector<field_t<Builder>> packed_byte_array<Builder>::to_unverified_byte_slices(const size_t bytes_per_slice) const
{
    std::vector<field_ct> slices;
    for (size_t i = 0; i < limbs.size(); ++i) {
        uint256_t limb_value(limbs[i].get_value());
        const size_t bytes_in_limb = (i == limbs.size() - 1) ? num_bytes - (i * BYTES_PER_ELEMENT) : BYTES_PER_ELEMENT;
        const size_t num_slices = (bytes_in_limb / bytes_per_slice) + (bytes_in_limb % bytes_per_slice != 0);

        field_ct accumulator(context, 0);
        for (size_t j = 0; j < num_slices; ++j) {
            const size_t bytes_in_slice =
                (j == num_slices - 1) ? bytes_in_limb - (j * bytes_per_slice) : bytes_per_slice;
            const uint64_t end = (BYTES_PER_ELEMENT - (j * bytes_in_slice)) << 3;
            const uint64_t start = (BYTES_PER_ELEMENT - ((j + 1) * bytes_in_slice)) << 3;

            const uint256_t slice = limb_value.slice(start, end);

            if (limbs[i].witness_index != IS_CONSTANT) {
                slices.push_back(witness_t(context, fr(slice)));
            } else {
                slices.push_back(field_ct(context, fr(slice)));
            }
            accumulator += (slices.back() * field_ct(context, uint256_t(1) << start));
        }

        limbs[i].assert_equal(accumulator);
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
