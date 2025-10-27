# copyright 2019 Spilsbury Holdings
#
# usage: barretenberg_module(module_name [dependencies ...])
#
# Scans for all .cpp files in a subdirectory, and creates a library named <module_name>.
# Scans for all .test.cpp files in a subdirectory, and creates a gtest binary named <module name>_tests.
# Scans for all .bench.cpp files in a subdirectory, and creates a benchmark binary named <module name>_bench.
#
# We have to get a bit complicated here, due to the fact CMake will not parallelize the building of object files
# between dependent targets, due to the potential of post-build code generation steps etc.
# To work around this, we create "object libraries" containing the object files.
# Then we declare executables/libraries that are to be built from these object files.
# These assets will only be linked as their dependencies complete, but we can parallelize the compilation at least.

# This is an interface library that can be used as an install target to include all header files
# encountered by the `barretenberg_module` function. There is probably a better way to do this,
# especially if we want to exclude some of the header files being installed
add_library(barretenberg_headers INTERFACE)
target_sources(
    barretenberg_headers
    INTERFACE
    FILE_SET HEADERS
    BASE_DIRS ${CMAKE_CURRENT_SOURCE_DIR}/src
)

# barretenberg_module variant that allows specifying custom source and header files
function(barretenberg_module_with_sources MODULE_NAME)
    # Parse named arguments for SOURCE_FILES and HEADER_FILES
    # All remaining arguments are treated as dependencies
    set(options "")
    set(oneValueArgs "")
    set(multiValueArgs SOURCE_FILES HEADER_FILES TEST_SOURCE_FILES BENCH_SOURCE_FILES FUZZERS_SOURCE_FILES DEPENDENCIES)
    cmake_parse_arguments(PARSE_ARGV 1 ARG "${options}" "${oneValueArgs}" "${multiValueArgs}")

    # Use provided SOURCE_FILES and HEADER_FILES
    set(SOURCE_FILES ${ARG_SOURCE_FILES})
    set(HEADER_FILES ${ARG_HEADER_FILES})
    set(TEST_SOURCE_FILES ${ARG_TEST_SOURCE_FILES})
    set(BENCH_SOURCE_FILES ${ARG_BENCH_SOURCE_FILES})
    set(FUZZERS_SOURCE_FILES ${ARG_FUZZERS_SOURCE_FILES})

    # Dependencies are either in ARG_DEPENDENCIES or ARG_UNPARSED_ARGUMENTS
    set(MODULE_DEPENDENCIES ${ARG_DEPENDENCIES} ${ARG_UNPARSED_ARGUMENTS})

    target_sources(
        barretenberg_headers
        INTERFACE
        FILE_SET HEADERS
        FILES ${HEADER_FILES}
    )

    if(SOURCE_FILES)
        add_library(
            ${MODULE_NAME}_objects
            OBJECT
            EXCLUDE_FROM_ALL
            ${SOURCE_FILES}
        )
        list(APPEND lib_targets ${MODULE_NAME}_objects)

        add_library(
            ${MODULE_NAME}
            STATIC
            $<TARGET_OBJECTS:${MODULE_NAME}_objects>
        )

        target_link_libraries(
            ${MODULE_NAME}
            PUBLIC
            ${MODULE_DEPENDENCIES}
            ${TRACY_LIBS}
            ${TBB_IMPORTED_TARGETS}
        )

        if(ENABLE_STACKTRACES)
            target_link_libraries(
                ${MODULE_NAME}_objects
                PUBLIC
                Backward::Interface
            )
            target_link_options(
                ${MODULE_NAME}
                PRIVATE
                -ldw -lelf
            )
        endif()

        if(FUZZING)
            target_compile_options(
                ${MODULE_NAME}_objects
                PRIVATE
                -fsanitize=fuzzer-no-link
            )
        endif()

        # enable msgpack downloading via dependency (solves race condition)
        add_dependencies(${MODULE_NAME} msgpack-c)
        add_dependencies(${MODULE_NAME}_objects msgpack-c)

        # enable lmdb downloading via dependency (solves race condition)
        if(NOT CMAKE_SYSTEM_PROCESSOR MATCHES "wasm32")
            add_dependencies(${MODULE_NAME} lmdb_repo)
            add_dependencies(${MODULE_NAME}_objects lmdb_repo)
        endif()
        list(APPEND lib_targets ${MODULE_NAME})

        set(MODULE_LINK_NAME ${MODULE_NAME})
    endif()

    # Test files - only build if TEST_SOURCE_FILES was provided
    if(TEST_SOURCE_FILES AND NOT FUZZING)
        add_library(
            ${MODULE_NAME}_test_objects
            OBJECT
            ${TEST_SOURCE_FILES}
        )
        list(APPEND lib_targets ${MODULE_NAME}_test_objects)

        target_link_libraries(
            ${MODULE_NAME}_test_objects
            PRIVATE
            ${TRACY_LIBS}
            GTest::gtest
            GTest::gmock_main
            ${TBB_IMPORTED_TARGETS}
        )

        add_executable(
            ${MODULE_NAME}_tests
            $<TARGET_OBJECTS:${MODULE_NAME}_test_objects>
        )
        list(APPEND exe_targets ${MODULE_NAME}_tests)

        if(ENABLE_STACKTRACES)
            target_link_libraries(
                ${MODULE_NAME}_test_objects
                PUBLIC
                Backward::Interface
            )
            target_link_options(
                ${MODULE_NAME}_tests
                PRIVATE
                -ldw -lelf
            )
        endif()

        if(WASM)
            target_link_options(
                ${MODULE_NAME}_tests
                PRIVATE
                -Wl,-z,stack-size=8388608
            )
        endif()

        if(CI)
            target_compile_definitions(
                ${MODULE_NAME}_test_objects
                PRIVATE
                -DCI=1
            )
        endif()

        if((COVERAGE AND NOT ENABLE_HEAVY_TESTS) OR (DISABLE_HEAVY_TESTS))
            # Heavy tests take hours when we are using profiling instrumentation
            target_compile_definitions(
                ${MODULE_NAME}_test_objects
                PRIVATE
            )
        endif()

        target_link_libraries(
            ${MODULE_NAME}_tests
            PRIVATE
            ${MODULE_LINK_NAME}
            ${MODULE_DEPENDENCIES}
            GTest::gtest
            GTest::gtest_main
            GTest::gmock_main
            ${TRACY_LIBS}
            ${TBB_IMPORTED_TARGETS}
        )

        # enable msgpack downloading via dependency (solves race condition)
        add_dependencies(${MODULE_NAME}_test_objects msgpack-c)
        add_dependencies(${MODULE_NAME}_tests msgpack-c)

        # enable lmdb downloading via dependency (solves race condition)
        if(NOT CMAKE_SYSTEM_PROCESSOR MATCHES "wasm32")
            add_dependencies(${MODULE_NAME}_test_objects lmdb_repo)
            add_dependencies(${MODULE_NAME}_tests lmdb_repo)
        endif()
        if(NOT WASM)
            # Currently haven't found a way to easily wrap the calls in wasmtime when run from ctest.
            gtest_discover_tests(${MODULE_NAME}_tests WORKING_DIRECTORY ${CMAKE_BINARY_DIR} TEST_FILTER -*_SKIP_CI*)
        endif()
    endif()

    # Fuzzer files - only build if FUZZERS_SOURCE_FILES was provided
    if(FUZZING AND FUZZERS_SOURCE_FILES)
        foreach(FUZZER_SOURCE_FILE ${FUZZERS_SOURCE_FILES})
            get_filename_component(FUZZER_NAME_STEM ${FUZZER_SOURCE_FILE} NAME_WE)
            add_executable(
                ${MODULE_NAME}_${FUZZER_NAME_STEM}_fuzzer
                ${FUZZER_SOURCE_FILE}
            )
            list(APPEND exe_targets ${MODULE_NAME}_${FUZZER_NAME_STEM}_fuzzer)

            target_link_options(
                ${MODULE_NAME}_${FUZZER_NAME_STEM}_fuzzer
                PRIVATE
                "-fsanitize=fuzzer"
            )

            target_compile_options(
                ${MODULE_NAME}_${FUZZER_NAME_STEM}_fuzzer
                PRIVATE
                "-fsanitize=fuzzer"
            )

            target_link_libraries(
                ${MODULE_NAME}_${FUZZER_NAME_STEM}_fuzzer
                PRIVATE
                ${MODULE_LINK_NAME}
                ${MODULE_DEPENDENCIES}
            )

            if(ENABLE_STACKTRACES)
                target_link_libraries(
                    ${MODULE_NAME}_${FUZZER_NAME_STEM}_fuzzer
                    PUBLIC
                    Backward::Interface
                )
                target_link_options(
                    ${MODULE_NAME}_${FUZZER_NAME_STEM}_fuzzer
                    PRIVATE
                    -ldw -lelf
                )
            endif()
        endforeach()
    endif()

    # Benchmark files - only build if BENCH_SOURCE_FILES was provided
    if(BENCH_SOURCE_FILES AND NOT FUZZING)
        foreach(BENCHMARK_SOURCE ${BENCH_SOURCE_FILES})
            get_filename_component(BENCHMARK_NAME ${BENCHMARK_SOURCE} NAME_WE) # extract name without extension
            add_library(
                ${BENCHMARK_NAME}_bench_objects
                OBJECT
                ${BENCHMARK_SOURCE}
            )
            list(APPEND lib_targets ${BENCHMARK_NAME}_bench_objects)

            target_link_libraries(
                ${BENCHMARK_NAME}_bench_objects
                PRIVATE
                benchmark::benchmark
                ${TRACY_LIBS}
                ${TBB_IMPORTED_TARGETS}
            )

            add_executable(
                ${BENCHMARK_NAME}_bench
                $<TARGET_OBJECTS:${BENCHMARK_NAME}_bench_objects>
            )
            list(APPEND exe_targets ${MODULE_NAME}_bench)

            target_link_libraries(
                ${BENCHMARK_NAME}_bench
                PRIVATE
                ${MODULE_LINK_NAME}
                ${MODULE_DEPENDENCIES}
                benchmark::benchmark
                ${TRACY_LIBS}
                ${TBB_IMPORTED_TARGETS}
            )
            if(ENABLE_STACKTRACES)
                target_link_libraries(
                    ${BENCHMARK_NAME}_bench_objects
                    PUBLIC
                    Backward::Interface
                )
                target_link_options(
                    ${BENCHMARK_NAME}_bench
                    PRIVATE
                    -ldw -lelf
                )
            endif()

            # enable msgpack downloading via dependency (solves race condition)
            add_dependencies(${BENCHMARK_NAME}_bench_objects msgpack-c)
            add_dependencies(${BENCHMARK_NAME}_bench msgpack-c)

            # enable lmdb downloading via dependency (solves race condition)
            if(NOT CMAKE_SYSTEM_PROCESSOR MATCHES "wasm32")
                add_dependencies(${BENCHMARK_NAME}_bench_objects lmdb_repo)
                add_dependencies(${BENCHMARK_NAME}_bench lmdb_repo)
            endif()
            add_custom_target(
                run_${BENCHMARK_NAME}_bench
                COMMAND ${BENCHMARK_NAME}_bench
                WORKING_DIRECTORY ${CMAKE_BINARY_DIR}
            )
        endforeach()
    endif()

    set(${MODULE_NAME}_lib_targets ${lib_targets} PARENT_SCOPE)
    set(${MODULE_NAME}_exe_targets ${exe_targets} PARENT_SCOPE)
