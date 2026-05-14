# External Audit Scope: merkle_tree

Repository: https://github.com/AztecProtocol/aztec-packages-private
Commit hash: Most recent commit on branch 'next'

## Files to Audit
Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg`

### Core Types and Utilities
1. `crypto/merkle_tree/types.hpp`
2. `crypto/merkle_tree/hash.hpp`
3. `crypto/merkle_tree/hash_path.hpp`
4. `crypto/merkle_tree/response.hpp`
5. `crypto/merkle_tree/signal.hpp`

### Storage Layer
6. `crypto/merkle_tree/lmdb_store/lmdb_tree_store.hpp`
7. `crypto/merkle_tree/lmdb_store/lmdb_tree_store.cpp`

### Node Store (Cache + Metadata)
8. `crypto/merkle_tree/node_store/cached_content_addressed_tree_store.hpp`
9. `crypto/merkle_tree/node_store/content_addressed_cache.hpp`
10. `crypto/merkle_tree/node_store/tree_meta.hpp`

### Append-Only Tree
11. `crypto/merkle_tree/append_only_tree/content_addressed_append_only_tree.hpp`

### Indexed Tree
12. `crypto/merkle_tree/indexed_tree/content_addressed_indexed_tree.hpp`
13. `crypto/merkle_tree/indexed_tree/indexed_leaf.hpp`

## Summary of Module

The `merkle_tree` module implements the persistent Merkle tree infrastructure for the Aztec protocol's world state. It provides two tree variants: append-only trees (used for NOTE_HASH_TREE, L1_TO_L2_MESSAGE_TREE, and ARCHIVE) and indexed trees (used for NULLIFIER_TREE and PUBLIC_DATA_TREE). Both use Poseidon2 hashing.

The storage architecture is two-layered: `ContentAddressedCachedTreeStore` wraps an in-memory cache (`ContentAddressedCache`) over a persistent LMDB backend (`LMDBTreeStore`). All tree operations are asynchronous, using thread pools and callback-based completion. The system supports block-level history, forking, checkpointing, and rollback for the world state managed by `world_state/`.

## Test Files
1. `crypto/merkle_tree/memory_tree.test.cpp`
2. `crypto/merkle_tree/fixtures.test.cpp`
3. `crypto/merkle_tree/lmdb_store/lmdb_tree_store.test.cpp`
4. `crypto/merkle_tree/node_store/content_addressed_cache.test.cpp`
5. `crypto/merkle_tree/append_only_tree/content_addressed_append_only_tree.test.cpp`
6. `crypto/merkle_tree/indexed_tree/content_addressed_indexed_tree.test.cpp`
7. `crypto/merkle_tree/nullifier_tree/nullifier_memory_tree.test.cpp`

### Test Infrastructure
Non-production code used for testing and benchmarking the production files above:

- `crypto/merkle_tree/memory_tree.hpp` — Simple in-memory tree. Also used by vm2/simulation as a lightweight tree for AVM transaction execution.
- `crypto/merkle_tree/fixtures.hpp` — Test utility functions (random directories, values, thread pools).
- `crypto/merkle_tree/test_fixtures.hpp` — GTest assertion wrappers for tree state verification.
- `crypto/merkle_tree/node_store/array_store.hpp` — Lightweight in-memory store substitute for LMDB in tests/benchmarks.
- `crypto/merkle_tree/nullifier_tree/nullifier_memory_tree.hpp` — Reference implementation of an indexed nullifier tree, used for differential testing of `ContentAddressedIndexedTree`.
- `crypto/merkle_tree/nullifier_tree/nullifier_leaf.hpp` — Leaf types used by `nullifier_memory_tree.hpp`.

## Security Mechanisms
None identified.
