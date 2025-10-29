set(DSL_DEPENDENCIES
    chonk
    ultra_honk
    stdlib_sha256
    stdlib_aes128
    stdlib_keccak
    stdlib_poseidon2
    stdlib_schnorr
    stdlib_honk_verifier
    stdlib_chonk_verifier)

if (NOT DISABLE_AZTEC_VM)
    list(APPEND DSL_DEPENDENCIES vm2)
endif()

barretenberg_module(
    dsl
    ${DSL_DEPENDENCIES}
)
