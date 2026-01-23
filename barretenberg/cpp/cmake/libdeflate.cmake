include(FetchContent)

# Find the path where we will download the libdeflate github repository
# we need this to find where the libdeflate header files are for inclusion.
set(LIBDEFLATE_INCLUDE "${CMAKE_BINARY_DIR}/_deps/libdeflate-src/")

set(LIBDEFLATE_BUILD_SHARED_LIB OFF CACHE BOOL "Don't build shared libdeflate library")
set(LIBDEFLATE_BUILD_GZIP OFF CACHE BOOL "Don't build libdeflate gzip program")

# required for macos cross build
add_definitions(-DLIBDEFLATE_ASSEMBLER_DOES_NOT_SUPPORT_SHA3)

FetchContent_Declare(
  libdeflate
  GIT_REPOSITORY https://github.com/ebiggers/libdeflate.git
  GIT_TAG        v1.24
  GIT_SHALLOW    TRUE
)

# Download and populate libdeflate
FetchContent_MakeAvailable(libdeflate)

