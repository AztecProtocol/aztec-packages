#include "barretenberg/boomerang_value_detection/graph.hpp"

#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/hash/keccak/keccak.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

#include <array>
#include <unordered_set>

using namespace bb;
using namespace bb::stdlib;
using namespace cdg;

using Builder = UltraCircuitBuilder;
using field_ct = field_t<Builder>;
using witness_ct = witness_t<Builder>;

/**
 * @brief Fix witness for an array of field elements
 *
 * Static analyzer prints variables that only appear in one gate. By fixing witnesses,
 * we ensure variables appear in at least 2 gates, filtering out false positives.
 */
template <size_t N> void fix_field_array(std::array<field_ct, N>& arr)
{
    for (auto& elem : arr) {
        elem.fix_witness();
    }
}

namespace {
auto& engine = numeric::get_debug_randomness();

using KeccakStateInput = std::array<uint64_t, keccak<Builder>::NUM_KECCAK_LANES>;

uint64_t random_u64()
{
    return (static_cast<uint64_t>(engine.get_random_uint32()) << 32) | engine.get_random_uint32();
}

KeccakStateInput make_random_keccak_state_input()
{
    KeccakStateInput input;
    for (auto& lane : input) {
        lane = random_u64();
    }
    return input;
}

void build_keccak_permutation_circuit(Builder& builder, const KeccakStateInput& input)
{
    std::array<field_ct, keccak<Builder>::NUM_KECCAK_LANES> state;
    for (size_t i = 0; i < state.size(); ++i) {
        state[i] = witness_ct(&builder, input[i]);
    }
    fix_field_array(state);

    auto out_state = keccak<Builder>::permutation_opcode(state, &builder);
    fix_field_array(out_state);
}

std::unordered_set<fr> get_keccak_rerun_varying_duplicate_values(const KeccakStateInput& baseline_input)
{
    Builder baseline_builder;
    build_keccak_permutation_circuit(baseline_builder, baseline_input);
    StaticAnalyzer baseline_graph(baseline_builder);
    baseline_graph.fill_witness_duplicate_map();

    Builder rerun_builder_0;
    build_keccak_permutation_circuit(rerun_builder_0, make_random_keccak_state_input());
    Builder rerun_builder_1;
    build_keccak_permutation_circuit(rerun_builder_1, make_random_keccak_state_input());
    Builder rerun_builder_2;
    build_keccak_permutation_circuit(rerun_builder_2, make_random_keccak_state_input());

    return baseline_graph.get_rerun_varying_duplicate_values({ &rerun_builder_0, &rerun_builder_1, &rerun_builder_2 });
}
} // namespace

TEST(boomerang_stdlib_keccak, test_graph_for_keccakf1600)
{
    Builder builder;

    // 25-lane input state as witnesses
    std::array<field_ct, keccak<Builder>::NUM_KECCAK_LANES> state;
    for (size_t i = 0; i < state.size(); ++i) {
        state[i] = witness_ct(&builder, static_cast<uint64_t>(i + 1));
    }
    fix_field_array(state);

    auto out_state = keccak<Builder>::permutation_opcode(state, &builder);
    fix_field_array(out_state);

    // Analyze graph structure
    StaticAnalyzer graph(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);

    auto variables_in_one_gate = graph.get_variables_in_one_gate();
    EXPECT_EQ(variables_in_one_gate.size(), 0);
}

TEST(boomerang_stdlib_keccak, duplicate_witnesses_are_rerun_varying)
{
    KeccakStateInput input;
    for (size_t i = 0; i < input.size(); ++i) {
        input[i] = static_cast<uint64_t>(i + 1);
    }
    const auto rerun_varying_filter_values = get_keccak_rerun_varying_duplicate_values(input);
    EXPECT_FALSE(rerun_varying_filter_values.empty());

    Builder builder;
    build_keccak_permutation_circuit(builder, input);

    StaticAnalyzer graph(builder);
    graph.fill_witness_duplicate_map({}, WitnessDuplicateFilterMode::EXPLANATION_ONLY, rerun_varying_filter_values);
    EXPECT_TRUE(graph.get_witness_duplicate_map().empty());
}
