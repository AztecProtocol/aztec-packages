#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/stdlib/primitives/bigfield/constants.hpp"
#include "barretenberg/stdlib/primitives/databus/databus.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"

using namespace bb;
using namespace cdg;

using Builder = MegaCircuitBuilder;
using field_ct = stdlib::field_t<Builder>;
using witness_ct = stdlib::witness_t<Builder>;
using databus_ct = stdlib::databus<Builder>;

namespace {
auto& engine = numeric::get_debug_randomness();
}
namespace bb {

TEST(BoomerangMegaCircuitBuilder, BasicCircuit)
{
    MegaCircuitBuilder builder = MegaCircuitBuilder();
    fr a = fr::one();
    builder.add_public_variable(a);

    for (size_t i = 0; i < 16; ++i) {
        for (size_t j = 0; j < 16; ++j) {
            uint64_t left = static_cast<uint64_t>(j);
            uint64_t right = static_cast<uint64_t>(i);
            uint32_t left_idx = builder.add_variable(fr(left));
            uint32_t right_idx = builder.add_variable(fr(right));
            uint32_t result_idx = builder.add_variable(fr(left ^ right));

            uint32_t add_idx = builder.add_variable(fr(left) + fr(right) + builder.get_variable(result_idx));
            builder.create_big_add_gate(
                { left_idx, right_idx, result_idx, add_idx, fr(1), fr(1), fr(1), fr(-1), fr(0) });
        }
    }

    // Compute a simple point accumulation natively
    auto P1 = g1::affine_element::random_element();
    auto P2 = g1::affine_element::random_element();
    auto z = fr::random_element();

    builder.queue_ecc_add_accum(P1);
    builder.queue_ecc_mul_accum(P2, z);
    builder.queue_ecc_eq();

    auto tool = MegaStaticAnalyzer(builder);
    auto connected_components = tool.find_connected_components();
    EXPECT_EQ(connected_components.size(), 257);
    for (size_t i = 0; i < connected_components.size(); i++) {
        if (connected_components[i].size() != 4) {
            EXPECT_EQ(connected_components[i].size(), 18);
        }
    }
    auto variables_in_one_gate = tool.get_variables_in_one_gate();
}

/**
 * @brief Check that the ultra ops are recorded correctly in the EccOpQueue
 *
 */
TEST(BoomerangMegaCircuitBuilder, OnlyGoblinEccOpQueueUltraOps)
{
    // Construct a simple circuit with op gates
    auto builder = MegaCircuitBuilder();

    // Compute a simple point accumulation natively
    auto P1 = g1::affine_element::random_element();
    auto P2 = g1::affine_element::random_element();
    auto z = fr::random_element();

    // Add gates corresponding to the above operations
    builder.queue_ecc_add_accum(P1);
    builder.queue_ecc_mul_accum(P2, z);
    builder.queue_ecc_eq();

    auto tool = MegaStaticAnalyzer(builder);
    auto cc = tool.find_connected_components();
    EXPECT_EQ(cc.size(), 1);
}
} // namespace bb
