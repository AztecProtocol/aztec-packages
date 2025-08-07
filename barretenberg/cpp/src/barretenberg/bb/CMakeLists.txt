barretenberg_module(
    bb-cli-lib
    barretenberg
    env
    api
    circuit_checker
    ${TRACY_LIBS}
    libdeflate::libdeflate_static)

target_link_libraries(bb-cli-lib_objects PRIVATE benchmark::benchmark)

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
        benchmark::benchmark
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
