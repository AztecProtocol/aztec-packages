if (NOT(FUZZING) AND NOT(WASM))
    add_executable(
        bb11
        main.cpp
    )

    target_link_libraries(
        bb11
        PRIVATE
        barretenberg
        env
        circuit_checker
        ${TRACY_LIBS}
        libdeflate::libdeflate_static
    )
    if(CHECK_CIRCUIT_STACKTRACES)
        target_link_libraries(
            bb11
            PUBLIC
            Backward::Interface
        )
        target_link_options(
            bb11
            PRIVATE
            -ldw -lelf
        )
    endif()
endif()