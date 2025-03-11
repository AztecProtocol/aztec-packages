# see https://nodejs.org/dist/latest/docs/api/n-api.html#node-api-version-matrix
add_definitions(-DNAPI_VERSION=9)

file(GLOB_RECURSE SOURCE_FILES *.cpp)
file(GLOB_RECURSE HEADER_FILES *.hpp *.tcc)

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

add_library(nodejs_module SHARED ${SOURCE_FILES})
set_target_properties(nodejs_module PROPERTIES PREFIX "" SUFFIX ".node")
target_include_directories(nodejs_module PRIVATE ${NODE_API_HEADERS_DIR} ${NODE_ADDON_API_DIR})
target_link_libraries(nodejs_module PRIVATE world_state)
