if(WASM)
    # Disable SLP vectorization on WASM as it's brokenly slow. To give an idea, with this off it still takes
    # 2m:18s to compile scalar_multiplication.cpp, and with it on I estimate it's 50-100 times longer. I never
    # had the patience to wait it out...
    add_compile_options(-fno-exceptions -fno-slp-vectorize)
endif()

# Auto-detect TARGET_ARCH for native builds only.
# Cross-compile presets handle arch via zig -target/-mcpu flags; set TARGET_ARCH
# explicitly in the preset if -march is also needed (e.g. arm64-linux uses "generic").
if(NOT WASM AND NOT TARGET_ARCH AND NOT CMAKE_CROSSCOMPILING)
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
