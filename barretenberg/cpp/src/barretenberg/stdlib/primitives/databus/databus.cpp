// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Khashayar], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "databus.hpp"
#include "../circuit_builders/circuit_builders.hpp"
#include "barretenberg/common/assert.hpp"

namespace bb::stdlib {

template <typename Builder>
void databus<Builder>::bus_vector::set_values(const std::vector<field_pt>& entries_in)
    requires IsMegaBuilder<Builder>
{
    // Set the context from the input entries
    for (const auto& entry : entries_in) {
        if (entry.get_context() != nullptr) {
            context = entry.get_context();
            break;
        }
    }
    // Enforce that builder context is known at this stage. Otherwise first read will fail if the index is a constant.
    BB_ASSERT(context != nullptr);

    // Single-writer-per-bus_idx: a second writer's reads would alias the first writer's rows
    // because read_bus_vector indexes the global column from row 0.
    BB_ASSERT_EQ(context->get_bus_vector(static_cast<size_t>(bus_idx)).size(),
                 static_cast<size_t>(0),
                 "bus_vector::set_values: bus_idx already written.");

    // Initialize the bus vector entries from the input entries which are un-normalized and possibly constants.
    // append_to_bus_vector creates a binding init-read for each appended entry. The bus column is not part of the
    // copy-constraint permutation, so this is what links bus_column[i] to its main-wire witness.
    for (const auto& entry : entries_in) {
        if (entry.is_constant()) { // create a constant witness from the constant
            auto const_var_idx = context->put_constant_variable(entry.get_value());
            entries.emplace_back(field_pt::from_witness_index(context, const_var_idx));
        } else { // normalize the raw entry
            entries.emplace_back(entry.normalize());
        }
        context->append_to_bus_vector(bus_idx, entries.back().get_witness_index());
    }
    length = entries.size();

    // Preserve tags to restore them in future reads (following the ROM/RAM pattern)
    _tags.resize(entries_in.size());
    for (size_t i = 0; i < length; ++i) {
        _tags[i] = entries_in[i].get_origin_tag();
    }
}

template <typename Builder>
field_t<Builder> databus<Builder>::bus_vector::operator[](const field_pt& index) const
    requires IsMegaBuilder<Builder>
{
    // Ensure the read is valid
    auto raw_index = static_cast<size_t>(uint256_t(index.get_value()).data[0]);
    BB_ASSERT_LT(raw_index, length, "bus_vector: access out of bounds");

    // The read index must be a witness; if constant, add it as a constant variable
    uint32_t index_witness_idx = 0;
    if (index.is_constant()) {
        index_witness_idx = context->put_constant_variable(index.get_value());
    } else {
        index_witness_idx = index.get_witness_index();
    }

    // Read from the bus vector at the specified index. Creates a single read gate
    uint32_t output_idx = context->read_bus_vector(bus_idx, index_witness_idx);
    auto result = field_pt::from_witness_index(context, output_idx);

    // If the index is legitimate, restore the tag (following the ROM/RAM pattern)
    if (raw_index < length) {
        result.set_origin_tag(_tags[raw_index]);
    }
    return result;
}

template class databus<bb::MegaCircuitBuilder>;
} // namespace bb::stdlib
