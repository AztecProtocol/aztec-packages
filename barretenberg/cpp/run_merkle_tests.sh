cmake --build --preset default --target stdlib_merkle_tree_tests
./build/bin/stdlib_merkle_tree_tests --gtest_filter=stdlib_indexed_tree*
