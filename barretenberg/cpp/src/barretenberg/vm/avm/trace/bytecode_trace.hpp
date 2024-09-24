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
    // These interfaces will change when we start feeding in more inputs and hints
    AvmBytecodeTraceBuilder(const std::vector<uint8_t>& contract_bytecode, const ExecutionHints& hints);

    size_t size() const { return bytecode_trace.size(); }
    void reset();
    void finalize(std::vector<AvmFullRow<FF>>& main_trace);

    void build_bytecode_columns();

  private:
    std::vector<BytecodeTraceEntry> bytecode_trace;
    // This will contain the bytecode as field elements
    std::vector<std::vector<FF>> all_contracts_bytecode;
    // TODO: Come back to this
    // VmPublicInputs public_inputs;
    // ExecutionHints hints;
};
} // namespace bb::avm_trace
