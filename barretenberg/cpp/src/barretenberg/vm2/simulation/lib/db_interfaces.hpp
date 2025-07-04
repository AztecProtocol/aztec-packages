#pragma once

#include <optional>
#include <span>

#include "barretenberg/crypto/merkle_tree/hash_path.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/response.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/world_state/types.hpp"
#include "barretenberg/world_state/world_state.hpp"

namespace bb::avm2::simulation {

class ContractDBInterface {
  public:
    virtual ~ContractDBInterface() = default;

    virtual std::optional<ContractInstance> get_contract_instance(const AztecAddress& address) const = 0;
    virtual std::optional<ContractClass> get_contract_class(const ContractClassId& class_id) const = 0;
};

// Aliases.
using MerkleTreeId = ::bb::world_state::MerkleTreeId;
using SiblingPath = ::bb::crypto::merkle_tree::fr_sibling_path;
using index_t = ::bb::crypto::merkle_tree::index_t;
using PublicDataLeafValue = ::bb::crypto::merkle_tree::PublicDataLeafValue;
using NullifierLeafValue = ::bb::crypto::merkle_tree::NullifierLeafValue;
template <typename LeafValueType> using IndexedLeaf = ::bb::crypto::merkle_tree::IndexedLeaf<LeafValueType>;
template <typename LeafValueType>
using SequentialInsertionResult = ::bb::world_state::SequentialInsertionResult<LeafValueType>;

// The sibling path and root after the insertion.
struct AppendLeafResult {
    FF root;
    SiblingPath path;
};

// Low level access to a merkle db. In general these will not be constrained.
class LowLevelMerkleDBInterface {
  public:
    virtual ~LowLevelMerkleDBInterface() = default;

    virtual const TreeSnapshots& get_tree_roots() const = 0;

    virtual SiblingPath get_sibling_path(MerkleTreeId tree_id, index_t leaf_index) const = 0;
    virtual GetLowIndexedLeafResponse get_low_indexed_leaf(MerkleTreeId tree_id, const FF& value) const = 0;
    // Returns the value if it exists, 0 otherwise.
    virtual FF get_leaf_value(MerkleTreeId tree_id, index_t leaf_index) const = 0;
    // We don't template the preimage methods because templated methods cannot be virtual.
    virtual IndexedLeaf<PublicDataLeafValue> get_leaf_preimage_public_data_tree(index_t leaf_index) const = 0;
    virtual IndexedLeaf<NullifierLeafValue> get_leaf_preimage_nullifier_tree(index_t leaf_index) const = 0;

    virtual SequentialInsertionResult<PublicDataLeafValue> insert_indexed_leaves_public_data_tree(
        const PublicDataLeafValue& leaf_value) = 0;
    virtual SequentialInsertionResult<NullifierLeafValue> insert_indexed_leaves_nullifier_tree(
        const NullifierLeafValue& leaf_value) = 0;

    virtual std::vector<AppendLeafResult> append_leaves(MerkleTreeId tree_id, std::span<const FF> leaves) = 0;

    virtual void pad_tree(MerkleTreeId tree_id, size_t num_leaves) = 0;

    virtual void create_checkpoint() = 0;
    virtual void commit_checkpoint() = 0;
    virtual void revert_checkpoint() = 0;
};

// High level access to a merkle db. In general these will be constrained.
class HighLevelMerkleDBInterface {
  public:
    virtual ~HighLevelMerkleDBInterface() = default;

    virtual InternalTreeSnapshots get_tree_roots() const = 0;
    virtual TreeStates get_tree_state() const = 0;

    virtual FF storage_read(const AztecAddress& contract_address, const FF& slot) const = 0;
    virtual void storage_write(const AztecAddress& contract_address,
                               const FF& slot,
                               const FF& value,
                               bool is_protocol_write) = 0;
    virtual bool was_storage_written(const AztecAddress& contract_address, const FF& slot) const = 0;

    virtual bool nullifier_exists(const AztecAddress& contract_address, const FF& nullifier) const = 0;
    virtual bool siloed_nullifier_exists(const FF& nullifier) const = 0;
    virtual bool nullifier_write(const AztecAddress& contract_address, const FF& nullifier) = 0;
    virtual bool siloed_nullifier_write(const FF& nullifier) = 0;

    virtual FF note_hash_read(index_t leaf_index) const = 0;
    virtual void note_hash_write(const AztecAddress& contract_address, const FF& note_hash) = 0;
    virtual void siloed_note_hash_write(const FF& note_hash) = 0;
    virtual void unique_note_hash_write(const FF& note_hash) = 0;

    virtual void create_checkpoint() = 0;
    virtual void commit_checkpoint() = 0;
    virtual void revert_checkpoint() = 0;

    virtual LowLevelMerkleDBInterface& as_unconstrained() const = 0;
};

class CheckpointNotifiable {
  public:
    virtual ~CheckpointNotifiable() = default;
    virtual void on_checkpoint_created() = 0;
    virtual void on_checkpoint_committed() = 0;
    virtual void on_checkpoint_reverted() = 0;
};

} // namespace bb::avm2::simulation
