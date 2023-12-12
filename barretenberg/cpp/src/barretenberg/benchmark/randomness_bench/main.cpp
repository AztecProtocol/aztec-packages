#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include <chrono>

int main(int, char**)
{
    using FF = barretenberg::fr;
    constexpr size_t num_elements = 1 << 15;
    FF random_element;
    numeric::random::Engine& engine = numeric::random::get_engine();
    numeric::random::Engine& devurandom_engine = numeric::random::get_devurandom_engine();

    // Let's warm up the engine just in case
    for (size_t i = 0; i < 128; i++) {
        random_element = FF::random_element(&engine);
    }

    std::chrono::steady_clock::time_point start = std::chrono::steady_clock::now();
    for (size_t i = 0; i < num_elements; i++) {
        random_element = FF::random_element(&engine);
    }
    std::chrono::steady_clock::time_point end = std::chrono::steady_clock::now();
    std::chrono::milliseconds diff = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);
    std::cout << "regular field random sampling operations: " << diff.count() << "ms" << std::endl;
    numeric::uint512_t wide_uint;

    start = std::chrono::steady_clock::now();
    for (size_t i = 0; i < num_elements; i++) {
        wide_uint = engine.get_random_uint512();
    }
    end = std::chrono::steady_clock::now();
    diff = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);
    std::cout << "regular uint random sampling operations: " << diff.count() << "ms" << std::endl;

    start = std::chrono::steady_clock::now();
    for (size_t i = 0; i < num_elements; i++) {

        random_element = FF::optimized_random_element(&engine);
    }
    end = std::chrono::steady_clock::now();
    diff = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);
    std::cout << "optimized field  random sampling operations: " << diff.count() << "ms" << std::endl;

    start = std::chrono::steady_clock::now();
    for (size_t i = 0; i < num_elements; i++) {
        random_element = FF::random_element(&devurandom_engine);
    }
    end = std::chrono::steady_clock::now();
    diff = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);
    std::cout << "buffered field random sampling operations: " << diff.count() << "ms" << std::endl;

    start = std::chrono::steady_clock::now();
    for (size_t i = 0; i < num_elements; i++) {
        wide_uint = devurandom_engine.get_random_uint512();
    }
    end = std::chrono::steady_clock::now();
    diff = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);
    std::cout << "buffered uint random sampling operations: " << diff.count() << "ms" << std::endl;

    start = std::chrono::steady_clock::now();
    for (size_t i = 0; i < num_elements; i++) {

        random_element = FF::optimized_random_element(&devurandom_engine);
    }
    end = std::chrono::steady_clock::now();
    diff = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);
    std::cout << "buffered optimized field  random sampling operations: " << diff.count() << "ms" << std::endl;
}
