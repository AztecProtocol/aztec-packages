if (NOT(FUZZING) AND NOT(WASM))
  barretenberg_module(main_bench bb-cli-lib)
endif()
