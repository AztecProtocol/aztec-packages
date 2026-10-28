# VM2 binding to the wsdb service: the generated IPC client plus the AVM adapter
# (WsdbIpcMerkleDB) that drives native AVM simulation against aztec-wsdb.
#
# The wsdb wire contract (wsdb_schema.jsonc) lives with wsdb-ref, its reference implementation, in
# ../wsdb_ref. The AVM only needs the generated client.
if(TARGET vm2_sim)
    set(WSDB_SCHEMA ${CMAKE_CURRENT_SOURCE_DIR}/../wsdb_ref/wsdb_schema.jsonc)
    set(WSDB_GEN_DIR ${CMAKE_CURRENT_SOURCE_DIR}/generated)
    set(WSDB_GEN_OUTPUTS
        ${WSDB_GEN_DIR}/wsdb_client.hpp
        ${WSDB_GEN_DIR}/wsdb_types.hpp
        ${WSDB_GEN_DIR}/ipc_codegen/backend.hpp
        ${WSDB_GEN_DIR}/ipc_codegen/ipc_backend.hpp
        ${WSDB_GEN_DIR}/ipc_codegen/msgpack_adaptor.hpp
        ${WSDB_GEN_DIR}/ipc_codegen/msgpack_include.hpp
        ${WSDB_GEN_DIR}/ipc_codegen/throw.hpp
    )
    set(IPC_CODEGEN_DIR ${CMAKE_SOURCE_DIR}/../../ipc-codegen)
    file(GLOB_RECURSE IPC_CODEGEN_SRC
        ${IPC_CODEGEN_DIR}/src/*.ts
        ${IPC_CODEGEN_DIR}/templates/cpp/*.hpp
    )
    add_custom_command(
        OUTPUT ${WSDB_GEN_OUTPUTS}
        COMMAND node --experimental-strip-types --no-warnings
                ${IPC_CODEGEN_DIR}/src/generate.ts
                --schema ${WSDB_SCHEMA}
                --lang cpp
                --out ${WSDB_GEN_DIR}
                --client
                --cpp-namespace bb::wsdb
                --cpp-include-dir barretenberg/vm2_wsdb/generated
        DEPENDS ${WSDB_SCHEMA} ${IPC_CODEGEN_SRC}
        COMMENT "Generating WSDB IPC client from wsdb_ref/wsdb_schema.jsonc"
        VERBATIM
    )
    add_custom_target(wsdb_ipc_generated DEPENDS ${WSDB_GEN_OUTPUTS})

    add_library(
        wsdb_ipc_merkle_db
        STATIC
        wsdb_ipc_merkle_db.cpp
    )
    add_dependencies(wsdb_ipc_merkle_db wsdb_ipc_generated)
    target_include_directories(
        wsdb_ipc_merkle_db
        PUBLIC
        ${WSDB_GEN_DIR}
    )
    target_link_libraries(
        wsdb_ipc_merkle_db
        PUBLIC
        barretenberg
        vm2_sim
        ipc_runtime
    )
    set_target_properties(wsdb_ipc_merkle_db PROPERTIES POSITION_INDEPENDENT_CODE ON)
endif()
