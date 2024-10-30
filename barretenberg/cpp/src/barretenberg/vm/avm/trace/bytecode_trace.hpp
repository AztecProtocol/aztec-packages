#pragma once

#include <utility>

#include "barretenberg/vm/avm/trace/common.hpp"
#include "barretenberg/vm/avm/trace/execution_hints.hpp"

namespace bb::avm_trace {

class AvmBytecodeTraceBuilder {
  public:
    struct BytecodeByteTraceEntry {
        FF bytecode_byte{};
        // In future selectors that aid in packing and decomposing
    };
    struct BytecodeHashTraceEntry {
        // The field encoded bytecode
        FF field_encoded_bytecode{};
        // Calculate the bytecode hash
        FF running_hash{};
        // This is the length in fields, not bytes - max 3000 fields
        uint16_t bytecode_field_length_remaining = 0;

        // Derive the class Id
        FF arifact_hash{};
        FF private_fn_root{};
        FF class_id{};

        // Derive the contract address
        FF salt{};
        FF initialization_hash{};
        FF deployer_addr{};
        FF public_key_hash{};
        FF contract_address{};
    };
    // These interfaces will change when we start feeding in more inputs and hints
    AvmBytecodeTraceBuilder(const std::vector<AvmContractBytecode>& all_contracts_bytecode);
    AvmBytecodeTraceBuilder() = default;

    size_t size() const { return bytecode_hash_trace.size(); }
    size_t total_bytecode_length() const;
    void reset();
    void finalize(std::vector<AvmFullRow<FF>>& main_trace);

    void build_bytecode_hash_columns();

    static FF compute_public_bytecode_commitment(const std::vector<uint8_t>& contract_bytes);
    static FF compute_address_from_instance(const ContractInstanceHint& contract_instance);
    static FF compute_contract_class_id(const FF& artifact_hash,
                                        const FF& private_fn_root,
                                        const FF& public_bytecode_commitment);

  private:
    // Encodes the bytecode into field elements (chunks of 31 bytes)
    static std::vector<FF> encode_bytecode(const std::vector<uint8_t>& contract_bytes);
    std::vector<BytecodeHashTraceEntry> bytecode_hash_trace;
    // The first element is the main top-level contract, the rest are external calls
    std::vector<AvmContractBytecode> all_contracts_bytecode;
};
} // namespace bb::avm_trace
