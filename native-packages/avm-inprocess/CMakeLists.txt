cmake_minimum_required(VERSION 3.24)

# Barretenberg source + build tree. barretenberg produces the avm_sim_ffi library
# (plain-C ABI) and its transitive static archives; this wrapper links them. The
# codegen'd package would be pointed at these paths, just as the IPC package is
# pointed at a binary. Toolchain must match barretenberg (zig c++) for ABI
# compatibility with the archives — set before project().
get_filename_component(BB_CPP "${CMAKE_CURRENT_SOURCE_DIR}/../../barretenberg/cpp" ABSOLUTE)
set(CMAKE_CXX_COMPILER "${BB_CPP}/scripts/zig-c++.sh")
set(CMAKE_C_COMPILER "${BB_CPP}/scripts/zig-cc.sh")

project(avm_inprocess CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

set(BB_BUILD "${BB_CPP}/build" CACHE PATH "barretenberg/cpp build dir")
set(BB_SRC "${BB_CPP}/src")

add_definitions(-DNAPI_VERSION=9)

# Reuse the node-addon-api / node-api-headers already installed for barretenberg's
# nodejs_module (avoids a second install for the spike).
set(NODEJS_MODULE_DIR "${BB_SRC}/barretenberg/nodejs_module")
execute_process(
  COMMAND node -p "require('node-addon-api').include"
  WORKING_DIRECTORY ${NODEJS_MODULE_DIR}
  OUTPUT_VARIABLE NODE_ADDON_API_DIR)
execute_process(
  COMMAND node -p "require('node-api-headers').include_dir"
  WORKING_DIRECTORY ${NODEJS_MODULE_DIR}
  OUTPUT_VARIABLE NODE_API_HEADERS_DIR)
string(REGEX REPLACE "[\r\n\"]" "" NODE_ADDON_API_DIR ${NODE_ADDON_API_DIR})
string(REGEX REPLACE "[\r\n\"]" "" NODE_API_HEADERS_DIR ${NODE_API_HEADERS_DIR})

add_library(avm_inprocess SHARED src/in_process_avm.cpp)
set_target_properties(avm_inprocess PROPERTIES PREFIX "" SUFFIX ".node")
target_include_directories(avm_inprocess PRIVATE
  ${NODE_API_HEADERS_DIR}
  ${NODE_ADDON_API_DIR}
  ${BB_SRC})  # for barretenberg/avm/avm_ffi.h

# The static archive set bb-avm-sim links (from build.ninja's LINK_LIBRARIES),
# wrapped in a group so inter-archive references resolve regardless of order.
set(BB_ARCHIVES
  ${BB_BUILD}/lib/libavm_sim_ffi.a
  ${BB_BUILD}/lib/libwsdb_ipc_merkle_db.a
  ${BB_BUILD}/lib/libvm2_sim.a
  ${BB_BUILD}/lib/libworld_state.a
  ${BB_BUILD}/lib/libcrypto_merkle_tree.a
  ${BB_BUILD}/lib/liblmdblib.a
  ${BB_BUILD}/_deps/lmdb/src/lmdb_repo/libraries/liblmdb/liblmdb.a
  ${BB_BUILD}/lib/libcrypto_poseidon2.a
  ${BB_BUILD}/lib/libecc.a
  ${BB_BUILD}/lib/libnumeric.a
  ${BB_BUILD}/lib/libcrypto_keccak.a
  ${BB_BUILD}/lib/libcrypto_sha256.a
  ${BB_BUILD}/lib/libcommon.a
  ${BB_BUILD}/_deps/libdeflate-build/libdeflate.a
  ${BB_BUILD}/lib/libwsdb_ipc_client.a
  ${BB_BUILD}/lib/libcdb_ipc_client.a
  ${BB_BUILD}/lib/libbarretenberg.a
  ${BB_BUILD}/lib/libipc_runtime.a
  ${BB_BUILD}/lib/libenv.a)

target_link_libraries(avm_inprocess PRIVATE
  -Wl,--start-group ${BB_ARCHIVES} -Wl,--end-group
  pthread)
