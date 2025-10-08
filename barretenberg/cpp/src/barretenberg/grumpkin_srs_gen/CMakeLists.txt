if (NOT(FUZZING))
    add_executable(
        grumpkin_srs_gen
        grumpkin_srs_gen.cpp
    )

    target_link_libraries(
        grumpkin_srs_gen
        PRIVATE
        srs
        ecc
        crypto_sha256
    )
    if(CHECK_CIRCUIT_STACKTRACES OR ENABLE_STACKTRACES)
        target_link_libraries(
            grumpkin_srs_gen
            PUBLIC
            Backward::Interface
        )
        target_link_options(
            grumpkin_srs_gen
            PRIVATE
            -ldw -lelf
        )
    endif()
endif()
