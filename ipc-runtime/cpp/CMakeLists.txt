# ipc-runtime — UDS + MPSC-SHM transport for IPC services.
#
# Standalone CMake project with no external dependencies beyond a C++20
# compiler + POSIX. Works two ways:
#
#   1. As a top-level standalone build:
#        cd ipc-runtime/cpp && cmake -B build && cmake --build build
#
#   2. As a sub-project via `add_subdirectory()` from a larger CMake tree.
#      In that case the parent's compile options
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
    set(IPC_RUNTIME_IS_TOP_LEVEL ON)
else()
    set(IPC_RUNTIME_IS_TOP_LEVEL OFF)
endif()

# Tests and the NAPI addon are ipc-runtime's own concerns. Consumers that
# add_subdirectory us only want the `ipc_runtime` library target; default
# both off in that case so they don't have to know these options exist.
option(IPC_RUNTIME_BUILD_TESTS "Build ipc-runtime unit tests" ${IPC_RUNTIME_IS_TOP_LEVEL})
option(IPC_RUNTIME_BUILD_NAPI "Build the Node native addon (ipc_runtime_napi.node) for the TS package" ${IPC_RUNTIME_IS_TOP_LEVEL})

# ---- Library ---------------------------------------------------------------

# Under WASM (emscripten / no-POSIX targets) the transport sources don't
# compile, but downstream no-POSIX consumers still need the headers (the
# IpcServer/IpcClient declarations referenced from generated server code;
# the codegen template helpers themselves now live in ipc-codegen).
# Expose an INTERFACE target with just the include path in that case.
if(WASM)
    add_library(ipc_runtime INTERFACE)
    target_include_directories(ipc_runtime INTERFACE ${CMAKE_CURRENT_SOURCE_DIR})
else()
    add_library(ipc_runtime STATIC
        ipc_runtime/c_abi.cpp
        ipc_runtime/ipc_client.cpp
        ipc_runtime/ipc_server.cpp
        ipc_runtime/pipe_client.cpp
        ipc_runtime/pipe_server.cpp
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
endif()

# ---- Tests -----------------------------------------------------------------

if(IPC_RUNTIME_BUILD_TESTS AND NOT WASM)
    # Reuse a parent project's GTest target if one is already in scope.
    # Otherwise fetch a pinned release.
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

    add_executable(ipc_runtime_tests ipc_runtime/pipe.test.cpp ipc_runtime/shm.test.cpp ipc_runtime/socket.test.cpp)
    target_link_libraries(ipc_runtime_tests PRIVATE ipc_runtime GTest::gtest_main)

    include(GoogleTest)
    if(NOT CMAKE_CROSSCOMPILING)
        gtest_discover_tests(ipc_runtime_tests DISCOVERY_TIMEOUT 30)
    endif()
endif()

# ---- Node native addon (consumed by @aztec-foundation/ipc-runtime) --------------------

if(IPC_RUNTIME_BUILD_NAPI AND NOT WASM)
    add_subdirectory(napi)
endif()
