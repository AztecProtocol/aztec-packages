include(ExternalProject)

set(HTTPLIB_PREFIX "${CMAKE_BINARY_DIR}/_deps/httplib")
set(HTTPLIB_INCLUDE "${HTTPLIB_PREFIX}/src/httplib")

# Create directory structure for ExternalProject
file(MAKE_DIRECTORY ${HTTPLIB_INCLUDE})

ExternalProject_Add(
    httplib
    PREFIX ${HTTPLIB_PREFIX}
    DOWNLOAD_COMMAND
        sh -c "mkdir -p ${HTTPLIB_INCLUDE} && cd ${HTTPLIB_INCLUDE} && git init . && (git remote add origin https://github.com/yhirose/cpp-httplib.git || true) && git fetch --depth 1 origin v0.15.3 && git checkout FETCH_HEAD"
    SOURCE_DIR ${HTTPLIB_INCLUDE}
    CONFIGURE_COMMAND ""
    BUILD_COMMAND ""
    INSTALL_COMMAND ""
    UPDATE_COMMAND ""
)

# Create interface library for httplib
add_library(httplib_headers INTERFACE)
add_dependencies(httplib_headers httplib)
target_include_directories(httplib_headers SYSTEM INTERFACE ${HTTPLIB_INCLUDE})
