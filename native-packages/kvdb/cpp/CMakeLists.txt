# Standalone build for the kvdb Node NAPI addon (nodejs_module.node).
#
# This package owns the kv-store native backend (the LMDBStore NAPI wrapper) that
# barretenberg no longer hosts. It is barretenberg-free: it links only the lmdblib
# sibling package's archives + lmdb + the Node addon runtime. It uses msgpack-c
# directly (no bb serialization framework) and vendors the small message header /
# dispatcher it needs under src/messaging.

cmake_minimum_required(VERSION 3.24)
project(aztec_kvdb CXX C)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)

# Default to Release (-O3 -DNDEBUG) to match the prebuilt liblmdblib.a it links: the
# shared lmdblib templated/inline headers must be compiled the same way in both, or
# their inline codegen diverges (ODR).
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

add_definitions(-DNAPI_VERSION=9)

# ---------------------------------------------------------------------------
# lmdblib sibling package build outputs (the only native dependency).
# ---------------------------------------------------------------------------
get_filename_component(REPO_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../../.." ABSOLUTE)
set(LMDBLIB_PKG "${REPO_ROOT}/native-packages/lmdblib")
set(LMDBLIB_SRC "${LMDBLIB_PKG}/cpp/src")
set(LMDBLIB_LIB "${LMDBLIB_PKG}/cpp/build/lib/liblmdblib.a")
set(LMDB_INCLUDE "${LMDBLIB_PKG}/cpp/build/_deps/lmdb/src/lmdb_repo/libraries/liblmdb")
set(LMDB_LIB "${LMDB_INCLUDE}/liblmdb.a")

foreach(artifact "${LMDBLIB_LIB}" "${LMDB_LIB}")
    if(NOT EXISTS "${artifact}")
        message(FATAL_ERROR "Missing prebuilt artifact: ${artifact}\n"
                            "Build lmdblib first (cd native-packages/lmdblib && ./bootstrap.sh).")
    endif()
endforeach()

# ---------------------------------------------------------------------------
# msgpack-c headers (own copy; commit must match lmdblib's so the wire ABI lines up).
# ---------------------------------------------------------------------------
set(DEPS_PREFIX "${CMAKE_BINARY_DIR}/_deps")
include(ExternalProject)

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

# ---------------------------------------------------------------------------
# Node addon-api / node-api headers (resolved from this package's node_modules).
# ---------------------------------------------------------------------------
execute_process(
    COMMAND yarn --immutable
    WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}
)
execute_process(
    COMMAND node -p "require('node-addon-api').include"
    WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}
    OUTPUT_VARIABLE NODE_ADDON_API_DIR
)
execute_process(
    COMMAND node -p "require('node-api-headers').include_dir"
    WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}
    OUTPUT_VARIABLE NODE_API_HEADERS_DIR
)
string(REGEX REPLACE "[\r\n\"]" "" NODE_ADDON_API_DIR ${NODE_ADDON_API_DIR})
string(REGEX REPLACE "[\r\n\"]" "" NODE_API_HEADERS_DIR ${NODE_API_HEADERS_DIR})

# libc++/-march=skylake match lmdblib's archive (ABI + arch compatibility). Static
# libc++/libgcc keep the addon self-contained (no libc++.so.1 runtime dependency).
add_compile_definitions(MSGPACK_NO_BOOST MSGPACK_USE_STD_VARIANT_ADAPTOR NO_PAR_ALGOS)
add_compile_options(-march=skylake -fconstexpr-steps=100000000 -fbracket-depth=1024)
add_compile_options(-Wno-deprecated-declarations -Wno-missing-field-initializers)
add_compile_options(-stdlib=libc++)
add_link_options(-stdlib=libc++ -static-libstdc++ -static-libgcc)

include_directories(
    ${CMAKE_CURRENT_SOURCE_DIR}/src
    ${LMDBLIB_SRC}
    ${MSGPACK_INCLUDE}
    ${LMDB_INCLUDE}
)

set(KVDB_SOURCES
    src/init_module.cpp
    src/lmdb_store/lmdb_store_wrapper.cpp
    src/util/promise.cpp
)
add_library(nodejs_module SHARED ${KVDB_SOURCES})
add_dependencies(nodejs_module msgpack-c)
set_target_properties(nodejs_module PROPERTIES PREFIX "" SUFFIX ".node")
target_include_directories(nodejs_module PRIVATE ${NODE_API_HEADERS_DIR} ${NODE_ADDON_API_DIR})

target_link_libraries(nodejs_module PRIVATE ${LMDBLIB_LIB} ${LMDB_LIB} pthread)

# On macOS, Node.js N-API symbols are provided by the runtime, not at link time.
if(CMAKE_SYSTEM_NAME STREQUAL "Darwin")
    target_link_options(nodejs_module PRIVATE "-undefined" "dynamic_lookup")
endif()
