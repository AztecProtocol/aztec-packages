include(ExternalProject)

# Find the path where we will download the libdeflate github repository
# we need this to find where the libdeflate header files are for inclusion.
set(LIBDEFLATE_PREFIX "${CMAKE_BINARY_DIR}/_deps/libdeflate")
set(LIBDEFLATE_SOURCE "${LIBDEFLATE_PREFIX}/src/libdeflate")
set(LIBDEFLATE_INCLUDE "${LIBDEFLATE_SOURCE}")
set(LIBDEFLATE_LIB "${LIBDEFLATE_PREFIX}/src/libdeflate_project-build/libdeflate.a")

# Create directory structure for ExternalProject
file(MAKE_DIRECTORY ${LIBDEFLATE_SOURCE})

# required for macos cross build
add_definitions(-DLIBDEFLATE_ASSEMBLER_DOES_NOT_SUPPORT_SHA3)

ExternalProject_Add(
  libdeflate_project
  PREFIX ${LIBDEFLATE_PREFIX}
  DOWNLOAD_COMMAND
      sh -c "mkdir -p ${LIBDEFLATE_SOURCE} && cd ${LIBDEFLATE_SOURCE} && git init . && (git remote add origin https://github.com/ebiggers/libdeflate.git || true) && git fetch --depth 1 origin 96836d7d9d10e3e0d53e6edb54eb908514e336c4 && git checkout FETCH_HEAD"
  SOURCE_DIR ${LIBDEFLATE_SOURCE}
  CMAKE_ARGS
      -DCMAKE_BUILD_TYPE=${CMAKE_BUILD_TYPE}
      -DCMAKE_C_COMPILER=${CMAKE_C_COMPILER}
      -DCMAKE_CXX_COMPILER=${CMAKE_CXX_COMPILER}
      -DLIBDEFLATE_BUILD_SHARED_LIB=OFF
      -DLIBDEFLATE_BUILD_GZIP=OFF
  INSTALL_COMMAND ""
  UPDATE_COMMAND ""
  BUILD_BYPRODUCTS ${LIBDEFLATE_LIB}
)

add_library(libdeflate_static STATIC IMPORTED GLOBAL)
add_dependencies(libdeflate_static libdeflate_project)
set_target_properties(libdeflate_static PROPERTIES IMPORTED_LOCATION ${LIBDEFLATE_LIB})
target_include_directories(libdeflate_static INTERFACE ${LIBDEFLATE_INCLUDE})

# Create namespaced alias
add_library(libdeflate::libdeflate_static ALIAS libdeflate_static)

