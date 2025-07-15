barretenberg_module(bbapi api serialize)

# Include the implementation files from the api directory
target_sources(bbapi_objects PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/../api/bbapi_execute.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../api/bbapi_client_ivc.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../api/bbapi_ultra_honk.cpp
)