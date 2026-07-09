# CUDA MSM backend (sppark). Hand-written rather than barretenberg_module() because the
# module mixes one nvcc-compiled CUDA TU with ordinary C++, and the vendored sppark/blst
# headers cannot build under the project-wide -Werror warning set.

# Drop the inherited directory-level compile options (-Werror -Wconversion,
# -fconstexpr-steps, -march, ...): nvcc forwards unknown flags to its host compiler,
# which is generally gcc and rejects the clang-only ones. The bb-typed C++ sources get
# the standard flag set re-added per target below.
set_directory_properties(PROPERTIES COMPILE_OPTIONS "")

set(ECC_GPU_CXX_OPTIONS
    -Werror
    -Wall
    -Wextra
    -Wconversion
    -Wsign-conversion
    -fcolor-diagnostics
    -fconstexpr-steps=100000000
    -pthread
)
if(CMAKE_SYSTEM_PROCESSOR STREQUAL "x86_64")
    list(APPEND ECC_GPU_CXX_OPTIONS -march=skylake)
endif()

add_library(
    ecc_gpu
    STATIC
    msm_gpu.cu
    bb_msm_gpu.cpp
)
add_dependencies(ecc_gpu sppark_repo blst_repo)

target_link_libraries(ecc_gpu PUBLIC ecc numeric sppark_headers)
set_target_properties(ecc_gpu PROPERTIES CUDA_STANDARD 17 POSITION_INDEPENDENT_CODE ON)
target_compile_options(ecc_gpu PRIVATE $<$<COMPILE_LANGUAGE:CXX>:${ECC_GPU_CXX_OPTIONS}>)

if(NOT FUZZING)
    add_executable(ecc_gpu_tests msm_gpu.test.cpp)
    target_compile_options(ecc_gpu_tests PRIVATE $<$<COMPILE_LANGUAGE:CXX>:${ECC_GPU_CXX_OPTIONS}>)
    target_link_libraries(
        ecc_gpu_tests
        PRIVATE
        ecc_gpu
        srs
        GTest::gtest
        GTest::gtest_main
    )
    gtest_discover_tests(ecc_gpu_tests WORKING_DIRECTORY ${CMAKE_BINARY_DIR} DISCOVERY_TIMEOUT 30)

    add_executable(pippenger_gpu_bench pippenger_gpu.bench.cpp)
    target_compile_options(pippenger_gpu_bench PRIVATE $<$<COMPILE_LANGUAGE:CXX>:${ECC_GPU_CXX_OPTIONS}>)
    target_link_libraries(
        pippenger_gpu_bench
        PRIVATE
        ecc_gpu
        srs
        polynomials
        env
        benchmark::benchmark
    )
endif()
