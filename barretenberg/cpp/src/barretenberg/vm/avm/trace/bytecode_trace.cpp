#include "barretenberg/vm/avm/trace/bytecode_trace.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"

namespace bb::avm_trace {
using poseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;
AvmBytecodeTraceBuilder::AvmBytecodeTraceBuilder(const std::vector<uint8_t>& contract_bytecode,
                                                 const ExecutionHints& hints)
{
    // Do we need to pad contract_bytecode to be 31bytes?
    std::vector<std::vector<uint8_t>> all_contracts_bytecode{ contract_bytecode };
    for (const auto& hint : hints.externalcall_hints) {
        all_contracts_bytecode.push_back(hint.bytecode);
    }
    for (auto& contract : all_contracts_bytecode) {
        // To make from_buffer<uint256_t> work properly, we need to make sure the contract is a multiple of 31 bytes
        // Otherwise we will end up over-reading the buffer
        size_t padding = 31 - (contract.size() % 31);
        contract.resize(contract.size() + padding, 0);
        std::vector<FF> contract_bytecode_fields;
        for (size_t i = 0; i < contract.size(); i += 31) {
            uint256_t u256_elem = from_buffer<uint256_t>(contract, i);
            // Drop the last byte
            contract_bytecode_fields.emplace_back(u256_elem >> 8);
        }
        this->all_contracts_bytecode.push_back(contract_bytecode_fields);
    }
}

void AvmBytecodeTraceBuilder::build_bytecode_columns()
{
    for (auto& contract_bytecode : all_contracts_bytecode) {
        FF running_hash = FF::zero();
        // This size is already based on the number of fields
        for (size_t i = 0; i < contract_bytecode.size(); ++i) {
            bytecode_trace.push_back(BytecodeTraceEntry{
                .packed_bytecode = contract_bytecode[i],
                .running_hash = running_hash,
                .bytecode_length_remaining = static_cast<uint16_t>(contract_bytecode.size() - i),
            });
            running_hash = poseidon2::hash({ contract_bytecode[i], running_hash });
        }
        // Now running_hash actually contains the bytecode hash
        BytecodeTraceEntry last_entry;
        last_entry.running_hash = running_hash;
        last_entry.bytecode_length_remaining = 0;
        // TODO: Come back to this later
        // last_entry.class_id = _
        // last_entry.contract_address = _
    }
}

void AvmBytecodeTraceBuilder::finalize(std::vector<AvmFullRow<FF>>& main_trace)
{
    for (size_t i = 0; i < bytecode_trace.size(); i++) {
        auto const& src = bytecode_trace.at(i);
        auto& dest = main_trace.at(i);
        dest.bytecode_running_hash = src.running_hash;
        dest.bytecode_length_remaining = src.bytecode_length_remaining;
        dest.bytecode_packed = src.packed_bytecode;
        dest.bytecode_end_latch = src.bytecode_length_remaining == 0 ? FF::one() : FF::zero();
    }
}

} // namespace bb::avm_trace
