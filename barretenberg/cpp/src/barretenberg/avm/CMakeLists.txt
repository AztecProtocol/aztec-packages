set(AVM_SCHEMA ${CMAKE_CURRENT_SOURCE_DIR}/avm_schema.json)
set(AVM_GEN_DIR ${CMAKE_CURRENT_SOURCE_DIR}/generated)
set(AVM_GEN_OUTPUTS
    ${AVM_GEN_DIR}/avm_ipc_server.hpp
    ${AVM_GEN_DIR}/avm_types.hpp
    ${AVM_GEN_DIR}/ipc_codegen/msgpack_adaptor.hpp
    ${AVM_GEN_DIR}/ipc_codegen/msgpack_include.hpp
    ${AVM_GEN_DIR}/ipc_codegen/throw.hpp
)
set(IPC_CODEGEN_DIR ${CMAKE_SOURCE_DIR}/../../ipc-codegen)
file(GLOB_RECURSE IPC_CODEGEN_SRC
    ${IPC_CODEGEN_DIR}/src/*.ts
    ${IPC_CODEGEN_DIR}/templates/cpp/*.hpp
)
add_custom_command(
    OUTPUT ${AVM_GEN_OUTPUTS}
    COMMAND node --experimental-strip-types --experimental-transform-types --no-warnings
            ${IPC_CODEGEN_DIR}/src/generate.ts
            --schema ${AVM_SCHEMA}
            --lang cpp
            --out ${AVM_GEN_DIR}
            --server
            --cpp-namespace bb::avm
            --cpp-include-dir barretenberg/avm/generated
            --prefix Avm
            --strip-method-prefix
    DEPENDS ${AVM_SCHEMA} ${IPC_CODEGEN_SRC}
    COMMENT "Generating AVM IPC server from avm_schema.json"
    VERBATIM
)
add_custom_target(avm_ipc_generated DEPENDS ${AVM_GEN_OUTPUTS})

add_executable(
    bb-avm-sim
    main.cpp
    cli.cpp
    avm_execute.cpp
    avm_ipc_server.cpp
)
add_dependencies(bb-avm-sim avm_ipc_generated)
target_include_directories(
    bb-avm-sim
    PRIVATE
    ${AVM_GEN_DIR}
)
target_link_libraries(
    bb-avm-sim
    PRIVATE
    barretenberg
    vm2_sim
    wsdb_ipc_merkle_db
    cdb_ipc_client
    ipc_runtime
    env
)
if(ENABLE_STACKTRACES)
    target_link_libraries(
        bb-avm-sim
        PUBLIC
        Backward::Interface
    )
    target_link_options(
        bb-avm-sim
        PRIVATE
        -ldw -lelf
    )
endif()
