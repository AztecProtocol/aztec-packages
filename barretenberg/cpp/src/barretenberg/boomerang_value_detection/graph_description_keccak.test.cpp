#include "barretenberg/boomerang_value_detection/graph.hpp"

#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
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
