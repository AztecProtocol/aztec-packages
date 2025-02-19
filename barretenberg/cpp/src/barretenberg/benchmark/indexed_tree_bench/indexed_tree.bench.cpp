#include "barretenberg/common/thread_pool.hpp"
#include "barretenberg/crypto/merkle_tree/fixtures.hpp"
#include "barretenberg/crypto/merkle_tree/hash.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/content_addressed_indexed_tree.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_tree_store.hpp"
#include "barretenberg/crypto/merkle_tree/node_store/cached_content_addressed_tree_store.hpp"
#include "barretenberg/crypto/merkle_tree/response.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include <benchmark/benchmark.h>
#include <filesystem>
#include <memory>
#include <vector>

using namespace benchmark;
using namespace bb::crypto::merkle_tree;

using StoreType = ContentAddressedCachedTreeStore<NullifierLeafValue>;

using Poseidon2 = ContentAddressedIndexedTree<StoreType, Poseidon2HashPolicy>;
using Pedersen = ContentAddressedIndexedTree<StoreType, PedersenHashPolicy>;

const size_t TREE_DEPTH = 40;
const size_t MAX_BATCH_SIZE = 64;

template <typename TreeType> void add_values(TreeType& tree, const std::vector<NullifierLeafValue>& values)
{
    Signal signal(1);
    bool success = true;
    std::string error_message;
    typename TreeType::AddCompletionCallback completion = [&](const auto& result) -> void {
        success = result.success;
        error_message = result.message;
        signal.signal_level(0);
    };

    tree.add_or_update_values(values, completion);
    signal.wait_for_level(0);
    if (!success) {
        throw std::runtime_error(format("Failed to add values: ", error_message));
    }
}

template <typename TreeType> void add_values_with_witness(TreeType& tree, const std::vector<NullifierLeafValue>& values)
{
    bool success = true;
    std::string error_message;
    Signal signal(1);
    typename TreeType::AddCompletionCallbackWithWitness completion = [&](const auto& result) -> void {
        success = result.success;
        error_message = result.message;
        signal.signal_level(0);
    };

    tree.add_or_update_values(values, completion);
    signal.wait_for_level(0);
    if (!success) {
        throw std::runtime_error(format("Failed to add values with witness: ", error_message));
    }
}

template <typename TreeType> void add_values_sequentially(TreeType& tree, const std::vector<NullifierLeafValue>& values)
{
    bool success = true;
    std::string error_message;
    Signal signal(1);
    typename TreeType::AddCompletionCallback completion = [&](const auto& result) -> void {
        success = result.success;
        error_message = result.message;
        signal.signal_level(0);
    };

    tree.add_or_update_values_sequentially(values, completion);
    signal.wait_for_level(0);
    if (!success) {
        throw std::runtime_error(format("Failed to add values sequentially: ", error_message));
    }
}

template <typename TreeType>
void add_values_sequentially_with_witness(TreeType& tree, const std::vector<NullifierLeafValue>& values)
{
    bool success = true;
    std::string error_message;
    Signal signal(1);
    typename TreeType::AddSequentiallyCompletionCallbackWithWitness completion = [&](const auto& result) -> void {
        success = result.success;
        error_message = result.message;
        signal.signal_level(0);
    };

    tree.add_or_update_values_sequentially(values, completion);
    signal.wait_for_level(0);
    if (!success) {
        throw std::runtime_error(format("Failed to add values sequentially with witness: ", error_message));
    }
}

enum InsertionStrategy { SEQUENTIAL, BATCH };

template <typename TreeType, InsertionStrategy strategy> void multi_thread_indexed_tree_bench(State& state) noexcept
{
    const size_t batch_size = size_t(state.range(0));
    const size_t depth = TREE_DEPTH;

    std::string directory = random_temp_directory();
    std::string name = random_string();
    std::filesystem::create_directories(directory);
    uint32_t num_threads = 16;

    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(directory, name, 1024 * 1024, num_threads);
    std::unique_ptr<StoreType> store = std::make_unique<StoreType>(name, depth, db);
    std::shared_ptr<ThreadPool> workers = std::make_shared<ThreadPool>(num_threads);
    TreeType tree = TreeType(std::move(store), workers, batch_size);

    const size_t initial_size = 1024 * 16;
    std::vector<NullifierLeafValue> initial_batch(initial_size);
    for (size_t i = 0; i < initial_size; ++i) {
        initial_batch[i] = fr(random_engine.get_random_uint256());
    }
    if (strategy == SEQUENTIAL) {
        add_values_sequentially(tree, initial_batch);
    } else {
        add_values(tree, initial_batch);
    }

    for (auto _ : state) {
        state.PauseTiming();
        std::vector<NullifierLeafValue> values(batch_size);
        for (size_t i = 0; i < batch_size; ++i) {
            values[i] = fr(random_engine.get_random_uint256());
        }
        state.ResumeTiming();
        if (strategy == SEQUENTIAL) {
            add_values_sequentially(tree, values);
        } else {
            add_values(tree, values);
        }
    }
}

