# ipc-runtime — UDS + MPSC-SHM transport for IPC services.
#
# Standalone CMake project with no external dependencies beyond a C++20
# compiler + POSIX. Works two ways:
#
#   1. As a top-level standalone build:
#        cd ipc-runtime/cpp && cmake -B build && cmake --build build
#
#   2. As a sub-project via `add_subdirectory()` from a larger CMake tree
#      (e.g. barretenberg/cpp). In that case the parent's compile options
#      (-Wall, -Werror, etc.) and gtest target (if any) are inherited.

cmake_minimum_required(VERSION 3.20)

# Only declare the project when this CMakeLists is the top-level entry point.
# Skipping project() under add_subdirectory keeps the parent's project name
# and avoids re-running platform detection.
if(NOT DEFINED PROJECT_NAME)
    project(ipc_runtime CXX)
    set(CMAKE_CXX_STANDARD 20)
    set(CMAKE_CXX_STANDARD_REQUIRED ON)
    set(CMAKE_POSITION_INDEPENDENT_CODE ON)
endif()

option(IPC_RUNTIME_BUILD_TESTS "Build ipc-runtime unit tests" ON)

# ---- Library ---------------------------------------------------------------

add_library(ipc_runtime STATIC
    ipc_runtime/c_abi.cpp
    ipc_runtime/ipc_client.cpp
    ipc_runtime/ipc_server.cpp
    ipc_runtime/serve_helper.cpp
    ipc_runtime/signal_handlers.cpp
    ipc_runtime/socket_client.cpp
    ipc_runtime/socket_server.cpp
    ipc_runtime/shm/mpsc_shm.cpp
    ipc_runtime/shm/spsc_shm.cpp
)
target_compile_features(ipc_runtime PUBLIC cxx_std_20)
set_target_properties(ipc_runtime PROPERTIES POSITION_INDEPENDENT_CODE ON)

# `#include "ipc_runtime/..."` resolves from this directory for both
# in-tree code and downstream consumers.
target_include_directories(ipc_runtime PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})

# pthread is the only system dep beyond libc (used by the SHM client thread
# and parent-death kqueue watcher).
find_package(Threads REQUIRED)
target_link_libraries(ipc_runtime PUBLIC Threads::Threads)

# ---- Tests -----------------------------------------------------------------

if(IPC_RUNTIME_BUILD_TESTS)
    # Reuse a parent project's GTest target if one is already in scope (e.g.
    # when add_subdirectory'd from barretenberg/cpp). Otherwise fetch a pinned
    # release — version matches barretenberg/cpp/cmake/gtest.cmake.
    if(NOT TARGET GTest::gtest_main)
        include(FetchContent)
        FetchContent_Declare(
            GTest
            GIT_REPOSITORY https://github.com/google/googletest.git
            GIT_TAG v1.13.0
            GIT_SHALLOW TRUE
            FIND_PACKAGE_ARGS
        )
        set(INSTALL_GTEST OFF CACHE BOOL "" FORCE)
        FetchContent_MakeAvailable(GTest)
    endif()

    add_executable(ipc_runtime_tests ipc_runtime/shm.test.cpp)
    target_link_libraries(ipc_runtime_tests PRIVATE ipc_runtime GTest::gtest_main)

    include(GoogleTest)
    if(NOT CMAKE_CROSSCOMPILING)
        gtest_discover_tests(ipc_runtime_tests DISCOVERY_TIMEOUT 30)
    endif()
endif()
