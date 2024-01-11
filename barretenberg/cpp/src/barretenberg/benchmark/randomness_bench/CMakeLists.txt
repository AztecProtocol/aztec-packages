add_executable(
    random_bench
    main.cpp
)

target_link_libraries(
    random_bench
    PRIVATE
    ecc
    common
)