if(WASM)
    # Disable SLP vectorization on WASM as it's brokenly slow. To give an idea, with this off it still takes
    # 2m:18s to compile scalar_multiplication.cpp, and with it on I estimate it's 50-100 times longer. I never
    # had the patience to wait it out...
    add_compile_options(-fno-exceptions -fno-slp-vectorize)
endif()

# Auto-detect TARGET_ARCH on x86_64 if not explicitly set (native builds only).
# On ARM, we skip -march entirely — the zig wrappers use an explicit aarch64 target
# to produce generic ARM64 code without CPU-specific extensions (e.g. SVE).
# Skip auto-detection when cross-compiling — the toolchain (e.g. Zig -mcpu) handles
# architecture targeting, and injecting -march here conflicts with it.
if(NOT WASM AND NOT TARGET_ARCH AND NOT ARM AND NOT CMAKE_CROSSCOMPILING)
    set(TARGET_ARCH "skylake")
endif()

if(NOT WASM AND TARGET_ARCH)
    message(STATUS "Target architecture: ${TARGET_ARCH}")
    add_compile_options(-march=${TARGET_ARCH})
endif()
