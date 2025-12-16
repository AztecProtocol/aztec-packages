include(FetchContent)

set(NLOHMANN_JSON_INCLUDE "${CMAKE_BINARY_DIR}/_deps/nlohmann_json-src/include")

FetchContent_Declare(
    nlohmann_json
    GIT_REPOSITORY https://github.com/nlohmann/json.git
    GIT_TAG v3.11.3
    GIT_SHALLOW TRUE
    FIND_PACKAGE_ARGS
)

set(JSON_BuildTests OFF CACHE INTERNAL "")
set(JSON_Install OFF CACHE INTERNAL "")

FetchContent_MakeAvailable(nlohmann_json)

if(NOT nlohmann_json_FOUND)
    # FetchContent_MakeAvailable calls FetchContent_Populate if `find_package` is unsuccessful
    # so these variables will be available if we reach this case
    set_property(DIRECTORY ${nlohmann_json_SOURCE_DIR} PROPERTY EXCLUDE_FROM_ALL)
    set_property(DIRECTORY ${nlohmann_json_BINARY_DIR} PROPERTY EXCLUDE_FROM_ALL)
endif()
