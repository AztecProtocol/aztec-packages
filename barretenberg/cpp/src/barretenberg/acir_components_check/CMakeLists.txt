# acir_components_check: ACIR vs Ultra circuit connected-component consistency tool + unit tests.
# vm2_stub is linked on consumers (not only the static lib) so dsl's AVM2 recursion stubs resolve
# at final link, matching dsl_tests.

add_library(
    acir_components_check_lib
    STATIC
    acir_graph.cpp
    components_check.cpp
)
target_link_libraries(
    acir_components_check_lib
    PUBLIC
    dsl
    boomerang_value_detection
    common
    vm2_stub
    libdeflate::libdeflate_static
)
add_dependencies(acir_components_check_lib msgpack-c)
if(NOT CMAKE_SYSTEM_PROCESSOR MATCHES "wasm32" AND NOT BB_LITE)
    add_dependencies(acir_components_check_lib lmdb_repo)
endif()

# The CLI binary has its own `main()` — not a libFuzzer entry point. Under FUZZING the static libs
# it links against are instrumented with `-fsanitize=fuzzer-no-link`, so a non-fuzzer executable
# fails to resolve `__sanitizer_cov_*` at link time. The library above is still built so any fuzz
# target can pull in components-check logic.
if(NOT FUZZING)
    add_executable(acir_components_check main.cpp)
    target_link_libraries(
        acir_components_check
        PRIVATE
        acir_components_check_lib
        vm2_stub
    )
endif()

if(NOT WASM AND NOT FUZZING)
    add_executable(acir_components_check_tests components_check.test.cpp)
    target_link_libraries(
        acir_components_check_tests
        PRIVATE
        acir_components_check_lib
        vm2_stub
        GTest::gtest
        GTest::gtest_main
        ${TRACY_LIBS}
    )
    if(CI)
        target_compile_definitions(
            acir_components_check_tests
            PRIVATE
            CI=1
        )
    endif()
    if(ENABLE_STACKTRACES)
        target_link_libraries(
            acir_components_check_tests
            PRIVATE
            Backward::Interface
        )
        target_link_options(
            acir_components_check_tests
            PRIVATE
            -ldw
            -lelf
        )
    endif()
    gtest_discover_tests(
        acir_components_check_tests
        WORKING_DIRECTORY
        ${CMAKE_BINARY_DIR}
        TEST_FILTER
        -*_SKIP_CI*
        DISCOVERY_TIMEOUT
        30
    )
endif()
