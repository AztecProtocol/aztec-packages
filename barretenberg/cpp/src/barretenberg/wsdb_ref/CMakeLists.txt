# wsdb-ref: the in-memory reference world state (world_state_reference) as a service over the wsdb
# base contract, ../world_state_reference/wsdb_base_schema.jsonc. The generated dispatch runs the
# handlers here; the generated FFI entry (wsdb_ipc_ffi_entry) runs the dispatch in-process. Two
# artifacts carry that entry to @aztec-foundation/wsdb-ref (barretenberg/ts/wsdb-ref):
#   - wsdb-ref.wasm, a WASI reactor (wasm builds), for the package's wasm transport;
#   - wsdb_ref_napi.node, a Node-API addon over the entry (native builds), for its napi transport.
set(WSDB_REF_SCHEMA ${CMAKE_CURRENT_SOURCE_DIR}/../world_state_reference/wsdb_base_schema.jsonc)
set(WSDB_REF_GEN_DIR ${CMAKE_CURRENT_SOURCE_DIR}/generated)
set(WSDB_REF_GEN_OUTPUTS
    ${WSDB_REF_GEN_DIR}/wsdb_dispatch.hpp
    ${WSDB_REF_GEN_DIR}/wsdb_ffi.cpp
    ${WSDB_REF_GEN_DIR}/wsdb_ffi.hpp
    ${WSDB_REF_GEN_DIR}/wsdb_ipc_server.hpp
    ${WSDB_REF_GEN_DIR}/wsdb_napi.cpp
    ${WSDB_REF_GEN_DIR}/wsdb_types.hpp
    ${WSDB_REF_GEN_DIR}/ipc_codegen/msgpack_adaptor.hpp
    ${WSDB_REF_GEN_DIR}/ipc_codegen/msgpack_include.hpp
    ${WSDB_REF_GEN_DIR}/ipc_codegen/throw.hpp
)
set(IPC_CODEGEN_DIR ${CMAKE_SOURCE_DIR}/../../ipc-codegen)
file(GLOB_RECURSE IPC_CODEGEN_SRC ${IPC_CODEGEN_DIR}/src/*.ts ${IPC_CODEGEN_DIR}/templates/cpp/*.hpp)
add_custom_command(
    OUTPUT ${WSDB_REF_GEN_OUTPUTS}
    COMMAND node --experimental-strip-types --no-warnings
            ${IPC_CODEGEN_DIR}/src/generate.ts
            --schema ${WSDB_REF_SCHEMA}
            --lang cpp
            --out ${WSDB_REF_GEN_DIR}
            --server
            --ffi
            --napi
            --cpp-namespace bb::wsdb_ref
            --cpp-include-dir barretenberg/wsdb_ref/generated
    DEPENDS ${WSDB_REF_SCHEMA} ${IPC_CODEGEN_SRC}
    COMMENT "Generating the wsdb-ref dispatch, FFI entry and Node-API addon from wsdb_base_schema.jsonc"
    VERBATIM
)
add_custom_target(wsdb_ref_generated DEPENDS ${WSDB_REF_GEN_OUTPUTS})

# Explicit sources: the generated Node-API addon must stay out of the module (it needs napi.h), and
# the generated FFI entry does not exist yet when a clean tree is configured.
file(GLOB WSDB_REF_TESTS CONFIGURE_DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/*.test.cpp)
barretenberg_module_with_sources(
    wsdb_ref
    SOURCE_FILES ${CMAKE_CURRENT_SOURCE_DIR}/wsdb_ref_handlers.cpp ${WSDB_REF_GEN_DIR}/wsdb_ffi.cpp
    HEADER_FILES ${CMAKE_CURRENT_SOURCE_DIR}/wsdb_ref_handlers.hpp
    TEST_SOURCE_FILES ${WSDB_REF_TESTS}
    DEPENDENCIES world_state_reference
)
add_dependencies(wsdb_ref_objects wsdb_ref_generated)
if(TARGET wsdb_ref_test_objects)
    add_dependencies(wsdb_ref_test_objects wsdb_ref_generated)
endif()
set_target_properties(wsdb_ref_objects PROPERTIES POSITION_INDEPENDENT_CODE ON)

if(WASM)
    # A WASI reactor exporting the FFI entry: the module and its dependencies plus barretenberg/wasi
    # (the env functions over WASI, and _initialize). It asks its host for WASI alone.
    add_executable(
        wsdb-ref-debug.wasm
        $<TARGET_OBJECTS:wsdb_ref_objects>
        $<TARGET_OBJECTS:wasi_objects>
    )
    target_link_libraries(wsdb-ref-debug.wasm PRIVATE world_state_reference)
    target_link_options(wsdb-ref-debug.wasm PRIVATE -nostartfiles -Wl,--no-entry,--export-dynamic)
    add_custom_command(
        OUTPUT ${CMAKE_BINARY_DIR}/bin/wsdb-ref.wasm
        COMMAND ${CMAKE_STRIP} ${CMAKE_BINARY_DIR}/bin/wsdb-ref-debug.wasm -o ${CMAKE_BINARY_DIR}/bin/wsdb-ref.wasm
        DEPENDS wsdb-ref-debug.wasm
        COMMENT "Stripping debug info to create wsdb-ref.wasm"
    )
    add_custom_target(wsdb-ref.wasm ALL DEPENDS ${CMAKE_BINARY_DIR}/bin/wsdb-ref.wasm)
else()
    # The Node-API addon over the FFI entry. Its headers come from the node-addon-api and
    # node-api-headers packages ipc-runtime already pins for its own addon.
    set(NAPI_PACKAGE_DIR ${CMAKE_SOURCE_DIR}/../../ipc-runtime/cpp/napi)
    execute_process(COMMAND yarn --immutable WORKING_DIRECTORY ${NAPI_PACKAGE_DIR} OUTPUT_QUIET)
    execute_process(
        COMMAND node -p "require('node-addon-api').include"
        WORKING_DIRECTORY ${NAPI_PACKAGE_DIR}
        OUTPUT_VARIABLE NODE_ADDON_API_DIR
    )
    execute_process(
        COMMAND node -p "require('node-api-headers').include_dir"
        WORKING_DIRECTORY ${NAPI_PACKAGE_DIR}
        OUTPUT_VARIABLE NODE_API_HEADERS_DIR
    )
    string(REGEX REPLACE "[\r\n\"]" "" NODE_ADDON_API_DIR "${NODE_ADDON_API_DIR}")
    string(REGEX REPLACE "[\r\n\"]" "" NODE_API_HEADERS_DIR "${NODE_API_HEADERS_DIR}")

    add_library(wsdb_ref_napi SHARED ${WSDB_REF_GEN_DIR}/wsdb_napi.cpp)
    add_dependencies(wsdb_ref_napi wsdb_ref_generated)
    target_compile_definitions(wsdb_ref_napi PRIVATE NAPI_VERSION=9)
    target_include_directories(wsdb_ref_napi SYSTEM PRIVATE ${NODE_API_HEADERS_DIR} ${NODE_ADDON_API_DIR})
    target_link_libraries(wsdb_ref_napi PRIVATE wsdb_ref world_state_reference)
    set_target_properties(wsdb_ref_napi PROPERTIES
        PREFIX ""
        SUFFIX ".node"
        OUTPUT_NAME wsdb_ref_napi
        LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)
    # Node provides the N-API symbols at load time.
    if(CMAKE_SYSTEM_NAME STREQUAL "Darwin")
        target_link_options(wsdb_ref_napi PRIVATE -undefined dynamic_lookup)
    endif()
endif()
