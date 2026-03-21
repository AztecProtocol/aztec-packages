barretenberg_module(chonk goblin dsl libdeflate::libdeflate_static hypernova multilinear_batching)
if(APPLE AND TARGET chonk_tests)
  target_link_options(chonk_tests PRIVATE "LINKER:-stack_size,0x4000000")
endif()
