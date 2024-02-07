#include "barretenberg/stdlib/merkle_tree/indexed_tree/indexed_tree.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/merkle_tree/array_store.hpp"
#include "barretenberg/stdlib/merkle_tree/hash.hpp"
#include "barretenberg/stdlib/merkle_tree/indexed_tree/leaves_cache.hpp"
#include <benchmark/benchmark.h>

using namespace benchmark;
using namespace bb::stdlib::merkle_tree;

using TreeType = IndexedTree<ArrayStore, LeavesCache, Poseidon2HashPolicy>;

namespace {
auto& random_engine = bb::numeric::get_randomness();
} // namespace

void perform_batch_insert(TreeType& tree, const std::vector<fr>& values)
{
    tree.add_values(values);
}

void indexed_tree_bench(State& state) noexcept
{
    const size_t batch_size = size_t(state.range(0));
    const size_t depth = 40;

    ArrayStore store(depth, 1024 * 1024);
    TreeType tree = TreeType(store, depth, batch_size);

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
BENCHMARK(indexed_tree_bench)->Unit(benchmark::kMillisecond)->RangeMultiplier(2)->Range(2, 64)->Iterations(6000);

BENCHMARK_MAIN();