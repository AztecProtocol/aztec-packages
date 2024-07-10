include(ExternalProject)

set(LMDB_PREFIX "${CMAKE_BINARY_DIR}/_deps/lmdb")
set(LMDB_INCLUDE "${LMDB_PREFIX}/src/lmdb/libraries/liblmdb")
set(LMDB_LIB "${LMDB_INCLUDE}/liblmdb.a")

ExternalProject_Add(
    lmdb
    PREFIX ${LMDB_PREFIX}
    GIT_REPOSITORY "https://github.com/LMDB/lmdb.git"
    GIT_TAG ddd0a773e2f44d38e4e31ec9ed81af81f4e4ccbb
    BUILD_IN_SOURCE YES
    CONFIGURE_COMMAND "" # No configure step
    BUILD_COMMAND make -C libraries/liblmdb liblmdb.a
    INSTALL_COMMAND ""
    UPDATE_COMMAND "" # No update step
    BUILD_BYPRODUCTS ${LMDB_LIB} ${LMDB_INCLUDE}
)

add_library(lmdb-lib STATIC IMPORTED)
add_dependencies(lmdb-lib lmdb)
set_target_properties(lmdb-lib PROPERTIES IMPORTED_LOCATION ${LMDB_LIB})