template <typename TreeType, InsertionStrategy strategy> void single_thread_indexed_tree_bench(State& state) noexcept
{
    const size_t batch_size = size_t(state.range(0));
    const size_t depth = TREE_DEPTH;

    std::string directory = random_temp_directory();
    std::string name = random_string();
    std::filesystem::create_directories(directory);
    uint32_t num_threads = 1;

    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(directory, name, 1024 * 1024, num_threads);
    std::unique_ptr<StoreType> store = std::make_unique<StoreType>(name, depth, db);
    std::shared_ptr<ThreadPool> workers = std::make_shared<ThreadPool>(num_threads);
    TreeType tree = TreeType(std::move(store), workers, batch_size);

    const size_t initial_size = 1024 * 16;
    std::vector<NullifierLeafValue> initial_batch(initial_size);
    for (size_t i = 0; i < initial_size; ++i) {
        initial_batch[i] = fr(random_engine.get_random_uint256());
    }
    if (strategy == SEQUENTIAL) {
        add_values_sequentially(tree, initial_batch);
    } else {
        add_values(tree, initial_batch);
    }

    for (auto _ : state) {
        state.PauseTiming();
        std::vector<NullifierLeafValue> values(batch_size);
        for (size_t i = 0; i < batch_size; ++i) {
            values[i] = fr(random_engine.get_random_uint256());
        }
        state.ResumeTiming();
        if (strategy == SEQUENTIAL) {
            add_values_sequentially(tree, values);
        } else {
            add_values(tree, values);
        }
    }
}

template <typename TreeType, InsertionStrategy strategy>
void multi_thread_indexed_tree_with_witness_bench(State& state) noexcept
{
    const size_t batch_size = size_t(state.range(0));
    const size_t depth = TREE_DEPTH;

    std::string directory = random_temp_directory();
    std::string name = random_string();
    std::filesystem::create_directories(directory);
    uint32_t num_threads = 16;

    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(directory, name, 1024 * 1024, num_threads);
    std::unique_ptr<StoreType> store = std::make_unique<StoreType>(name, depth, db);
    std::shared_ptr<ThreadPool> workers = std::make_shared<ThreadPool>(num_threads);
    TreeType tree = TreeType(std::move(store), workers, batch_size);

    const size_t initial_size = 1024 * 16;
    std::vector<NullifierLeafValue> initial_batch(initial_size);
    for (size_t i = 0; i < initial_size; ++i) {
        initial_batch[i] = fr(random_engine.get_random_uint256());
    }
    if (strategy == SEQUENTIAL) {
        add_values_sequentially(tree, initial_batch);
    } else {
        add_values(tree, initial_batch);
    }

    for (auto _ : state) {
        state.PauseTiming();
        std::vector<NullifierLeafValue> values(batch_size);
        for (size_t i = 0; i < batch_size; ++i) {
            values[i] = fr(random_engine.get_random_uint256());
        }
        state.ResumeTiming();
        if (strategy == SEQUENTIAL) {
            add_values_sequentially_with_witness(tree, values);
        } else {
            add_values_with_witness(tree, values);
        }
    }
}

template <typename TreeType, InsertionStrategy strategy>
void single_thread_indexed_tree_with_witness_bench(State& state) noexcept
{
    const size_t batch_size = size_t(state.range(0));
    const size_t depth = TREE_DEPTH;

    std::string directory = random_temp_directory();
    std::string name = random_string();
    std::filesystem::create_directories(directory);
    uint32_t num_threads = 1;

    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(directory, name, 1024 * 1024, num_threads);
    std::unique_ptr<StoreType> store = std::make_unique<StoreType>(name, depth, db);
    std::shared_ptr<ThreadPool> workers = std::make_shared<ThreadPool>(num_threads);
    TreeType tree = TreeType(std::move(store), workers, batch_size);

    const size_t initial_size = 1024 * 16;
    std::vector<NullifierLeafValue> initial_batch(initial_size);
    for (size_t i = 0; i < initial_size; ++i) {
        initial_batch[i] = fr(random_engine.get_random_uint256());
    }
    if (strategy == SEQUENTIAL) {
        add_values_sequentially(tree, initial_batch);
    } else {
        add_values(tree, initial_batch);
    }

    for (auto _ : state) {
        state.PauseTiming();
        std::vector<NullifierLeafValue> values(batch_size);
        for (size_t i = 0; i < batch_size; ++i) {
            values[i] = fr(random_engine.get_random_uint256());
        }
        state.ResumeTiming();
        if (strategy == SEQUENTIAL) {
            add_values_sequentially_with_witness(tree, values);
        } else {
            add_values_with_witness(tree, values);
        }
    }
}

