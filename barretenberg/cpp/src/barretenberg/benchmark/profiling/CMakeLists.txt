if (NOT(FUZZING))
    add_executable(
        profiling_main
        main.cpp
    )

    target_link_libraries(
        profiling_main
        PRIVATE
        stdlib_sha256
        stdlib_keccak
        stdlib_merkle_tree
    )
endif()
