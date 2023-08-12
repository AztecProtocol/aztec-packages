add_executable(
    decrypt_bench
    main.main.cpp
)

target_link_libraries(
    decrypt_bench
    PRIVATE
    ecc
    common
)
