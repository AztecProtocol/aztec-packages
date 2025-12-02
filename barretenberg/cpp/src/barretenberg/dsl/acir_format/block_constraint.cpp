// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "block_constraint.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/stdlib/primitives/databus/databus.hpp"
#include "barretenberg/stdlib/primitives/memory/ram_table.hpp"
#include "barretenberg/stdlib/primitives/memory/rom_table.hpp"

namespace acir_format {

using namespace bb;

/**
 * @brief Create block constraints; Specialization for Ultra arithmetization
 * @details Ultra does not support DataBus operations
 *
 */
template <>
void create_block_constraints(UltraCircuitBuilder& builder,
                              const BlockConstraint& constraint,
                              bool has_valid_witness_assignments)
{
    using field_ct = bb::stdlib::field_t<UltraCircuitBuilder>;

    std::vector<field_ct> init;
    init.reserve(constraint.init.size());
    for (const auto idx : constraint.init) {
        init.push_back(field_ct::from_witness_index(&builder, idx));
    }

    switch (constraint.type) {
    // Note: CallData/ReturnData require DataBus, which is only available in Mega and in particular is _not_ supported
    // by Ultra. If we encounter them in an Ultra circuit, we return an error.
    case BlockType::ROM:
        process_ROM_operations(builder, constraint, has_valid_witness_assignments, init);
        break;
    case BlockType::RAM:
        process_RAM_operations(builder, constraint, has_valid_witness_assignments, init);
        break;
    case BlockType::CallData:
    case BlockType::ReturnData:
        bb::assert_failure(
            "UltraCircuitBuilder (standalone Noir application) does not support CallData/ReturnData "
            "block constraints. Use MegaCircuitBuilder (Aztec app) or fall back to RAM and ROM operations.");
        break;
    default:
        bb::assert_failure("Unexpected block constraint type.");
        break;
    }
}

/**
 * @brief Create block constraints; Specialization for Mega arithmetization
 *
 */
template <>
void create_block_constraints(MegaCircuitBuilder& builder,
                              const BlockConstraint& constraint,
                              bool has_valid_witness_assignments)
{
    using field_ct = stdlib::field_t<MegaCircuitBuilder>;

    std::vector<field_ct> init;
    init.reserve(constraint.init.size());
    for (const auto idx : constraint.init) {
        init.push_back(field_ct::from_witness_index(&builder, idx));
    }

    switch (constraint.type) {
    case BlockType::ROM: {
        process_ROM_operations(builder, constraint, has_valid_witness_assignments, init);
    } break;
    case BlockType::RAM: {
        process_RAM_operations(builder, constraint, has_valid_witness_assignments, init);
    } break;
    case BlockType::CallData: {
        process_call_data_operations(builder, constraint, has_valid_witness_assignments, init);
    } break;
    case BlockType::ReturnData: {
        process_return_data_operations(builder, constraint, init);
    } break;
    default:
        bb::assert_failure("Unexpected block constraint type.");
        break;
    }
}

template <typename Builder>
void process_ROM_operations(Builder& builder,
                            const BlockConstraint& constraint,
                            bool has_valid_witness_assignments,
                            std::vector<bb::stdlib::field_t<Builder>>& init)
{
    using field_ct = stdlib::field_t<Builder>;
    using rom_table_ct = stdlib::rom_table<Builder>;

    rom_table_ct table(&builder, init);
    for (const auto& op : constraint.trace) {
        field_ct value = to_field_ct(op.value, builder);
        field_ct index = to_field_ct(op.index, builder);

        // In case of invalid witness assignment, we set the value of index value to zero to not hit out of bound in
        // ROM table
        if (!has_valid_witness_assignments && !index.is_constant()) {
            builder.set_variable(index.get_witness_index(), 0);
        }

        switch (op.access_type) {
        case AccessType::Read:
            value.assert_equal(table[index]);
            break;
        default:
            bb::assert_failure("Invalid AccessType for ROM memory operation.");
            break;
        }
    }
}

template <typename Builder>
void process_RAM_operations(Builder& builder,
                            const BlockConstraint& constraint,
                            bool has_valid_witness_assignments,
                            std::vector<bb::stdlib::field_t<Builder>>& init)
{
    using field_ct = stdlib::field_t<Builder>;
    using ram_table_ct = stdlib::ram_table<Builder>;

    ram_table_ct table(&builder, init);
    for (const auto& op : constraint.trace) {
        field_ct value = to_field_ct(op.value, builder);
        field_ct index = to_field_ct(op.index, builder);

        // In case of invalid witness assignment, we set the value of index value to zero to not hit an out-of-bounds
        // index in the RAM table
        if (!has_valid_witness_assignments && !index.is_constant()) {
            builder.set_variable(index.get_witness_index(), 0);
        }

        switch (op.access_type) {
        case AccessType::Read:
            value.assert_equal(table.read(index));
            break;
        case AccessType::Write:
            table.write(index, value);
            break;
        default:
            bb::assert_failure("Invalid AccessType for RAM memory operation.");
            break;
        }
    }
}

template <typename Builder>
void process_call_data_operations(Builder& builder,
                                  const BlockConstraint& constraint,
                                  bool has_valid_witness_assignments,
                                  std::vector<bb::stdlib::field_t<Builder>>& init)
{
    using field_ct = stdlib::field_t<Builder>;
    using databus_ct = stdlib::databus<Builder>;

    databus_ct databus;

    // Method for processing operations on a generic databus calldata array
    auto process_calldata = [&](auto& calldata_array) {
        calldata_array.set_context(&builder);
        calldata_array.set_values(init); // Initialize the data in the bus array

        for (const auto& op : constraint.trace) {
            field_ct value = to_field_ct(op.value, builder);
            field_ct index = to_field_ct(op.index, builder);

            // In case of invalid witness assignment, we set the value of index value to zero to not hit out of bound in
            // ROM table
            if (!has_valid_witness_assignments && !index.is_constant()) {
                builder.set_variable(index.get_witness_index(), 0);
            }

            switch (op.access_type) {
            case AccessType::Read:
                value.assert_equal(calldata_array[index]);
                break;
            default:
                bb::assert_failure("Invalid AccessType for CallData memory operation.");
                break;
            }
        }
    };

    // Process primary or secondary calldata based on calldata_id
    switch (constraint.calldata_id) {
    case CallDataType::Primary:
        process_calldata(databus.calldata);
        break;
    case CallDataType::Secondary:
        process_calldata(databus.secondary_calldata);
        break;
    default:
        bb::assert_failure("Databus only supports two calldata arrays.");
        break;
    }
}

template <typename Builder>
void process_return_data_operations(Builder& builder,
                                    const BlockConstraint& constraint,
                                    std::vector<bb::stdlib::field_t<Builder>>& init)
{
    using databus_ct = stdlib::databus<Builder>;
    // Return data opcodes simply copy the data from the initialization vector to the return data vector in the databus.
    // There is no operation happening.
    BB_ASSERT_EQ(constraint.trace.size(), 0U, "Return data opcodes should have empty traces");

    databus_ct databus;

    databus.return_data.set_context(&builder);
    // Populate the returndata in the databus
    databus.return_data.set_values(init);
    // For each entry of the return data, explicitly assert equality with the initialization value. This implicitly
    // creates the return data read gates that are required to connect witness values in the main wires to witness
    // values in the databus return data column.
    size_t c = 0;
    for (const auto& value : init) {
        value.assert_equal(databus.return_data[c]);
        c++;
    }
}

} // namespace acir_format
