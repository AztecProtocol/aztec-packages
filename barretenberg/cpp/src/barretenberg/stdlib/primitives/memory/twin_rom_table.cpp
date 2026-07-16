// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Raju], commit: 05a381f8b31ae4648e480f1369e911b148216e8b}
// external_1:  { status: Complete, auditors: [Sherlock], commit: e6694849223 }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "twin_rom_table.hpp"

#include "../circuit_builders/circuit_builders.hpp"
#include "barretenberg/common/assert.hpp"

using namespace bb;

namespace bb::stdlib {

template <typename Builder>
twin_rom_table<Builder>::twin_rom_table(const std::vector<std::array<field_pt, 2>>& table_entries)
    : raw_entries(table_entries)
    , length(raw_entries.size())
{
    // get the builder context
    for (const auto& entry : table_entries) {
        context = validate_context(context, entry[0].get_context(), entry[1].get_context());
    }

    // We do not initialize the table yet. The input entries might all be constant,
    // if this is the case we might not have a valid pointer to a Builder
    // We get around this, by initializing the table when `operator[]` is called
    // with a non-const field element.

    // Ensure that the origin tags of all entries are preserved so we can assign them on lookups
    _tags.resize(length);
    for (size_t i = 0; i < length; ++i) {
        _tags[i] = { raw_entries[i][0].get_origin_tag(), raw_entries[i][1].get_origin_tag() };
    }
}

// initialize the table once we perform a read. This ensures we always have a valid
// pointer to a Builder.
// (if both the table entries and the index are constant, we don't need a builder as we
// can directly extract the desired value from `raw_entries`)
template <typename Builder> void twin_rom_table<Builder>::initialize_table() const
{
    if (initialized) {
        return;
    }
    BB_ASSERT_EQ(context != nullptr, true, "twin_rom_table: context must be set before initializing the table");

    // populate table. Table entries must be normalized and cannot be constants
    for (const auto& entry : raw_entries) {
        field_pt first;
        field_pt second;
        if (entry[0].is_constant()) {
            first = field_pt::from_witness_index(context, context->put_constant_variable(entry[0].get_value()));
        } else {
            first = entry[0];
        }
        if (entry[1].is_constant()) {
            second = field_pt::from_witness_index(context, context->put_constant_variable(entry[1].get_value()));
        } else {
            second = entry[1];
        }
        entries.emplace_back(field_pair_pt{ first, second });
    }

    // create uninitialized table of size `length`
    rom_id = context->create_ROM_array(length);

    for (size_t i = 0; i < length; ++i) {
        context->set_ROM_element_pair(
            rom_id, i, std::array<uint32_t, 2>{ entries[i][0].get_witness_index(), entries[i][1].get_witness_index() });
    }

    // Ensure that the origin tags of all entries are preserved so we can assign them on lookups
    _tags.resize(length);
    for (size_t i = 0; i < length; ++i) {
        _tags[i] = { raw_entries[i][0].get_origin_tag(), raw_entries[i][1].get_origin_tag() };
    }
    initialized = true;
}

template <typename Builder> twin_rom_table<Builder>::twin_rom_table(const twin_rom_table& other) = default;

template <typename Builder>
twin_rom_table<Builder>::twin_rom_table(twin_rom_table&& other) noexcept
    : raw_entries(std::move(other.raw_entries))
    , entries(std::move(other.entries))
    , _tags(std::move(other._tags))
    , length(other.length)
    , rom_id(other.rom_id)
    , initialized(other.initialized)
    , context(other.context)
{
    other.length = 0;
    other.rom_id = 0;
    other.initialized = false;
    other.context = nullptr;
}

template <typename Builder>
twin_rom_table<Builder>& twin_rom_table<Builder>::operator=(const twin_rom_table& other) = default;

template <typename Builder> twin_rom_table<Builder>& twin_rom_table<Builder>::operator=(twin_rom_table&& other) noexcept
{
    if (this != &other) {
        raw_entries = std::move(other.raw_entries);
        entries = std::move(other.entries);
        _tags = std::move(other._tags);
        length = other.length;
        rom_id = other.rom_id;
        initialized = other.initialized;
        context = other.context;

        other.length = 0;
        other.rom_id = 0;
        other.initialized = false;
        other.context = nullptr;
    }
    return *this;
}

template <typename Builder>
std::array<field_t<Builder>, 2> twin_rom_table<Builder>::operator[](const size_t index) const
{
    BB_ASSERT_LT(index, length, "twin_rom_table: ROM array access out of bounds");
    return raw_entries[index];
}

template <typename Builder>
std::array<field_t<Builder>, 2> twin_rom_table<Builder>::operator[](const field_pt& index) const
{
    const auto native_index = uint256_t(index.get_value());
    BB_ASSERT_LT(native_index, length, "twin_rom_table: ROM array access out of bounds");

    if (index.is_constant()) {
        // This cast is safe because native_index is uint64_t (other components are zero) and native_index < length
        return operator[](static_cast<size_t>(static_cast<uint64_t>(native_index)));
    }
    if (context == nullptr) {
        context = index.get_context();
    }

    initialize_table();

    auto output_indices = context->read_ROM_array_pair(rom_id, index.get_witness_index());
    auto pair = field_pair_pt{
        field_pt::from_witness_index(context, output_indices[0]),
        field_pt::from_witness_index(context, output_indices[1]),
    };

    // This cast is safe because native_index is uint64_t (other components are zero) and native_index < length
    const size_t cast_index = static_cast<size_t>(static_cast<uint64_t>(native_index));
    // In case of a legitimate lookup, restore the tags of the original entries to the output
    if (native_index < length) {
        pair[0].set_origin_tag(_tags[cast_index][0]);
        pair[1].set_origin_tag(_tags[cast_index][1]);
    }
    return pair;
}

template class twin_rom_table<bb::UltraCircuitBuilder>;
template class twin_rom_table<bb::MegaCircuitBuilder>;
} // namespace bb::stdlib
