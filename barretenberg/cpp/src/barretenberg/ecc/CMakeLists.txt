barretenberg_module(ecc numeric crypto_keccak crypto_sha256)
set_target_properties(ecc_objects PROPERTIES POSITION_INDEPENDENT_CODE ON)

if(GPU_MSM)
    # msm_cuda.cu is compiled by a dedicated nvcc command, not as a CUDA-language source, so the project's
    # host-compiler flags (-march, -fbracket-depth, ...) are never passed to nvcc.
    find_package(CUDAToolkit REQUIRED)
    set(GPU_MSM_DIR ${CMAKE_CURRENT_SOURCE_DIR}/scalar_multiplication/gpu)
    set(GPU_MSM_OBJECT ${CMAKE_CURRENT_BINARY_DIR}/msm_cuda.o)
    add_custom_command(
        OUTPUT ${GPU_MSM_OBJECT}
        COMMAND ${CUDAToolkit_NVCC_EXECUTABLE} -std=c++20 -O3 -arch=${GPU_MSM_CUDA_ARCH} -Xcompiler -fPIC
                -I ${CMAKE_SOURCE_DIR}/src -c ${GPU_MSM_DIR}/msm_cuda.cu -o ${GPU_MSM_OBJECT}
        DEPENDS ${GPU_MSM_DIR}/msm_cuda.cu ${GPU_MSM_DIR}/msm_kernels_impl.hpp ${GPU_MSM_DIR}/msm_core.hpp
        COMMENT "Compiling msm_cuda.cu with nvcc"
        VERBATIM
    )
    add_custom_target(gpu_msm_cuda_object DEPENDS ${GPU_MSM_OBJECT})
    set_source_files_properties(${GPU_MSM_OBJECT} PROPERTIES EXTERNAL_OBJECT TRUE GENERATED TRUE)
    add_dependencies(ecc gpu_msm_cuda_object)
    target_sources(ecc PRIVATE ${GPU_MSM_OBJECT})
    target_link_libraries(ecc PUBLIC CUDA::cudart)
endif()

if(DISABLE_ADX)
    message(STATUS "Disabling ADX assembly variant.")
    target_compile_definitions(ecc PRIVATE -DDISABLE_ADX)
endif()

target_precompile_headers(
    ecc
    PUBLIC
    "$<$<COMPILE_LANGUAGE:CXX>:<random$<ANGLE-R>>"
    $<$<COMPILE_LANGUAGE:CXX>:"barretenberg/numeric/uint256/uint256.hpp">
    $<$<COMPILE_LANGUAGE:CXX>:"barretenberg/numeric/uint256/uint256_impl.hpp">
    $<$<COMPILE_LANGUAGE:CXX>:"${CMAKE_CURRENT_SOURCE_DIR}/fields/asm_macros.hpp">
    $<$<COMPILE_LANGUAGE:CXX>:"${CMAKE_CURRENT_SOURCE_DIR}/fields/field_declarations.hpp">
    $<$<COMPILE_LANGUAGE:CXX>:"${CMAKE_CURRENT_SOURCE_DIR}/fields/field_impl.hpp">
    $<$<COMPILE_LANGUAGE:CXX>:"${CMAKE_CURRENT_SOURCE_DIR}/fields/field_impl_generic.hpp">
    $<$<COMPILE_LANGUAGE:CXX>:"${CMAKE_CURRENT_SOURCE_DIR}/fields/field_impl_x64.hpp">
    $<$<COMPILE_LANGUAGE:CXX>:"${CMAKE_CURRENT_SOURCE_DIR}/fields/field.hpp">
)
