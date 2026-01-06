#include "barretenberg/avm_fuzzer/mutations/bytecode.hpp"

#include "barretenberg/avm_fuzzer/fuzz_lib/constants.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"

extern "C" size_t LLVMFuzzerMutate(uint8_t* Data, size_t Size, size_t MaxSize);

namespace bb::avm2::fuzzer {

void mutate_bytecode(std::vector<ContractClass>& contract_classes,
                     std::vector<ContractInstance>& contract_instances,
                     const std::vector<AztecAddress>& contract_addresses,
                     std::vector<bb::crypto::merkle_tree::PublicDataLeafValue>& public_data_writes,
                     std::mt19937_64& rng)
{
    using Poseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

    // Skip if no contracts to mutate
    if (contract_classes.empty()) {
        return;
    }

    // Select a random contract
    size_t idx = std::uniform_int_distribution<size_t>(0, contract_classes.size() - 1)(rng);

    ContractClass& klass = contract_classes[idx];
    ContractInstance& instance = contract_instances[idx];
    const AztecAddress& address = contract_addresses[idx];

    // Copy bytecode and mutate it, we allow the default byte-wise fuzzing strategy to modify the
    // bytecode, including expanding or shrinking it.
    std::vector<uint8_t> bytecode = klass.packed_bytecode;
    size_t original_size = bytecode.size();
    size_t max_size = original_size * 2; // Allow growth up to 2x original size
    // We have to resize before calling LLVMFuzzerMutate to ensure there's enough space without writing OOB
    // We have to resize after so that the vector's metadata is correct
    // LLVMFuzzerMutate is a C function that operates on raw pointers
    bytecode.resize(max_size);
    size_t new_size = LLVMFuzzerMutate(bytecode.data(), original_size, max_size);
    bytecode.resize(new_size); // We need to resize here in case it shrunk

    // Compute new bytecode commitment and class ID
    FF new_bytecode_commitment = simulation::compute_public_bytecode_commitment(bytecode);
    FF new_class_id = simulation::compute_contract_class_id(
        klass.artifact_hash, klass.private_functions_root, new_bytecode_commitment);

    // Store original class ID before modifications
    FF original_class_id = instance.original_contract_class_id;

    // Copy into NEW contract class with updated bytecode and id, we don't modify the existing one in case
    // other instances refer to it
    ContractClass new_class = klass;
    new_class.id = new_class_id;
    new_class.packed_bytecode = std::move(bytecode);

    // Update instance's current class ID to point to the newly upgraded-to class
    fuzz_info("Contract at address ", address, ", upgraded from ", original_class_id, " -> ", new_class_id);
    instance.current_contract_class_id = new_class_id;

    // Add the new contract class to the vector (for serialization to TS)
    contract_classes.push_back(new_class);

    // Compute public data tree writes for UpdateCheck to pass
    FF delayed_public_mutable_slot = Poseidon2::hash({ FF(UPDATED_CLASS_IDS_SLOT), address });

    // Build preimage
    FF metadata = 0; // The lower 32 bits are the timestamp_of_change, we set to 0 so it has "taken effect"
    FF hash = Poseidon2::hash({ metadata, original_class_id, new_class_id });

    std::array<FF, 4> values = { metadata, original_class_id, new_class_id, hash };

    for (size_t i = 0; i < 4; i++) {
        FF storage_slot = delayed_public_mutable_slot + i;
        FF leaf_slot = Poseidon2::hash(
            { FF(DOM_SEP__PUBLIC_LEAF_INDEX), FF(CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS), storage_slot });
        public_data_writes.push_back(bb::crypto::merkle_tree::PublicDataLeafValue{ leaf_slot, values[i] });
    }
}

} // namespace bb::avm2::fuzzer