BENCHMARK(single_thread_indexed_tree_with_witness_bench<Poseidon2, BATCH>)
    ->Unit(benchmark::kMillisecond)
    ->RangeMultiplier(2)
    ->Range(2, MAX_BATCH_SIZE)
    ->Iterations(1000);

BENCHMARK(single_thread_indexed_tree_with_witness_bench<Poseidon2, BATCH>)
    ->Unit(benchmark::kMillisecond)
    ->RangeMultiplier(2)
    ->Range(512, 8192)
    ->Iterations(10);

BENCHMARK(single_thread_indexed_tree_with_witness_bench<Poseidon2, SEQUENTIAL>)
    ->Unit(benchmark::kMillisecond)
    ->RangeMultiplier(2)
    ->Range(2, MAX_BATCH_SIZE)
    ->Iterations(1000);

BENCHMARK(single_thread_indexed_tree_with_witness_bench<Poseidon2, SEQUENTIAL>)
    ->Unit(benchmark::kMillisecond)
    ->RangeMultiplier(2)
    ->Range(512, 8192)
    ->Iterations(10);

BENCHMARK(multi_thread_indexed_tree_with_witness_bench<Poseidon2, BATCH>)
    ->Unit(benchmark::kMillisecond)
    ->RangeMultiplier(2)
    ->Range(2, MAX_BATCH_SIZE)
    ->Iterations(1000);

BENCHMARK(multi_thread_indexed_tree_with_witness_bench<Poseidon2, BATCH>)
    ->Unit(benchmark::kMillisecond)
    ->RangeMultiplier(2)
    ->Range(512, 8192)
    ->Iterations(10);

BENCHMARK(multi_thread_indexed_tree_with_witness_bench<Poseidon2, SEQUENTIAL>)
    ->Unit(benchmark::kMillisecond)
    ->RangeMultiplier(2)
    ->Range(2, MAX_BATCH_SIZE)
    ->Iterations(1000);

BENCHMARK(multi_thread_indexed_tree_with_witness_bench<Poseidon2, SEQUENTIAL>)
    ->Unit(benchmark::kMillisecond)
    ->RangeMultiplier(2)
    ->Range(512, 8192)
    ->Iterations(10);

BENCHMARK(single_thread_indexed_tree_bench<Poseidon2, BATCH>)
    ->Unit(benchmark::kMillisecond)
    ->RangeMultiplier(2)
    ->Range(2, MAX_BATCH_SIZE)
    ->Iterations(1000);

BENCHMARK(single_thread_indexed_tree_bench<Poseidon2, BATCH>)
    ->Unit(benchmark::kMillisecond)
    ->RangeMultiplier(2)
    ->Range(512, 8192)
    ->Iterations(10);

BENCHMARK(single_thread_indexed_tree_bench<Poseidon2, SEQUENTIAL>)
    ->Unit(benchmark::kMillisecond)
    ->RangeMultiplier(2)
    ->Range(2, MAX_BATCH_SIZE)
    ->Iterations(1000);

BENCHMARK(single_thread_indexed_tree_bench<Poseidon2, SEQUENTIAL>)
    ->Unit(benchmark::kMillisecond)
    ->RangeMultiplier(2)
    ->Range(512, 8192)
    ->Iterations(10);

BENCHMARK(multi_thread_indexed_tree_bench<Poseidon2, BATCH>)
    ->Unit(benchmark::kMillisecond)
    ->RangeMultiplier(2)
    ->Range(2, MAX_BATCH_SIZE)
    ->Iterations(1000);

BENCHMARK(multi_thread_indexed_tree_bench<Poseidon2, BATCH>)
    ->Unit(benchmark::kMillisecond)
    ->RangeMultiplier(2)
    ->Range(512, 8192)
    ->Iterations(100);

BENCHMARK(multi_thread_indexed_tree_bench<Poseidon2, SEQUENTIAL>)
    ->Unit(benchmark::kMillisecond)
    ->RangeMultiplier(2)
    ->Range(2, MAX_BATCH_SIZE)
    ->Iterations(1000);

BENCHMARK(multi_thread_indexed_tree_bench<Poseidon2, SEQUENTIAL>)
    ->Unit(benchmark::kMillisecond)
    ->RangeMultiplier(2)
    ->Range(512, 8192)
    ->Iterations(100);

BENCHMARK_MAIN();
