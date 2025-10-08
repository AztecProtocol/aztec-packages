if (NOT FUZZING)
    add_executable(
        decrypt_bench
        main.cpp
    )

    target_link_libraries(
        decrypt_bench
        PRIVATE
        ecc
        common
    )
  if(CHECK_CIRCUIT_STACKTRACES OR ENABLE_STACKTRACES)
    target_link_libraries(
        decrypt_bench
        PUBLIC
        Backward::Interface
    )
    target_link_options(
        decrypt_bench
        PRIVATE
        -ldw -lelf
    )
  endif()
endif()
