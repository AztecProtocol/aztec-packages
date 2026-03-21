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
endif()
