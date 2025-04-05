#include "barretenberg/vm2/simulation/lib/db_interfaces.hpp"

#include <cassert>
#include <gmock/gmock.h>
#include <optional>

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
    MOCK_METHOD(crypto::merkle_tree::fr_sibling_path,
                get_sibling_path,
                (world_state::MerkleTreeId tree_id, crypto::merkle_tree::index_t leaf_index),
                (const, override));
    MOCK_METHOD(crypto::merkle_tree::GetLowIndexedLeafResponse,
                get_low_indexed_leaf,
                (world_state::MerkleTreeId tree_id, const FF& value),
                (const, override));
    MOCK_METHOD(FF,
                get_leaf_value,
                (world_state::MerkleTreeId tree_id, crypto::merkle_tree::index_t leaf_index),
                (const, override));
    MOCK_METHOD(crypto::merkle_tree::IndexedLeaf<crypto::merkle_tree::PublicDataLeafValue>,
                get_leaf_preimage_public_data_tree,
                (crypto::merkle_tree::index_t leaf_index),
                (const, override));
    MOCK_METHOD(crypto::merkle_tree::IndexedLeaf<crypto::merkle_tree::NullifierLeafValue>,
                get_leaf_preimage_nullifier_tree,
                (crypto::merkle_tree::index_t leaf_index),
                (const, override));
    MOCK_METHOD(world_state::SequentialInsertionResult<crypto::merkle_tree::PublicDataLeafValue>,
                insert_indexed_leaves_public_data_tree,
                (const crypto::merkle_tree::PublicDataLeafValue& leaf_value),
                (override));
    MOCK_METHOD(world_state::SequentialInsertionResult<crypto::merkle_tree::NullifierLeafValue>,
                insert_indexed_leaves_nullifier_tree,
                (const crypto::merkle_tree::NullifierLeafValue& leaf_value),
                (override));
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
    MOCK_METHOD(FF, storage_read, (const FF& key), (const, override));

    MOCK_METHOD(void, create_checkpoint, (), (override));
    MOCK_METHOD(void, commit_checkpoint, (), (override));
    MOCK_METHOD(void, revert_checkpoint, (), (override));

    MOCK_METHOD(LowLevelMerkleDBInterface&, as_unconstrained, (), (const, override));
};

} // namespace bb::avm2::simulation
