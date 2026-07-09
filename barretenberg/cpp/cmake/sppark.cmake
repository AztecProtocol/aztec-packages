include(ExternalProject)

# sppark (Apache-2.0, supranational) — CUDA/C++ template library providing the GPU MSM.
# Header-only from our perspective: the single CUDA TU in src/barretenberg/ecc_gpu
# includes its headers. Pinned to a fixed upstream commit.
set(SPPARK_PREFIX "${CMAKE_BINARY_DIR}/_deps/sppark")
set(SPPARK_INCLUDE "${SPPARK_PREFIX}/src/sppark_repo")
set(SPPARK_COMMIT "17278d74295392f9813f009300b257a688422b7a")

ExternalProject_Add(
    sppark_repo
    PREFIX ${SPPARK_PREFIX}
    # Shallow clone of a fixed commit (same hoops as lmdb.cmake).
    DOWNLOAD_COMMAND
        sh -c "mkdir -p ${SPPARK_INCLUDE} && cd ${SPPARK_INCLUDE} && git init --quiet && (git remote add origin https://github.com/supranational/sppark.git 2>/dev/null || true) && git fetch --depth 1 origin --quiet ${SPPARK_COMMIT} && git reset --quiet --hard FETCH_HEAD"
    SOURCE_DIR ${SPPARK_INCLUDE}
    BUILD_IN_SOURCE YES
    CONFIGURE_COMMAND ""
    BUILD_COMMAND ""
    INSTALL_COMMAND ""
    UPDATE_COMMAND ""
)

# blst (Apache-2.0, supranational) — sppark's host-side field arithmetic (blst_t.hpp
# wraps blst's assembly; msm_t's final bucket reduction runs on the host), so the GPU
# module must link libblst.a.
set(BLST_PREFIX "${CMAKE_BINARY_DIR}/_deps/blst")
set(BLST_SRC "${BLST_PREFIX}/src/blst_repo")
set(BLST_LIB "${BLST_SRC}/libblst.a")

ExternalProject_Add(
    blst_repo
    PREFIX ${BLST_PREFIX}
    GIT_REPOSITORY https://github.com/supranational/blst.git
    GIT_TAG v0.3.16
    GIT_SHALLOW TRUE
    SOURCE_DIR ${BLST_SRC}
    BUILD_IN_SOURCE YES
    CONFIGURE_COMMAND ""
    BUILD_COMMAND ${CMAKE_COMMAND} -E env --unset=CFLAGS --unset=CXXFLAGS CC=${CMAKE_C_COMPILER}${CMAKE_C_COMPILER_ARG1} ./build.sh
    INSTALL_COMMAND ""
    UPDATE_COMMAND ""
    BUILD_BYPRODUCTS ${BLST_LIB}
)

add_library(blst STATIC IMPORTED GLOBAL)
add_dependencies(blst blst_repo)
set_target_properties(blst PROPERTIES IMPORTED_LOCATION ${BLST_LIB})

add_library(sppark_headers INTERFACE)
add_dependencies(sppark_headers sppark_repo blst_repo)
# blst_t.hpp lives in blst/src (and includes vect.h/bytes.h from there); the C API
# header blst.h lives in blst/bindings.
target_include_directories(sppark_headers SYSTEM INTERFACE
    ${SPPARK_INCLUDE}
    ${BLST_SRC}/src
    ${BLST_SRC}/bindings
)
target_link_libraries(sppark_headers INTERFACE blst)
