#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/primitives/group/cycle_group.hpp"

#include <algorithm>
#include <array>
#include <gtest/gtest.h>
#include <vector>

namespace bb::stdlib {
namespace {

using Builder = UltraCircuitBuilder;
using cycle_group_ct = cycle_group<Builder>;
using cycle_scalar_ct = cycle_group_ct::cycle_scalar;
using AffineElement = cycle_group_ct::AffineElement;
using ScalarField = cycle_scalar_ct::ScalarField;

std::vector<Builder::FF> fixed_batch_mul_witness(const std::vector<AffineElement>& points,
                                                 const std::vector<ScalarField>& scalars)
{
    Builder builder;
    std::vector<cycle_group_ct> constant_points;
    std::vector<cycle_scalar_ct> witness_scalars;
    for (size_t i = 0; i < points.size(); ++i) {
        constant_points.emplace_back(points[i]);
        witness_scalars.push_back(cycle_scalar_ct::from_witness(&builder, scalars[i]));
    }
    cycle_group_ct::fixed_batch_mul(constant_points, witness_scalars, /*table_bits=*/8);
    EXPECT_TRUE(CircuitChecker::check(builder));
    return builder.get_variables();
}

} // namespace

// The native hints are normalized in chunks whose boundaries follow the thread count, which must not change any
// witness value.
TEST(CycleGroupFixedBatchMulHints, WitnessDoesNotDependOnThreadCount)
{
    constexpr size_t num_points = 256;
    const auto points = bb::grumpkin::g1::derive_generators("cycle_group_fixed_batch_mul_hints_test", num_points);
    auto& engine = numeric::get_debug_randomness();
    std::vector<ScalarField> scalars(num_points);
    for (auto& scalar : scalars) {
        scalar = ScalarField::random_element(&engine);
    }

    const auto reference = fixed_batch_mul_witness(points, scalars);
#ifdef NO_MULTITHREADING
    // The thread count cannot be changed in a build without threads: check that the witness is reproducible.
    constexpr std::array<size_t, 1> concurrencies{ 1 };
#else
    const size_t original_concurrency = get_num_cpus();
    constexpr std::array<size_t, 2> concurrencies{ 1, 5 };
#endif
    for (const size_t concurrency : concurrencies) {
#ifndef NO_MULTITHREADING
        set_parallel_for_concurrency(concurrency);
#endif
        const auto witness = fixed_batch_mul_witness(points, scalars);

        EXPECT_EQ(witness.size(), reference.size());
        size_t num_mismatches = 0;
        for (size_t i = 0; i < std::min(witness.size(), reference.size()); ++i) {
            num_mismatches += static_cast<size_t>(witness[i] != reference[i]);
        }
        EXPECT_EQ(num_mismatches, 0U) << "concurrency " << concurrency;
    }
#ifndef NO_MULTITHREADING
    set_parallel_for_concurrency(original_concurrency);
#endif
}

} // namespace bb::stdlib
