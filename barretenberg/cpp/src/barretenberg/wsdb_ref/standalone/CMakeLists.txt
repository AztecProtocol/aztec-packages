cmake_minimum_required(VERSION 3.24)
# wsdb-ref (the reference world state behind its FFI entry, wsdb_ref_ipc_ffi_entry) and barretenberg's
# poseidon2 C bindings, as a static library a downstream project builds from source with its own
# toolchain: add it with FetchContent (or add_subdirectory) and link `wsdb_ref`. It compiles only the
# barretenberg sources those need, and none of barretenberg's own CMake.
#
# Its interface is C: wsdb_ref_ipc_ffi_entry/_alloc/_free and bb_poseidon2_hash{,_pair_with_separator}.
# The C++ behind it is linked with the consumer's, so both must use the same msgpack-c: this declares
# it under FetchContent's name `msgpack`, and the first declaration in a build wins.
project(wsdb_ref CXX)

get_filename_component(bb_src "${CMAKE_CURRENT_SOURCE_DIR}/../../.." ABSOLUTE)
get_filename_component(repo "${bb_src}/../../.." ABSOLUTE)
set(gen_root "${CMAKE_CURRENT_BINARY_DIR}/gen")
set(gen_dir "${gen_root}/barretenberg/wsdb_ref/generated")

include(FetchContent)
# Header-only. SOURCE_SUBDIR names a directory without a CMakeLists.txt, so this only fetches.
FetchContent_Declare(
    msgpack
    GIT_REPOSITORY https://github.com/msgpack/msgpack-c.git
    GIT_TAG cpp-7.0.0
    GIT_SHALLOW TRUE
    SOURCE_SUBDIR include
)
FetchContent_MakeAvailable(msgpack)
# Only Tracy's headers: barretenberg's profiling macros expand to nothing without TRACY_ENABLE.
FetchContent_Declare(
    tracy
    URL https://github.com/wolfpld/tracy/archive/5d542dc09f3d9378d005092a4ad446bd405f819a.tar.gz
    SOURCE_SUBDIR public/tracy
)
FetchContent_MakeAvailable(tracy)

# The protocol constants header, regenerated as barretenberg's own configure does (atomically, so the
# two may run at once).
execute_process(COMMAND "${bb_src}/../scripts/remake-constants.sh" COMMAND_ERROR_IS_FATAL ANY)
set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS
    "${repo}/noir-projects/fnd/noir-protocol-circuits/crates/types/src/constants.nr")

set(schema "${bb_src}/barretenberg/wsdb_ref/wsdb_schema.jsonc")
file(GLOB_RECURSE ipc_codegen_inputs CONFIGURE_DEPENDS ${repo}/ipc-codegen/src/*.ts
     ${repo}/ipc-codegen/templates/cpp/*)
add_custom_command(
    OUTPUT ${gen_dir}/wsdb_ffi.cpp ${gen_dir}/wsdb_ffi.hpp ${gen_dir}/wsdb_dispatch.hpp
           ${gen_dir}/wsdb_ipc_server.hpp ${gen_dir}/wsdb_types.hpp
    COMMAND node --experimental-strip-types --no-warnings ${repo}/ipc-codegen/src/generate.ts
            --schema ${schema} --lang cpp --out ${gen_dir} --server --ffi --ffi-name wsdb_ref
            --cpp-namespace bb::wsdb_ref --cpp-include-dir barretenberg/wsdb_ref/generated
    DEPENDS ${schema} ${ipc_codegen_inputs}
    COMMENT "Generating the wsdb-ref dispatch and FFI entry from wsdb_schema.jsonc"
    VERBATIM)

add_library(wsdb_ref STATIC
    ${bb_src}/barretenberg/common/assert.cpp
    ${bb_src}/barretenberg/common/log.cpp
    ${bb_src}/barretenberg/common/logstr.cpp
    ${bb_src}/barretenberg/common/throw_or_abort.cpp
    ${bb_src}/barretenberg/crypto/poseidon2/poseidon2.cpp
    ${bb_src}/barretenberg/crypto/poseidon2/poseidon2_capi.cpp
    ${bb_src}/barretenberg/world_state_reference/merkle_tree_id.cpp
    ${bb_src}/barretenberg/world_state_reference/reference_world_state.cpp
    ${bb_src}/barretenberg/wsdb_ref/wsdb_ref_handlers.cpp
    ${gen_dir}/wsdb_ffi.cpp)
target_compile_features(wsdb_ref PRIVATE cxx_std_20)
set_target_properties(wsdb_ref PROPERTIES POSITION_INDEPENDENT_CODE ON)
# All private: a consumer declares the C entry points itself and compiles no barretenberg header.
target_include_directories(wsdb_ref PRIVATE ${bb_src} ${gen_root} ${repo}/ipc-runtime/cpp)
target_include_directories(wsdb_ref SYSTEM PRIVATE ${msgpack_SOURCE_DIR}/include ${tracy_SOURCE_DIR}/public)
# What barretenberg's build defines for these sources.
target_compile_definitions(wsdb_ref PRIVATE MSGPACK_NO_BOOST MSGPACK_USE_STD_VARIANT_ADAPTOR NO_PAR_ALGOS)
target_compile_options(wsdb_ref PRIVATE -fconstexpr-steps=100000000 -fbracket-depth=1024)
if(CMAKE_SYSTEM_PROCESSOR MATCHES "x86_64")
    target_compile_options(wsdb_ref PRIVATE -march=skylake)
endif()
