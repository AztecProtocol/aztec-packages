# Used also by bb_cli_bench
barretenberg_module(
    bb-cli-lib
    barretenberg
    env
    api
    circuit_checker
    ${TRACY_LIBS}
    libdeflate::libdeflate_static)

if(NOT DISABLE_AZTEC_VM)
    add_dependencies(bb-cli-lib vm2)
endif()

if (NOT(FUZZING))
    add_executable(
        bb
        main.cpp
    )
    target_link_libraries(
        bb
        PRIVATE
        bb-cli-lib
        tracy_mem
    )
    if(CHECK_CIRCUIT_STACKTRACES)
        target_link_libraries(
            bb
            PUBLIC
            Backward::Interface
        )
        target_link_options(
            bb
            PRIVATE
            -ldw -lelf
        )
    endif()
endif()
