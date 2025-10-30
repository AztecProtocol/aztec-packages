barretenberg_module(bbapi common chonk dsl crypto_poseidon2 crypto_pedersen_commitment crypto_pedersen_hash crypto_blake2s crypto_aes128 crypto_schnorr crypto_ecdsa ecc srs)

# bbapi_tests needs vm2_stub to resolve dsl's AVM recursion constraint references
if(NOT WASM AND NOT FUZZING)
    target_link_libraries(bbapi_tests PRIVATE vm2_stub)
endif()
