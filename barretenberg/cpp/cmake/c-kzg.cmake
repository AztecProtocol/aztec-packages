include(FetchContent)

# Fetch c-kzg-4844 library from ethereum/c-kzg-4844
# This provides KZG cryptographic operations for EIP-4844 and EIP-7594

set(C_KZG_PREFIX "${CMAKE_BINARY_DIR}/_deps/c-kzg")

FetchContent_Declare(
  c-kzg
  GIT_REPOSITORY https://github.com/ethereum/c-kzg-4844.git
  GIT_TAG        v2.1.5
  GIT_SUBMODULES blst
  GIT_SUBMODULES_RECURSE ON
)

# Download and populate c-kzg (but don't build yet - we'll build it ourselves)
FetchContent_MakeAvailable(c-kzg)

# Set up paths for use in the kzg module
set(C_KZG_SOURCE_DIR "${c-kzg_SOURCE_DIR}/src")
set(C_KZG_BLST_DIR "${c-kzg_SOURCE_DIR}/blst")
