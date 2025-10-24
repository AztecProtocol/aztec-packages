# Download nlohmann_json at configure time
set(NLOHMANN_JSON_SOURCE_DIR "${CMAKE_BINARY_DIR}/_deps/nlohmann_json-src")
set(NLOHMANN_JSON_COMMIT_HASH "9cca280a4d0ccf0c08f47a99aa71d1b0e52f8d03")

execute_process(
    COMMAND sh -c "mkdir -p ${NLOHMANN_JSON_SOURCE_DIR} && cd ${NLOHMANN_JSON_SOURCE_DIR} && git init . 2>/dev/null && (git remote add origin https://github.com/nlohmann/json.git 2>/dev/null || true) && git fetch --depth 1 origin ${NLOHMANN_JSON_COMMIT_HASH} 2>/dev/null && git checkout FETCH_HEAD 2>/dev/null"
    RESULT_VARIABLE result
)
if(result)
    message(FATAL_ERROR "Failed to download nlohmann_json")
endif()

# Set the same variables as FetchContent would have
set(NLOHMANN_JSON_INCLUDE "${NLOHMANN_JSON_SOURCE_DIR}/include")

# Set options (same as before)
set(JSON_BuildTests OFF CACHE INTERNAL "")
set(JSON_Install OFF CACHE INTERNAL "")

# Add nlohmann_json as a subdirectory (same as FetchContent_MakeAvailable would do)
add_subdirectory(${NLOHMANN_JSON_SOURCE_DIR} ${CMAKE_BINARY_DIR}/_deps/nlohmann_json-build EXCLUDE_FROM_ALL)
