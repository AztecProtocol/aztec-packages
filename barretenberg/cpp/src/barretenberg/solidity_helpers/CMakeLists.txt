barretenberg_module(stdlib_solidity_helpers ultra_honk stdlib_sha256 stdlib_blake3s stdlib_blake2s stdlib_pedersen_commitment)

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
endif()
