if(NOT(FUZZING) AND NOT(WASM))
    # IPC client library (used by AVM simulator to talk to aztec-cdb)
    add_library(
        cdb_ipc_client
        STATIC
        cdb_ipc_client_generated.cpp
        cdb_ipc_client.cpp
    )
    target_link_libraries(
        cdb_ipc_client
        PUBLIC
        barretenberg
        ipc
    )

    # aztec-cdb binary (schema provider for codegen)
    add_executable(
        aztec-cdb
        main.cpp
        cli.cpp
    )
    target_link_libraries(
        aztec-cdb
        PRIVATE
        barretenberg
        ipc
    )
    if(ENABLE_STACKTRACES)
        target_link_libraries(
            aztec-cdb
            PUBLIC
            Backward::Interface
        )
        target_link_options(
            aztec-cdb
            PRIVATE
            -ldw -lelf
        )
    endif()
endif()
