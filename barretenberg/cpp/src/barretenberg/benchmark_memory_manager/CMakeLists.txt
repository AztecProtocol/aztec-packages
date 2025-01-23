barretenberg_module(
    benchmark_memory_manager
    common
    benchmark::benchmark
)

target_link_libraries(
    benchmark_memory_manager_objects
    PRIVATE
    benchmark::benchmark
)