# see https://nodejs.org/dist/latest/docs/api/n-api.html#node-api-version-matrix
add_definitions(-DNAPI_VERSION=9)

include_directories(${CMAKE_JS_INC})

file(GLOB_RECURSE SOURCE_FILES *.cpp)
file(GLOB_RECURSE HEADER_FILES *.hpp *.tcc)

add_library(world_state_napi SHARED ${SOURCE_FILES} ${CMAKE_JS_SRC})
set_target_properties(world_state_napi PROPERTIES PREFIX "" SUFFIX ".node")

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

message(STATUS "Found node-addon-api at ${NODE_ADDON_API_DIR}")
message(STATUS "Found node-api-headers at ${NODE_API_HEADERS_DIR}")

target_include_directories(world_state_napi PRIVATE ${NODE_API_HEADERS_DIR} ${NODE_ADDON_API_DIR})
target_link_libraries(world_state_napi common crypto_merkle_tree ${CMAKE_JS_LIB} ${TBB_IMPORTED_TARGETS})
