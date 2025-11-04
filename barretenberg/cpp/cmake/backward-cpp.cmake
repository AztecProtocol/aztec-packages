if(ENABLE_STACKTRACES)
    include(ExternalProject)

    set(BACKWARD_PREFIX "${CMAKE_BINARY_DIR}/_deps/backward")
    set(BACKWARD_INCLUDE "${BACKWARD_PREFIX}/src/backward")

    # Create directory structure for ExternalProject
    file(MAKE_DIRECTORY ${BACKWARD_INCLUDE})

    # Also requires one of: libbfd (gnu binutils), libdwarf, libdw (elfutils)
    ExternalProject_Add(
        backward
        PREFIX ${BACKWARD_PREFIX}
        # We need to go through some hoops to do a shallow clone of a fixed commit (as opposed to a tag).
        DOWNLOAD_COMMAND
            sh -c "mkdir -p ${BACKWARD_PREFIX}/src/backward && cd ${BACKWARD_PREFIX}/src/backward && git init . 2>/dev/null && (git remote add origin https://github.com/bombela/backward-cpp 2>/dev/null || true) && git fetch --depth 1 origin 51f0700452cf71c57d43c2d028277b24cde32502 2>/dev/null && git checkout FETCH_HEAD 2>/dev/null"
        SOURCE_DIR ${BACKWARD_PREFIX}/src/backward
        CONFIGURE_COMMAND ""
        BUILD_COMMAND ""
        INSTALL_COMMAND ""
        UPDATE_COMMAND ""
    )

    add_library(Backward::Interface INTERFACE IMPORTED)
    add_dependencies(Backward::Interface backward)
    target_include_directories(Backward::Interface SYSTEM INTERFACE ${BACKWARD_INCLUDE})
endif()
