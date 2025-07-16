#include "barretenberg/vm2/simulation/lib/written_slots_tree.hpp"

#include <benchmark/benchmark.h>
#include <chrono>
#include <stack>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/poseidon2.hpp"

using namespace benchmark;
using namespace bb::avm2;
using RawPoseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

namespace bb::avm2::simulation {

static void BM_WrittenSlotsTreeStack(benchmark::State& state)
{
    const size_t stack_size = static_cast<size_t>(state.range(0));

    auto base_tree = build_public_data_slots_tree();
    std::vector<WrittenPublicDataSlotLeafValue> leaves;
    for (size_t i = 0; i < MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX; ++i) {
        leaves.push_back(WrittenPublicDataSlotLeafValue(FF::random_element()));
    }
    base_tree.insert_indexed_leaves(leaves);

    for (auto _ : state) {
        std::stack<WrittenPublicDataSlotsTree> tree_stack;
        tree_stack.push(base_tree);

        for (size_t i = 0; i < stack_size; ++i) {
            tree_stack.push(tree_stack.top());
        }

        for (size_t i = 0; i < stack_size; ++i) {
            WrittenPublicDataSlotsTree current_tree = std::move(tree_stack.top());
            tree_stack.pop();
            tree_stack.top() = std::move(current_tree);
        }

        benchmark::DoNotOptimize(tree_stack);
        benchmark::ClobberMemory();

        if (tree_stack.size() != 1) {
            state.SkipWithError("Stack size is not 1 after unwind");
        }
    }
}

BENCHMARK(BM_WrittenSlotsTreeStack)->Arg(1000)->Arg(3000)->Arg(6000)->Arg(9000)->Unit(benchmark::kMicrosecond);

} // namespace bb::avm2::simulation

BENCHMARK_MAIN();
