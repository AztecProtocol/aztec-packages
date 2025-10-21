set(DSL_DEPENDENCIES
    client_ivc
    ultra_honk
    stdlib_sha256
    stdlib_aes128
    stdlib_keccak
    stdlib_poseidon2
    stdlib_schnorr
    stdlib_honk_verifier
    stdlib_client_ivc_verifier
    vm2_stub)

barretenberg_module(
    dsl
    ${DSL_DEPENDENCIES}
)
