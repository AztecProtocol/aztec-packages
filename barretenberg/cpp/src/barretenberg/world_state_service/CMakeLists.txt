if (NOT(FUZZING))
  add_executable(world_state main.cpp)
  target_link_libraries(world_state lmdb crypto_merkle_tree crypto_pedersen_hash common)

  endif()
