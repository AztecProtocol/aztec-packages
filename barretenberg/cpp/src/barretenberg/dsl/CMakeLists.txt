set(DSL_DEPENDENCIES
    client_ivc
    ultra_honk
    stdlib_sha256
    stdlib_aes128
    stdlib_keccak
    stdlib_poseidon2
    stdlib_schnorr
    stdlib_honk_verifier)

if (NOT DISABLE_AZTEC_VM)
    list(APPEND DSL_DEPENDENCIES vm2)
endif()

barretenberg_module(
    dsl
    ${DSL_DEPENDENCIES}
)
