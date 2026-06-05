if(NOT(FUZZING) AND NOT(WASM))
    # WSDB IPC client library - bridges callers to aztec-wsdb over IPC.
    # Implements LowLevelMerkleDBInterface so the AVM simulator can talk to a
    # standalone aztec-wsdb process instead of an in-process WorldState.
    add_library(
        wsdb_client
        STATIC
        wsdb_ipc_merkle_db.cpp
    )
    target_link_libraries(
        wsdb_client
        PUBLIC
        barretenberg
        wsdb_ipc_client
        ipc
        vm2_sim
    )
    set_target_properties(wsdb_client PROPERTIES POSITION_INDEPENDENT_CODE ON)
endif()
