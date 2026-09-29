cmake_minimum_required(VERSION 3.24)
# aztec-wsdb: the world-state DB service. Compiles no barretenberg header; everything it needs from
# outside this directory comes from one aztec-packages release, pinned by tag in ../foundation.pin.
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
# barretenberg's static library (the poseidon2 c_bind and the reference world state's C ABI) from
# the GitHub release of the pinned tag, and a sparse clone of aztec-packages at that tag for
# ipc-runtime/cpp (compiled in) and ipc-codegen (run with node).
file(READ "${pkg}/foundation.pin" tag)
string(STRIP "${tag}" tag)
string(REGEX REPLACE "^v" "" version "${tag}")
string(TOLOWER "${CMAKE_SYSTEM_NAME}" os)
string(REPLACE "x86_64" "amd64" arch "${CMAKE_SYSTEM_PROCESSOR}")
string(REPLACE "aarch64" "arm64" arch "${arch}")
include(FetchContent)
FetchContent_Declare(aztec-packages
    DOWNLOAD_COMMAND git clone --quiet --filter=blob:none --depth 1 --sparse --branch "${tag}"
                     https://github.com/AztecProtocol/aztec-packages.git <SOURCE_DIR>
            COMMAND git -C <SOURCE_DIR> sparse-checkout set ipc-runtime/cpp ipc-codegen)
FetchContent_Declare(barretenberg
    URL "https://github.com/AztecProtocol/barretenberg/releases/download/${tag}/barretenberg-static-${arch}-${os}.tar.gz")
FetchContent_MakeAvailable(aztec-packages barretenberg)
set(foundation ${aztec-packages_SOURCE_DIR})
set(bb_archive ${barretenberg_SOURCE_DIR}/libbb-external.a)
# The lmdblib sibling package: the lmdb C++ wrapper plus the lmdb and msgpack-c sources it fetched.
set(lmdblib "${pkg}/../lmdblib/cpp")
# --- Build --------------------------------------------------------------------------------------
# Match barretenberg's archive build (-march=skylake, libc++, Release).
add_compile_definitions(MSGPACK_NO_BOOST MSGPACK_USE_STD_VARIANT_ADAPTOR NO_PAR_ALGOS)
add_compile_options(-march=skylake -fconstexpr-steps=100000000 -fbracket-depth=1024 -stdlib=libc++
                    -Wno-deprecated-declarations -Wno-missing-field-initializers)
add_link_options(-stdlib=libc++ -static-libstdc++ -static-libgcc)
include_directories(src ${lmdblib}/src ${lmdblib}/build/_deps/msgpack-src/include
                    ${lmdblib}/build/_deps/lmdb-src/libraries/liblmdb)

set(IPC_RUNTIME_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(IPC_RUNTIME_BUILD_NAPI OFF CACHE BOOL "" FORCE)
add_subdirectory(${foundation}/ipc-runtime/cpp ${deps}/ipc-runtime)

# The generated server dispatch and wire types (../wsdb_schema.jsonc owns the wire contract), and
# the protocol constants from @aztec-foundation/constants-codegen at the pinned version; both are
# regenerated whenever configure runs, which their inputs below trigger.
execute_process(
    COMMAND node --experimental-strip-types --no-warnings ${foundation}/ipc-codegen/src/generate.ts
            --schema ${pkg}/wsdb_schema.jsonc --lang cpp --out ${CMAKE_CURRENT_SOURCE_DIR}/src/wsdb/generated
            --server --cpp-namespace azteclabs::wsdb --cpp-include-dir wsdb/generated
    COMMAND_ERROR_IS_FATAL ANY)
execute_process(
    COMMAND "${CMAKE_COMMAND}" -E env "WSDB_FOUNDATION_VERSION=${version}" "${pkg}/scripts/remake-constants.sh"
    COMMAND_ERROR_IS_FATAL ANY)
set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS
    ${pkg}/wsdb_schema.jsonc ${pkg}/foundation.pin ${pkg}/scripts/constants-codegen/cpp.json)

set(CLI11_BUILD_TESTS OFF CACHE INTERNAL "")
set(CLI11_BUILD_EXAMPLES OFF CACHE INTERNAL "")
set(CLI11_BUILD_DOCS OFF CACHE INTERNAL "")
FetchContent_Declare(cli11 GIT_REPOSITORY https://github.com/CLIUtils/CLI11.git GIT_TAG v2.4.2 GIT_SHALLOW TRUE)
set(INSTALL_GTEST OFF CACHE BOOL "" FORCE)
FetchContent_Declare(googletest GIT_REPOSITORY https://github.com/google/googletest.git GIT_TAG v1.13.0 GIT_SHALLOW TRUE)
set(BENCHMARK_ENABLE_TESTING OFF CACHE BOOL "" FORCE)
set(BENCHMARK_ENABLE_GTEST_TESTS OFF CACHE BOOL "" FORCE)
FetchContent_Declare(benchmark GIT_REPOSITORY https://github.com/google/benchmark.git GIT_TAG v1.8.3 GIT_SHALLOW TRUE)
FetchContent_MakeAvailable(cli11 googletest benchmark)

file(GLOB_RECURSE sources CONFIGURE_DEPENDS src/*.cpp)
file(GLOB_RECURSE tests CONFIGURE_DEPENDS src/*.test.cpp)
file(GLOB_RECURSE benches CONFIGURE_DEPENDS src/*.bench.cpp)
list(REMOVE_ITEM sources ${tests} ${benches})
set(libs ${bb_archive} ${lmdblib}/build/lib/liblmdblib.a ipc_runtime ${lmdblib}/build/lib/liblmdb.a pthread)

add_executable(aztec-wsdb ${sources})
target_link_libraries(aztec-wsdb PRIVATE ${libs} CLI11::CLI11)

list(REMOVE_ITEM sources ${CMAKE_CURRENT_SOURCE_DIR}/src/wsdb/main.cpp)
add_executable(wsdb_tests ${sources} ${tests})
target_link_libraries(wsdb_tests PRIVATE ${libs} CLI11::CLI11 gmock_main gmock gtest)

add_executable(wsdb_bench ${sources} ${benches})
target_link_libraries(wsdb_bench PRIVATE ${libs} CLI11::CLI11 benchmark::benchmark_main)
