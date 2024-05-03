if (NOT(FUZZING))
    # We would include this at a top-level, but CMake is inflexible once you set flags at a top-level.
    # To be able to build WASM binaries that both include shared and non-shared memory, we need this flexibility.
    include(${CMAKE_SOURCE_DIR}/cmake/threading.cmake)

    add_executable(
        bb
        main.cpp
        get_bn254_crs.cpp
        get_grumpkin_crs.cpp
    )

    target_link_libraries(
        bb
        PRIVATE
        barretenberg
        env
    )
endif()