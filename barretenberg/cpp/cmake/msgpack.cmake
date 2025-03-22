include(ExternalProject)

# External project: Download msgpack-c from GitHub
set(MSGPACK_PREFIX "${CMAKE_BINARY_DIR}/_deps/msgpack-c")
set(MSGPACK_INCLUDE "${MSGPACK_PREFIX}/src/msgpack-c/include")

ExternalProject_Add(
    msgpack-c
    PREFIX ${MSGPACK_PREFIX}
    GIT_REPOSITORY "https://github.com/AztecProtocol/msgpack-c.git"
    GIT_TAG 54e9865b84bbdc73cfbf8d1d437dbf769b64e386
    CONFIGURE_COMMAND ""  # No configure step
    BUILD_COMMAND ""      # No build step
    INSTALL_COMMAND ""    # No install step
    UPDATE_COMMAND ""     # No update step
)
