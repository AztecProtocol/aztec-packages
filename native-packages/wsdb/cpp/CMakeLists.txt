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
# C is enabled so CMAKE_C_COMPILER is populated for lmdb's ExternalProject build.
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

# We depend on barretenberg only for its *published* static archives (under
# ${BB_BUILD}/lib), which are the artifacts CI caches. bb's FetchContent build
# internals (${BB_BUILD}/_deps/...) are NOT cached, so we fetch and build our own
# copies of the third-party deps here, pinned to the exact commits bb uses so the
# headers/ABI line up with the prebuilt libbarretenberg.a.
foreach(artifact "${BB_LIB}" "${ENV_LIB}" "${IPC_RUNTIME_LIB}" "${LMDBLIB_LIB}")
    if(NOT EXISTS "${artifact}")
        message(FATAL_ERROR "Missing prebuilt artifact: ${artifact}\n"
                            "Build barretenberg (cd barretenberg/cpp && cmake --preset default && cd build && ninja) "
                            "and lmdblib (cd native-packages/lmdblib && ./bootstrap.sh) first.")
    endif()
endforeach()

# ---------------------------------------------------------------------------
# Third-party deps (own copies; commits must match barretenberg/cpp/cmake/*).
# ---------------------------------------------------------------------------
set(DEPS_PREFIX "${CMAKE_BINARY_DIR}/_deps")

# lmdb: build our own liblmdb.a (pinned to bb's commit in cmake/lmdb.cmake).
include(ExternalProject)
set(LMDB_PREFIX "${DEPS_PREFIX}/lmdb")
set(LMDB_INCLUDE "${LMDB_PREFIX}/src/lmdb_repo/libraries/liblmdb")
set(LMDB_LIB "${LMDB_INCLUDE}/liblmdb.a")
ExternalProject_Add(
    lmdb_repo
    PREFIX ${LMDB_PREFIX}
    DOWNLOAD_COMMAND
        sh -c "mkdir -p ${LMDB_PREFIX}/src/lmdb_repo && cd ${LMDB_PREFIX}/src/lmdb_repo && git init --quiet && (git remote add origin https://github.com/LMDB/lmdb.git 2>/dev/null || true) && git fetch --depth 1 origin --quiet ddd0a773e2f44d38e4e31ec9ed81af81f4e4ccbb && git reset --quiet --hard FETCH_HEAD"
    SOURCE_DIR ${LMDB_PREFIX}/src/lmdb_repo
    BUILD_IN_SOURCE YES
    CONFIGURE_COMMAND ""
    BUILD_COMMAND ${CMAKE_COMMAND} -E env --unset=CFLAGS --unset=CXXFLAGS CC=${CMAKE_C_COMPILER}${CMAKE_C_COMPILER_ARG1} AR=${CMAKE_AR} make -e -C libraries/liblmdb XCFLAGS=-fPIC liblmdb.a
    INSTALL_COMMAND ""
    UPDATE_COMMAND ""
    BUILD_BYPRODUCTS ${LMDB_LIB}
)
add_library(lmdb STATIC IMPORTED GLOBAL)
add_dependencies(lmdb lmdb_repo)
set_target_properties(lmdb PROPERTIES IMPORTED_LOCATION ${LMDB_LIB})

# msgpack-c: header-only; fetch for includes (pinned to bb's commit in cmake/msgpack.cmake).
set(MSGPACK_PREFIX "${DEPS_PREFIX}/msgpack-c")
set(MSGPACK_INCLUDE "${MSGPACK_PREFIX}/src/msgpack-c/include")
ExternalProject_Add(
    msgpack-c
    PREFIX ${MSGPACK_PREFIX}
    DOWNLOAD_COMMAND
        sh -c "mkdir -p ${MSGPACK_PREFIX}/src/msgpack-c && cd ${MSGPACK_PREFIX}/src/msgpack-c && git init --quiet && (git remote add origin https://github.com/AztecProtocol/msgpack-c.git 2>/dev/null || true) && git fetch --depth 1 origin --quiet c0334576ed657fb3b3c49e8e61402989fb84146d && git reset --quiet --hard FETCH_HEAD"
    SOURCE_DIR ${MSGPACK_PREFIX}/src/msgpack-c
    CONFIGURE_COMMAND ""
    BUILD_COMMAND ""
    INSTALL_COMMAND ""
    UPDATE_COMMAND ""
)

# tracy: header-only here (we only include its headers); pinned to bb's commit in cmake/tracy.cmake.
set(TRACY_SOURCE_DIR "${DEPS_PREFIX}/tracy-src")
execute_process(
    COMMAND sh -c "mkdir -p ${TRACY_SOURCE_DIR} && cd ${TRACY_SOURCE_DIR} && git init --quiet && (git remote add origin https://github.com/wolfpld/tracy.git 2>/dev/null || true) && git fetch --depth 1 origin --quiet 5d542dc09f3d9378d005092a4ad446bd405f819a && git reset --quiet --hard FETCH_HEAD"
    RESULT_VARIABLE tracy_result
)
if(tracy_result)
    message(FATAL_ERROR "Failed to download Tracy")
endif()
set(TRACY_INCLUDE "${TRACY_SOURCE_DIR}/public")

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

include_directories(
    ${CMAKE_CURRENT_SOURCE_DIR}/src
    ${BB_SRC}
    ${LMDBLIB_SRC}
    ${MSGPACK_INCLUDE}
    ${TRACY_INCLUDE}
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
            --cpp-namespace bb::wsdb
            --cpp-include-dir wsdb/generated
    DEPENDS ${WSDB_SCHEMA} ${IPC_CODEGEN_SRC}
    COMMENT "Generating WSDB IPC server dispatch from wsdb_schema.jsonc"
    VERBATIM
)
add_custom_target(wsdb_ipc_server_generated DEPENDS ${WSDB_GEN_OUTPUTS})

# ---------------------------------------------------------------------------
# wsdb core: world_state + persistent merkle storage + server handlers.
# ---------------------------------------------------------------------------
set(WSDB_CORE_SOURCES
    src/world_state/types.cpp
    src/world_state/world_state.cpp
    src/merkle_tree/lmdb_store/lmdb_tree_store.cpp
    src/wsdb/wsdb_handlers.cpp
    src/wsdb/wsdb_ipc_server.cpp
    src/wsdb/cli.cpp
)
add_library(wsdb_core STATIC ${WSDB_CORE_SOURCES})
add_dependencies(wsdb_core wsdb_ipc_server_generated lmdb_repo msgpack-c)
# Wrap libbarretenberg.a + libenv.a in --start-group/--end-group: bb's archive
# references env symbols (logstr, throw_or_abort_impl) and the link order between
# the two is not a clean DAG, so let the linker resolve them mutually.
target_link_libraries(wsdb_core PUBLIC
    -Wl,--start-group ${BB_LIB} ${ENV_LIB} ${LMDBLIB_LIB} -Wl,--end-group
    ${IPC_RUNTIME_LIB} ${LMDB_LIB} pthread)

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

    set(WSDB_TEST_SOURCES
        src/merkle_tree/fixtures.test.cpp
        src/merkle_tree/lmdb_store/lmdb_tree_store.test.cpp
        src/merkle_tree/node_store/content_addressed_cache.test.cpp
        src/merkle_tree/append_only_tree/content_addressed_append_only_tree.test.cpp
        src/merkle_tree/indexed_tree/content_addressed_indexed_tree.test.cpp
        src/merkle_tree/nullifier_tree/nullifier_memory_tree.test.cpp
        src/world_state/world_state.test.cpp
        src/wsdb/memory_merkle_db.test.cpp
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
