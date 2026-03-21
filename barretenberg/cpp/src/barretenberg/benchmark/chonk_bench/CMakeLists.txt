barretenberg_module(chonk_bench vm2_stub chonk stdlib_honk_verifier stdlib_sha256 stdlib_primitives)
if(APPLE AND TARGET chonk_v2_bench)
  target_link_options(chonk_v2_bench PRIVATE "LINKER:-stack_size,0x4000000")
endif()
