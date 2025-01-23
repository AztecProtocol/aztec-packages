barretenberg_module(
    benchmark_memory_manager
    common
)

add_library(
    benchmark_memory_manager_objects
    custom_allocator.cpp

)

target_link_libraries(
    benchmark_memory_manager_objects
    PRIVATE
    benchmark::benchmark
)
