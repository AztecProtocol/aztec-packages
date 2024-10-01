#include "barretenberg/vm/avm/trace/bytecode_trace.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"

namespace bb::avm_trace {

// These separators can be added to the constants file, but it's a bit finicky since there are the GENERATOR_INDEX ones
// We can migrate these once they are finalised as part of contract address derivation
const FF PARTIAL_ADDRESS = 27;
const FF CONTRACT_ADDRESS_V1 = 15;
const FF CONTRACT_LEAF = 16;

using poseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

/**************************************************************************************************
 *                                   HELPERS
 **************************************************************************************************/
FF AvmBytecodeTraceBuilder::compute_address_from_instance(ContractInstanceHint contract_instance)
{
    FF salted_initialization_hash = poseidon2::hash({ PARTIAL_ADDRESS,
                                                      contract_instance.salt,
                                                      contract_instance.initialisation_hash,
                                                      contract_instance.deployer_addr });
    FF partial_address =
        poseidon2::hash({ PARTIAL_ADDRESS, contract_instance.contract_class_id, salted_initialization_hash });
    return poseidon2::hash({ CONTRACT_ADDRESS_V1, contract_instance.public_key_hash, partial_address });
}

FF AvmBytecodeTraceBuilder::compute_contract_class_id(FF artifact_hash,
                                                      FF private_fn_root,
                                                      FF public_bytecode_commitment)
{
    return poseidon2::hash({ CONTRACT_LEAF, artifact_hash, private_fn_root, public_bytecode_commitment });
}

std::vector<FF> AvmBytecodeTraceBuilder::encode_bytecode(const std::vector<uint8_t>& contract_bytes)
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

size_t AvmBytecodeTraceBuilder::total_bytecode_length() const
{
    return std::accumulate(all_contracts_bytecode.begin(),
                           all_contracts_bytecode.end(),
                           static_cast<size_t>(0),
                           [](size_t acc, auto& contract) { return acc + contract.bytecode.size(); });
}

/**************************************************************************************************
 *                                   CONSTRUCTOR
 **************************************************************************************************/
AvmBytecodeTraceBuilder::AvmBytecodeTraceBuilder(const std::vector<AvmContractBytecode>& all_contracts_bytecode)
    : all_contracts_bytecode(all_contracts_bytecode)
{}

/**************************************************************************************************
 *                                   BUILD BYTECODE TRACE
 **************************************************************************************************/

void AvmBytecodeTraceBuilder::build_bytecode_hash_columns()
{
    // This is the main loop that will generate the bytecode trace
    for (auto& contract_bytecode : all_contracts_bytecode) {
        FF running_hash = FF::zero();
        auto field_encoded_bytecode = encode_bytecode(contract_bytecode.bytecode);
        // This size is already based on the number of fields
        for (size_t i = 0; i < field_encoded_bytecode.size(); ++i) {
            bytecode_hash_trace.push_back(BytecodeHashTraceEntry{
                .field_encoded_bytecode = field_encoded_bytecode[i],
                .running_hash = running_hash,
                .bytecode_length_remaining = static_cast<uint16_t>(field_encoded_bytecode.size() - i),
            });
            running_hash = poseidon2::hash({ field_encoded_bytecode[i], running_hash });
        }
        // Now running_hash actually contains the bytecode hash
        BytecodeHashTraceEntry last_entry;
        last_entry.bytecode_length_remaining = 0;
        last_entry.running_hash = running_hash;
        ASSERT(running_hash == contract_bytecode.contract_class_id_preimage.public_bytecode_commitment);

        last_entry.class_id = compute_contract_class_id(contract_bytecode.contract_class_id_preimage.artifact_hash,
                                                        contract_bytecode.contract_class_id_preimage.private_fn_root,
                                                        running_hash);
        ASSERT(last_entry.class_id == contract_bytecode.contract_instance.contract_class_id);

        last_entry.contract_address = compute_address_from_instance(contract_bytecode.contract_instance);
        ASSERT(last_entry.contract_address == contract_bytecode.contract_instance.address);
    }
}

void AvmBytecodeTraceBuilder::finalize(std::vector<AvmFullRow<FF>>& main_trace)
{
    for (size_t i = 0; i < bytecode_hash_trace.size(); i++) {
        auto const& src = bytecode_hash_trace.at(i);
        auto& dest = main_trace.at(i);
        dest.bytecode_running_hash = src.running_hash;
        dest.bytecode_length_remaining = src.bytecode_length_remaining;
        dest.bytecode_as_fields = src.field_encoded_bytecode;
        dest.bytecode_end_latch = src.bytecode_length_remaining == 0 ? FF::one() : FF::zero();
    }

    // We should probably combine this step with the previous one
    size_t row_index = 0;
    for (auto& bytecode : all_contracts_bytecode) {
        // Reset the byte index for each contract
        uint32_t byte_index = 0;
        for (auto& byte : bytecode.bytecode) {
            main_trace.at(row_index).bytecode_bytes = byte;
            main_trace.at(row_index).bytecode_bytes_pc = byte_index;
        }
        // The row index will match up with the clk
        row_index += bytecode.bytecode.size();
    }
}

} // namespace bb::avm_trace
