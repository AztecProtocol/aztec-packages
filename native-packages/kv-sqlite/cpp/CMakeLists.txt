cmake_minimum_required(VERSION 3.24)
# kv-sqlite: the Kv service (../kv_schema.jsonc) over SQLite3 Multiple Ciphers, built as
#   - kv-sqlite, the server process;
#   - libkv_sqlite, the same service in-process (kv_sqlite_ipc_ffi_*).
project(aztec_kv_sqlite C CXX)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()
set(pkg "${CMAKE_CURRENT_SOURCE_DIR}/..")
set(foundation "${pkg}/../..")
set(gen "${CMAKE_BINARY_DIR}/gen")
option(KV_BUILD_TESTS "Build kv_tests" ON)

add_compile_definitions(MSGPACK_NO_BOOST MSGPACK_USE_STD_VARIANT_ADAPTOR)

# --- Dependencies -------------------------------------------------------------------------------
include(FetchContent)
# The SQLite3 Multiple Ciphers release @aztec-labs/kv-store's browser store (sqlite3mc-wasm) is built from, so a
# database has one format wherever it is opened.
FetchContent_Declare(sqlite3mc
    URL https://github.com/utelle/SQLite3MultipleCiphers/releases/download/v2.6.1/sqlite3mc-2.6.1-sqlite-3.54.0-amalgamation.zip
    URL_HASH SHA256=3f25af603566a23c821d8e581778b5ece2a541d2435776de57b8d845c176815a
    DOWNLOAD_EXTRACT_TIMESTAMP TRUE)
FetchContent_Declare(msgpack_c
    GIT_REPOSITORY https://github.com/msgpack/msgpack-c.git
    GIT_TAG 8c602e8579c7e7d65d6f9c6703c9699db3fb0488
    GIT_SHALLOW TRUE)
FetchContent_MakeAvailable(sqlite3mc)
FetchContent_GetProperties(msgpack_c)
if(NOT msgpack_c_POPULATED)
    FetchContent_Populate(msgpack_c)
endif()

set(IPC_RUNTIME_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(IPC_RUNTIME_BUILD_NAPI OFF CACHE BOOL "" FORCE)
add_subdirectory(${foundation}/ipc-runtime/cpp ${CMAKE_BINARY_DIR}/_deps/ipc-runtime)

# --- Generated code -----------------------------------------------------------------------------
# The Kv server dispatch and FFI; regenerated whenever configure runs, which its inputs below trigger.
execute_process(
    COMMAND node --experimental-strip-types --no-warnings ${foundation}/ipc-codegen/src/generate.ts
            --schema ${pkg}/kv_schema.jsonc --lang cpp --out ${gen}/generated
            --server --cpp-namespace aztec::kv --cpp-include-dir generated --ffi --ffi-name kv_sqlite
    COMMAND_ERROR_IS_FATAL ANY OUTPUT_QUIET)
file(GLOB_RECURSE ipc_codegen_sources ${foundation}/ipc-codegen/src/*.ts ${foundation}/ipc-codegen/templates/cpp/*)
set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS
    ${pkg}/kv_schema.jsonc ${ipc_codegen_sources})

# --- SQLite -------------------------------------------------------------------------------------
add_library(kv_sqlite3mc STATIC ${sqlite3mc_SOURCE_DIR}/sqlite3mc_amalgamation.c)
target_include_directories(kv_sqlite3mc PUBLIC ${sqlite3mc_SOURCE_DIR})
target_compile_definitions(kv_sqlite3mc PRIVATE
    SQLITE_DQS=0
    SQLITE_OMIT_LOAD_EXTENSION=1
    SQLITE_OMIT_SHARED_CACHE=1
    SQLITE_DEFAULT_MEMSTATUS=0
    SQLITE_LIKE_DOESNT_MATCH_BLOBS=1)
target_compile_options(kv_sqlite3mc PRIVATE -w)
target_compile_definitions(kv_sqlite3mc PRIVATE SQLITE_THREADSAFE=1)
find_package(Threads REQUIRED)
target_link_libraries(kv_sqlite3mc PUBLIC Threads::Threads ${CMAKE_DL_LIBS})

# --- The service --------------------------------------------------------------------------------
add_library(kv_service STATIC src/kv/store.cpp src/kv/kv_service.cpp src/kv/files_native.cpp)
target_include_directories(kv_service PUBLIC src/kv ${gen} ${gen}/generated ${msgpack_c_SOURCE_DIR}/include)
target_link_libraries(kv_service PUBLIC kv_sqlite3mc ipc_runtime)

add_executable(kv-sqlite src/kv/main.cpp)
target_link_libraries(kv-sqlite PRIVATE kv_service)

# Exports only the kv_sqlite_ipc_ffi_* symbols, so SQLite and everything else it links stay private to it.
add_library(kv_sqlite_ffi SHARED ${gen}/generated/kv_ffi.cpp)
target_link_libraries(kv_sqlite_ffi PRIVATE kv_service)
set_target_properties(kv_sqlite_ffi PROPERTIES
    OUTPUT_NAME kv_sqlite
    LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib
    CXX_VISIBILITY_PRESET hidden)
if(APPLE)
    target_link_options(kv_sqlite_ffi PRIVATE "-Wl,-exported_symbol,_kv_sqlite_ipc_ffi_*")
else()
    set(ffi_map "${CMAKE_CURRENT_BINARY_DIR}/kv_sqlite_ffi.map")
    file(WRITE ${ffi_map} "{ global: kv_sqlite_ipc_ffi_*; local: *; };\n")
    target_link_options(kv_sqlite_ffi PRIVATE "-Wl,--version-script=${ffi_map}")
    set_property(TARGET kv_sqlite_ffi APPEND PROPERTY LINK_DEPENDS ${ffi_map})
endif()

if(KV_BUILD_TESTS)
    set(INSTALL_GTEST OFF CACHE BOOL "" FORCE)
    FetchContent_Declare(googletest GIT_REPOSITORY https://github.com/google/googletest.git GIT_TAG v1.13.0 GIT_SHALLOW TRUE)
    FetchContent_MakeAvailable(googletest)
    add_executable(kv_tests src/kv/store.test.cpp)
    target_link_libraries(kv_tests PRIVATE kv_service gtest_main gtest)
endif()
