// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Raju], commit: 05a381f8b31ae4648e480f1369e911b148216e8b}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
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
template <> void create_block_constraints(UltraCircuitBuilder& builder, const BlockConstraint& constraint)
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
        process_ROM_operations(builder, constraint, init);
        break;
    case BlockType::RAM:
        process_RAM_operations(builder, constraint, init);
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
template <> void create_block_constraints(MegaCircuitBuilder& builder, const BlockConstraint& constraint)
{
    using field_ct = stdlib::field_t<MegaCircuitBuilder>;

    std::vector<field_ct> init;
    init.reserve(constraint.init.size());
    for (const auto idx : constraint.init) {
        init.push_back(field_ct::from_witness_index(&builder, idx));
    }

    switch (constraint.type) {
    case BlockType::ROM: {
        process_ROM_operations(builder, constraint, init);
    } break;
    case BlockType::RAM: {
        process_RAM_operations(builder, constraint, init);
    } break;
    case BlockType::CallData: {
        process_call_data_operations(builder, constraint, init);
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
                            std::vector<bb::stdlib::field_t<Builder>>& init)
{
    using field_ct = stdlib::field_t<Builder>;
    using rom_table_ct = stdlib::rom_table<Builder>;

    rom_table_ct table(&builder, init);
    for (const auto& op : constraint.trace) {
        field_ct value = field_ct::from_witness_index(&builder, op.value);
        field_ct index = field_ct::from_witness_index(&builder, op.index);

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
                            std::vector<bb::stdlib::field_t<Builder>>& init)
{
    using field_ct = stdlib::field_t<Builder>;
    using ram_table_ct = stdlib::ram_table<Builder>;

    ram_table_ct table(&builder, init);
    for (const auto& op : constraint.trace) {
        field_ct value = field_ct::from_witness_index(&builder, op.value);
        field_ct index = field_ct::from_witness_index(&builder, op.index);

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
            field_ct value = field_ct::from_witness_index(&builder, op.value);
            field_ct index = field_ct::from_witness_index(&builder, op.index);

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

    // Process kernel or app calldata based on the ACIR calldata id. Id 0 is kernel calldata; app calldata ids start at
    // 1 and map directly onto app_calldata[id - 1].
    const auto calldata_id = static_cast<uint32_t>(constraint.calldata_id);
    if (calldata_id == static_cast<uint32_t>(CallDataType::KernelCalldata)) {
        process_calldata(databus.kernel_calldata);
    } else {
        const size_t app_calldata_idx = calldata_id - /*shift by kernel calldata*/ 1;
        BB_ASSERT_LT(app_calldata_idx, MAX_APPS_PER_KERNEL, "Databus app calldata index out of bounds");
        process_calldata(databus.app_calldata[app_calldata_idx]);
    }
}

template <typename Builder>
void process_return_data_operations(Builder& builder,
                                    const BlockConstraint& constraint,
                                    std::vector<bb::stdlib::field_t<Builder>>& init)
{
    using databus_ct = stdlib::databus<Builder>;
    // set_values populates the return-data bus column and creates one busread per slot.
    BB_ASSERT_EQ(constraint.trace.size(), 0U, "Return data opcodes should have empty traces");

    databus_ct databus;

    databus.return_data.set_context(&builder);
    databus.return_data.set_values(init);
}

} // namespace acir_format
