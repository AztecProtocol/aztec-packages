// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "ram_table.hpp"

#include "../circuit_builders/circuit_builders.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/transcript/origin_tag.hpp"
#include <vector>

namespace bb::stdlib {

/**
 * @brief Construct a new RAM table, i.e., dynamic memory with a fixed length.
 *
 * @tparam Builder
 * @param table_size size of the table we are constructing
 */
template <typename Builder>
ram_table<Builder>::ram_table(Builder* builder, const size_t table_size)
    : length(table_size)
    , context(builder)
{
    static_assert(IsUltraOrMegaBuilder<Builder>);
    index_initialized.resize(table_size, false);

    // do not initialize the table yet. The input entries might all be constant;
    // if this is the case we might not have a valid pointer to a Builder.
    // We get around this by initializing the table when `read` or `write` operator is called
    // with a non-const field element.
}

/**
 * @brief Construct a new RAM table, i.e., dynamic memory with a fixed length.
 *
 * @tparam Builder
 * @param table_entries vector of field elements that will initialize the RAM table
 */
template <typename Builder>
ram_table<Builder>::ram_table(const std::vector<field_pt>& table_entries)
    : raw_entries(table_entries)
    , length(raw_entries.size())
{
    static_assert(IsUltraOrMegaBuilder<Builder>);
    for (const auto& entry : table_entries) {
        if (entry.get_context() != nullptr) {
            context = entry.get_context();
            break;
        }
    }

    index_initialized.resize(length);
    for (auto&& idx : index_initialized) {
        idx = false;
    }
    // do not initialize the table yet. The input entries might all be constant,
    // if this is the case we might not have a valid pointer to a Builder
    // We get around this, by initializing the table when `read` or `write` operator is called
    // with a non-const field element.

    // Store tags
    _tags.resize(length);
    for (size_t i = 0; i < length; i++) {
        _tags[i] = table_entries[i].get_origin_tag();
    }
}

/**
 * @brief internal method, is used to call Builder methods that will generate RAM table.
 *
 * @details initialize the table once we perform a read. This ensures we always have a pointer to a Builder.
 * (if both the table entries and the index are constant, we don't need a builder as we
 * can directly extract the desired value fram `raw_entries`)
 *
 * @tparam Builder
 */
template <typename Builder> void ram_table<Builder>::initialize_table() const
{
    if (ram_table_generated_in_builder) {
        return;
    }
    // only call this when there is a context
    BB_ASSERT(context != nullptr);
    ram_id = context->create_RAM_array(length);

    if (raw_entries.size() > 0) {
        for (size_t i = 0; i < length; ++i) {
            if (!index_initialized[i]) {
                field_pt entry;
                if (raw_entries[i].is_constant()) {
                    entry = field_pt::from_witness_index(context,
                                                         context->put_constant_variable(raw_entries[i].get_value()));
                } else {
                    entry = raw_entries[i];
                }
                context->init_RAM_element(ram_id, i, entry.get_witness_index());
                index_initialized[i] = true;
            }
        }
    }

    // Store the tags of the original entries
    _tags.resize(length);
    if (raw_entries.size() > 0) {
        for (size_t i = 0; i < length; i++) {
            _tags[i] = raw_entries[i].get_origin_tag();
        }
    }
    ram_table_generated_in_builder = true;
}
// constructors and move operators
template <typename Builder> ram_table<Builder>::ram_table(const ram_table& other) = default;
template <typename Builder> ram_table<Builder>::ram_table(ram_table&& other) = default;
template <typename Builder> ram_table<Builder>& ram_table<Builder>::operator=(const ram_table& other) = default;
template <typename Builder> ram_table<Builder>& ram_table<Builder>::operator=(ram_table&& other) = default;

/**
 * @brief Read a field element from the RAM table at an index value
 *
 * @tparam Builder
 * @param index
 * @return field_t<Builder>
 */
template <typename Builder> field_t<Builder> ram_table<Builder>::read(const field_pt& index) const
{
    if (context == nullptr) {
        context = index.get_context();
    }
    const auto native_index = uint256_t(index.get_value());
    if (native_index >= length) {
        // set a failure when the index is out of bounds. another error will be thrown when we try to call
        // `read_RAM_array`.
        context->failure("ram_table: RAM array access out of bounds");
    }

    initialize_table();

    if (!check_indices_initialized()) {
        context->failure("ram_table must have initialized every RAM entry before the table can be read");
    }

    field_pt index_wire = index;
    if (index.is_constant()) {
        index_wire = field_pt::from_witness_index(context, context->put_constant_variable(index.get_value()));
    }

    uint32_t output_idx = context->read_RAM_array(ram_id, index_wire.get_witness_index());
    auto element = field_pt::from_witness_index(context, output_idx);

    const size_t cast_index = static_cast<size_t>(static_cast<uint64_t>(native_index));
    // If the index is legitimate, restore the tag
    if (native_index < length) {
        element.set_origin_tag(_tags[cast_index]);
    }
    return element;
}

/**
 * @brief Write a field element from the RAM table at an index value
 *
 * @tparam Builder
 * @param index
 * @param value
 *
 * @note This is used to write an already-existing RAM entry and also to initialize a not-yet-written RAM entry.
 */
template <typename Builder> void ram_table<Builder>::write(const field_pt& index, const field_pt& value)
{
    if (context == nullptr) {
        context = index.get_context();
    }

    if (uint256_t(index.get_value()) >= length) {
        // set a failure when the index is out of bounds. an error will be thrown when we try to call either
        // `init_RAM_element` or `write_RAM_array`.
        context->failure("ram_table: RAM array access out of bounds");
    }

    initialize_table();
    field_pt index_wire = index;
    const auto native_index = uint256_t(index.get_value());
    if (index.is_constant()) {
        // need to write/process every array element at constant indicies before doing reads/writes at prover-defined
        // indices
        index_wire.convert_constant_to_fixed_witness(context);
    } else {
        if (!check_indices_initialized()) {
            context->failure("ram_table must have initialized every RAM entry before a write can be performed");
        }
    }

    field_pt value_wire = value;
    auto native_value = value.get_value();
    if (value.is_constant()) {
        value_wire = field_pt::from_witness_index(context, context->put_constant_variable(native_value));
    }

    const size_t cast_index = static_cast<size_t>(static_cast<uint64_t>(native_index));
    if (index.is_constant() && !index_initialized[cast_index]) {
        context->init_RAM_element(ram_id, cast_index, value_wire.get_witness_index());

        index_initialized[cast_index] = true;
    } else {
        context->write_RAM_array(ram_id, index_wire.get_witness_index(), value_wire.get_witness_index());
    }
    // Update the value of the stored tag, if index is legitimate

    if (native_index < length) {
        _tags[cast_index] = value.get_origin_tag();
    }
}

template class ram_table<bb::UltraCircuitBuilder>;
template class ram_table<bb::MegaCircuitBuilder>;
} // namespace bb::stdlib
