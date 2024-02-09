#include <gtest/gtest.h>

#include "barretenberg/proof_system/circuit_builder/goblin_ultra_circuit_builder.hpp"
#include "barretenberg/proof_system/circuit_builder/ultra_circuit_builder.hpp"
#include "barretenberg/ultra_honk/ultra_composer.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "execution_trace.hpp"

using namespace bb;

namespace bb {
auto& engine = numeric::get_debug_randomness();

class ExecutionTraceTests : public ::testing::Test {
  protected:
    // static void SetUpTestSuite() { bb::srs::init_crs_factory("../srs_db/ignition"); }

    using Curve = curve::BN254;
    using FF = Curve::ScalarField;
    using Point = Curve::AffineElement;
    using CommitmentKey = bb::CommitmentKey<Curve>;
    using Trace = ExecutionTrace_<GoblinUltraFlavor>;

    /**
     * @brief Generate a simple test circuit with some ECC op gates and conventional arithmetic gates
     *
     * @param builder
     */
    void generate_test_circuit(auto& builder)
    {
        // Add some ecc op gates
        for (size_t i = 0; i < 3; ++i) {
            auto point = Point::one() * FF::random_element();
            auto scalar = FF::random_element();
            builder.queue_ecc_mul_accum(point, scalar);
        }
        builder.queue_ecc_eq();

        // Add some conventional gates that utilize public inputs
        for (size_t i = 0; i < 10; ++i) {
            FF a = FF::random_element();
            FF b = FF::random_element();
            FF c = FF::random_element();
            FF d = a + b + c;
            uint32_t a_idx = builder.add_public_variable(a);
            uint32_t b_idx = builder.add_variable(b);
            uint32_t c_idx = builder.add_variable(c);
            uint32_t d_idx = builder.add_variable(d);

            builder.create_big_add_gate({ a_idx, b_idx, c_idx, d_idx, FF(1), FF(1), FF(1), FF(-1), FF(0) });
        }
    }
};

/**
 * @brief
 *
 */
TEST_F(ExecutionTraceTests, Basic)
{
    auto op_queue = std::make_shared<bb::ECCOpQueue>();

    // Add mock data to op queue to simulate interaction with a previous circuit
    op_queue->populate_with_mock_initital_data();

    auto builder = GoblinUltraCircuitBuilder{ op_queue };

    generate_test_circuit(builder);

    auto composer = GoblinUltraComposer();

    Trace execution_trace;
    auto blocks = execution_trace.create_execution_trace_blocks(builder);
    (void)blocks;
}

} // namespace bb