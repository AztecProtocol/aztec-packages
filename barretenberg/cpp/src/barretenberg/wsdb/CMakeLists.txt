if(NOT(FUZZING) AND NOT(WASM))
    # IPC client library (used by AVM simulator to talk to aztec-wsdb)
    # Generated via: cd barretenberg/ts && npx tsx src/aztec-wsdb/generate.ts
    add_library(
        wsdb_ipc_client
        STATIC
        wsdb_ipc_client_generated.cpp
    )
    target_link_libraries(
        wsdb_ipc_client
        PUBLIC
        barretenberg
        ipc
    )

    # aztec-wsdb binary (standalone world state database server)
    add_executable(
        aztec-wsdb
        main.cpp
        cli.cpp
        wsdb_execute.cpp
        wsdb_ipc_server.cpp
    )
    target_link_libraries(
        aztec-wsdb
        PRIVATE
        barretenberg
        world_state
        ipc
        env
    )
    if(ENABLE_STACKTRACES)
        target_link_libraries(
            aztec-wsdb
            PUBLIC
            Backward::Interface
        )
        target_link_options(
            aztec-wsdb
            PRIVATE
            -ldw -lelf
        )
    endif()

    # Wire-format compatibility tests
    # Uses the same pattern as barretenberg_module() for ABI compatibility with gtest.
    add_library(
        wsdb_wire_compat_test_objects
        OBJECT
        wsdb_wire_compat.test.cpp
    )
    target_link_libraries(
        wsdb_wire_compat_test_objects
        PRIVATE
        barretenberg
        world_state
        GTest::gtest
        GTest::gtest_main
        GTest::gmock_main
    )

    add_executable(
        wsdb_wire_compat_tests
        $<TARGET_OBJECTS:wsdb_wire_compat_test_objects>
    )
    target_link_libraries(
        wsdb_wire_compat_tests
        PRIVATE
        barretenberg
        world_state
        GTest::gtest
        GTest::gtest_main
        GTest::gmock_main
    )
    gtest_discover_tests(wsdb_wire_compat_tests)
endif()
