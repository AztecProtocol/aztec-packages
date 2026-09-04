# merkle tree is agnostic to hash function.
# Now header-only (the world-state vocabulary that provided its only .cpp moved to world_state_reference),
# so this is an INTERFACE library; the `numeric` dependency makes the module resolve as one.
barretenberg_module(
    crypto_merkle_tree
    numeric
)

if (NOT FUZZING)
    # but the tests use poseidon
    target_link_libraries(crypto_merkle_tree_tests PRIVATE stdlib_poseidon2)
endif()
