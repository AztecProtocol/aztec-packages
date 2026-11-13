cmake_minimum_required(VERSION 3.24)
# aztec-wsdb: the world-state DB service. Compiles no barretenberg header. What it needs from outside
# this directory (barretenberg's libwsdb-ref.a, ipc-runtime, ipc-codegen and the schema) comes from
# this aztec-packages checkout; only the protocol constants come from the release pinned by tag in
# ../foundation.pin.
# NOTE: when native-packages moves out of aztec-packages, take all of it from the pinned release
# again: libwsdb-ref.a from the release's barretenberg-static-<arch>-<os>.tar.gz, and ipc-runtime/cpp,
# ipc-codegen and the schema from a sparse clone of aztec-packages at the tag.
project(aztec_wsdb CXX C)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()
set(pkg "${CMAKE_CURRENT_SOURCE_DIR}/..")
set(deps "${CMAKE_BINARY_DIR}/_deps")

# --- Dependencies -------------------------------------------------------------------------------
include(FetchContent)
# barretenberg's libwsdb-ref.a: the poseidon2 C bindings, and wsdb-ref (the reference world state)
# behind its FFI entry, which the differential test drives. It exports only those C symbols, so
# barretenberg's C++ (its own msgpack-c among it) cannot collide with this package's. bb-cpp-native
# builds it.
file(READ "${pkg}/foundation.pin" tag)
string(STRIP "${tag}" tag)
string(REGEX REPLACE "^v" "" version "${tag}")
set(foundation "${pkg}/../..")
set(bb_archive "${foundation}/barretenberg/cpp/build/lib/libwsdb-ref.a" CACHE FILEPATH
    "barretenberg's libwsdb-ref.a")
if(NOT EXISTS "${bb_archive}")
    message(FATAL_ERROR "No libwsdb-ref.a at ${bb_archive}: build barretenberg/cpp first")
endif()
option(WSDB_BUILD_TESTS "Build wsdb_tests and wsdb_bench" ON)
# The lmdblib sibling package (the lmdb C++ wrapper, with the lmdb and msgpack-c sources it fetches),
# built here for this toolchain and target.
set(lmdblib "${pkg}/../lmdblib/cpp")
set(LMDBLIB_BUILD_TESTS OFF CACHE BOOL "" FORCE)
add_subdirectory(${lmdblib} ${deps}/lmdblib)
FetchContent_GetProperties(msgpack)
# --- Build --------------------------------------------------------------------------------------
# Match barretenberg's archive build (-march=skylake on x86_64, libc++, Release).
add_compile_definitions(MSGPACK_NO_BOOST MSGPACK_USE_STD_VARIANT_ADAPTOR NO_PAR_ALGOS)
if(CMAKE_SYSTEM_PROCESSOR MATCHES "x86_64")
    add_compile_options(-march=skylake)
endif()
add_compile_options(-fconstexpr-steps=100000000 -fbracket-depth=1024 -stdlib=libc++
                    -Wno-deprecated-declarations -Wno-missing-field-initializers)
add_link_options(-stdlib=libc++ -static-libstdc++ -static-libgcc)
include_directories(src ${lmdblib}/src ${msgpack_SOURCE_DIR}/include)

set(IPC_RUNTIME_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(IPC_RUNTIME_BUILD_NAPI OFF CACHE BOOL "" FORCE)
add_subdirectory(${foundation}/ipc-runtime/cpp ${deps}/ipc-runtime)

# The wire contract is wsdb_schema.jsonc, owned by barretenberg's wsdb-ref (the reference
# implementation).
set(wsdb_schema "${foundation}/barretenberg/cpp/src/barretenberg/wsdb_ref/wsdb_schema.jsonc")

# The generated server dispatch, wire types, in-process FFI entry (wsdb_labs_ipc_ffi_entry; its symbols
# carry this implementation's name, as wsdb-ref's carry wsdb_ref) and typed client from that schema, and
# the protocol constants from @aztec-foundation/constants-codegen at the pinned version; both are
# regenerated whenever configure runs, which their inputs below trigger.
execute_process(
    COMMAND node --experimental-strip-types --no-warnings ${foundation}/ipc-codegen/src/generate.ts
            --schema ${wsdb_schema} --lang cpp --out ${CMAKE_CURRENT_SOURCE_DIR}/src/wsdb/generated
            --server --client --ffi --ffi-name wsdb_labs --cpp-namespace azteclabs::wsdb
            --cpp-include-dir wsdb/generated
    COMMAND_ERROR_IS_FATAL ANY)
execute_process(
    COMMAND "${CMAKE_COMMAND}" -E env "WSDB_FOUNDATION_VERSION=${version}" "${pkg}/scripts/remake-constants.sh"
    COMMAND_ERROR_IS_FATAL ANY)
set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS
    ${wsdb_schema} ${pkg}/foundation.pin ${pkg}/scripts/constants-codegen/cpp.json)
file(GLOB_RECURSE ipc_codegen_sources CONFIGURE_DEPENDS ${foundation}/ipc-codegen/src/*.ts
     ${foundation}/ipc-codegen/templates/cpp/*)
set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS ${ipc_codegen_sources})

set(CLI11_BUILD_TESTS OFF CACHE INTERNAL "")
set(CLI11_BUILD_EXAMPLES OFF CACHE INTERNAL "")
set(CLI11_BUILD_DOCS OFF CACHE INTERNAL "")
FetchContent_Declare(cli11 GIT_REPOSITORY https://github.com/CLIUtils/CLI11.git GIT_TAG v2.4.2 GIT_SHALLOW TRUE)
FetchContent_MakeAvailable(cli11)

file(GLOB_RECURSE sources CONFIGURE_DEPENDS src/*.cpp)
file(GLOB_RECURSE tests CONFIGURE_DEPENDS src/*.test.cpp)
file(GLOB_RECURSE benches CONFIGURE_DEPENDS src/*.bench.cpp)
list(REMOVE_ITEM sources ${tests} ${benches})
set(libs ${bb_archive} lmdblib ipc_runtime lmdb pthread)

add_executable(aztec-wsdb ${sources})
target_link_libraries(aztec-wsdb PRIVATE ${libs} CLI11::CLI11)

if(WSDB_BUILD_TESTS)
    set(INSTALL_GTEST OFF CACHE BOOL "" FORCE)
    FetchContent_Declare(googletest GIT_REPOSITORY https://github.com/google/googletest.git GIT_TAG v1.13.0 GIT_SHALLOW TRUE)
    set(BENCHMARK_ENABLE_TESTING OFF CACHE BOOL "" FORCE)
    set(BENCHMARK_ENABLE_GTEST_TESTS OFF CACHE BOOL "" FORCE)
    FetchContent_Declare(benchmark GIT_REPOSITORY https://github.com/google/benchmark.git GIT_TAG v1.8.3 GIT_SHALLOW TRUE)
    FetchContent_MakeAvailable(googletest benchmark)

    list(REMOVE_ITEM sources ${CMAKE_CURRENT_SOURCE_DIR}/src/wsdb/main.cpp)
    add_executable(wsdb_tests ${sources} ${tests})
    target_link_libraries(wsdb_tests PRIVATE ${libs} CLI11::CLI11 gmock_main gmock gtest)

    add_executable(wsdb_bench ${sources} ${benches})
    target_link_libraries(wsdb_bench PRIVATE ${libs} CLI11::CLI11 benchmark::benchmark_main)
endif()
