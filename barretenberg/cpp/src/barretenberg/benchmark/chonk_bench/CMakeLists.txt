barretenberg_module(chonk_bench vm2_stub chonk stdlib_honk_verifier stdlib_sha256 stdlib_primitives)
if(APPLE)
  set_target_properties(chonk_v2_bench PROPERTIES LINK_FLAGS "-Wl,-stack_size,0x4000000")
endif()
