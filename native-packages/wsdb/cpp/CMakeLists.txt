# Standalone build for the aztec-wsdb world-state database service.
#
# This package owns the wsdb service: the world_state engine, the persistent
# content-addressed merkle storage, the lmdb tree store, and the IPC server.
# It depends on barretenberg only as a *prebuilt* artifact: bb is assumed to be
# already built in place (default preset -> barretenberg/cpp/build), and this
# project links the resulting static archives. It never (re)builds bb.
#
# Link target: the full libbarretenberg.a (for the generic merkle core), plus the
# lmdblib sibling package's liblmdblib.a (the lmdb C++ wrapper, which barretenberg
# no longer hosts). bb-external is intentionally NOT usable here -- it excludes
# crypto_merkle_tree_objects (see barretenberg/cpp/src/CMakeLists.txt).

cmake_minimum_required(VERSION 3.24)
# C is enabled for any C sources pulled in transitively.
project(aztec_wsdb CXX C)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)

# Match barretenberg's prebuilt archive build (Release -> -O3 -DNDEBUG). bb headers
# (inline/template crypto + field code) are compiled into BOTH bb's Release archive
# and this build; compiling them here without NDEBUG/-O3 is an ODR violation that can
# silently diverge inlined results (e.g. tree leaf hashes). Default to Release.
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

