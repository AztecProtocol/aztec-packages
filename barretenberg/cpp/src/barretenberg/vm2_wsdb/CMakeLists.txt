# VM2 adapter for native AVM simulation against aztec-wsdb.
if(TARGET vm2_sim AND TARGET wsdb_ipc_client)
    add_library(
        wsdb_ipc_merkle_db
        STATIC
        wsdb_ipc_merkle_db.cpp
    )
    target_link_libraries(
        wsdb_ipc_merkle_db
        PUBLIC
        barretenberg
        vm2_sim
        wsdb_ipc_client
    )
    set_target_properties(wsdb_ipc_merkle_db PROPERTIES POSITION_INDEPENDENT_CODE ON)
endif()
