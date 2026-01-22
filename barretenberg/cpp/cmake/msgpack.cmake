include(ExternalProject)

# External project: Download msgpack-c from GitHub
set(MSGPACK_PREFIX "${CMAKE_BINARY_DIR}/_deps/msgpack-c")
set(MSGPACK_INCLUDE "${MSGPACK_PREFIX}/src/msgpack-c/include")

ExternalProject_Add(
    msgpack-c
    PREFIX ${MSGPACK_PREFIX}
    # We need to go through some hoops to do a shallow clone of a fixed commit (as opposed to a tag).
    DOWNLOAD_COMMAND
        sh -c "mkdir -p ${MSGPACK_PREFIX}/src/msgpack-c && cd ${MSGPACK_PREFIX}/src/msgpack-c && git init --quiet && (git remote add origin https://github.com/AztecProtocol/msgpack-c.git 2>/dev/null || true) && git fetch --depth 1 origin --quiet c0334576ed657fb3b3c49e8e61402989fb84146d && git reset --quiet --hard FETCH_HEAD"
    SOURCE_DIR ${MSGPACK_PREFIX}/src/msgpack-c
    CONFIGURE_COMMAND ""  # No configure step
    BUILD_COMMAND ""      # No build step
    INSTALL_COMMAND ""    # No install step
    UPDATE_COMMAND ""     # No update step
)
