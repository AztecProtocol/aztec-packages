# External Audit Scope: merkle_tree

Repository: https://github.com/AztecProtocol/aztec-packages
Commit hash: TBD (link)

## Files to Audit
Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg`

### Core Merkle Tree Implementation
1. `crypto/merkle_tree/merkle_tree.hpp`
2. `crypto/merkle_tree/memory_tree.hpp`
3. `crypto/merkle_tree/hash.hpp`
4. `crypto/merkle_tree/hash_path.hpp`
5. `crypto/merkle_tree/types.hpp`
6. `crypto/merkle_tree/index.hpp`
7. `crypto/merkle_tree/response.hpp`
8. `crypto/merkle_tree/signal.hpp`

### Storage Implementations
9. `crypto/merkle_tree/memory_store.hpp`
10. `crypto/merkle_tree/lmdb_store/lmdb_tree_store.cpp`
11. `crypto/merkle_tree/lmdb_store/lmdb_tree_store.hpp`

### Node Store
12. `crypto/merkle_tree/node_store/array_store.hpp`
13. `crypto/merkle_tree/node_store/cached_content_addressed_tree_store.hpp`
14. `crypto/merkle_tree/node_store/content_addressed_cache.hpp`
15. `crypto/merkle_tree/node_store/tree_meta.hpp`

### Append-Only Tree
16. `crypto/merkle_tree/append_only_tree/content_addressed_append_only_tree.hpp`

### Indexed Tree
17. `crypto/merkle_tree/indexed_tree/content_addressed_indexed_tree.hpp`
18. `crypto/merkle_tree/indexed_tree/indexed_leaf.hpp`
19. `crypto/merkle_tree/indexed_tree/fixtures.hpp`

### Nullifier Tree
20. `crypto/merkle_tree/nullifier_tree/nullifier_tree.cpp`
21. `crypto/merkle_tree/nullifier_tree/nullifier_tree.hpp`
22. `crypto/merkle_tree/nullifier_tree/nullifier_memory_tree.hpp`
23. `crypto/merkle_tree/nullifier_tree/nullifier_leaf.hpp`

### Test Fixtures
24. `crypto/merkle_tree/fixtures.hpp`
25. `crypto/merkle_tree/test_fixtures.hpp`

## Summary of Module

The `merkle_tree` module provides a comprehensive implementation of Merkle tree data structures for the Aztec protocol, including standard Merkle trees, append-only trees, indexed trees, and nullifier trees. The module supports multiple hash policies (Pedersen hash and Poseidon2) and provides both in-memory and persistent LMDB-backed storage options. The core implementation includes content-addressed storage with caching, allowing efficient tree operations and proof generation. The append-only tree implementation is optimized for sequential insertions, while the indexed tree maintains an ordered set of leaves with nullifier functionality. The nullifier tree is a specialized indexed tree used for tracking spent notes in the Aztec protocol. The module includes utilities for computing Merkle paths, tree roots, and managing tree metadata across multiple storage backends.

## Test Files
1. `crypto/merkle_tree/merkle_tree.test.cpp`
2. `crypto/merkle_tree/memory_tree.test.cpp`
3. `crypto/merkle_tree/fixtures.test.cpp`
4. `crypto/merkle_tree/lmdb_store/lmdb_tree_store.test.cpp`
5. `crypto/merkle_tree/node_store/content_addressed_cache.test.cpp`
6. `crypto/merkle_tree/append_only_tree/content_addressed_append_only_tree.test.cpp`
7. `crypto/merkle_tree/indexed_tree/content_addressed_indexed_tree.test.cpp`
8. `crypto/merkle_tree/nullifier_tree/nullifier_tree.test.cpp`
9. `crypto/merkle_tree/nullifier_tree/nullifier_memory_tree.test.cpp`

## Security Mechanisms
None identified.
