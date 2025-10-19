if (NOT(FUZZING))
    # Full bb binary with AVM support
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
        vm2
        ${TRACY_LIBS}
        libdeflate::libdeflate_static
        tracy_mem
    )
    # Link avm_transpiler when library is provided
    if(AVM_TRANSPILER_LIB)
        target_link_libraries(bb PRIVATE ${AVM_TRANSPILER_LIB})
    endif()
    if(NOT WASM)
        target_link_libraries(bb PRIVATE ipc)
    endif()
    if(ENABLE_STACKTRACES)
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

    # Lightweight bb-no-avm binary without AVM support
    add_executable(
        bb-no-avm
        main.cpp
        cli.cpp
    )
    target_link_libraries(
        bb-no-avm
        PRIVATE
        barretenberg
        env
        api
        circuit_checker
        vm2_stub
        ${TRACY_LIBS}
        libdeflate::libdeflate_static
        tracy_mem
    )
    # Link avm_transpiler when library is provided
    if(AVM_TRANSPILER_LIB)
        target_link_libraries(bb-no-avm PRIVATE ${AVM_TRANSPILER_LIB})
    endif()
    if(NOT WASM)
        target_link_libraries(bb-no-avm PRIVATE ipc)
    endif()
    if(ENABLE_STACKTRACES)
        target_link_libraries(
            bb-no-avm
            PUBLIC
            Backward::Interface
        )
        target_link_options(
            bb-no-avm
            PRIVATE
            -ldw -lelf
        )
    endif()
endif()
