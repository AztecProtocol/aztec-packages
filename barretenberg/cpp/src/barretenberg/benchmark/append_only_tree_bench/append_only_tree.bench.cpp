#include "barretenberg/stdlib/merkle_tree/append_only_tree/append_only_tree.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/merkle_tree/array_store.hpp"
#include "barretenberg/stdlib/merkle_tree/hash.hpp"
#include <benchmark/benchmark.h>

using namespace benchmark;
using namespace bb::stdlib::merkle_tree;

using Pedersen = AppendOnlyTree<ArrayStore, PedersenHashPolicy>;
using Poseidon2 = AppendOnlyTree<ArrayStore, Poseidon2HashPolicy>;

namespace {
auto& random_engine = bb::numeric::get_randomness();
} // namespace

template <typename TreeType> void perform_batch_insert(TreeType& tree, const std::vector<fr>& values)
{
    tree.add_values(values);
}

template <typename TreeType> void append_only_tree_bench(State& state) noexcept
{
    const size_t batch_size = size_t(state.range(0));
    const size_t depth = 32;

    ArrayStore store(depth, 1024 * 1024);
    TreeType tree = TreeType(store, depth);

    for (auto _ : state) {
        state.PauseTiming();
        std::vector<fr> values(batch_size);
        for (size_t i = 0; i < batch_size; ++i) {
            values[i] = fr(random_engine.get_random_uint256());
        }
        state.ResumeTiming();
        perform_batch_insert(tree, values);
    }
}
BENCHMARK(append_only_tree_bench<Pedersen>)
    ->Unit(benchmark::kMillisecond)
    ->RangeMultiplier(2)
    ->Range(2, 64)
    ->Iterations(100);
BENCHMARK(append_only_tree_bench<Poseidon2>)
    ->Unit(benchmark::kMillisecond)
    ->RangeMultiplier(2)
    ->Range(2, 64)
    ->Iterations(1000);

BENCHMARK_MAIN();