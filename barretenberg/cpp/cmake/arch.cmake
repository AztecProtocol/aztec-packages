if(WASM)
    # Disable SLP vectorization on WASM as it's brokenly slow. To give an idea, with this off it still takes
    # 2m:18s to compile scalar_multiplication.cpp, and with it on I estimate it's 50-100 times longer. I never
    # had the patience to wait it out...
    add_compile_options(-fno-exceptions -fno-slp-vectorize)
endif()

# Auto-detect TARGET_ARCH if not explicitly set.
# Use 'skylake' on x86_64 (matches our cross-compile presets) and 'generic' on ARM
# to avoid emitting CPU-specific instructions (e.g. SVE on Graviton) that break on
# other ARM machines like Apple Silicon.
if(NOT WASM AND NOT TARGET_ARCH)
    if(ARM)
        set(TARGET_ARCH "generic")
    else()
        set(TARGET_ARCH "skylake")
    endif()
endif()

if(NOT WASM AND TARGET_ARCH)
    message(STATUS "Target architecture: ${TARGET_ARCH}")
    add_compile_options(-march=${TARGET_ARCH})
endif()
