barretenberg_module(env)

if(CHECK_CIRCUIT_STACKTRACES OR ENABLE_STACKTRACES)
    target_link_libraries(env PUBLIC dw elf)
endif()