if(WASM)
    # Disable SLP vectorization on WASM as it's brokenly slow. To give an idea, with this off it still takes
    # 2m:18s to compile scalar_multiplication.cpp, and with it on I estimate it's 50-100 times longer. I never
    # had the patience to wait it out...
    add_compile_options(-fno-exceptions -fno-slp-vectorize)
endif()

# Auto-detect TARGET_ARCH for native (non-cross) builds only.
# Cross-compilation presets already specify the target via -target/-mcpu flags;
# auto-detecting based on the HOST architecture would set the wrong -march
# (e.g. -march=skylake when cross-compiling to aarch64).
# For native x86_64 builds, default to 'skylake'.
# For native ARM builds, skip -march entirely — the zig wrapper scripts handle
# the target architecture, and -march=generic can conflict with -mcpu flags.
if(NOT WASM AND NOT TARGET_ARCH AND NOT CMAKE_CROSSCOMPILING)
    if(NOT ARM)
        set(TARGET_ARCH "skylake")
    endif()
endif()

if(NOT WASM AND TARGET_ARCH)
    message(STATUS "Target architecture: ${TARGET_ARCH}")
    add_compile_options(-march=${TARGET_ARCH})
endif()
