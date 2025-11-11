# merkle tree is agnostic to hash function
barretenberg_module(
    crypto_merkle_tree
    lmdblib
)

if (NOT FUZZING)
    # but the tests use poseidon
    target_link_libraries(crypto_merkle_tree_tests PRIVATE stdlib_poseidon2)
endif()

