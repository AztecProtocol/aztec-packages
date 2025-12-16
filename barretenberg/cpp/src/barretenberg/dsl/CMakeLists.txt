set(DSL_DEPENDENCIES
    chonk
    ultra_honk
    stdlib_sha256
    stdlib_aes128
    stdlib_blake2s
    stdlib_blake3s
    stdlib_keccak
    stdlib_poseidon2
    stdlib_honk_verifier
    stdlib_chonk_verifier)

barretenberg_module(
    dsl
    ${DSL_DEPENDENCIES}
)

# dsl calls create_avm2_recursion_constraints_goblin() which must be provided by vm2_stub or vm2.
# We don't list either in dependencies to avoid forcing all consumers to use one or the other.
# Binaries (bb, bb-avm) explicitly link their choice. Tests link vm2_stub for AVM functionality.
if(NOT WASM AND NOT FUZZING)
    target_link_libraries(dsl_tests PRIVATE vm2_stub)
endif()
