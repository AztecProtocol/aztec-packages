if(NOT(FUZZING) AND NOT(WASM))
    # IPC adapter library (WsdbIpcMerkleDB + related adapters)
    add_library(
        avm_ipc_adapters
        STATIC
        wsdb_ipc_merkle_db.cpp
    )
    target_link_libraries(
        avm_ipc_adapters
        PUBLIC
        barretenberg
        wsdb_ipc_client
        cdb_ipc_client
        ipc
    )

    # aztec-avm binary (standalone AVM simulator server)
    add_executable(
        aztec-avm
        main.cpp
        cli.cpp
        avm_execute.cpp
        avm_ipc_server.cpp
        avm_ipc_server_generated.cpp
    )
    target_link_libraries(
        aztec-avm
        PRIVATE
        barretenberg
        vm2_sim
        avm_ipc_adapters
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
