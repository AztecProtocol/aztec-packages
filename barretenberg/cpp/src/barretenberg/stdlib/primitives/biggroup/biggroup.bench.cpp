#include "barretenberg/stdlib/primitives/biggroup/biggroup.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include <benchmark/benchmark.h>

using namespace benchmark;
using namespace bb;

void mul_bench(State& state) noexcept
{
    using Builder = UltraCircuitBuilder;
    using Group = stdlib::bn254<Builder>::Group;
    using FF = stdlib::field_t<Builder>;

    for (auto _ : state) {
        Builder builder = UltraCircuitBuilder();
        Group element = Group::one(&builder);
        for (int64_t i = 0; i < state.range(0); ++i) {
            element = element * FF::from_witness_index(&builder, builder.add_variable(bb::fr::random_element()));
        }
        builder.finalize_circuit();
        info("Finalized gate count for doing ", state.range(0), " biggroup muls is: ", builder.num_gates);
    }
}

void add_bench(State& state) noexcept
{
    using Builder = UltraCircuitBuilder;
    using Group = stdlib::bn254<Builder>::Group;

    for (auto _ : state) {
        Builder builder = UltraCircuitBuilder();
        Group element = Group::one(&builder);
        for (int64_t i = 0; i < state.range(0); ++i) {
            element += element * bb::fr::random_element();
        }
        builder.finalize_circuit();
        info("Finalized gate count for doing ", state.range(0), " biggroup adds is: ", builder.num_gates);
    }
}

void mul_add_bench(State& state) noexcept
{
    using Builder = UltraCircuitBuilder;
    using Group = stdlib::bn254<Builder>::Group;
    using FF = stdlib::field_t<Builder>;

    for (auto _ : state) {
        Builder builder = UltraCircuitBuilder();
        Group element = Group::one(&builder);
        for (int64_t i = 0; i < state.range(0); ++i) {
            element += element * FF::from_witness_index(&builder, builder.add_variable(bb::fr::random_element()));
        }
        builder.finalize_circuit();
        info("Finalized gate count for doing ", state.range(0), " biggroup mul-adds is: ", builder.num_gates);
    }
}

void batch_mul_bench(State& state) noexcept
{
    using Builder = UltraCircuitBuilder;
    using Group = stdlib::bn254<Builder>::Group;
    using FF = stdlib::field_t<Builder>;

    for (auto _ : state) {
        Builder builder = UltraCircuitBuilder();
        std::vector<Group> points;
        std::vector<FF> scalars;
        // create batch mul of length state.range(0)+1
        points.push_back(Group::one(&builder));
        scalars.push_back(FF::from_witness_index(&builder, builder.add_variable(1)));
        for (int64_t i = 0; i < state.range(0); ++i) {
            points.push_back(Group::one(&builder));
            scalars.push_back(FF::from_witness_index(&builder, builder.add_variable(bb::fr::random_element())));
        }
        Group::batch_mul(points, scalars, 128, true);
        builder.finalize_circuit();
        info(
            "Finalized gate count for doing length ", state.range(0) + 1, " biggroup batchmul is: ", builder.num_gates);
    }
}

void wnaf_batch_mul_bench(State& state) noexcept
{
    using Builder = UltraCircuitBuilder;
    using Group = stdlib::bn254<Builder>::Group;
    using FF = stdlib::field_t<Builder>;

    for (auto _ : state) {
        Builder builder = UltraCircuitBuilder();
        std::vector<Group> points;
        std::vector<FF> scalars;
        // create batch mul of length state.range(0)+1
        points.push_back(Group::one(&builder));
        scalars.push_back(FF::from_witness_index(&builder, builder.add_variable(1)));
        for (int64_t i = 0; i < state.range(0); ++i) {
            points.push_back(Group::one(&builder));
            scalars.push_back(FF::from_witness_index(&builder, builder.add_variable(bb::fr::random_element())));
        }
        Group::wnaf_batch_mul(points, scalars);
        builder.finalize_circuit();
        info("Finalized gate count for doing length ",
             state.range(0) + 1,
             " biggroup wnaf batchmul is: ",
             builder.num_gates);
    }
}

void bn254_endo_batch_mul_bench(State& state) noexcept
{
    using Builder = UltraCircuitBuilder;
    using Group = stdlib::bn254<Builder>::Group;
    using FF = stdlib::field_t<Builder>;

    for (auto _ : state) {
        Builder builder = UltraCircuitBuilder();
        std::vector<Group> points;
        std::vector<FF> scalars;
        // create batch mul of length state.range(0)+1
        points.push_back(Group::one(&builder));
        scalars.push_back(FF::from_witness_index(&builder, builder.add_variable(1)));
        for (int64_t i = 0; i < state.range(0); ++i) {
            points.push_back(Group::one(&builder));
            scalars.push_back(FF::from_witness_index(&builder, builder.add_variable(bb::fr::random_element())));
        }
        Group::bn254_endo_batch_mul({}, {}, points, scalars, 128);
        builder.finalize_circuit();
        info("Finalized gate count for doing length ",
             state.range(0) + 1,
             " biggroup bn254_endo_batch_mul is: ",
             builder.num_gates);
    }
}

BENCHMARK(mul_bench)->Iterations(1)->Arg(1)->Arg(2)->Arg(3)->Arg(10)->Arg(50);
BENCHMARK(add_bench)->Iterations(1)->Arg(1)->Arg(2)->Arg(3)->Arg(10)->Arg(50);
BENCHMARK(mul_add_bench)->Iterations(1)->Arg(1)->Arg(2)->Arg(3)->Arg(10)->Arg(50);
BENCHMARK(batch_mul_bench)->Iterations(1)->Arg(1)->Arg(2)->Arg(3)->Arg(10)->Arg(50);
BENCHMARK(wnaf_batch_mul_bench)->Iterations(1)->Arg(1)->Arg(2)->Arg(3)->Arg(10)->Arg(50);
BENCHMARK(bn254_endo_batch_mul_bench)->Iterations(1)->Arg(1)->Arg(2)->Arg(3)->Arg(10)->Arg(50);

BENCHMARK_MAIN();