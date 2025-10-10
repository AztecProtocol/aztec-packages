include(ExternalProject)

set(NLOHMANN_JSON_PREFIX "${CMAKE_BINARY_DIR}/_deps/nlohmann_json")
set(NLOHMANN_JSON_INCLUDE "${NLOHMANN_JSON_PREFIX}/src/nlohmann_json_project/include")

# Create directory structure for ExternalProject
file(MAKE_DIRECTORY ${NLOHMANN_JSON_INCLUDE})

ExternalProject_Add(
    nlohmann_json_project
    PREFIX ${NLOHMANN_JSON_PREFIX}
    DOWNLOAD_COMMAND
        sh -c "mkdir -p ${NLOHMANN_JSON_PREFIX}/src/nlohmann_json_project && cd ${NLOHMANN_JSON_PREFIX}/src/nlohmann_json_project && git init . && (git remote add origin https://github.com/nlohmann/json.git || true) && git fetch --depth 1 origin v3.11.3 && git checkout FETCH_HEAD"
    SOURCE_DIR ${NLOHMANN_JSON_PREFIX}/src/nlohmann_json_project
    CONFIGURE_COMMAND ""
    BUILD_COMMAND ""
    INSTALL_COMMAND ""
    UPDATE_COMMAND ""
)

add_library(nlohmann_json INTERFACE)
add_dependencies(nlohmann_json nlohmann_json_project)
target_include_directories(nlohmann_json SYSTEM INTERFACE ${NLOHMANN_JSON_PREFIX}/src/nlohmann_json_project/include)

# Create namespaced alias
add_library(nlohmann_json::nlohmann_json ALIAS nlohmann_json)
