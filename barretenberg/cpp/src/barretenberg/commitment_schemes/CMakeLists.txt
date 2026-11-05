barretenberg_module(commitment_schemes common transcript polynomials ecc numeric srs)
if(GPU_MSM)
    target_compile_definitions(commitment_schemes_objects PRIVATE BB_GPU_MSM)
endif()
