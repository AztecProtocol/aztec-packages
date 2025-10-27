# Download Tracy at configure time
set(TRACY_SOURCE_DIR "${CMAKE_BINARY_DIR}/_deps/tracy-src")
set(TRACY_COMMIT_HASH "5d542dc09f3d9378d005092a4ad446bd405f819a")

execute_process(
    COMMAND sh -c "mkdir -p ${TRACY_SOURCE_DIR} && cd ${TRACY_SOURCE_DIR} && git init . 2>/dev/null && (git remote add origin https://github.com/wolfpld/tracy.git 2>/dev/null || true) && git fetch --depth 1 origin ${TRACY_COMMIT_HASH} 2>/dev/null && git checkout FETCH_HEAD 2>/dev/null"
    RESULT_VARIABLE result
)
if(result)
    message(FATAL_ERROR "Failed to download Tracy")
endif()

# Set the same variables as FetchContent would have
set(TRACY_INCLUDE "${TRACY_SOURCE_DIR}/public")

# Work around an issue finding threads.
set(CMAKE_THREAD_LIBS_INIT "-lpthread")

# Add Tracy as a subdirectory (same as FetchContent_MakeAvailable would do)
add_subdirectory(${TRACY_SOURCE_DIR} ${CMAKE_BINARY_DIR}/_deps/tracy-build EXCLUDE_FROM_ALL)