endfunction()

function(barretenberg_module MODULE_NAME)
    # Auto-discover all source files
    file(GLOB_RECURSE SOURCE_FILES *.cpp)
    file(GLOB_RECURSE HEADER_FILES *.hpp *.tcc)
    file(GLOB_RECURSE TEST_SOURCE_FILES *.test.cpp)
    file(GLOB_RECURSE BENCH_SOURCE_FILES *.bench.cpp)
    file(GLOB_RECURSE FUZZERS_SOURCE_FILES *.fuzzer.cpp)
    list(FILTER SOURCE_FILES EXCLUDE REGEX ".*\\.(fuzzer|test|bench)\\.cpp$")

    barretenberg_module_with_sources(
        ${MODULE_NAME}
        SOURCE_FILES ${SOURCE_FILES}
        HEADER_FILES ${HEADER_FILES}
        TEST_SOURCE_FILES ${TEST_SOURCE_FILES}
        BENCH_SOURCE_FILES ${BENCH_SOURCE_FILES}
        FUZZERS_SOURCE_FILES ${FUZZERS_SOURCE_FILES}
        DEPENDENCIES ${ARGN}
    )

    # Propagate targets to parent scope
    set(${MODULE_NAME}_lib_targets ${${MODULE_NAME}_lib_targets} PARENT_SCOPE)
    set(${MODULE_NAME}_exe_targets ${${MODULE_NAME}_exe_targets} PARENT_SCOPE)
endfunction()
