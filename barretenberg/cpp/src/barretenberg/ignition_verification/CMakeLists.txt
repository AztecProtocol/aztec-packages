if(NOT FUZZING)
    # Library sources (shared between executable and tests)
    set(LIB_SOURCES
        blake2b.cpp
        transcript_loader.cpp
        structure_check.cpp
        hash_check.cpp
        chain_check.cpp
        chain_commitment.cpp
        checksum_check.cpp
        report.cpp
    )

    # Main executable
    add_executable(
        ignition_verifier
        main.cpp
        ${LIB_SOURCES}
    )

    target_link_libraries(
        ignition_verifier
        PRIVATE
        srs
        ecc
        crypto_sha256
    )

    if(ENABLE_STACKTRACES)
        target_link_libraries(
            ignition_verifier
            PUBLIC
            Backward::Interface
        )
        target_link_options(
            ignition_verifier
            PRIVATE
            -ldw -lelf
        )
    endif()

    # Tests
    add_executable(
        ignition_verification_tests
        blake2b.test.cpp
        transcript_loader.test.cpp
        structure_check.test.cpp
        ${LIB_SOURCES}
    )

    target_link_libraries(
        ignition_verification_tests
        PRIVATE
        srs
        ecc
        crypto_sha256
        GTest::gtest
        GTest::gtest_main
    )

    gtest_discover_tests(ignition_verification_tests WORKING_DIRECTORY ${CMAKE_BINARY_DIR} DISCOVERY_TIMEOUT 30)
endif()
