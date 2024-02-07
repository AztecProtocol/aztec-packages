#include "barretenberg/stdlib/merkle_tree/append_only_tree/append_only_tree.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/merkle_tree/array_store.hpp"
#include "barretenberg/stdlib/merkle_tree/hash.hpp"
#include <benchmark/benchmark.h>

using namespace benchmark;
using namespace bb::stdlib::merkle_tree;

using TreeType = AppendOnlyTree<ArrayStore, Poseidon2HashPolicy>;

namespace {
auto& random_engine = bb::numeric::get_randomness();
} // namespace

void perform_batch_insert(TreeType& tree, const std::vector<fr>& values)
{
    tree.add_values(values);
}

void append_only_tree_bench(State& state) noexcept
{
    const size_t batch_size = 16;
    const size_t depth = 32;

    ArrayStore store(depth + 1, 100 * 1024);
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
BENCHMARK(append_only_tree_bench)->Unit(benchmark::kMillisecond)->Iterations(6000);

BENCHMARK_MAIN();