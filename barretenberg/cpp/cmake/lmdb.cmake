include(ExternalProject)

set(LMDB_PREFIX "${CMAKE_BINARY_DIR}/_deps/lmdb")
set(LMDB_INCLUDE "${LMDB_PREFIX}/src/lmdb_repo/libraries/liblmdb")
set(LMDB_LIB "${LMDB_INCLUDE}/liblmdb.a")
set(LMDB_HEADER "${LMDB_INCLUDE}/lmdb.h")
set(LMDB_OBJECT "${LMDB_INCLUDE}/*.o")

ExternalProject_Add(
    lmdb_repo
    PREFIX ${LMDB_PREFIX}
    # We need to go through some hoops to do a shallow clone of a fixed commit (as opposed to a tag).
    DOWNLOAD_COMMAND
        sh -c "mkdir -p ${LMDB_PREFIX}/src/lmdb_repo && cd ${LMDB_PREFIX}/src/lmdb_repo && git init --quiet && (git remote add origin https://github.com/LMDB/lmdb.git 2>/dev/null || true) && git fetch --depth 1 origin --quiet ddd0a773e2f44d38e4e31ec9ed81af81f4e4ccbb && git reset --quiet --hard FETCH_HEAD"
    SOURCE_DIR ${LMDB_PREFIX}/src/lmdb_repo
    BUILD_IN_SOURCE YES
    CONFIGURE_COMMAND "" # No configure step
    # build-lmdb.sh pins LMDB's toolchain to the rest of barretenberg. Passing
    # CC only via the environment is not enough: this make is nested under the
    # outer build's make, and a CC inherited as a command-line variable (via
    # MAKEFLAGS) outranks both the environment and `make -e`, so an ambient
    # CC=gcc would build LMDB against the host glibc (undefined __isoc23_strtol
    # vs the zig-pinned glibc 2.35). The script severs inherited make state and
    # passes CC on make's command line. BUILD_ALWAYS lets it re-check the
    # toolchain each build; it is a no-op (liblmdb.a untouched) when unchanged.
    BUILD_COMMAND ${CMAKE_SOURCE_DIR}/scripts/build-lmdb.sh ${CMAKE_C_COMPILER}${CMAKE_C_COMPILER_ARG1} ${CMAKE_AR}
    BUILD_ALWAYS YES
    INSTALL_COMMAND ""
    UPDATE_COMMAND "" # No update step
    BUILD_BYPRODUCTS ${LMDB_LIB}
)

add_library(lmdb STATIC IMPORTED GLOBAL)
add_dependencies(lmdb lmdb_repo)
set_target_properties(lmdb PROPERTIES IMPORTED_LOCATION ${LMDB_LIB})

add_library(lmdb_objects OBJECT IMPORTED GLOBAL)
add_dependencies(lmdb_objects lmdb_repo)
set_target_properties(lmdb_objects PROPERTIES IMPORTED_LOCATION ${LMDB_OBJECT})
