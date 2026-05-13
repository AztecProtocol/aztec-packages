if(NOT(FUZZING) AND NOT(WASM))
    # aztec-kvdb binary (standalone LMDB-backed key-value store server). Used by
    # archiver, p2p, pxe, slasher, and validator-ha-signer via the @aztec/kv-store
    # `lmdb-v2` backend. Communicates with the TS host over UDS or MPSC SHM.
    add_executable(
        aztec-kvdb
        main.cpp
        cli.cpp
        kvdb_ipc_server.cpp
    )
    target_link_libraries(
        aztec-kvdb
        PRIVATE
        lmdblib
        ipc
        env
    )
    if(ENABLE_STACKTRACES)
        target_link_libraries(
            aztec-kvdb
            PUBLIC
            Backward::Interface
        )
        target_link_options(
            aztec-kvdb
            PRIVATE
            -ldw -lelf
        )
    endif()
endif()
