#pragma once

#include <utility>

#include "barretenberg/vm/avm/trace/common.hpp"
#include "barretenberg/vm/avm/trace/execution_hints.hpp"
namespace bb::avm_trace {

class AvmBytecodeTraceBuilder {
  public:
    struct BytecodeTraceEntry {
        // The field packed bytecode
        FF packed_bytecode{};
        // Calculate the bytecode hash
        FF running_hash{};
        // This is the length in fields, not bytes - max 3000 fields
        uint16_t bytecode_length_remaining = 0;

        // Derive the class Id
        FF class_id{};

        // Derive the contract address
        FF contract_address{};
    };
    AvmBytecodeTraceBuilder() = default;
    // These interfaces will change when we start feeding in more inputs and hints
    AvmBytecodeTraceBuilder(const std::vector<std::vector<uint8_t>>& all_contracts_bytecode);

    size_t size() const { return bytecode_trace.size(); }
    void reset();
    void finalize(std::vector<AvmFullRow<FF>>& main_trace);

    void build_bytecode_columns();

  private:
    // Converts the bytecode into field elements (chunks of 31 bytes)
    static std::vector<FF> pack_bytecode(const std::vector<uint8_t>& contract_bytes);

    std::vector<BytecodeTraceEntry> bytecode_trace;
    // The first element is the main top-level contract, the rest are external calls
    std::vector<std::vector<uint8_t>> all_contracts_bytecode;
    // TODO: Come back to this
    // VmPublicInputs public_inputs;
    // ExecutionHints hints;
};
} // namespace bb::avm_trace
