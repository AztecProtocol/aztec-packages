#include "barretenberg/stdlib/merkle_tree/merkle_tree.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/merkle_tree/hash.hpp"
#include "barretenberg/stdlib/merkle_tree/hasher.hpp"
#include "barretenberg/stdlib/merkle_tree/indexed_tree/fixed_memory_store.hpp"
#include "barretenberg/stdlib/merkle_tree/indexed_tree/indexed_tree.hpp"
#include "barretenberg/stdlib/merkle_tree/indexed_tree/leaves_cache.hpp"
#include "barretenberg/stdlib/merkle_tree/memory_store.hpp"
#include <benchmark/benchmark.h>

using namespace benchmark;
using namespace bb::stdlib::merkle_tree;

namespace {
auto& engine = bb::numeric::get_debug_randomness();
auto& random_engine = bb::numeric::get_randomness();
} // namespace

constexpr size_t DEPTH = 256;
constexpr size_t MAX = 2048;

static std::vector<fr> VALUES = []() {
    std::vector<fr> values(MAX);
    for (size_t i = 0; i < MAX; ++i) {
        values[i] = fr(i);
    }
    return values;
}();

void hash(State& state) noexcept
{
    for (auto _ : state) {
        hash_pair_native({ 0, 0, 0, 0 }, { 1, 1, 1, 1 });
    }
}
// BENCHMARK(hash)->MinTime(5);

void update_first_element(State& state) noexcept
{
    MemoryStore store;
    MerkleTree<MemoryStore> db(store, DEPTH);

    for (auto _ : state) {
        db.update_element(0, VALUES[1]);
    }
}
// BENCHMARK(update_first_element)->Unit(benchmark::kMillisecond);

void update_elements(State& state) noexcept
{
    for (auto _ : state) {
        state.PauseTiming();
        MemoryStore store;
        MerkleTree<MemoryStore> db(store, DEPTH);
        state.ResumeTiming();
        for (size_t i = 0; i < (size_t)state.range(0); ++i) {
            db.update_element(i, VALUES[i]);
        }
    }
}
// BENCHMARK(update_elements)->Unit(benchmark::kMillisecond)->RangeMultiplier(2)->Range(256, MAX);

void update_random_elements(State& state) noexcept
{
    for (auto _ : state) {
        state.PauseTiming();
        MemoryStore store;
        MerkleTree db(store, DEPTH);
        for (size_t i = 0; i < (size_t)state.range(0); i++) {
            state.PauseTiming();
            auto index = MerkleTree<MemoryStore>::index_t(engine.get_random_uint256());
            state.ResumeTiming();
            db.update_element(index, VALUES[i]);
        }
    }
}
// BENCHMARK(update_random_elements)->Unit(benchmark::kMillisecond)->Range(100, 100)->Iterations(1);

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
