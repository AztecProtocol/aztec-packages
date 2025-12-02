// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "rom_table.hpp"

#include "../circuit_builders/circuit_builders.hpp"
#include "barretenberg/common/assert.hpp"

using namespace bb;

namespace bb::stdlib {

/**
 * @brief Construct a new ROM table (read only array)
 *
 * @details This constructor is used in DSL, where we need to initialize a table with a builder to prevent the case in
 * which a read operation happens before the context has been set.
 *
 */
template <IsUltraOrMegaBuilder Builder>
rom_table<Builder>::rom_table(Builder* builder, const std::vector<field_pt>& table_entries)
    : raw_entries(table_entries)
    , length(raw_entries.size())
    , context(builder)
{
    // For consistency with the other constructor, we delegate the initialization of the table to the first read
    // operation.

    //  Initialize tags
    _tags.resize(raw_entries.size());
    for (size_t i = 0; i < length; ++i) {
        _tags[i] = raw_entries[i].get_origin_tag();
    }
}

/**
 * @brief Construct a new ROM table (read only array)
 *
 * @details This constructor is used internally in barretenberg to construct tables without the need to specify the
 * builder. It is especially useful when methods create new rom tables operating on in-circuit values which a priori we
 * don't know whether they are constant or witnesses.
 *
 */
template <IsUltraOrMegaBuilder Builder>
rom_table<Builder>::rom_table(const std::vector<field_pt>& table_entries)
    : raw_entries(table_entries)
    , length(raw_entries.size())
{
    // get the builder context
    for (const auto& entry : table_entries) {
        if (entry.get_context() != nullptr) {
            context = entry.get_context();
            break;
        }
    }

    // Do not initialize the table yet. The input entries might all be constant,
    // if this is the case we might not have a valid pointer to a Builder
    // We get around this, by initializing the table when `operator[]` is called
    // with a non-const field element.

    // Initialize tags
    _tags.resize(raw_entries.size());
    for (size_t i = 0; i < length; ++i) {
        _tags[i] = raw_entries[i].get_origin_tag();
    }
}

/**
 * @brief Initialize the table once we perform a read.
 * @tparam Builder
 *
 * @note If both the table entries and the index are constant, we don't need a builder as we can directly extract the
 * desired value from `raw_entries`. In particular, we simply _don't use_ the ROM table mechanism under the hood.
 * @note using this API, ROM tables are always fully initialized.
 */
template <IsUltraOrMegaBuilder Builder> void rom_table<Builder>::initialize_table() const
{
    if (initialized) {
        return;
    }
    BB_ASSERT(context != nullptr);
    // populate table. Table entries must be normalized and cannot be constants
    for (const auto& entry : raw_entries) {
        if (entry.is_constant()) {
            auto fixed_witness =
                field_pt::from_witness_index(context, context->put_constant_variable(entry.get_value()));
            fixed_witness.set_origin_tag(entry.get_origin_tag());
            entries.emplace_back(fixed_witness);

        } else {
            entries.emplace_back(entry);
        }
    }
    rom_id = context->create_ROM_array(length);

    for (size_t i = 0; i < length; ++i) {
        context->set_ROM_element(rom_id, i, entries[i].get_witness_index());
    }

    // Preserve tags to restore them in the future lookups
    _tags.resize(raw_entries.size());
    for (size_t i = 0; i < length; ++i) {
        _tags[i] = raw_entries[i].get_origin_tag();
    }
    initialized = true;
}

template <IsUltraOrMegaBuilder Builder> rom_table<Builder>::rom_table(const rom_table& other) = default;
template <IsUltraOrMegaBuilder Builder> rom_table<Builder>::rom_table(rom_table&& other) = default;
template <IsUltraOrMegaBuilder Builder>
rom_table<Builder>& rom_table<Builder>::operator=(const rom_table& other) = default;
template <IsUltraOrMegaBuilder Builder> rom_table<Builder>& rom_table<Builder>::operator=(rom_table&& other) = default;

template <IsUltraOrMegaBuilder Builder> field_t<Builder> rom_table<Builder>::operator[](const size_t index) const
{
    if (index >= length) {
        BB_ASSERT(context != nullptr);
        context->failure("rom_rable: ROM array access out of bounds");
    }

    return entries[index];
}

template <IsUltraOrMegaBuilder Builder> field_t<Builder> rom_table<Builder>::operator[](const field_pt& index) const
{
    if (context == nullptr) {
        context = index.get_context();
        BB_ASSERT_NEQ(
            context,
            nullptr,
            "rom_table: Performing a read operation without providing a context. We cannot initialize the table.");
    }

    // When we perform the first read operation, we initialize the table
    initialize_table();

    if (index.is_constant()) {
        return operator[](static_cast<size_t>(uint256_t(index.get_value()).data[0]));
    }

    const auto native_index = uint256_t(index.get_value());
    if (native_index >= length) {
        context->failure("rom_table: ROM array access out of bounds");
    }

    uint32_t output_idx = context->read_ROM_array(rom_id, index.get_witness_index());
    auto element = field_pt::from_witness_index(context, output_idx);

    const size_t cast_index = static_cast<size_t>(static_cast<uint64_t>(native_index));

    // If the index is legitimate, restore the tag
    if (native_index < length) {

        element.set_origin_tag(_tags[cast_index]);
    }
    return element;
}

template class rom_table<bb::UltraCircuitBuilder>;
template class rom_table<bb::MegaCircuitBuilder>;
} // namespace bb::stdlib
