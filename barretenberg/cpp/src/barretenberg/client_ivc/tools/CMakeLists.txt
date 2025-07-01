add_executable(extract_tail_kernel_hash extract_tail_kernel_hash.cpp)

target_link_libraries(
    extract_tail_kernel_hash
    client_ivc  # This should pull in everything it needs
                # perhaps I should do less?
    ${CMAKE_THREAD_LIBS_INIT}
)
