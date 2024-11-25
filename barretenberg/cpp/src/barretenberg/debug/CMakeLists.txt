add_executable(xor_debug xor.cpp)
add_executable(xor_debug1 xor1.cpp)
add_executable(xor_debug2 xor3.cpp)

target_link_libraries(xor_debug stdlib_primitives)
target_link_libraries(xor_debug1 stdlib_primitives)
target_link_libraries(xor_debug2 stdlib_primitives)


add_executable(fuzz fuzz.cpp)
target_link_libraries(fuzz stdlib_primitives)