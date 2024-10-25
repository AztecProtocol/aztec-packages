#include "barretenberg/vm/avm/trace/bytecode_trace.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"

namespace bb::avm_trace {
using poseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;
AvmBytecodeTraceBuilder::AvmBytecodeTraceBuilder(const std::vector<AvmContractBytecode>& all_contracts_bytecode)
    : all_contracts_bytecode(all_contracts_bytecode)
{}

std::vector<FF> AvmBytecodeTraceBuilder::pack_bytecode(const std::vector<uint8_t>& contract_bytes)
{
    // To make from_buffer<uint256_t> work properly, we need to make sure the contract is a multiple of 31 bytes
    // Otherwise we will end up over-reading the buffer
    size_t padding = 31 - (contract_bytes.size() % 31);
    // We dont want to mutate the original contract bytes, since we will (probably) need them later in the trace
    // unpadded
    std::vector<uint8_t> contract_bytes_padded = contract_bytes;
    contract_bytes_padded.resize(contract_bytes_padded.size() + padding, 0);
    std::vector<FF> contract_bytecode_fields;
    for (size_t i = 0; i < contract_bytes_padded.size(); i += 31) {
        uint256_t u256_elem = from_buffer<uint256_t>(contract_bytes_padded, i);
        // Drop the last byte
        contract_bytecode_fields.emplace_back(u256_elem >> 8);
    }
    return contract_bytecode_fields;
}

void AvmBytecodeTraceBuilder::build_bytecode_columns()
{
    // This is the main loop that will generate the bytecode trace
    for (auto& contract_bytecode : all_contracts_bytecode) {
        FF running_hash = FF::zero();
        auto packed_bytecode = pack_bytecode(contract_bytecode.bytecode);
        // This size is already based on the number of fields
        for (size_t i = 0; i < packed_bytecode.size(); ++i) {
            bytecode_trace.push_back(BytecodeTraceEntry{
                .packed_bytecode = packed_bytecode[i],
                .running_hash = running_hash,
                .bytecode_length_remaining = static_cast<uint16_t>(packed_bytecode.size() - i),
            });
            running_hash = poseidon2::hash({ packed_bytecode[i], running_hash });
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
