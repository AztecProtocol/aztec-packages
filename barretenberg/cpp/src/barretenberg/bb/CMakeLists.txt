if (NOT(FUZZING))
    # Default lightweight bb binary without AVM support
    add_executable(
        bb
        main.cpp
        cli.cpp
        curve_constants.cpp
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
        target_link_libraries(bb PRIVATE avm_transpiler)
    endif()
    # ipc_runtime is INTERFACE-only under WASM (headers, no transport), STATIC
    # natively — linking in both modes just propagates include paths so
    # bb/cli.cpp can find ipc_runtime/throw.hpp via the codegen-emitted
    # bb_types.hpp it transitively pulls in.
    if(NOT BB_LITE)
        target_link_libraries(bb PRIVATE ipc_runtime)
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
            curve_constants.cpp
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
            target_link_libraries(bb-avm PRIVATE avm_transpiler)
        endif()
        # ipc_runtime as above — INTERFACE under WASM, STATIC native.
        if(NOT BB_LITE)
            target_link_libraries(bb-avm PRIVATE ipc_runtime)
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
