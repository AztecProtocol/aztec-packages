#pragma once

#include <utility>

#include "barretenberg/vm/avm/trace/common.hpp"
#include "barretenberg/vm/avm/trace/execution_hints.hpp"
namespace bb::avm_trace {

class AvmBytecodeTraceBuilder {
  public:
    struct BytecodeTraceEntry {
        // Calculate the bytecode hash
        FF packed_bytecode{};
        FF running_hash{};
        // This is the length in fields, not bytes - max 1000 fields
        uint16_t bytecode_length_remaining = 0;

        // Derive the class Id
        FF class_id{};

        // Derive the contract address
        FF contract_address{};
    };
    // These interfaces will change when we start feeding in more inputs and hints
    AvmBytecodeTraceBuilder(std::vector<std::vector<FF>> all_contracts_bytecode)
        : all_contracts_bytecode(std::move(all_contracts_bytecode))
    {}

    AvmBytecodeTraceBuilder(const std::vector<std::vector<uint8_t>>& all_contracts_bytecode_bytes)
    {
        for (const auto& contract_bytecode : all_contracts_bytecode_bytes) {
            std::vector<FF> contract_bytecode_fields;
            size_t num_fields_required =
                (contract_bytecode.size() / 31) + static_cast<size_t>(contract_bytecode.size() % 31 != 0);
            contract_bytecode_fields.reserve(num_fields_required);
            for (size_t i = 0; i < contract_bytecode.size(); i += 31) {
                auto field_elem = from_buffer<FF>(contract_bytecode.data(), i);
                contract_bytecode_fields.push_back(field_elem);
            }
            this->all_contracts_bytecode.push_back(contract_bytecode_fields);
        }
    }
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
