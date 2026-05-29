# Node.js native addon for ipc-runtime's SHM-IPC clients.
#
# Builds a SHARED library `ipc_runtime_napi.node` exporting MsgpackClient /
# MsgpackClientAsync. The header search paths for `node-addon-api` / `napi.h`
# come from the local `node-addon-api` + `node-api-headers` npm packages —
# the same convention used by barretenberg/cpp/src/barretenberg/nodejs_module.
#
# Only built when targeting native (not WASM, not fuzzing).
if(WASM OR FUZZING)
  return()
endif()

# see https://nodejs.org/dist/latest/docs/api/n-api.html#node-api-version-matrix
add_definitions(-DNAPI_VERSION=9)

execute_process(
  COMMAND yarn --immutable
  WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}
)

execute_process(
  COMMAND node -p "require('node-addon-api').include"
  WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}
  OUTPUT_VARIABLE NODE_ADDON_API_DIR
)

execute_process(
  COMMAND node -p "require('node-api-headers').include_dir"
  WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}
  OUTPUT_VARIABLE NODE_API_HEADERS_DIR
)

string(REGEX REPLACE "[\r\n\"]" "" NODE_ADDON_API_DIR ${NODE_ADDON_API_DIR})
string(REGEX REPLACE "[\r\n\"]" "" NODE_API_HEADERS_DIR ${NODE_API_HEADERS_DIR})

add_library(ipc_runtime_napi SHARED
  init.cpp
  msgpack_client_wrapper.cpp
  msgpack_client_async.cpp
)
# Pin the output location so the addon lands at <build>/lib/ipc_runtime_napi.node
# regardless of build mode (standalone, cross-preset, or add_subdirectory'd).
set_target_properties(ipc_runtime_napi PROPERTIES
  PREFIX ""
  SUFFIX ".node"
  LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)
# Mark node-addon-api / node-api-headers as SYSTEM includes so the vendored
# napi-inl.h doesn't trip parent-project warning flags (-Werror
# -Wsign-conversion under barretenberg's strict preset).
target_include_directories(ipc_runtime_napi SYSTEM PRIVATE
  ${NODE_API_HEADERS_DIR}
  ${NODE_ADDON_API_DIR}
)
target_link_libraries(ipc_runtime_napi PRIVATE ipc_runtime)

# On macOS, Node N-API symbols are provided by the host runtime, not at link time.
if(CMAKE_SYSTEM_NAME STREQUAL "Darwin")
  target_link_options(ipc_runtime_napi PRIVATE "-undefined" "dynamic_lookup")
endif()
