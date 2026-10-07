# lmdblib — a small C++ wrapper around LMDB.
#
# Builds two static archives that the kvdb NAPI addon and the wsdb service link:
#   - liblmdb.a    : the LMDB C library (built from source, pinned commit)
#   - liblmdblib.a : the lmdblib C++ wrapper objects
#
# It is self-contained: it vendors LMDB and msgpack-c (header-only) via FetchContent.

cmake_minimum_required(VERSION 3.24)
# C is enabled to compile the LMDB C sources.
project(aztec_lmdblib CXX C)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
set(CMAKE_ARCHIVE_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)

# Default to Release (-O3 -DNDEBUG). lmdblib's templated/inline headers (serialise_key,
# value_cmp, the msgpack adaptors) are compiled into both liblmdblib.a and into every
# consumer that includes them (the kvdb addon, the wsdb service); matching the consumers'
# Release build keeps that inline codegen identical and avoids ODR divergence.
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

# ---------------------------------------------------------------------------
# Third-party dependencies (fetched at configure time).
# ---------------------------------------------------------------------------
include(FetchContent)

# LMDB: a plain-Makefile C library (no CMake). Fetch the source and compile the two
# translation units ourselves so they use this project's toolchain and flags.
FetchContent_Declare(
    lmdb
    GIT_REPOSITORY https://github.com/LMDB/lmdb.git
    GIT_TAG ddd0a773e2f44d38e4e31ec9ed81af81f4e4ccbb
)
FetchContent_MakeAvailable(lmdb)
set(LMDB_DIR ${lmdb_SOURCE_DIR}/libraries/liblmdb)
add_library(lmdb STATIC ${LMDB_DIR}/mdb.c ${LMDB_DIR}/midl.c)
target_include_directories(lmdb PUBLIC ${LMDB_DIR})

# msgpack-c: header-only. Fetch the source and use its include directory directly
# (we don't build msgpack-c's own CMake targets/tests).
FetchContent_Declare(
    msgpack
    GIT_REPOSITORY https://github.com/msgpack/msgpack-c.git
    GIT_TAG cpp-7.0.0
)
FetchContent_GetProperties(msgpack)
if(NOT msgpack_POPULATED)
    FetchContent_Populate(msgpack)
endif()
set(MSGPACK_INCLUDE ${msgpack_SOURCE_DIR}/include)

# msgpack-c is used header-only with exceptions (no boost). Compiled with libc++ and
# -march=skylake so lmdblib's objects are ABI- and arch-compatible with the consumers
# (kvdb, wsdb) they are linked into.
add_compile_definitions(MSGPACK_NO_BOOST NO_PAR_ALGOS)
add_compile_options(-march=skylake -fconstexpr-steps=100000000 -fbracket-depth=1024)
add_compile_options(-Wno-deprecated-declarations -Wno-missing-field-initializers)
add_compile_options(-stdlib=libc++)

include_directories(
    ${CMAKE_CURRENT_SOURCE_DIR}/src
    ${MSGPACK_INCLUDE}
    ${LMDB_DIR}
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
add_dependencies(lmdblib lmdb)

# ---------------------------------------------------------------------------
# Tests (vendored googletest; self-contained, no external dependencies).
# ---------------------------------------------------------------------------
option(LMDBLIB_BUILD_TESTS "Build lmdblib C++ tests" ON)
if(LMDBLIB_BUILD_TESTS)
    add_link_options(-stdlib=libc++)
    FetchContent_Declare(
        googletest
        GIT_REPOSITORY https://github.com/google/googletest.git
        GIT_TAG v1.13.0
    )
    set(INSTALL_GTEST OFF CACHE BOOL "" FORCE)
    FetchContent_MakeAvailable(googletest)
    add_executable(lmdblib_tests
        src/lmdblib/lmdb_store.test.cpp
        src/lmdblib/lmdb_environment.test.cpp
    )
    target_link_libraries(lmdblib_tests PRIVATE lmdblib lmdb GTest::gtest_main pthread)
endif()
