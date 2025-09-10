barretenberg_module(stdlib_solidity_helpers ultra_honk stdlib_sha256 stdlib_blake3s stdlib_blake2s stdlib_pedersen_commitment stdlib_circuit_builders stdlib_honk_verifier)

if (NOT(FUZZING))
  # Honk
  add_executable(honk_solidity_key_gen honk_key_gen.cpp)

  target_link_libraries(
    honk_solidity_key_gen
    PRIVATE
    stdlib_solidity_helpers
  )

  add_executable(honk_solidity_proof_gen honk_proof_gen.cpp)

  target_link_libraries(
    honk_solidity_proof_gen
    PRIVATE
    stdlib_solidity_helpers
  )
  if(CHECK_CIRCUIT_STACKTRACES OR ENABLE_STACKTRACES)
    target_link_libraries(
        honk_solidity_key_gen
        PUBLIC
        Backward::Interface
    )
    target_link_options(
        honk_solidity_key_gen
        PRIVATE
        -ldw -lelf
    )
    target_link_libraries(
        honk_solidity_proof_gen
        PUBLIC
        Backward::Interface
    )
    target_link_options(
        honk_solidity_proof_gen
        PRIVATE
        -ldw -lelf
    )
  endif()
endif()
