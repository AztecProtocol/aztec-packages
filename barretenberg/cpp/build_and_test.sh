cmake --build --preset default --target crypto_merkle_tree_tests
#cmake --build --preset default --target world_state
./build/bin/crypto_merkle_tree_tests --gtest_filter=PersistedIndexedTreeTest.*
./build/bin/crypto_merkle_tree_tests --gtest_filter=PersistedAppendOnlyTreeTest*
./build/bin/crypto_merkle_tree_tests --gtest_filter=LMDBStoreTest*
