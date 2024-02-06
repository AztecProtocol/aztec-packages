#include "barretenberg/stdlib/merkle_tree/indexed_tree/indexed_tree.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/merkle_tree/hash.hpp"
#include "barretenberg/stdlib/merkle_tree/hasher.hpp"
#include "barretenberg/stdlib/merkle_tree/indexed_tree/fixed_memory_store.hpp"
#include "barretenberg/stdlib/merkle_tree/indexed_tree/leaves_cache.hpp"
#include <benchmark/benchmark.h>

using namespace benchmark;
using namespace bb::stdlib::merkle_tree;

namespace {
auto& random_engine = bb::numeric::get_randomness();
} // namespace

void perform_batch_insert(IndexedTree<FixedMemoryStore, LeavesCache>& tree, const std::vector<fr>& values)
{
    tree.update_elements(values);
}

void indexed_tree_bench(State& state) noexcept
{
    const size_t batch_size = 16;

    Poseidon2Hasher hasher;
    FixedMemoryStore store(41, 1024 * 1024);
    IndexedTree<FixedMemoryStore, LeavesCache> tree =
        IndexedTree<FixedMemoryStore, LeavesCache>(hasher, store, 40, batch_size);

    for (auto _ : state) {
        state.PauseTiming();
        std::vector<fr> values(batch_size);
        for (size_t i = 0; i < batch_size; ++i) {
            values[i] = fr(random_engine.get_random_uint256());
        }
        state.ResumeTiming();
        perform_batch_insert(tree, values);
    }
    info("Performed ", hasher.get_hash_count(), " hashes");
}
BENCHMARK(indexed_tree_bench)->Unit(benchmark::kMillisecond)->Iterations(6000);

BENCHMARK_MAIN();