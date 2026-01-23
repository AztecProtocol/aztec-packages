# merkle tree is agnostic to hash function
barretenberg_module(
    crypto_merkle_tree
    lmdblib
)
# Need -fPIC because it's linked into the nodejs_module shared library
set_target_properties(crypto_merkle_tree_objects PROPERTIES POSITION_INDEPENDENT_CODE ON)

if (NOT FUZZING)
    # but the tests use poseidon
    target_link_libraries(crypto_merkle_tree_tests PRIVATE stdlib_poseidon2)
endif()

