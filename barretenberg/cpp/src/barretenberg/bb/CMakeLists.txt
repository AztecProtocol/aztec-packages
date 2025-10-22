if (NOT(FUZZING))
    # bb binary with optional dynamic AVM loading
    # AVM functionality is provided by libvm2.so/dylib if present at runtime
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

    # Set RPATH so bb can find libvm2.so/dylib in the same directory
    if(CMAKE_SYSTEM_NAME STREQUAL "Darwin")
        # On macOS, use @executable_path to find library next to executable
        set_target_properties(bb PROPERTIES
            INSTALL_RPATH "@executable_path"
            BUILD_WITH_INSTALL_RPATH TRUE
        )
    else()
        # On Linux, use $ORIGIN to find library next to executable
        set_target_properties(bb PROPERTIES
            INSTALL_RPATH "$ORIGIN"
            BUILD_WITH_INSTALL_RPATH TRUE
        )
    endif()

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
endif()
