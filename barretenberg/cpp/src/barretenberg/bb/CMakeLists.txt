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
    if(GPU)
        # WHOLE_ARCHIVE: the GPU MSM hook is a strong definition overriding a weak
        # symbol in ecc; without it the archive member is never extracted since bb
        # doesn't reference ecc_gpu symbols directly.
        target_link_libraries(bb PRIVATE "$<LINK_LIBRARY:WHOLE_ARCHIVE,ecc_gpu>")
    endif()
    if(NOT WASM AND NOT BB_LITE)
        target_link_libraries(bb PRIVATE ipc)
        # bb-msm daemon client: the facade-hook TU is compiled directly into the binary
        # (not archived) so its strong definition of the weak IPC MSM symbol in ecc is
        # always extracted — the zig release linker has no whole-archive support.
        target_sources(bb PRIVATE ../msm_service/msm_facade_client.cpp)
        target_link_libraries(bb PRIVATE msm_ipc_client)
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
        if(GPU)
            target_link_libraries(bb-avm PRIVATE "$<LINK_LIBRARY:WHOLE_ARCHIVE,ecc_gpu>")
        endif()
        if(NOT WASM AND NOT BB_LITE)
            target_link_libraries(bb-avm PRIVATE ipc)
            target_sources(bb-avm PRIVATE ../msm_service/msm_facade_client.cpp)
            target_link_libraries(bb-avm PRIVATE msm_ipc_client)
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
