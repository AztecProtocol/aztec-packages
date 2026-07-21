#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/stdlib/primitives/bigfield/constants.hpp"
#include <gtest/gtest.h>

using namespace bb;

namespace {
auto& engine = numeric::get_debug_randomness();
}
namespace bb {

TEST(MegaCircuitBuilder, CopyConstructor)
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

    // Add gates corresponding to the above operations
    builder.queue_ecc_add_accum(P1);
    builder.queue_ecc_mul_accum(P2, z);
    builder.queue_ecc_eq();

    bool result = CircuitChecker::check(builder);
    EXPECT_EQ(result, true);

    MegaCircuitBuilder duplicate_builder{ builder };

    EXPECT_EQ(duplicate_builder, builder);
    EXPECT_TRUE(CircuitChecker::check(duplicate_builder));
}

TEST(MegaCircuitBuilder, BaseCase)
{
    MegaCircuitBuilder builder = MegaCircuitBuilder();
    fr a = fr::one();
    builder.add_public_variable(a);
    bool result = CircuitChecker::check(builder);
    EXPECT_EQ(result, true);
}

/**
 * @brief Test the queueing of simple ecc ops via the Goblin builder
 * @details There are two things to check here: 1) When ecc ops are queued by the builder, the corresponding native
 * operations are performed correctly by the internal ecc op queue, and 2) The ecc op gate operands are correctly
 * encoded in the op_wires, i.e. the operands can be reconstructed as expected.
 *
 */
TEST(MegaCircuitBuilder, GoblinSimple)
{
    const size_t CHUNK_SIZE = stdlib::NUM_LIMB_BITS_IN_FIELD_SIMULATION * 2;

    auto builder = MegaCircuitBuilder();

    // Compute a simple point accumulation natively
    auto P1 = g1::affine_element::random_element();
    auto P2 = g1::affine_element::random_element();
    auto z = fr::random_element();
    auto P_expected = P1 + P2 * z;

    // Add gates corresponding to the above operations
    builder.queue_ecc_add_accum(P1);
    builder.queue_ecc_mul_accum(P2, z);

    // Add equality op gates based on the internal accumulator
    auto eq_op_tuple = builder.queue_ecc_eq();

    // Check that we can reconstruct the coordinates of P_expected from the data in variables
    auto P_result_x_lo = uint256_t(builder.get_variable(eq_op_tuple.x_lo));
    auto P_result_x_hi = uint256_t(builder.get_variable(eq_op_tuple.x_hi));
    auto P_result_x = P_result_x_lo + (P_result_x_hi << CHUNK_SIZE);
    auto P_result_y_lo = uint256_t(builder.get_variable(eq_op_tuple.y_lo));
    auto P_result_y_hi = uint256_t(builder.get_variable(eq_op_tuple.y_hi));
    auto P_result_y = P_result_y_lo + (P_result_y_hi << CHUNK_SIZE);
    EXPECT_EQ(P_result_x, uint256_t(P_expected.x));
    EXPECT_EQ(P_result_y, uint256_t(P_expected.y));

    // Check that the accumulator in the op queue has been reset to 0
    auto accumulator = builder.op_queue->get_accumulator();
    EXPECT_EQ(accumulator, g1::affine_point_at_infinity);

    // Check number of ecc op "gates"/rows = 3 ops * 2 rows per op = 6
    EXPECT_EQ(builder.blocks.ecc_op.size(), 6);

    // Check that the expected op codes have been correctly recorded in the 1st op wires pointed by circuit indices
    auto opcode_wire_indexes = builder.blocks.ecc_op.w_l();
    EXPECT_EQ(builder.get_variable(opcode_wire_indexes[0]), (EccOpCode{ .add = true }).value());
    EXPECT_EQ(builder.get_variable(opcode_wire_indexes[2]), (EccOpCode{ .mul = true }).value());
    EXPECT_EQ(builder.get_variable(opcode_wire_indexes[4]), (EccOpCode{ .eq = true, .reset = true }).value());

    // Check that we can reconstruct the coordinates of P1 from the op_wires
    auto P1_x_lo = uint256_t(builder.get_variable(builder.blocks.ecc_op.w_r()[0]));
    auto P1_x_hi = uint256_t(builder.get_variable(builder.blocks.ecc_op.w_o()[0]));
    auto P1_x = P1_x_lo + (P1_x_hi << CHUNK_SIZE);
    EXPECT_EQ(P1_x, uint256_t(P1.x));
    auto P1_y_lo = uint256_t(builder.get_variable(builder.blocks.ecc_op.w_4()[0]));
    auto P1_y_hi = uint256_t(builder.get_variable(builder.blocks.ecc_op.w_r()[1]));
    auto P1_y = P1_y_lo + (P1_y_hi << CHUNK_SIZE);
    EXPECT_EQ(P1_y, uint256_t(P1.y));

    // Check that we can reconstruct the coordinates of P2 from the op_wires
    auto P2_x_lo = uint256_t(builder.get_variable(builder.blocks.ecc_op.w_r()[2]));
    auto P2_x_hi = uint256_t(builder.get_variable(builder.blocks.ecc_op.w_o()[2]));
    auto P2_x = P2_x_lo + (P2_x_hi << CHUNK_SIZE);
    EXPECT_EQ(P2_x, uint256_t(P2.x));
    auto P2_y_lo = uint256_t(builder.get_variable(builder.blocks.ecc_op.w_4()[2]));
    auto P2_y_hi = uint256_t(builder.get_variable(builder.blocks.ecc_op.w_r()[3]));
    auto P2_y = P2_y_lo + (P2_y_hi << CHUNK_SIZE);
    EXPECT_EQ(P2_y, uint256_t(P2.y));
}

