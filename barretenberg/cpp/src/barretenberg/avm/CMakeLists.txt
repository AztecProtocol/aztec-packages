# bb-avm-sim: the AVM simulator as a service over avm_schema.json. Three artifacts carry it to
# @aztec-foundation/bb-avm-sim (barretenberg/ts/bb-avm-sim):
#   - the bb-avm-sim binary (native builds), served over IPC, reaching world state and contract
#     data through its wsdb and cdb IPC clients;
#   - bb-avm-sim.wasm, a WASI reactor (wasm builds) exporting the generated FFI
#     (avm_ipc_ffi_create/_call/...), reaching world state and contract data through the same clients over
#     its host's ipc_runtime.host_call import (targets "wsdb" and "cdb");
#   - libbb_avm_sim.so (native builds), the same FFI as a plain shared library for the
#     package's napi transport, whose host calls go to the function its loader sets
#     (avm_ipc_ffi_set_host_call; ipc-runtime's addon answers them in JS).
set(AVM_SCHEMA ${CMAKE_CURRENT_SOURCE_DIR}/avm_schema.json)
# Generated code is per build tree (each preset generates its own, so presets building at once never
# share a file). Remove the copy older checkouts generated into the source tree: it would shadow this one.
file(REMOVE_RECURSE ${CMAKE_CURRENT_SOURCE_DIR}/generated)
set(AVM_GEN_DIR ${CMAKE_CURRENT_BINARY_DIR}/generated)
set(AVM_GEN_OUTPUTS
    ${AVM_GEN_DIR}/avm_dispatch.hpp
    ${AVM_GEN_DIR}/avm_ffi.cpp
    ${AVM_GEN_DIR}/avm_ffi.hpp
    ${AVM_GEN_DIR}/avm_ipc_server.hpp
    ${AVM_GEN_DIR}/avm_types.hpp
)
set(IPC_CODEGEN_DIR ${CMAKE_SOURCE_DIR}/../../ipc-codegen)
file(GLOB_RECURSE IPC_CODEGEN_SRC
    ${IPC_CODEGEN_DIR}/src/*.ts
)
add_custom_command(
    OUTPUT ${AVM_GEN_OUTPUTS}
    COMMAND ${IPC_CODEGEN_DIR}/bin/ipc-codegen.mjs
            --schema ${AVM_SCHEMA}
            --lang cpp
            --out ${AVM_GEN_DIR}
            --server
            --ffi
            --cpp-namespace bb::avm
            --cpp-include-dir barretenberg/avm/generated
    DEPENDS ${AVM_SCHEMA} ${IPC_CODEGEN_SRC}
    COMMENT "Generating the AVM IPC server and FFI from avm_schema.json"
    VERBATIM
)
add_custom_target(avm_ipc_generated DEPENDS ${AVM_GEN_OUTPUTS})

# The service as a library over the generated FFI, which the wasm reactor exports and the
# tests call. The entry is generated into the build tree, which the module's source glob does not cover.
barretenberg_module_with_sources(
    avm_ffi
    SOURCE_FILES
        ${CMAKE_CURRENT_SOURCE_DIR}/avm_service.cpp
        ${CMAKE_CURRENT_SOURCE_DIR}/avm_simulate.cpp
        ${CMAKE_CURRENT_SOURCE_DIR}/avm_simulate_with_hints.cpp
        ${AVM_GEN_DIR}/avm_ffi.cpp
    HEADER_FILES
        ${CMAKE_CURRENT_SOURCE_DIR}/avm_simulate.hpp
        ${CMAKE_CURRENT_SOURCE_DIR}/avm_simulate_with_hints.hpp
    TEST_SOURCE_FILES ${CMAKE_CURRENT_SOURCE_DIR}/avm_ffi.test.cpp
    DEPENDENCIES vm2_sim wsdb_ipc_merkle_db cdb_ipc_client
)
add_dependencies(avm_ffi_objects avm_ipc_generated wsdb_ipc_generated cdb_ipc_generated)
target_link_libraries(avm_ffi_objects PRIVATE wsdb_ipc_merkle_db cdb_ipc_client)
if(TARGET avm_ffi_test_objects)
    add_dependencies(avm_ffi_test_objects avm_ipc_generated wsdb_ipc_generated cdb_ipc_generated wsdb_ref_generated)
    target_link_libraries(avm_ffi_test_objects PRIVATE wsdb_ipc_merkle_db cdb_ipc_client)
    # Simulate is tested over wsdb-ref, linked in and reached through a host_call the test defines.
    target_link_libraries(avm_ffi_tests PRIVATE wsdb_ref)
endif()

if(WASM)
    # A standard WASI reactor exporting the FFI, like barretenberg.wasm: wasi-sdk's reactor
    # startup provides _initialize, and the module imports nothing but WASI.
    add_executable(
        bb-avm-sim-debug.wasm
        $<TARGET_OBJECTS:avm_ffi_objects>
    )
    target_link_libraries(bb-avm-sim-debug.wasm PRIVATE vm2_sim wsdb_ipc_merkle_db cdb_ipc_client)
    target_link_options(bb-avm-sim-debug.wasm PRIVATE -mexec-model=reactor -Wl,--export-dynamic)
    add_custom_command(
        OUTPUT ${CMAKE_BINARY_DIR}/bin/bb-avm-sim.wasm
        COMMAND ${CMAKE_STRIP} ${CMAKE_BINARY_DIR}/bin/bb-avm-sim-debug.wasm -o ${CMAKE_BINARY_DIR}/bin/bb-avm-sim.wasm
        DEPENDS bb-avm-sim-debug.wasm
        COMMENT "Stripping debug info to create bb-avm-sim.wasm"
    )
    add_custom_target(bb-avm-sim.wasm ALL DEPENDS ${CMAKE_BINARY_DIR}/bin/bb-avm-sim.wasm)
    return()
endif()

add_executable(
    bb-avm-sim
    main.cpp
    cli.cpp
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
    avm_ffi
    vm2_sim
    wsdb_ipc_merkle_db
    cdb_ipc_client
    ipc_runtime
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

# The FFI as a plain shared library, for the napi transport, built like wsdb-ref's (see
# wsdb_ref/CMakeLists.txt): ipc-runtime's Node-API addon loads it, and it exports only the FFI symbols.
add_library(bb_avm_sim_ffi SHARED $<TARGET_OBJECTS:avm_ffi_objects>)
target_link_libraries(bb_avm_sim_ffi PRIVATE vm2_sim wsdb_ipc_merkle_db cdb_ipc_client)
set_target_properties(bb_avm_sim_ffi PROPERTIES
    PREFIX "lib"
    SUFFIX ".so"
    OUTPUT_NAME bb_avm_sim
    LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)
if(NOT APPLE)
    set(BB_AVM_SIM_FFI_VERSION_SCRIPT ${CMAKE_CURRENT_BINARY_DIR}/bb_avm_sim_ffi.map)
    file(WRITE ${BB_AVM_SIM_FFI_VERSION_SCRIPT} "{ global: avm_ipc_ffi_*; local: *; };\n")
    target_link_options(bb_avm_sim_ffi PRIVATE "LINKER:--version-script,${BB_AVM_SIM_FFI_VERSION_SCRIPT}")
    set_property(TARGET bb_avm_sim_ffi APPEND PROPERTY LINK_DEPENDS ${BB_AVM_SIM_FFI_VERSION_SCRIPT})
endif()
