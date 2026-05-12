// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Raju], commit: 05a381f8b31ae4648e480f1369e911b148216e8b}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/constants.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include <cstdint>
#include <vector>

namespace acir_format {

enum AccessType : std::uint8_t {
    Read = 0,
    Write = 1,
};

enum CallDataType : std::uint32_t {
    KernelCalldata = 0,
    FirstAppCalldata = 1,
    SecondAppCalldata = 2,
    ThirdAppCalldata = 3,
    None = bb::MAX_APPS_PER_KERNEL + 1, // Used for non-calldata blocks
};

/**
 * @brief Memory operation. `index` is the witness index of the memory location, and `value` is the witness index of the
 * value to be read or written.
 */
struct MemOp {
    AccessType access_type;
    uint32_t index;
    uint32_t value;
};

enum BlockType : std::uint8_t {
    ROM = 0,
    RAM = 1,
    CallData = 2,
    ReturnData = 3,
};

/**
 * @brief Struct holding the data required to add memory constraints to a circuit.
 *
 * @details 1. init holds the initial values of the RAM/ROM/CallData/ReturnData table
 *          2. trace holds the sequence of memory operations (reads/writes) performed on the table
 *          3. type indicates the type of memory being constrained (RAM/ROM/CallData/ReturnData)
 *          4. calldata_id (used only for CallData) indicates whether we are operating on kernel calldata or an app
 *             calldata slot. The kernel calldata id is 0, app calldata ids are in [1, MAX_APPS_PER_KERNEL].
 */
struct BlockConstraint {
    std::vector<uint32_t> init;
    std::vector<MemOp> trace;
    BlockType type;
    CallDataType calldata_id;
};

template <typename Builder> void create_block_constraints(Builder& builder, const BlockConstraint& constraint);

template <typename Builder>
void process_ROM_operations(Builder& builder,
                            const BlockConstraint& constraint,
                            std::vector<bb::stdlib::field_t<Builder>>& init);
template <typename Builder>
void process_RAM_operations(Builder& builder,
                            const BlockConstraint& constraint,
                            std::vector<bb::stdlib::field_t<Builder>>& init);
template <typename Builder>
void process_call_data_operations(Builder& builder,
                                  const BlockConstraint& constraint,
                                  std::vector<bb::stdlib::field_t<Builder>>& init);
template <typename Builder>
void process_return_data_operations(Builder& builder,
                                    const BlockConstraint& constraint,
                                    std::vector<bb::stdlib::field_t<Builder>>& init);
} // namespace acir_format
