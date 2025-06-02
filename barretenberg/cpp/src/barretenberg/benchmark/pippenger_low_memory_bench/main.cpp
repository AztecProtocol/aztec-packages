#include "barretenberg/common/assert.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/scalar_multiplication/scalar_multiplication.hpp"
#include "barretenberg/ecc/scalar_multiplication/scalar_multiplication_new.hpp"
#include "barretenberg/polynomials/polynomial_arithmetic.hpp"

#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

#include <chrono>
#include <cstdlib>

// #include <valgrind/callgrind.h>
//  CALLGRIND_START_INSTRUMENTATION;
//  CALLGRIND_STOP_INSTRUMENTATION;
//  CALLGRIND_DUMP_STATS;

using namespace bb;

// constexpr size_t NUM_GATES = 1 << 10;

// size_t get_num_rounds(size_t bucket_size)
// {
//     return (127 + bucket_size) / (bucket_size + 1);
// }

// size_t get_num_bucket_adds(const size_t num_rounds, const size_t bucket_size)
// {
//     size_t num_buckets = 1UL << bucket_size;
//     return (2 * num_buckets + 2) * num_rounds;
// }

// size_t get_next_bucket_size(const size_t bucket_size)
// {
//     size_t old_rounds = get_num_rounds(bucket_size);
//     size_t acc = bucket_size;
//     size_t new_rounds = old_rounds;
//     while (old_rounds <= new_rounds)
//     {
//         ++acc;
//         new_rounds = get_num_rounds(acc);
//     }
//     return acc;
// }
constexpr size_t NUM_POINTS = 1 << 20;
constexpr size_t NUM_MSMS = 4;
std::vector<std::vector<fr>> scalars;

const auto init = []() {
    fr element = fr::random_element();
    fr accumulator = element;
    scalars.resize(NUM_MSMS);

    for (size_t j = 0; j < NUM_MSMS; ++j) {
        scalars[j].reserve(NUM_POINTS);
        for (size_t i = 0; i < NUM_POINTS; ++i) {
            accumulator *= element;
            scalars[j].emplace_back(accumulator);
        }
    }
    std::cout << "init?" << std::endl;
    return 1;
};
// constexpr double add_to_mixed_add_complexity = 1.36;

int pippenger()
{
    // scalar_multiplication::pippenger_runtime_state<curve::BN254> state(NUM_POINTS);
    std::vector<std::span<fr>> batch_scalars;
    std::vector<std::span<const g1::affine_element>> batch_points;
    std::span<const g1::affine_element> points =
        srs::get_bn254_crs_factory()->get_crs(NUM_POINTS)->get_monomial_points();
    for (size_t i = 0; i < NUM_MSMS; ++i) {
        batch_scalars.push_back(scalars[i]);
        batch_points.push_back(points);
    }
    std::chrono::steady_clock::time_point time_start = std::chrono::steady_clock::now();

    std::vector<g1::affine_element> result =
        scalar_multiplication::MSM<curve::BN254, false, 1>::batch_multi_scalar_mul(batch_points, batch_scalars);
    std::chrono::steady_clock::time_point time_end = std::chrono::steady_clock::now();
    std::chrono::microseconds diff = std::chrono::duration_cast<std::chrono::microseconds>(time_end - time_start);
    std::cout << "run time: " << diff.count() << "us" << std::endl;
    for (auto& r : result) {
        std::cout << r.x << std::endl;
    }
    return 0;
}

int main()
{
    bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());
    std::cout << "initializing" << std::endl;
    init();
    std::cout << "executing pippenger algorithm" << std::endl;
    pippenger();
    pippenger();
    pippenger();
    pippenger();
    pippenger();
    return 0;
}
