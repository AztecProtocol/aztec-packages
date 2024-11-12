
# We do not need to bloat barretenberg.wasm with gzip functionality in a browser context as the browser can do this

set(DSL_DEPENDENCIES
    client_ivc
    plonk
    ultra_honk
    stdlib_sha256
    stdlib_aes128
    stdlib_keccak
    stdlib_poseidon2
    crypto_merkle_tree
    stdlib_schnorr
    stdlib_honk_verifier)

if (NOT WASM AND NOT DISABLE_AZTEC_VM)
    list(APPEND DSL_DEPENDENCIES libdeflate::libdeflate_static vm)
endif()

barretenberg_module(
    dsl
    ${DSL_DEPENDENCIES}
)