# ---------------------------------------------------------------------------
# Locate the prebuilt barretenberg tree.
# ---------------------------------------------------------------------------
get_filename_component(REPO_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../../.." ABSOLUTE)
set(BB_SRC "${REPO_ROOT}/barretenberg/cpp/src")
set(BB_BUILD "${REPO_ROOT}/barretenberg/cpp/build" CACHE PATH "barretenberg build dir")
set(IPC_RUNTIME_SRC "${REPO_ROOT}/ipc-runtime/cpp")
set(IPC_CODEGEN_DIR "${REPO_ROOT}/ipc-codegen")

set(BB_LIB "${BB_BUILD}/lib/libbarretenberg.a")
# libbarretenberg.a deliberately excludes the env module (logstr / throw_or_abort_impl /
# hardware_concurrency) so consumers supply their own runtime. As a native command we
# link bb's env implementation, matching what the old in-bb aztec-wsdb target did.
set(ENV_LIB "${BB_BUILD}/lib/libenv.a")
set(IPC_RUNTIME_LIB "${BB_BUILD}/lib/libipc_runtime.a")

# lmdblib sibling package: headers + the prebuilt wrapper archive (the lmdb C++
# wrapper that barretenberg no longer hosts).
set(LMDBLIB_PKG "${REPO_ROOT}/native-packages/lmdblib")
set(LMDBLIB_SRC "${LMDBLIB_PKG}/cpp/src")
set(LMDBLIB_LIB "${LMDBLIB_PKG}/cpp/build/lib/liblmdblib.a")

# wsdb consumes prebuilt static archives: barretenberg's (for the poseidon2 c_bind,
# under ${BB_BUILD}/lib) and the lmdblib sibling package's. lmdblib owns the LMDB and
# msgpack-c dependencies; wsdb gets them transitively (liblmdblib.a is built against
# them), so reference lmdblib's built artifacts rather than fetching our own copies.
set(DEPS_PREFIX "${CMAKE_BINARY_DIR}/_deps")
set(LMDB_INCLUDE "${LMDBLIB_PKG}/cpp/build/_deps/lmdb-src/libraries/liblmdb")
set(LMDB_LIB "${LMDBLIB_PKG}/cpp/build/lib/liblmdb.a")
set(MSGPACK_INCLUDE "${LMDBLIB_PKG}/cpp/build/_deps/msgpack-src/include")

foreach(artifact "${BB_LIB}" "${ENV_LIB}" "${IPC_RUNTIME_LIB}" "${LMDBLIB_LIB}" "${LMDB_LIB}")
    if(NOT EXISTS "${artifact}")
        message(FATAL_ERROR "Missing prebuilt artifact: ${artifact}\n"
                            "Build barretenberg (cd barretenberg/cpp && cmake --preset default && cd build && ninja) "
                            "and lmdblib (cd native-packages/lmdblib && ./bootstrap.sh) first.")
    endif()
endforeach()

# Match the ABI-affecting compile flags of the bb build. bb is compiled with
# clang and -march=skylake; mixing toolchains/arch against bb's prebuilt static
# archives risks subtle ODR/template-instantiation mismatches, so match it.
add_compile_definitions(MSGPACK_NO_BOOST MSGPACK_USE_STD_VARIANT_ADAPTOR NO_PAR_ALGOS)
add_compile_options(-march=skylake -fconstexpr-steps=100000000 -fbracket-depth=1024)
add_compile_options(-Wno-deprecated-declarations -Wno-missing-field-initializers)
# bb's archives are built with libc++ (std::__1:: symbols). The system clang here
# links libstdc++ by default, leaving those symbols undefined, so force libc++ for
# both compile and link to match bb's ABI.
add_compile_options(-stdlib=libc++)
# Statically link libc++/libc++abi/libgcc so aztec-wsdb is self-contained (no
# libc++.so.1 runtime dependency), matching bb's own aztec-wsdb. Otherwise the
# binary fails to launch (exit 127) in minimal environments — e.g. a scaffolded
# user project — that don't ship the libc++ runtime.
add_link_options(-stdlib=libc++ -static-libstdc++ -static-libgcc)

# The decoupled wsdb core/tests include NO barretenberg headers — only wsdb's own src,
# the bb-free sibling packages (lmdblib, ipc-runtime), msgpack-c and lmdb. bb is still
# *linked* (libbarretenberg.a) purely for the poseidon2 c_bind. BB_SRC is added back only
# on the parity/equivalence target, which deliberately compiles barretenberg headers.
include_directories(
    ${CMAKE_CURRENT_SOURCE_DIR}/src
    ${LMDBLIB_SRC}
    ${MSGPACK_INCLUDE}
    ${LMDB_INCLUDE}
    ${IPC_RUNTIME_SRC}
)

# ---------------------------------------------------------------------------
# Codegen the wsdb server dispatch from the local schema (this package owns the
# wire contract). bb's client codegen reads the same schema from this path.
# ---------------------------------------------------------------------------
set(WSDB_SCHEMA ${CMAKE_CURRENT_SOURCE_DIR}/../wsdb_schema.jsonc)
set(WSDB_GEN_DIR ${CMAKE_CURRENT_SOURCE_DIR}/src/wsdb/generated)
set(WSDB_GEN_OUTPUTS
    ${WSDB_GEN_DIR}/wsdb_dispatch.hpp
    ${WSDB_GEN_DIR}/wsdb_ipc_server.hpp
    ${WSDB_GEN_DIR}/wsdb_types.hpp
    ${WSDB_GEN_DIR}/ipc_codegen/msgpack_adaptor.hpp
    ${WSDB_GEN_DIR}/ipc_codegen/named_union.hpp
    ${WSDB_GEN_DIR}/ipc_codegen/throw.hpp
)
file(GLOB_RECURSE IPC_CODEGEN_SRC
    ${IPC_CODEGEN_DIR}/src/*.ts
    ${IPC_CODEGEN_DIR}/templates/cpp/*.hpp
)
add_custom_command(
    OUTPUT ${WSDB_GEN_OUTPUTS}
    COMMAND node --experimental-strip-types --experimental-transform-types --no-warnings
            ${IPC_CODEGEN_DIR}/src/generate.ts
            --schema ${WSDB_SCHEMA}
            --lang cpp
            --out ${WSDB_GEN_DIR}
            --server
            --cpp-namespace azteclabs::wsdb
            --cpp-include-dir wsdb/generated
    DEPENDS ${WSDB_SCHEMA} ${IPC_CODEGEN_SRC}
    COMMENT "Generating WSDB IPC server dispatch from wsdb_schema.jsonc"
    VERBATIM
)
add_custom_target(wsdb_ipc_server_generated DEPENDS ${WSDB_GEN_OUTPUTS})

# ---------------------------------------------------------------------------
# CLI11 (header-only) for aztec-wsdb command-line parsing. Fetched and pinned to
# v2.4.2 (matches barretenberg's vendored copy) rather than vendored in-tree.
# ---------------------------------------------------------------------------
include(FetchContent)
set(CLI11_BUILD_TESTS OFF CACHE INTERNAL "")
set(CLI11_BUILD_EXAMPLES OFF CACHE INTERNAL "")
set(CLI11_BUILD_DOCS OFF CACHE INTERNAL "")
FetchContent_Declare(
    cli11
    GIT_REPOSITORY https://github.com/CLIUtils/CLI11.git
    GIT_TAG v2.4.2
    GIT_SHALLOW TRUE
)
FetchContent_MakeAvailable(cli11)

# ---------------------------------------------------------------------------
# wsdb core: world_state + persistent merkle storage + server handlers.
# ---------------------------------------------------------------------------
set(WSDB_CORE_SOURCES
    src/common/thread_pool.cpp
    src/world_state/types.cpp
    src/world_state/world_state.cpp
    src/merkle_tree/lmdb_store/lmdb_tree_store.cpp
    src/merkle_tree/merkle_tree_id.cpp
    src/wsdb/wsdb_handlers.cpp
    src/wsdb/wsdb_ipc_server.cpp
    src/wsdb/cli.cpp
)
add_library(wsdb_core STATIC ${WSDB_CORE_SOURCES})
add_dependencies(wsdb_core wsdb_ipc_server_generated)
# Wrap libbarretenberg.a + libenv.a in --start-group/--end-group: bb's archive
# references env symbols (logstr, throw_or_abort_impl) and the link order between
# the two is not a clean DAG, so let the linker resolve them mutually.
target_link_libraries(wsdb_core PUBLIC
    -Wl,--start-group ${BB_LIB} ${ENV_LIB} ${LMDBLIB_LIB} -Wl,--end-group
    ${IPC_RUNTIME_LIB} ${LMDB_LIB} pthread)
# CLI11 is only used in cli.cpp's implementation, so keep it private to wsdb_core.
target_link_libraries(wsdb_core PRIVATE CLI11::CLI11)

# ---------------------------------------------------------------------------
# aztec-wsdb binary.
# ---------------------------------------------------------------------------
add_executable(aztec-wsdb src/wsdb/main.cpp)
target_link_libraries(aztec-wsdb PRIVATE wsdb_core)

# ---------------------------------------------------------------------------
# Tests. The equality test links MemoryMerkleDB (the reference impl, which stays
# in bb's vm2_sim module -> libvm2_sim.a) against a real WorldState (local). It
# can no longer live in vm2_tests since that target no longer links world_state.
# ---------------------------------------------------------------------------
option(WSDB_BUILD_TESTS "Build wsdb C++ tests" ON)
if(WSDB_BUILD_TESTS)
    include(ExternalProject)
    set(VM2_SIM_LIB "${BB_BUILD}/lib/libvm2_sim.a")
    set(GTEST_LIB "${BB_BUILD}/lib/libgtest.a")
    set(GMOCK_LIB "${BB_BUILD}/lib/libgmock.a")
    set(GMOCK_MAIN_LIB "${BB_BUILD}/lib/libgmock_main.a")
    # gtest/gmock libs come from bb's published archives (cached), but their headers
    # live under bb's uncached _deps. Fetch our own copy, pinned to bb's tag (cmake/gtest.cmake).
    set(GTEST_PREFIX "${DEPS_PREFIX}/gtest-src")
    ExternalProject_Add(
        gtest_headers
        PREFIX ${GTEST_PREFIX}
        GIT_REPOSITORY https://github.com/google/googletest.git
        GIT_TAG v1.13.0
        GIT_SHALLOW TRUE
        SOURCE_DIR ${GTEST_PREFIX}/src/gtest
        CONFIGURE_COMMAND ""
        BUILD_COMMAND ""
        INSTALL_COMMAND ""
        UPDATE_COMMAND ""
    )
    set(GTEST_INCLUDE "${GTEST_PREFIX}/src/gtest/googletest/include")
    set(GMOCK_INCLUDE "${GTEST_PREFIX}/src/gtest/googlemock/include")

    # The decoupled test set: exercises wsdb's own tree/storage with no barretenberg
    # headers. (field_element parity + memory_merkle_db equivalence tests link bb and
    # live in their own target below.)
    set(WSDB_TEST_SOURCES
        src/common/uint256.test.cpp
        src/merkle_tree/fixtures.test.cpp
        src/merkle_tree/lmdb_store/lmdb_tree_store.test.cpp
        src/merkle_tree/node_store/content_addressed_cache.test.cpp
        src/merkle_tree/append_only_tree/content_addressed_append_only_tree.test.cpp
        src/merkle_tree/indexed_tree/content_addressed_indexed_tree.test.cpp
        src/merkle_tree/nullifier_tree/nullifier_memory_tree.test.cpp
        src/world_state/world_state.test.cpp
    )
    add_executable(wsdb_tests ${WSDB_TEST_SOURCES})
    add_dependencies(wsdb_tests wsdb_ipc_server_generated gtest_headers)
    target_include_directories(wsdb_tests PRIVATE ${GTEST_INCLUDE} ${GMOCK_INCLUDE})
    # wsdb_core (WorldState + persistent merkle), vm2_sim (MemoryMerkleDB) and bb's
    # archive reference each other's symbols, so group them all for mutual resolution.
    target_link_libraries(wsdb_tests PRIVATE
        -Wl,--start-group
            $<TARGET_FILE:wsdb_core> ${VM2_SIM_LIB} ${BB_LIB} ${ENV_LIB} ${LMDBLIB_LIB}
        -Wl,--end-group
        ${IPC_RUNTIME_LIB} ${LMDB_LIB} pthread
        ${GMOCK_MAIN_LIB} ${GMOCK_LIB} ${GTEST_LIB}
    )
    add_dependencies(wsdb_tests wsdb_core)
endif()

# ---------------------------------------------------------------------------
# Barretenberg-linked tests (OFF by default; require a prebuilt barretenberg).
# These deliberately compile bb headers, so they add BB_SRC back and define
#
#  - wsdb_parity_tests: proves FieldElement + the poseidon2 c_bind are byte-identical
#    to bb::fr / bb's Poseidon2HashPolicy (the consensus gate).
#  - The MemoryMerkleDB equivalence test (src/wsdb/memory_merkle_db.test.cpp) is NOT
#    wired here yet: it includes both wsdb's forked crypto::merkle_tree headers and
#    barretenberg's real ones in one TU, which collide. Reviving it needs wsdb's merkle
#    types moved to a dedicated namespace. Left in-tree (may rot) per design.
# ---------------------------------------------------------------------------
option(WSDB_BUILD_BB_TESTS "Build the barretenberg-linked parity/equivalence tests" OFF)
if(WSDB_BUILD_BB_TESTS AND WSDB_BUILD_TESTS)
    # These tests compile barretenberg headers, which include tracy; fetch its headers.
    set(TRACY_SOURCE_DIR "${DEPS_PREFIX}/tracy-src")
    execute_process(
        COMMAND sh -c "mkdir -p ${TRACY_SOURCE_DIR} && cd ${TRACY_SOURCE_DIR} && git init --quiet && (git remote add origin https://github.com/wolfpld/tracy.git 2>/dev/null || true) && git fetch --depth 1 origin --quiet 5d542dc09f3d9378d005092a4ad446bd405f819a && git reset --quiet --hard FETCH_HEAD"
        RESULT_VARIABLE tracy_result
    )
    if(tracy_result)
        message(FATAL_ERROR "Failed to download Tracy")
    endif()
    set(TRACY_INCLUDE "${TRACY_SOURCE_DIR}/public")

    add_executable(wsdb_parity_tests src/field/field_element.test.cpp)
    add_dependencies(wsdb_parity_tests wsdb_ipc_server_generated gtest_headers)
    target_include_directories(wsdb_parity_tests PRIVATE ${BB_SRC} ${TRACY_INCLUDE} ${GTEST_INCLUDE} ${GMOCK_INCLUDE})
    target_link_libraries(wsdb_parity_tests PRIVATE
        -Wl,--start-group ${BB_LIB} ${ENV_LIB} ${LMDBLIB_LIB} -Wl,--end-group
        ${IPC_RUNTIME_LIB} ${LMDB_LIB} pthread
        ${GMOCK_MAIN_LIB} ${GMOCK_LIB} ${GTEST_LIB}
    )
endif()
