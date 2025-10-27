if (NOT(FUZZING))
    # Default lightweight bb binary without AVM support
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
        vm2_stub
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

    if(AVM)
        # Full bb-avm binary with AVM support (opt-in)
        add_executable(
            bb-avm
            main.cpp
            cli.cpp
        )
        target_link_libraries(
            bb-avm
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
            target_link_libraries(bb-avm PRIVATE ${AVM_TRANSPILER_LIB})
        endif()
        if(NOT WASM)
            target_link_libraries(bb-avm PRIVATE ipc)
        endif()
        if(ENABLE_STACKTRACES)
            target_link_libraries(
                bb-avm
                PUBLIC
                Backward::Interface
            )
            target_link_options(
                bb-avm
                PRIVATE
                -ldw -lelf
            )
        endif()
    endif()
endif()
