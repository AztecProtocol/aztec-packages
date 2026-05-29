cmake_minimum_required(VERSION 3.20)

project(echo_wire_compat_cpp CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(REPO_ROOT "${CMAKE_CURRENT_LIST_DIR}/../../..")
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_BINARY_DIR}/bin")

include(FetchContent)

FetchContent_Declare(
    msgpack_c
    GIT_REPOSITORY https://github.com/msgpack/msgpack-c.git
    GIT_TAG 8c602e8579c7e7d65d6f9c6703c9699db3fb0488
    GIT_SHALLOW TRUE
)

FetchContent_GetProperties(msgpack_c)
if(NOT msgpack_c_POPULATED)
    FetchContent_Populate(msgpack_c)
endif()

add_subdirectory(
    "${REPO_ROOT}/ipc-runtime/cpp"
    "${CMAKE_CURRENT_BINARY_DIR}/ipc-runtime"
    EXCLUDE_FROM_ALL
)

add_library(echo_common INTERFACE)
target_include_directories(echo_common INTERFACE
    "${CMAKE_CURRENT_SOURCE_DIR}/src"
    "${CMAKE_CURRENT_SOURCE_DIR}/src/generated"
    "${msgpack_c_SOURCE_DIR}/include"
)
target_compile_definitions(echo_common INTERFACE
    MSGPACK_NO_BOOST
    MSGPACK_USE_STD_VARIANT_ADAPTOR
)

add_executable(echo_server src/echo_server.cpp)
target_link_libraries(echo_server PRIVATE echo_common ipc_runtime)

add_executable(echo_client
    src/echo_client.cpp
    src/generated/echo_ipc_client.cpp
)
target_link_libraries(echo_client PRIVATE echo_common ipc_runtime)

add_executable(schema_reflection_test src/schema_reflection_test.cpp)
target_link_libraries(schema_reflection_test PRIVATE echo_common)
