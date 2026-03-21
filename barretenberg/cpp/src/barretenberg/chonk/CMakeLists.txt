barretenberg_module(chonk goblin dsl libdeflate::libdeflate_static hypernova multilinear_batching)
if(APPLE)
  set_target_properties(chonk_tests PROPERTIES LINK_FLAGS "-Wl,-stack_size,0x4000000")
endif()
