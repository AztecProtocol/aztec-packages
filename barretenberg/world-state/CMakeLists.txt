cmake_minimum_required(VERSION 3.15)
cmake_policy(SET CMP0091 NEW)
cmake_policy(SET CMP0042 NEW)

project (world-state-napi)

add_definitions(-DNAPI_VERSION=9)

include_directories(${CMAKE_JS_INC})

include(ExternalProject)

file(GLOB SOURCE_FILES "hello.cpp")

add_library(${PROJECT_NAME} SHARED ${SOURCE_FILES} ${CMAKE_JS_SRC})
set_target_properties(${PROJECT_NAME} PROPERTIES PREFIX "" SUFFIX ".node")

execute_process(
  COMMAND node -p "require('node-addon-api').include"
  WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
  OUTPUT_VARIABLE NODE_ADDON_API_DIR
)

execute_process(
  COMMAND node -p "require('node-api-headers').include_dir"
  WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
  OUTPUT_VARIABLE NODE_API_HEADERS_DIR
)

string(REGEX REPLACE "[\r\n\"]" "" NODE_ADDON_API_DIR ${NODE_ADDON_API_DIR})
string(REGEX REPLACE "[\r\n\"]" "" NODE_API_HEADERS_DIR ${NODE_API_HEADERS_DIR})

set(NODE_API_HEADERS_DIR "${NODE_API_HEADERS_DIR}"
  CACHE
  PATH
  "Node API Headers directory."
  FORCE
)

set(NODE_ADDON_API_DIR "${NODE_ADDON_API_DIR}"
  CACHE
  PATH
  "Node Addon API Headers directory."
  FORCE
)

message(STATUS "Found node-addon-api at ${NODE_ADDON_API_DIR}")
message(STATUS "Found node-api-headers at ${NODE_API_HEADERS_DIR}")

target_include_directories(${PROJECT_NAME} PRIVATE ${NODE_API_HEADERS_DIR} ${NODE_ADDON_API_DIR})

include_directories(${CMAKE_JS_INC})
include_directories(${NODE_API_HEADERS_DIR})
include_directories(${NODE_ADDON_API_DIR})

target_link_libraries(${PROJECT_NAME} ${CMAKE_JS_LIB})

set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

if(MSVC AND CMAKE_JS_NODELIB_DEF AND CMAKE_JS_NODELIB_TARGET)
  # Generate node.lib
  execute_process(COMMAND ${CMAKE_AR} /def:${CMAKE_JS_NODELIB_DEF} /out:${CMAKE_JS_NODELIB_TARGET} ${CMAKE_STATIC_LINKER_FLAGS})
endif()
