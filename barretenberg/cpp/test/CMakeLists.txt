include_directories(${PROJECT_SOURCE_DIR}/src)
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)

barretenberg_module_with_sources(
    experimental_optimizations_config
    TEST_SOURCE_FILES ${CMAKE_CURRENT_SOURCE_DIR}/experimental_optimizations_config.test.cpp
    DEPENDENCIES common
    SKIP_EXPERIMENTAL_INITIALIZATION
)

barretenberg_module_with_sources(
    experimental_optimizations_startup
    TEST_SOURCE_FILES ${CMAKE_CURRENT_SOURCE_DIR}/experimental_optimizations_startup.test.cpp
    DEPENDENCIES common
)
