if (NOT FUZZING)
    add_executable(pippenger_low_memory_bench main.cpp)

    target_link_libraries(
      pippenger_low_memory_bench
      polynomials
      srs
    )

    add_custom_target(
        run_pippenger_low_memory_bench
        COMMAND pippenger_low_memory_bench
        WORKING_DIRECTORY ${CMAKE_BINARY_DIR}
    )
endif()
