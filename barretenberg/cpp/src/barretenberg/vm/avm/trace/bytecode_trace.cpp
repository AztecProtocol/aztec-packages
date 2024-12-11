#include "barretenberg/vm/avm/trace/bytecode_trace.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/vm/aztec_constants.hpp"

namespace bb::avm_trace {

using poseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;
using Point = grumpkin::g1::affine_element;

/**************************************************************************************************
 *                                   HELPERS
 **************************************************************************************************/
/**
 * @brief Computes the address of a contract instance given the contract instance hint
 *        The address is computed as follows:
 *        1. Compute the salted initialization hash: H(PARTIAL_ADDRESS, salt, initialization_hash, deployer_addr)
 *        2. Compute the partial address: H(PARTIAL_ADDRESS, contract_class_id, salted_initialization_hash)
 *        3. Compute the "flat" public keys hash: H(PUBLIC_KEYS_HASH, public_keys)
 *        4. Compute h (also called the pre-address in ts): H(GENERATOR_INDEX__CONTRACT_ADDRESS_V1, public_keys_hash,
 * partial_address)
 *        4. Compute the address: h * G + public_key.ivk, where G is the generator of the grumpkin curve
 * @param contract_instance the hinted contract instance
 *
 * @return FF The aztec address of the contract instance
 */
// TODO: Handling of point at infinity is still a bb <> ts pain point, we need to make sure we are consistent
FF AvmBytecodeTraceBuilder::compute_address_from_instance(const ContractInstanceHint& contract_instance)
{
    FF salted_initialization_hash = poseidon2::hash({ GENERATOR_INDEX__PARTIAL_ADDRESS,
                                                      contract_instance.salt,
                                                      contract_instance.initialisation_hash,
                                                      contract_instance.deployer_addr });
    FF partial_address = poseidon2::hash(
        { GENERATOR_INDEX__PARTIAL_ADDRESS, contract_instance.contract_class_id, salted_initialization_hash });

    std::vector<FF> public_keys_hash_fields = contract_instance.public_keys.to_fields();
    std::vector<FF> public_key_hash_vec{ GENERATOR_INDEX__PUBLIC_KEYS_HASH };
    for (size_t i = 0; i < public_keys_hash_fields.size(); i += 2) {
        public_key_hash_vec.push_back(public_keys_hash_fields[i]);
        public_key_hash_vec.push_back(public_keys_hash_fields[i + 1]);
        // Is it guaranteed we wont get a point at infinity here?
        public_key_hash_vec.push_back(FF::zero());
    }
    FF public_keys_hash = poseidon2::hash({ public_key_hash_vec });

    FF h = poseidon2::hash({ GENERATOR_INDEX__CONTRACT_ADDRESS_V1, public_keys_hash, partial_address });
    // This is safe since BN254_Fr < GRUMPKIN_Fr so we know there is no modulo reduction
    grumpkin::fr h_fq = grumpkin::fr(h);
    return (grumpkin::g1::affine_one * h_fq + contract_instance.public_keys.incoming_viewing_key).x;
}

FF AvmBytecodeTraceBuilder::compute_contract_class_id(const FF& artifact_hash,
                                                      const FF& private_fn_root,
                                                      const FF& public_bytecode_commitment)
{
    return poseidon2::hash(
        { GENERATOR_INDEX__CONTRACT_LEAF, artifact_hash, private_fn_root, public_bytecode_commitment });
}

// Helpder to encode the contract bytecode into chunks of field sized elements
std::vector<FF> AvmBytecodeTraceBuilder::encode_bytecode(const std::vector<uint8_t>& contract_bytes)
{
    // To make from_buffer<uint256_t> work properly, we need to make sure the contract is a multiple of 31 bytes
    // Otherwise we will end up over-reading the buffer
    size_t padded_size = 31 * ((contract_bytes.size() + 30) / 31);
    // We dont want to mutate the original contract bytes, since we will (probably) need them later in the trace
    // unpadded
    std::vector<uint8_t> contract_bytes_padded = contract_bytes;
    contract_bytes_padded.resize(padded_size, 0);
    std::vector<FF> contract_bytecode_fields;
    for (size_t i = 0; i < contract_bytes_padded.size(); i += 31) {
        uint256_t u256_elem = from_buffer<uint256_t>(contract_bytes_padded, i);
        // Drop the last byte
        contract_bytecode_fields.emplace_back(u256_elem >> 8);
    }
    return contract_bytecode_fields;
}

// Compute the public bytecode commitment from a given contract bytecode
FF AvmBytecodeTraceBuilder::compute_public_bytecode_commitment(const std::vector<uint8_t>& contract_bytes)
{
    std::vector<FF> contract_bytecode_fields = encode_bytecode(contract_bytes);
    FF running_hash = FF::zero();
    for (auto& contract_bytecode_field : contract_bytecode_fields) {
        running_hash = poseidon2::hash({ contract_bytecode_field, running_hash });
    }
    return running_hash;
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
                .bytecode_field_length_remaining = static_cast<uint16_t>(field_encoded_bytecode.size() - i),
            });
            // We pair-wise hash the i-th bytecode field with the running hash (which is the output of previous i-1
            // round). I.e.
            // initially running_hash = 0,
            // the first round is running_hash = hash(bytecode[0], running_hash),
            // the second round is running_hash = hash(bytecode[1],running_hash), and so on.
            running_hash = poseidon2::hash({ field_encoded_bytecode[i], running_hash });
        }
        // Now running_hash actually contains the bytecode hash
        BytecodeHashTraceEntry last_entry;
        last_entry.bytecode_field_length_remaining = 0;
        last_entry.running_hash = running_hash;
        // Assert that the computed bytecode hash is the same as what we received as the hint
        ASSERT(running_hash == contract_bytecode.contract_class_id_preimage.public_bytecode_commitment);

        last_entry.class_id = compute_contract_class_id(contract_bytecode.contract_class_id_preimage.artifact_hash,
                                                        contract_bytecode.contract_class_id_preimage.private_fn_root,
                                                        running_hash);
        // Assert that the computed class id is the same as what we received as the hint
        ASSERT(last_entry.class_id == contract_bytecode.contract_instance.contract_class_id);

        last_entry.contract_address = compute_address_from_instance(contract_bytecode.contract_instance);
        // Assert that the computed contract address is the same as what we received as the hint
        ASSERT(last_entry.contract_address == contract_bytecode.contract_instance.address);
    }
}

void AvmBytecodeTraceBuilder::finalize(std::vector<AvmFullRow<FF>>& main_trace)
{
    for (size_t i = 0; i < bytecode_hash_trace.size(); i++) {
        auto const& src = bytecode_hash_trace.at(i);
        auto& dest = main_trace.at(i);
        dest.bytecode_running_hash = src.running_hash;
        dest.bytecode_length_remaining = src.bytecode_field_length_remaining;
        dest.bytecode_as_fields = src.field_encoded_bytecode;
        dest.bytecode_end_latch = src.bytecode_field_length_remaining == 0 ? FF::one() : FF::zero();
    }

    // We should probably combine this step with the previous one
    size_t row_index = 0;
    for (auto& bytecode : all_contracts_bytecode) {
        // Reset the byte index for each contract
        uint32_t byte_index = 0;
        for (auto& byte : bytecode.bytecode) {
            main_trace.at(row_index).bytecode_bytes = byte;
            main_trace.at(row_index).bytecode_bytes_pc = byte_index;
            row_index++;
        }
    }
}

} // namespace bb::avm_trace
