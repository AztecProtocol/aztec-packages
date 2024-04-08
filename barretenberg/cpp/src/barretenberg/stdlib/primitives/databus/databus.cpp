#include "databus.hpp"
#include "../circuit_builders/circuit_builders.hpp"

namespace bb::stdlib {

template <typename Builder> void databus<Builder>::bus_vector::set_values(const std::vector<field_pt>& entries_in)
{
    raw_entries = entries_in;
    length = raw_entries.size();
}

template <typename Builder> void databus<Builder>::bus_vector::initialize() const
{
    ASSERT(!initialized);
    ASSERT(context != nullptr);
    // Populate the bus vector entries from raw entries
    for (const auto& entry : raw_entries) {
        if (entry.is_constant()) { // create a non-constant witness from the constant witness
            auto const_var_idx = context->put_constant_variable(entry.get_value());
            entries.emplace_back(field_pt::from_witness_index(context, const_var_idx));
        } else { // normalize the raw entry
            entries.emplace_back(entry.normalize());
        }
        // Add the entry to the bus vector data
        context->append_to_bus_vector(bus_idx, entries.back().get_witness_index());
    }

    initialized = true;
}

template <typename Builder> field_t<Builder> databus<Builder>::bus_vector::operator[](const size_t index) const
{
    if (index >= length) {
        ASSERT(context != nullptr);
        context->failure("bus_vector: access out of bounds");
    }
    return entries[index];
}

template <typename Builder> field_t<Builder> databus<Builder>::bus_vector::operator[](const field_pt& index) const
{
    auto raw_index = static_cast<size_t>(uint256_t(index.get_value()).data[0]);
    if (index.is_constant()) {
        return operator[](raw_index);
    }
    if (context == nullptr) {
        context = index.get_context();
    }
    if (raw_index >= length) {
        context->failure("bus_vector: access out of bounds");
    }

    if (!initialized) {
        initialize();
    }

    uint32_t output_idx = context->read_bus_vector(bus_idx, index.normalize().get_witness_index());
    return field_pt::from_witness_index(context, output_idx);
}

template class databus<bb::GoblinUltraCircuitBuilder>;
} // namespace bb::stdlib