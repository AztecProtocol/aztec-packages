if(WASM)
    # Disable SLP vectorization on WASM as it's brokenly slow. To give an idea, with this off it still takes
    # 2m:18s to compile scalar_multiplication.cpp, and with it on I estimate it's 50-100 times longer. I never
    # had the patience to wait it out...
    add_compile_options(-fno-exceptions -fno-slp-vectorize)
endif()

# Target skylake on x86 for AVX2 etc. ARM is handled by the zig wrapper scripts
# which use explicit aarch64 targets to produce generic ARM64 code without
# CPU-specific extensions (e.g. SVE on Graviton) that would break on Apple Silicon.
if(CMAKE_SYSTEM_PROCESSOR MATCHES "x86_64")
    add_compile_options(-march=skylake)
endif()
