#!/usr/bin/env bash

set -e

TEST=${1:-*}

cmake --build --preset default --target crypto_merkle_tree_tests
./build/bin/crypto_merkle_tree_tests --gtest_filter=PersistedIndexedTreeTest.$TEST
./build/bin/crypto_merkle_tree_tests --gtest_filter=PersistedAppendOnlyTreeTest.$TEST
./build/bin/crypto_merkle_tree_tests --gtest_filter=LMDBStoreTest.$TEST