/**
 * @brief Check that the ultra ops are recorded correctly in the EccOpQueue
 *
 */
TEST(MegaCircuitBuilder, GoblinEccOpQueueUltraOps)
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

    // Merge the ops of the incoming circuit
    builder.op_queue->merge();

    // Check that the ultra ops recorded in the EccOpQueue match the ops recorded in the wires
    auto ultra_ops = builder.op_queue->construct_current_ultra_ops_subtable_columns();
    for (size_t i = 1; i < 4; ++i) {
        for (size_t j = 0; j < builder.blocks.ecc_op.size(); ++j) {
            auto op_wire_val = builder.get_variable(builder.blocks.ecc_op.wires[i][j]);
            auto ultra_op_val = ultra_ops[i][j];
            ASSERT_EQ(op_wire_val, ultra_op_val);
        }
    }
}

/**
 * @brief Verify that the ecc_op block is first in the trace and starts at offset 1 (after the zero row)
 */
TEST(MegaCircuitBuilder, EccOpBlockIsFirstInTrace)
{
    auto builder = MegaCircuitBuilder();

    // Add ECC ops
    auto P1 = g1::affine_element::random_element();
    builder.queue_ecc_add_accum(P1);
    builder.queue_ecc_eq();

    // Add some arithmetic gates (goes to a different block)
    auto a = builder.add_variable(fr::random_element());
    auto b = builder.add_variable(fr::random_element());
    auto c = builder.add_variable(builder.get_variable(a) + builder.get_variable(b));
    builder.create_add_gate({ a, b, c, 1, 1, -1, 0 });

    builder.finalize_circuit();
    builder.blocks.compute_offsets(MegaFlavor::TRACE_OFFSET);

    // Verify ecc_op block starts at offset TRACE_OFFSET + NUM_ZERO_ROWS = NUM_ZERO_ROWS for non-ZK Mega.
    EXPECT_EQ(builder.blocks.ecc_op.trace_offset(), MegaFlavor::TRACE_OFFSET + NUM_ZERO_ROWS);

    // Verify no other non-empty block starts before ecc_op ends
    size_t ecc_op_end = builder.blocks.ecc_op.trace_end();
    for (auto& block : builder.blocks.get()) {
        if (&block != &builder.blocks.ecc_op && block.size() > 0) {
            EXPECT_GE(block.trace_offset(), ecc_op_end) << "Block starts before ecc_op ends";
        }
    }

    EXPECT_TRUE(CircuitChecker::check(builder));
}

/**
 * @brief Verify that an empty circuit can be finalized and passes circuit checks
 */
TEST(MegaCircuitBuilder, EmptyCircuitFinalization)
{
    auto builder = MegaCircuitBuilder();

    // Completely empty circuit - no gates added
    EXPECT_EQ(builder.blocks.ecc_op.size(), 0);
    EXPECT_FALSE(builder.circuit_finalized);

    builder.finalize_circuit();

    EXPECT_TRUE(builder.circuit_finalized);

    // After finalization: only zero_idx arithmetic gates and the corresponding public inputs remain.
    // No dummy ecc ops, databus entries, or other gate types are added.
    EXPECT_EQ(builder.blocks.arithmetic.size(), 4); // zero_idx setup
    EXPECT_EQ(builder.blocks.pub_inputs.size(), 0);
    EXPECT_EQ(builder.blocks.ecc_op.size(), 0);
    EXPECT_EQ(builder.blocks.busread.size(), 0);
    EXPECT_EQ(builder.blocks.lookup.size(), 0);
    EXPECT_EQ(builder.blocks.delta_range.size(), 0);
    EXPECT_EQ(builder.blocks.elliptic.size(), 0);
    EXPECT_EQ(builder.blocks.memory.size(), 0);
    EXPECT_EQ(builder.blocks.nnf.size(), 0);
    EXPECT_EQ(builder.blocks.poseidon2.size(), 0);
    EXPECT_EQ(builder.get_calldata(BusId::KERNEL_CALLDATA).size(), 0);
    EXPECT_EQ(builder.get_calldata(BusId::APP_CALLDATA).size(), 0);
    EXPECT_EQ(builder.get_return_data().size(), 0);

    EXPECT_TRUE(CircuitChecker::check(builder));
}

/**
 * @brief Verify that databus read with out-of-bounds index is caught
 */
TEST(MegaCircuitBuilder, DatabusOutOfBoundsReadFails)
{
    auto builder = MegaCircuitBuilder();

    // Add single entry to calldata
    auto val = builder.add_variable(fr(42));
    builder.add_public_calldata(BusId::KERNEL_CALLDATA, val);

    // Try to read at index 1 (out of bounds - only index 0 exists)
    auto bad_idx = builder.add_variable(fr(1));

    // This should trigger an assertion in read_calldata
    EXPECT_THROW(builder.read_calldata(BusId::KERNEL_CALLDATA, bad_idx), std::runtime_error);
}

} // namespace bb
