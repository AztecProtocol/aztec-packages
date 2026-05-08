if(NOT(FUZZING) AND NOT(WASM))
    # aztec-avm binary (standalone AVM simulator server). Connects to a running aztec-wsdb over
    # UDS for tree access (via wsdb_client::WsdbIpcMerkleDB) and to a TS-hosted CdbIpcServer for
    # contract data.
    add_executable(
        aztec-avm
        main.cpp
        cli.cpp
        avm_execute.cpp
        avm_ipc_server.cpp
    )
    target_link_libraries(
        aztec-avm
        PRIVATE
        barretenberg
        vm2_sim
        wsdb_client
        cdb_ipc_client
        ipc
        env
    )
    if(ENABLE_STACKTRACES)
        target_link_libraries(
            aztec-avm
            PUBLIC
            Backward::Interface
        )
        target_link_options(
            aztec-avm
            PRIVATE
            -ldw -lelf
        )
    endif()
endif()
