barretenberg_module(
  root_rollup_bench
  dsl
  ultra_honk
)

if(NOT WASM AND NOT FUZZING)
    target_link_libraries(root_rollup_bench PRIVATE vm2_stub)
endif()
