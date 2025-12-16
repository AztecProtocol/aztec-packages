// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/dsl/acir_format/witness_constant.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include <cstdint>
#include <vector>

namespace acir_format {

enum AccessType : std::uint8_t {
    Read = 0,
    Write = 1,
};

enum CallDataType : std::uint8_t {
    None = 0,
    Primary = 1,
    Secondary = 2,
};

/**
 * @brief Memory operation. Index and value store the index of the memory location, and value is the value to be read or
 * written.
 */
struct MemOp {
    AccessType access_type;
    WitnessOrConstant<bb::fr> index;
    WitnessOrConstant<bb::fr> value;
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
 *          4. calldata_id (used only for CallData) indicates whether we are operating on primary (kernel) or secondary
 *             (app) calldata
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
