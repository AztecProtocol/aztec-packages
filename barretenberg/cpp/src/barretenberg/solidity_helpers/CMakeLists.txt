barretenberg_module(stdlib_solidity_helpers ultra_honk plonk proof_system transcript crypto_pedersen_commitment polynomials crypto_sha256 ecc crypto_blake3s stdlib_primitives stdlib_pedersen_commitment stdlib_blake3s stdlib_blake2s stdlib_sha256 srs)

if (NOT(FUZZING))
  # Honk
  add_executable(honk_solidity_key_gen honk_key_gen.cpp)

  target_link_libraries(
    honk_solidity_key_gen 
    stdlib_solidity_helpers
  )

  add_executable(honk_solidity_proof_gen honk_proof_gen.cpp)

  target_link_libraries(
    honk_solidity_proof_gen 
    stdlib_solidity_helpers
  )

  # Plonk
  add_executable(solidity_key_gen key_gen.cpp)

  add_executable(solidity_proof_gen proof_gen.cpp)

  target_link_libraries(
    solidity_key_gen
    stdlib_solidity_helpers
  )

  target_link_libraries(
    solidity_proof_gen
    stdlib_solidity_helpers
  )
endif()