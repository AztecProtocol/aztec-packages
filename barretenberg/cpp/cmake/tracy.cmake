include(ExternalProject)

set(TRACY_PREFIX "${CMAKE_BINARY_DIR}/_deps/tracy")
set(TRACY_SOURCE "${TRACY_PREFIX}/src/tracy")
# Find the path where we will download the Tracy github repository
# we need this to find where the Tracy header files are for inclusion.
set(TRACY_INCLUDE "${TRACY_SOURCE}/public")

# Create directory structure for ExternalProject
file(MAKE_DIRECTORY ${TRACY_INCLUDE})

# Work around an issue finding threads.
set(CMAKE_THREAD_LIBS_INIT "-lpthread")

# Download the Tracy github project
ExternalProject_Add(
    tracy_project
    PREFIX ${TRACY_PREFIX}
    DOWNLOAD_COMMAND
        sh -c "mkdir -p ${TRACY_SOURCE} && cd ${TRACY_SOURCE} && git init . && (git remote add origin https://github.com/wolfpld/tracy || true) && git fetch --depth 1 origin 5d542dc09f3d9378d005092a4ad446bd405f819a && git checkout FETCH_HEAD"
    SOURCE_DIR ${TRACY_SOURCE}
    CMAKE_ARGS -DCMAKE_INSTALL_PREFIX=${TRACY_PREFIX}/install
    BUILD_COMMAND ""
    INSTALL_COMMAND ""
    UPDATE_COMMAND ""
)

add_library(TracyClient INTERFACE)
add_dependencies(TracyClient tracy_project)
target_include_directories(TracyClient SYSTEM INTERFACE ${TRACY_INCLUDE})
