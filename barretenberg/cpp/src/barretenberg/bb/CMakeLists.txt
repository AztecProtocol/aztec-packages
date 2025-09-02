if (NOT(FUZZING))
    add_executable(
        bb
        main.cpp
        cli.cpp
    )
    target_link_libraries(
        bb
        PRIVATE
        barretenberg
        env
        api
        circuit_checker
        ${TRACY_LIBS}
        libdeflate::libdeflate_static
        tracy_mem
    )
    if(NOT DISABLE_AZTEC_VM)
        add_dependencies(bb vm2)
    endif()
    if(CHECK_CIRCUIT_STACKTRACES OR ENABLE_STACKTRACES)
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
