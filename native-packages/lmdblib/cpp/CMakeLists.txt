# Standalone build for lmdblib — the LMDB C++ wrapper.
#
# This package owns the lmdb wrapper that barretenberg no longer needs (the
# in-memory merkle core is lmdb-free). It builds two static archives that the
# kvdb NAPI addon and the wsdb service link against:
#   - liblmdb.a    : the upstream LMDB C library (pinned to bb's commit)
#   - liblmdblib.a : the bb::lmdblib C++ wrapper objects
#
# It is barretenberg-free: it includes no bb headers and links no bb archives. It
# vendors its own msgpack-c + lmdb (commits pinned to barretenberg/cpp/cmake/*) and
# defines the shared DBStats POD locally (src/lmdblib/types.hpp).

cmake_minimum_required(VERSION 3.24)
# C is enabled so CMAKE_C_COMPILER is populated for lmdb's ExternalProject build.
project(aztec_lmdblib CXX C)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
set(CMAKE_ARCHIVE_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)

# Default to Release (-O3 -DNDEBUG). lmdblib's templated/inline headers (serialise_key,
# value_cmp, the msgpack adaptors) are compiled into both liblmdblib.a and into every
# consumer that includes them (the kvdb .node, the wsdb service). Matching the consumers'
# Release build keeps that inline codegen identical and avoids ODR divergence.
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

# ---------------------------------------------------------------------------
# Third-party deps (own copies; commits must match barretenberg/cpp/cmake/*).
# ---------------------------------------------------------------------------
set(DEPS_PREFIX "${CMAKE_BINARY_DIR}/_deps")
include(ExternalProject)

# lmdb: build our own liblmdb.a (pinned to bb's commit in cmake/lmdb.cmake).
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

# lmdblib is barretenberg-free: it links no bb archives and includes no bb headers.
# It is still compiled with libc++ and -march=skylake so its objects are ABI- and
# arch-compatible when linked into consumers (wsdb, kvdb) alongside bb's archives.
add_compile_definitions(MSGPACK_NO_BOOST MSGPACK_USE_STD_VARIANT_ADAPTOR NO_PAR_ALGOS)
add_compile_options(-march=skylake -fconstexpr-steps=100000000 -fbracket-depth=1024)
add_compile_options(-Wno-deprecated-declarations -Wno-missing-field-initializers)
add_compile_options(-stdlib=libc++)

include_directories(
    ${CMAKE_CURRENT_SOURCE_DIR}/src
    ${MSGPACK_INCLUDE}
    ${LMDB_INCLUDE}
)

# ---------------------------------------------------------------------------
# liblmdblib.a — the C++ wrapper objects.
# ---------------------------------------------------------------------------
set(LMDBLIB_SOURCES
    src/lmdblib/lmdb_cursor.cpp
    src/lmdblib/lmdb_database.cpp
    src/lmdblib/lmdb_db_transaction.cpp
    src/lmdblib/lmdb_environment.cpp
    src/lmdblib/lmdb_helpers.cpp
    src/lmdblib/lmdb_read_transaction.cpp
    src/lmdblib/lmdb_store.cpp
    src/lmdblib/lmdb_store_base.cpp
    src/lmdblib/lmdb_transaction.cpp
    src/lmdblib/lmdb_write_transaction.cpp
    src/lmdblib/queries.cpp
)
add_library(lmdblib STATIC ${LMDBLIB_SOURCES})
add_dependencies(lmdblib lmdb_repo msgpack-c)
