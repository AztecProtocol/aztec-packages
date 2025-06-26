#include "barretenberg/vm2/simulation/lib/db_interfaces.hpp"

#include <cassert>
#include <gmock/gmock.h>
#include <optional>
#include <span>

namespace bb::avm2::simulation {

class MockContractDB : public ContractDBInterface {
  public:
    // https://google.github.io/googletest/gmock_cook_book.html#making-the-compilation-faster
    MockContractDB();
    ~MockContractDB() override;

    MOCK_METHOD(std::optional<ContractInstance>,
                get_contract_instance,
                (const AztecAddress& address),
                (const, override));
    MOCK_METHOD(std::optional<ContractClass>, get_contract_class, (const ContractClassId& class_id), (const, override));
};

class MockLowLevelMerkleDB : public LowLevelMerkleDBInterface {
  public:
    // https://google.github.io/googletest/gmock_cook_book.html#making-the-compilation-faster
    MockLowLevelMerkleDB();
    ~MockLowLevelMerkleDB() override;

    MOCK_METHOD(const TreeSnapshots&, get_tree_roots, (), (const, override));
    MOCK_METHOD(SiblingPath, get_sibling_path, (MerkleTreeId tree_id, index_t leaf_index), (const, override));
    MOCK_METHOD(GetLowIndexedLeafResponse,
                get_low_indexed_leaf,
                (MerkleTreeId tree_id, const FF& value),
                (const, override));
    MOCK_METHOD(FF, get_leaf_value, (MerkleTreeId tree_id, index_t leaf_index), (const, override));
    MOCK_METHOD(IndexedLeaf<PublicDataLeafValue>,
                get_leaf_preimage_public_data_tree,
                (index_t leaf_index),
                (const, override));
    MOCK_METHOD(IndexedLeaf<NullifierLeafValue>,
                get_leaf_preimage_nullifier_tree,
                (index_t leaf_index),
                (const, override));
    MOCK_METHOD(SequentialInsertionResult<PublicDataLeafValue>,
                insert_indexed_leaves_public_data_tree,
                (const PublicDataLeafValue& leaf_value),
                (override));
    MOCK_METHOD(SequentialInsertionResult<NullifierLeafValue>,
                insert_indexed_leaves_nullifier_tree,
                (const NullifierLeafValue& leaf_value),
                (override));
    MOCK_METHOD(std::vector<AppendLeafResult>,
                append_leaves,
                (MerkleTreeId tree_id, std::span<const FF> leaves),
                (override));
    MOCK_METHOD(void, pad_tree, (MerkleTreeId tree_id, size_t num_leaves), (override));
    MOCK_METHOD(void, create_checkpoint, (), (override));
    MOCK_METHOD(void, commit_checkpoint, (), (override));
    MOCK_METHOD(void, revert_checkpoint, (), (override));
};

class MockHighLevelMerkleDB : public HighLevelMerkleDBInterface {
  public:
    // https://google.github.io/googletest/gmock_cook_book.html#making-the-compilation-faster
    MockHighLevelMerkleDB();
    ~MockHighLevelMerkleDB() override;

    MOCK_METHOD(const TreeSnapshots&, get_tree_roots, (), (const, override));
    MOCK_METHOD(TreeStates, get_tree_state, (), (const, override));
    MOCK_METHOD(FF, storage_read, (const FF& key), (const, override));
    MOCK_METHOD(void, storage_write, (const FF& key, const FF& value), (override));
    MOCK_METHOD(bool, nullifier_exists, (const AztecAddress& contract_address, const FF& nullifier), (const, override));
    MOCK_METHOD(bool, siloed_nullifier_exists, (const FF& nullifier), (const, override));
    MOCK_METHOD(bool, nullifier_write, (const AztecAddress& contract_address, const FF& nullifier), (override));
    MOCK_METHOD(bool, siloed_nullifier_write, (const FF& nullifier), (override));
    MOCK_METHOD(FF, note_hash_read, (index_t leaf_index), (const, override));
    MOCK_METHOD(void, note_hash_write, (const AztecAddress& contract_address, const FF& note_hash), (override));
    MOCK_METHOD(void, siloed_note_hash_write, (const FF& note_hash), (override));
    MOCK_METHOD(void, unique_note_hash_write, (const FF& note_hash), (override));

    MOCK_METHOD(void, create_checkpoint, (), (override));
    MOCK_METHOD(void, commit_checkpoint, (), (override));
    MOCK_METHOD(void, revert_checkpoint, (), (override));

    MOCK_METHOD(LowLevelMerkleDBInterface&, as_unconstrained, (), (const, override));
};

} // namespace bb::avm2::simulation
