include(ExternalProject)

# External project: Download msgpack-c from GitHub
set(MSGPACK_PREFIX "${CMAKE_BINARY_DIR}/_deps/msgpack-c")
set(MSGPACK_INCLUDE "${MSGPACK_PREFIX}/src/msgpack-c/include")

ExternalProject_Add(
    msgpack-c
    PREFIX ${MSGPACK_PREFIX}
    # We need to go through some hoops to do a shallow clone of a fixed commit (as opposed to a tag).
    DOWNLOAD_COMMAND
        sh -c "mkdir -p ${MSGPACK_PREFIX}/src/msgpack-c && cd ${MSGPACK_PREFIX}/src/msgpack-c && git init . && (git remote add origin https://github.com/AztecProtocol/msgpack-c.git || true) && git fetch --depth 1 origin 5ee9a1c8c325658b29867829677c7eb79c433a98 && git checkout FETCH_HEAD"
    SOURCE_DIR ${MSGPACK_PREFIX}/src/msgpack-c
    CONFIGURE_COMMAND ""  # No configure step
    BUILD_COMMAND ""      # No build step
    INSTALL_COMMAND ""    # No install step
    UPDATE_COMMAND ""     # No update step
)
