#include "barretenberg/avm_fuzzer/common/interfaces/dbs.hpp"

#include <cstdint>
#include <vector>

#include "barretenberg/avm_fuzzer/fuzz_lib/constants.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/response.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"
#include "barretenberg/vm2/simulation/lib/merkle.hpp"

using namespace bb::avm2::simulation;
using Poseidon2 = bb::crypto::Poseidon2<bb::crypto::Poseidon2Bn254ScalarFieldParams>;
using namespace bb::world_state;

namespace bb::avm2::fuzzer {

////////////////////////////////
/// ContractDBInterface methods
////////////////////////////////
std::optional<ContractInstance> FuzzerContractDB::get_contract_instance(const AztecAddress& address) const
{
    if (!contract_instances.contains(address)) {
        return std::nullopt;
    }
    return contract_instances.at(address);
}

std::optional<ContractClass> FuzzerContractDB::get_contract_class(const ContractClassId& class_id) const
{
    if (!contract_classes.contains(class_id)) {
        return std::nullopt;
    }
    return contract_classes.at(class_id);
}

std::optional<FF> FuzzerContractDB::get_bytecode_commitment(const ContractClassId& class_id) const
{
    if (!contract_classes.contains(class_id)) {
        return std::nullopt;
    }
    // Compute the actual bytecode commitment from the stored bytecode
    const auto& klass = contract_classes.at(class_id);
    return compute_public_bytecode_commitment(klass.packed_bytecode);
}
std::optional<std::string> FuzzerContractDB::get_debug_function_name(
    [[maybe_unused]] const AztecAddress& address, [[maybe_unused]] const FunctionSelector& selector) const
{
    return std::nullopt;
}

void FuzzerContractDB::add_contracts(const ContractDeploymentData& contract_deployment_data)
{
    // Extract ContractClasses
    for (const auto& log : contract_deployment_data.contract_class_logs) {
        ContractClass klass = from_logs(log);
        contract_classes[klass.id] = klass;
    }

    // Extract ContractInstances
    for (const auto& log : contract_deployment_data.private_logs) {
        ContractInstance instance = from_logs(log);
        AztecAddress contract_address = log.fields[2];
        contract_instances[contract_address] = instance;
    }
}

void FuzzerContractDB::add_contract_class(const ContractClassId& class_id, const ContractClass& contract_class)
{
    // todo(ilyas): think of a nicer way without both map and vector
    // Only push to vector if not already present, otherwise we get duplicates sent to the TS simulator
    if (contract_classes.contains(class_id)) {
        return;
    }
    contract_classes_vector.push_back(contract_class);
    contract_classes[class_id] = contract_class;
}

void FuzzerContractDB::add_contract_instance(const AztecAddress& address, const ContractInstance& contract_instance)
{
    // todo(ilyas): think of a nicer way without both map and vector
    if (contract_instances.contains(address)) {
        return;
    }
    contract_instances[address] = contract_instance;
    contract_instances_vector.push_back({ address, contract_instance });
}

// Based on fromLogs in yarn-project/protocol-contracts/src/class-registry/contract_class_published_event.ts
ContractClass FuzzerContractDB::from_logs(const ContractClassLog& log) const
{
    // todo(ilyas): difference between log.emitted_length and log.fields.fields.length?
    size_t offset = 1; // Tag field is at index 0 and we skip it
    auto class_id = log.fields.fields[offset++];
    [[maybe_unused]] auto version = static_cast<uint32_t>(log.fields.fields[offset++]);
    auto artifact_hash = log.fields.fields[offset++];
    auto private_functions_root = log.fields.fields[offset++];
    // The remainder is packed_bytecode, the first element is the length
    auto packed_bytecode_len = static_cast<uint32_t>(log.fields.fields[offset++]);
    std::vector<uint8_t> packed_bytecode;
    packed_bytecode.reserve(packed_bytecode_len);
    for (size_t i = 0; i < packed_bytecode_len; ++i) {
        // todo(ilyas): check that the bufferFromFields function in TS skips the first byte of each field's buffer
        // (since it expects it to be zero?)
        std::vector<uint8_t> f = to_buffer(log.fields.fields[offset + i]);
        packed_bytecode.insert(packed_bytecode.end(), f.begin() + 1, f.end());
    }

    return ContractClass{
        .id = class_id,
        .artifact_hash = artifact_hash,
        .private_functions_root = private_functions_root,
        .packed_bytecode = packed_bytecode,
    };
}

// Base on fromLogs in yarn-project/protocol-contracts/src/instance-registry/contract_instance_published_event.ts
ContractInstance FuzzerContractDB::from_logs(const PrivateLog& log) const
{
    // We skip the following fields:
    // - tag (index 0)
    // - version (index 1)
    // - contract address (index 2)
    size_t offset = 3;
    FF salt = log.fields[offset++];
    FF contract_class_id = log.fields[offset++];
    FF initialization_hash = log.fields[offset++];
    PublicKeys public_keys = {
        .nullifier_key = { log.fields[offset++], log.fields[offset++] },
        .incoming_viewing_key = { log.fields[offset++], log.fields[offset++] },
        .outgoing_viewing_key = { log.fields[offset++], log.fields[offset++] },
        .tagging_key = { log.fields[offset++], log.fields[offset++] },
    };
    auto deployer = AztecAddress(log.fields[offset++]);
    return ContractInstance{
        .salt = salt,
        .deployer = deployer,
        .current_contract_class_id = contract_class_id,
        .original_contract_class_id = contract_class_id,
        .initialization_hash = initialization_hash,
        .public_keys = public_keys,
    };
}

void FuzzerContractDB::create_checkpoint()
{
    checkpoints.push(Checkpoint{
        .contract_classes = contract_classes,
        .contract_instances = contract_instances,
    });
}

void FuzzerContractDB::commit_checkpoint()
{
    if (!checkpoints.empty()) {
        checkpoints.pop();
    }
}

void FuzzerContractDB::revert_checkpoint()
{
    if (!checkpoints.empty()) {
        contract_classes = std::move(checkpoints.top().contract_classes);
        contract_instances = std::move(checkpoints.top().contract_instances);
        checkpoints.pop();
    }
}

////////////////////////////////////
/// FuzzerWorldStateManager methods
////////////////////////////////////

// Static instance definition
FuzzerWorldStateManager* FuzzerWorldStateManager::instance = nullptr;

void FuzzerWorldStateManager::initialize_world_state()
{
    std::unordered_map<simulation::MerkleTreeId, uint32_t> tree_heights{
        { simulation::MerkleTreeId::NULLIFIER_TREE, NULLIFIER_TREE_HEIGHT },
        { simulation::MerkleTreeId::NOTE_HASH_TREE, NOTE_HASH_TREE_HEIGHT },
        { simulation::MerkleTreeId::PUBLIC_DATA_TREE, PUBLIC_DATA_TREE_HEIGHT },
        { simulation::MerkleTreeId::L1_TO_L2_MESSAGE_TREE, L1_TO_L2_MSG_TREE_HEIGHT },
        { simulation::MerkleTreeId::ARCHIVE, ARCHIVE_HEIGHT },
    };
    std::unordered_map<simulation::MerkleTreeId, index_t> tree_prefill{
        { simulation::MerkleTreeId::NULLIFIER_TREE, 128 },
        { simulation::MerkleTreeId::PUBLIC_DATA_TREE, 128 },
    };
    uint32_t initial_header_generator_point = 28; // GeneratorIndex.BLOCK_HASH
    ws = std::make_unique<world_state::WorldState>(
        /*thread_pool_size=*/4, DATA_DIR, MAP_SIZE_KB, tree_heights, tree_prefill, initial_header_generator_point);

    fork_ids.push(ws->create_fork(std::nullopt));
}

WorldStateRevision FuzzerWorldStateManager::get_current_revision() const
{
    return WorldStateRevision{ .forkId = fork_ids.top(), .blockNumber = 0, .includeUncommitted = true };
}

WorldStateRevision FuzzerWorldStateManager::fork()
{
    auto fork_id = ws->create_fork(std::nullopt);
    fork_ids.push(fork_id);
    return WorldStateRevision{ .forkId = fork_id, .blockNumber = 0, .includeUncommitted = true };
}
void FuzzerWorldStateManager::reset_world_state()
{
    // We keep the initial fork, so pop until only one remains
    while (fork_ids.size() != 1) {
        ws->delete_fork(fork_ids.top());
        fork_ids.pop();
    }
}
void FuzzerWorldStateManager::register_contract_address(const AztecAddress& contract_address)
{
    NullifierLeafValue contract_nullifier =
        unconstrained_silo_nullifier(CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS, contract_address);
    fuzz_info("Registering contract address in world state: ", contract_nullifier.nullifier);
    auto fork_id = fork_ids.top();
    ws->insert_indexed_leaves<NullifierLeafValue>(MerkleTreeId::NULLIFIER_TREE, { contract_nullifier }, fork_id);
}

void FuzzerWorldStateManager::write_fee_payer_balance(const AztecAddress& fee_payer, const FF& balance)
{
    if (fee_payer == 0) {
        return;
    }
    FF fee_juice_balance_slot = Poseidon2::hash({ FEE_JUICE_BALANCES_SLOT, fee_payer });
    FF leaf_slot = Poseidon2::hash({ DOM_SEP__PUBLIC_LEAF_INDEX, FF(FEE_JUICE_ADDRESS), fee_juice_balance_slot });

    // Write to public data tree using current fork
    auto fork_id = fork_ids.top();
    ws->update_public_data(PublicDataLeafValue(leaf_slot, balance), fork_id);
}

void FuzzerWorldStateManager::public_data_write(const bb::crypto::merkle_tree::PublicDataLeafValue& public_data)
{
    auto fork_id = fork_ids.top();
    ws->update_public_data(public_data, fork_id);
}

void FuzzerWorldStateManager::append_note_hashes(const std::vector<FF>& note_hashes)
{
    auto fork_id = fork_ids.top();

    uint64_t padding_leaves = MAX_NOTE_HASHES_PER_TX - (note_hashes.size() % MAX_NOTE_HASHES_PER_TX);

    ws->append_leaves(MerkleTreeId::NOTE_HASH_TREE, note_hashes, fork_id);
    ws->append_leaves(MerkleTreeId::NOTE_HASH_TREE, std::vector<FF>(padding_leaves, FF(0)), fork_id);
}

} // namespace bb::avm2::fuzzer
