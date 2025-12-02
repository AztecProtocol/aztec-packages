if(AVM AND FUZZING)
    # Collect source files, excluding the harness subdirectory to avoid duplicate targets
    file(GLOB_RECURSE SOURCE_FILES
        "${CMAKE_CURRENT_SOURCE_DIR}/*.cpp"
    )
    file(GLOB_RECURSE HEADER_FILES
        "${CMAKE_CURRENT_SOURCE_DIR}/*.hpp"
        "${CMAKE_CURRENT_SOURCE_DIR}/*.tcc"
    )
    file(GLOB_RECURSE TEST_SOURCE_FILES "${CMAKE_CURRENT_SOURCE_DIR}/*.test.cpp")
    file(GLOB_RECURSE BENCH_SOURCE_FILES "${CMAKE_CURRENT_SOURCE_DIR}/*.bench.cpp")
    file(GLOB_RECURSE FUZZERS_SOURCE_FILES "${CMAKE_CURRENT_SOURCE_DIR}/*.fuzzer.cpp")

    # Exclude harness subdirectory files from this module
    list(FILTER SOURCE_FILES EXCLUDE REGEX ".*/harness/.*")
    list(FILTER HEADER_FILES EXCLUDE REGEX ".*/harness/.*")
    list(FILTER TEST_SOURCE_FILES EXCLUDE REGEX ".*/harness/.*")
    list(FILTER BENCH_SOURCE_FILES EXCLUDE REGEX ".*/harness/.*")
    list(FILTER FUZZERS_SOURCE_FILES EXCLUDE REGEX ".*/harness/.*")

    # Filter out test, bench, and fuzzer files from regular sources
    list(FILTER SOURCE_FILES EXCLUDE REGEX ".*\\.(fuzzer|test|bench)\\.cpp$")

    # Create the avm_fuzzer module with explicit file lists
    barretenberg_module_with_sources(
        avm_fuzzer
        SOURCE_FILES ${SOURCE_FILES}
        HEADER_FILES ${HEADER_FILES}
        TEST_SOURCE_FILES ${TEST_SOURCE_FILES}
        BENCH_SOURCE_FILES ${BENCH_SOURCE_FILES}
        FUZZERS_SOURCE_FILES ${FUZZERS_SOURCE_FILES}
        DEPENDENCIES vm2 nlohmann_json::nlohmann_json
    )

    # Add the harness subdirectory which will create the alu_fuzzer target
    add_subdirectory(harness)
endif()

