# Standalone build for the kvdb Node NAPI addon (nodejs_module.node).
#
# This package owns the kv-store native backend (the LMDBStore NAPI wrapper) that
# barretenberg no longer hosts. It is barretenberg-free: it builds and links only the
# lmdblib sibling package + lmdb + the Node addon runtime. It uses msgpack-c
# directly (no bb serialization framework) and vendors the small message header /
# dispatcher it needs under src/messaging.

cmake_minimum_required(VERSION 3.24)
project(aztec_kvdb CXX C)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)

# Default to Release (-O3 -DNDEBUG), as lmdblib does: the shared lmdblib templated/inline
# headers must be compiled the same way in both, or their inline codegen diverges (ODR).
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

add_definitions(-DNAPI_VERSION=9)

# The lmdblib sibling package (the lmdb C++ wrapper, with the lmdb and msgpack-c sources it fetches),
# built here for this toolchain and target.
include(FetchContent)
get_filename_component(LMDBLIB "${CMAKE_CURRENT_SOURCE_DIR}/../../lmdblib/cpp" ABSOLUTE)
set(LMDBLIB_BUILD_TESTS OFF CACHE BOOL "" FORCE)
add_subdirectory(${LMDBLIB} ${CMAKE_BINARY_DIR}/_deps/lmdblib)
FetchContent_GetProperties(msgpack)

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

# libc++ and the x86_64 Skylake target match lmdblib's. Static
# libc++/libgcc keep the addon self-contained (no libc++.so.1 runtime dependency).
add_compile_definitions(MSGPACK_NO_BOOST MSGPACK_USE_STD_VARIANT_ADAPTOR NO_PAR_ALGOS)
if(CMAKE_SYSTEM_PROCESSOR MATCHES "x86_64")
    add_compile_options(-march=skylake)
endif()
add_compile_options(-fconstexpr-steps=100000000 -fbracket-depth=1024)
add_compile_options(-Wno-deprecated-declarations -Wno-missing-field-initializers)
add_compile_options(-stdlib=libc++)
add_link_options(-stdlib=libc++ -static-libstdc++ -static-libgcc)

include_directories(
    ${CMAKE_CURRENT_SOURCE_DIR}/src
    ${LMDBLIB}/src
    ${msgpack_SOURCE_DIR}/include
)

set(KVDB_SOURCES
    src/init_module.cpp
    src/lmdb_store/lmdb_store_wrapper.cpp
    src/util/promise.cpp
)
add_library(nodejs_module SHARED ${KVDB_SOURCES})
set_target_properties(nodejs_module PROPERTIES PREFIX "" SUFFIX ".node")
target_include_directories(nodejs_module PRIVATE ${NODE_API_HEADERS_DIR} ${NODE_ADDON_API_DIR})

target_link_libraries(nodejs_module PRIVATE lmdblib lmdb pthread)

# On macOS, Node.js N-API symbols are provided by the runtime, not at link time.
if(CMAKE_SYSTEM_NAME STREQUAL "Darwin")
    target_link_options(nodejs_module PRIVATE "-undefined" "dynamic_lookup")
endif()
