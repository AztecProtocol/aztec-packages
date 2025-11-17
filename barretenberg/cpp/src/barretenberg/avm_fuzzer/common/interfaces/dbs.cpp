#include "barretenberg/avm_fuzzer/common/interfaces/dbs.hpp"

#include <vector>

#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"

using namespace bb::avm2::simulation;
using namespace bb::crypto::merkle_tree;

// TODO(ilyas): implement other methods as needed
namespace bb::avm2::fuzzer {

TreeSnapshots FuzzerLowLevelDB::get_tree_roots() const
{
    return {
        .l1_to_l2_message_tree = { .root = FF(0), .next_available_leaf_index = 0 },
        .note_hash_tree = { .root = FF(0), .next_available_leaf_index = 0 },
        .nullifier_tree = { .root = FF(0), .next_available_leaf_index = 0 },
        .public_data_tree = { .root = FF(0), .next_available_leaf_index = 0 },
    };
}

SiblingPath FuzzerLowLevelDB::get_sibling_path([[maybe_unused]] MerkleTreeId tree_id,
                                               [[maybe_unused]] index_t leaf_index) const
{
    throw_or_abort("FuzzerLowLevelDB::get_sibling_path not implemented");
}

std::pair<FF, index_t> FuzzerLowLevelDB::get_indexed_low_leaf_helper(
    const std::vector<std::pair<FF, index_t>>& value_sorted_leaves, const FF& value) const
{
    for (size_t i = 0; i < value_sorted_leaves.size(); ++i) {
        if (value_sorted_leaves[i].first == value) {
            return value_sorted_leaves[i];
        }
        if (value_sorted_leaves[i].first > value) {
            return value_sorted_leaves[i - 1];
        }
    }
    // If we reach here, the value is larger than any leaf in the tree, return the last leaf
    return value_sorted_leaves.back();
}

GetLowIndexedLeafResponse FuzzerLowLevelDB::get_low_indexed_leaf(MerkleTreeId tree_id, const FF& value) const
{
    // todo(ilyas): implement other trees if needed
    switch (tree_id) {
    case MerkleTreeId::NULLIFIER_TREE: {
        auto [low_value, low_index] = get_indexed_low_leaf_helper(nullifier_values, value);
        return GetLowIndexedLeafResponse(low_value == value, low_index);
        break;
    }
    default:
        break;
    }
    return GetLowIndexedLeafResponse(false, 0);
}
FF FuzzerLowLevelDB::get_leaf_value(MerkleTreeId tree_id, index_t leaf_index) const
{
    switch (tree_id) {
    case MerkleTreeId::NULLIFIER_TREE:
        return nullifier_leaves.at(leaf_index).nullifier;
    default:
        break;
    }
    return FF(0);
}
bb::crypto::merkle_tree::IndexedLeaf<PublicDataLeafValue> FuzzerLowLevelDB::get_leaf_preimage_public_data_tree(
    [[maybe_unused]] index_t leaf_index) const
{
    return {};
}
bb::crypto::merkle_tree::IndexedLeaf<NullifierLeafValue> FuzzerLowLevelDB::get_leaf_preimage_nullifier_tree(
    index_t leaf_index) const
{
    auto leaf_value = nullifier_leaves.at(leaf_index);
    std::pair<FF, index_t> value_index_pair = { leaf_value.nullifier, leaf_index };
    // Find index in nullifiers_values
    auto it = std::ranges::find_if(
        nullifier_values.begin(), nullifier_values.end(), [&value_index_pair](const std::pair<FF, index_t>& pair) {
            return pair.second == value_index_pair.second;
        });
    if (it == nullifier_values.end()) {
        throw_or_abort("FuzzerLowLevelDB::get_leaf_preimage_nullifier_tree: leaf not found in nullifier_values");
    }

    it++; // Now iterator is at the next element

    if (it == nullifier_values.end()) {
        // If this is the last leaf, return with index 0
        return bb::crypto::merkle_tree::IndexedLeaf(leaf_value, 0, 0);
    }
    auto [next_value, next_index] = *it;
    return bb::crypto::merkle_tree::IndexedLeaf<NullifierLeafValue>(leaf_value, next_index, next_value);
}

SequentialInsertionResult<PublicDataLeafValue> FuzzerLowLevelDB::insert_indexed_leaves_public_data_tree(
    [[maybe_unused]] const PublicDataLeafValue& leaf_value)
{
    return {};
}

SequentialInsertionResult<NullifierLeafValue> FuzzerLowLevelDB::insert_indexed_leaves_nullifier_tree(
    const NullifierLeafValue& leaf_value)
{
    // Add to map
    nullifier_leaves[next_available_nullifier_index] = leaf_value;
    // Add to sorted vector
    nullifier_values.push_back({ leaf_value.nullifier, next_available_nullifier_index });
    // Sort vector
    std::ranges::sort(
        nullifier_values.begin(),
        nullifier_values.end(),
        [](const std::pair<FF, index_t>& a, const std::pair<FF, index_t>& b) { return a.first < b.first; });

    // Increment next available index
    next_available_nullifier_index++;
    return {};
}

std::vector<AppendLeafResult> FuzzerLowLevelDB::append_leaves([[maybe_unused]] MerkleTreeId tree_id,
                                                              [[maybe_unused]] std::span<const FF> leaves)
{
    return {};
}
void FuzzerLowLevelDB::pad_tree([[maybe_unused]] MerkleTreeId tree_id, [[maybe_unused]] size_t num_leaves) {}

void FuzzerLowLevelDB::create_checkpoint() {}
void FuzzerLowLevelDB::commit_checkpoint() {}
void FuzzerLowLevelDB::revert_checkpoint() {}
uint32_t FuzzerLowLevelDB::get_checkpoint_id() const
{
    return 0;
}

void FuzzerLowLevelDB::insert_contract_address(const AztecAddress& contract_address)
{
    auto contract_nullifier =
        simulation::unconstrained_silo_nullifier(CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS, contract_address);
    insert_indexed_leaves_nullifier_tree(contract_nullifier);
}

////////////////////////////////
/// ContractDBInterface methods
////////////////////////////////
std::optional<ContractInstance> FuzzerContractDB::get_contract_instance(
    [[maybe_unused]] const AztecAddress& address) const
{
    ContractInstance instance = {
        .salt = FF(0),
        .deployer = AztecAddress(0),
        .current_contract_class_id = ContractClassId(0),
        .original_contract_class_id = ContractClassId(0),
        .initialization_hash = FF(0),
        .public_keys = {
            .nullifier_key = { FF(0), FF(0) },
            .incoming_viewing_key = { FF(0), FF(0) },
            .outgoing_viewing_key = { FF(0), FF(0) },
            .tagging_key = { FF(0), FF(0) },
        },
    };

    return instance;
}
std::optional<ContractClass> FuzzerContractDB::get_contract_class(
    [[maybe_unused]] const ContractClassId& class_id) const
{

    ContractClass klass = {
        .artifact_hash = FF(0),
        .private_functions_root = FF(0),
        .packed_bytecode = bytecode,
    };
    return klass;
}

std::optional<FF> FuzzerContractDB::get_bytecode_commitment([[maybe_unused]] const ContractClassId& class_id) const
{
    return FF(0);
}
std::optional<std::string> FuzzerContractDB::get_debug_function_name(
    [[maybe_unused]] const AztecAddress& address, [[maybe_unused]] const FunctionSelector& selector) const
{
    return std::nullopt;
}

void FuzzerContractDB::add_contracts([[maybe_unused]] const ContractDeploymentData& contract_deployment_data)
{
    // This probably needs to store the input contract deployment data for later retrieval.
    {};
}

void FuzzerContractDB::create_checkpoint() {}
void FuzzerContractDB::commit_checkpoint() {}
void FuzzerContractDB::revert_checkpoint() {}

} // namespace bb::avm2::fuzzer
