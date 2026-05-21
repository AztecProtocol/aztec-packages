# ipc-runtime C++ library — UDS + MPSC-SHM transport for IPC services.
#
# This CMakeLists is currently consumed via add_subdirectory() from
# barretenberg/cpp/src/CMakeLists.txt, so it can rely on barretenberg's
# module macros + provided dependencies (msgpack, gtest).
#
# Making it truly standalone-buildable (its own FetchContent for gtest,
# its own bootstrap.sh + cmake invocation) is a planned follow-up.

set(IPC_RUNTIME_SOURCES
    ipc_runtime/ipc_client.cpp
    ipc_runtime/ipc_server.cpp
    ipc_runtime/socket_client.cpp
    ipc_runtime/socket_server.cpp
    ipc_runtime/shm/mpsc_shm.cpp
    ipc_runtime/shm/spsc_shm.cpp
)

set(IPC_RUNTIME_HEADERS
    ipc_runtime/ipc_client.hpp
    ipc_runtime/ipc_server.hpp
    ipc_runtime/socket_client.hpp
    ipc_runtime/socket_server.hpp
    ipc_runtime/mpsc_shm_client.hpp
    ipc_runtime/mpsc_shm_server.hpp
    ipc_runtime/shm_client.hpp
    ipc_runtime/shm_common.hpp
    ipc_runtime/shm_server.hpp
    ipc_runtime/shm/futex.hpp
    ipc_runtime/shm/mpsc_shm.hpp
    ipc_runtime/shm/spsc_shm.hpp
    ipc_runtime/shm/utilities.hpp
)

set(IPC_RUNTIME_TEST_SOURCES
    ipc_runtime/shm.test.cpp
)

barretenberg_module_with_sources(
    ipc_runtime
    SOURCE_FILES ${IPC_RUNTIME_SOURCES}
    HEADER_FILES ${IPC_RUNTIME_HEADERS}
    TEST_SOURCE_FILES ${IPC_RUNTIME_TEST_SOURCES}
)
set_target_properties(ipc_runtime_objects PROPERTIES POSITION_INDEPENDENT_CODE ON)

# Make `#include "ipc_runtime/..."` resolve from this directory regardless of
# which parent project includes us. The test object lib doesn't link the lib
# in barretenberg_module_with_sources (only the test exe does), so add the
# include path explicitly.
target_include_directories(ipc_runtime PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})
target_include_directories(ipc_runtime_objects PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})
if(TARGET ipc_runtime_test_objects)
    target_include_directories(ipc_runtime_test_objects PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})
endif()
