# merkle tree is agnostic to hash function
barretenberg_module(
    crypto_merkle_tree
    lmdblib
)
# Need -fPIC because it's linked into the nodejs_module shared library
set_target_properties(crypto_merkle_tree_objects PROPERTIES POSITION_INDEPENDENT_CODE ON)

if (NOT FUZZING)
    # Tests use poseidon, and (in indexed_tree/node_store/lmdb_store tests) reference
    # bb::aztec::NullifierLeafValue / PublicDataLeafValue — link aztec here rather than
    # making crypto_merkle_tree itself depend on aztec (that would be a circular dependency:
    # aztec already depends on crypto_merkle_tree for the generic IndexedLeaf<T> template).
    target_link_libraries(crypto_merkle_tree_tests PRIVATE stdlib_poseidon2 aztec)
endif()

