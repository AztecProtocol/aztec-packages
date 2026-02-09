#include "barretenberg/common/thread.hpp"
#include "barretenberg/honk/library/grand_product_library.hpp"
#include "barretenberg/honk/relation_checker.hpp"
#include "barretenberg/translator_vm/translator_flavor.hpp"
#include "barretenberg/translator_vm/translator_proving_key.hpp"

#include <gtest/gtest.h>
#include <set>
using namespace bb;

class TranslatorRelationCorrectnessTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

/**
 * @brief Test the correctness of TranslatorFlavor's  extra relations (TranslatorOpcodeConstraintRelation
 * and TranslatorAccumulatorTransferRelation)
 *
 */
TEST_F(TranslatorRelationCorrectnessTests, TranslatorExtraRelationsCorrectness)
{
    using Flavor = TranslatorFlavor;
    using FF = typename Flavor::FF;
    using ProverPolynomials = typename Flavor::ProverPolynomials;

    auto& engine = numeric::get_debug_randomness();

    // We only use accumulated_result from relation parameters in this relation
    RelationParameters<FF> params;
    params.accumulated_result = {
        FF::random_element(), FF::random_element(), FF::random_element(), FF::random_element()
    };

    // Create storage for polynomials
    ProverPolynomials prover_polynomials;
    constexpr size_t mini_circuit_size_without_masking = TranslatorProvingKey::dyadic_mini_circuit_size_without_masking;
    constexpr size_t full_circuit_size = Flavor::MINI_CIRCUIT_SIZE * Flavor::CONCATENATION_GROUP_SIZE;

    // Reallocate lagrange polynomials to full circuit size for manual testing
    prover_polynomials.lagrange_even_in_minicircuit = typename Flavor::Polynomial(full_circuit_size);
    prover_polynomials.lagrange_odd_in_minicircuit = typename Flavor::Polynomial(full_circuit_size);
    prover_polynomials.lagrange_result_row = typename Flavor::Polynomial(full_circuit_size);
    prover_polynomials.lagrange_last_in_minicircuit = typename Flavor::Polynomial(full_circuit_size);

    // Fill in lagrange even and odd polynomials (only in first minicircuit, not the full concatenated circuit)
    for (size_t i = Flavor::RESULT_ROW; i < mini_circuit_size_without_masking; i += 2) {
        prover_polynomials.lagrange_even_in_minicircuit.at(i) = 1;
        prover_polynomials.lagrange_odd_in_minicircuit.at(i + 1) = 1;
    }
    constexpr size_t NUMBER_OF_POSSIBLE_OPCODES = 3;
    constexpr std::array<uint64_t, NUMBER_OF_POSSIBLE_OPCODES> possible_opcode_values = { 3, 4, 8 };

    // Assign random opcode values
    for (size_t i = Flavor::RESULT_ROW; i < mini_circuit_size_without_masking; i += 2) {
        prover_polynomials.op.at(i) =
            possible_opcode_values[static_cast<size_t>(engine.get_random_uint8() % NUMBER_OF_POSSIBLE_OPCODES)];
    }

    // Initialize used lagrange polynomials
    prover_polynomials.lagrange_result_row.at(Flavor::RESULT_ROW) = 1;
    prover_polynomials.lagrange_last_in_minicircuit.at(mini_circuit_size_without_masking - 1) = 1;

    // Put random values in accumulator binary limbs (values should be preserved across even->next odd shift)
    for (size_t i = Flavor::RESULT_ROW + 1; i < mini_circuit_size_without_masking - 1; i += 2) {
        prover_polynomials.accumulators_binary_limbs_0.at(i) = FF ::random_element();
        prover_polynomials.accumulators_binary_limbs_1.at(i) = FF ::random_element();
        prover_polynomials.accumulators_binary_limbs_2.at(i) = FF ::random_element();
        prover_polynomials.accumulators_binary_limbs_3.at(i) = FF ::random_element();
        prover_polynomials.accumulators_binary_limbs_0.at(i + 1) = prover_polynomials.accumulators_binary_limbs_0[i];
        prover_polynomials.accumulators_binary_limbs_2.at(i + 1) = prover_polynomials.accumulators_binary_limbs_2[i];
        prover_polynomials.accumulators_binary_limbs_1.at(i + 1) = prover_polynomials.accumulators_binary_limbs_1[i];
        prover_polynomials.accumulators_binary_limbs_3.at(i + 1) = prover_polynomials.accumulators_binary_limbs_3[i];
    }

    // The values of accumulator binary limbs at index 1 should equal the accumulated result from relation parameters
    prover_polynomials.accumulators_binary_limbs_0.at(Flavor::RESULT_ROW) = params.accumulated_result[0];
    prover_polynomials.accumulators_binary_limbs_1.at(Flavor::RESULT_ROW) = params.accumulated_result[1];
    prover_polynomials.accumulators_binary_limbs_2.at(Flavor::RESULT_ROW) = params.accumulated_result[2];
    prover_polynomials.accumulators_binary_limbs_3.at(Flavor::RESULT_ROW) = params.accumulated_result[3];

    // Check that Opcode Constraint relation is satisfied across each row of the prover polynomials
    auto translator_op_code_failures = RelationChecker<Flavor>::check<TranslatorOpcodeConstraintRelation<FF>>(
        prover_polynomials, params, "TranslatorOpcodeConstraintRelation");
    EXPECT_TRUE(translator_op_code_failures.empty());
    // Check that Accumulator Transfer relation is satisfied across each row of the prover polynomials
    auto translator_accumulator_transfer_failures =
        RelationChecker<Flavor>::check<TranslatorAccumulatorTransferRelation<FF>>(
            prover_polynomials, params, "TranslatorAccumulatorTransferRelation");
    EXPECT_TRUE(translator_accumulator_transfer_failures.empty());
    // Check that Zero Constraint relation is satisfied across each row of the prover polynomials
    auto translator_zero_constraints_failures = RelationChecker<Flavor>::check<TranslatorZeroConstraintsRelation<FF>>(
        prover_polynomials, params, "TranslatorZeroConstraintsRelation");
    EXPECT_TRUE(translator_zero_constraints_failures.empty());
}
/**
 * @brief Test the correctness of TranslatorFlavor's Decomposition Relation
 *
 */
TEST_F(TranslatorRelationCorrectnessTests, Decomposition)
{
    using Flavor = TranslatorFlavor;
    using FF = typename Flavor::FF;
    using BF = typename Flavor::BF;
    using ProverPolynomials = typename Flavor::ProverPolynomials;
    auto& engine = numeric::get_debug_randomness();

    constexpr size_t mini_circuit_size = Flavor::MINI_CIRCUIT_SIZE;

    // Decomposition relation doesn't use any relation parameters
    RelationParameters<FF> params;

    // Create storage for polynomials
    ProverPolynomials prover_polynomials;
    constexpr size_t full_circuit_size = Flavor::MINI_CIRCUIT_SIZE * Flavor::CONCATENATION_GROUP_SIZE;

    // Reallocate lagrange polynomials to full circuit size for manual testing
    prover_polynomials.lagrange_odd_in_minicircuit = typename Flavor::Polynomial(full_circuit_size);

    auto lagrange_odd_in_minicircuit = prover_polynomials.lagrange_odd_in_minicircuit;
    // Fill in lagrange odd polynomial (the only non-witness one we are using)
    for (size_t i = prover_polynomials.lagrange_odd_in_minicircuit.start_index();
         i < lagrange_odd_in_minicircuit.end_index();
         i += 2) {
        prover_polynomials.lagrange_odd_in_minicircuit.at(i) = 1;
    }

    constexpr size_t NUM_LIMB_BITS = Flavor::CircuitBuilder::NUM_LIMB_BITS;
    constexpr size_t HIGH_WIDE_LIMB_WIDTH =
        Flavor::CircuitBuilder::NUM_LIMB_BITS + Flavor::CircuitBuilder::NUM_LAST_LIMB_BITS;
    constexpr size_t LOW_WIDE_LIMB_WIDTH = Flavor::CircuitBuilder::NUM_LIMB_BITS * 2;
    constexpr size_t Z_LIMB_WIDTH = 128;
    constexpr size_t MICRO_LIMB_WIDTH = Flavor::MICRO_LIMB_BITS;
    constexpr size_t SHIFT_12_TO_14 = 4;
    constexpr size_t SHIFT_10_TO_14 = 16;
    constexpr size_t SHIFT_8_TO_14 = 64;
    constexpr size_t SHIFT_4_TO_14 = 1024;

    /**
     * @brief Decompose a standard 68-bit limb of binary into 5 14-bit limbs and the 6th limb that is the same as the
     * 5th but shifted by 2 bits
     *
     */
    auto decompose_standard_limb =
        [](auto& input, auto& limb_0, auto& limb_1, auto& limb_2, auto& limb_3, auto& limb_4, auto& shifted_limb) {
            limb_0 = uint256_t(input).slice(0, MICRO_LIMB_WIDTH);
            limb_1 = uint256_t(input).slice(MICRO_LIMB_WIDTH, MICRO_LIMB_WIDTH * 2);
            limb_2 = uint256_t(input).slice(MICRO_LIMB_WIDTH * 2, MICRO_LIMB_WIDTH * 3);
            limb_3 = uint256_t(input).slice(MICRO_LIMB_WIDTH * 3, MICRO_LIMB_WIDTH * 4);
            limb_4 = uint256_t(input).slice(MICRO_LIMB_WIDTH * 4, MICRO_LIMB_WIDTH * 5);
            shifted_limb = limb_4 * SHIFT_12_TO_14;
        };

    /**
     * @brief Decompose a standard 50-bit top limb into 4 14-bit limbs and the 5th limb that is the same as 5th, but
     * shifted by 6 bits
     *
     */
    auto decompose_standard_top_limb =
        [](auto& input, auto& limb_0, auto& limb_1, auto& limb_2, auto& limb_3, auto& shifted_limb) {
            limb_0 = uint256_t(input).slice(0, MICRO_LIMB_WIDTH);
            limb_1 = uint256_t(input).slice(MICRO_LIMB_WIDTH, MICRO_LIMB_WIDTH * 2);
            limb_2 = uint256_t(input).slice(MICRO_LIMB_WIDTH * 2, MICRO_LIMB_WIDTH * 3);
            limb_3 = uint256_t(input).slice(MICRO_LIMB_WIDTH * 3, MICRO_LIMB_WIDTH * 4);
            shifted_limb = limb_3 * SHIFT_8_TO_14;
        };

    /**
     * @brief Decompose the 60-bit top limb of z1 or z2 into 5 14-bit limbs and a 6th limb which is equal to the 5th,
     * but shifted by 10 bits.
     *
     */
    auto decompose_standard_top_z_limb =
        [](auto& input, auto& limb_0, auto& limb_1, auto& limb_2, auto& limb_3, auto& limb_4, auto& shifted_limb) {
            limb_0 = uint256_t(input).slice(0, MICRO_LIMB_WIDTH);
            limb_1 = uint256_t(input).slice(MICRO_LIMB_WIDTH, MICRO_LIMB_WIDTH * 2);
            limb_2 = uint256_t(input).slice(MICRO_LIMB_WIDTH * 2, MICRO_LIMB_WIDTH * 3);
            limb_3 = uint256_t(input).slice(MICRO_LIMB_WIDTH * 3, MICRO_LIMB_WIDTH * 4);
            limb_4 = uint256_t(input).slice(MICRO_LIMB_WIDTH * 4, MICRO_LIMB_WIDTH * 5);
            shifted_limb = limb_4 * SHIFT_4_TO_14;
        };

    /**
     * @brief Decompose the 52-bit top limb of quotient into 4 14-bit limbs and the 5th limb that is the same as 5th,
     * but shifted by 4 bits
     *
     */
    auto decompose_top_quotient_limb =
        [](auto& input, auto& limb_0, auto& limb_1, auto& limb_2, auto& limb_3, auto& shifted_limb) {
            limb_0 = uint256_t(input).slice(0, MICRO_LIMB_WIDTH);
            limb_1 = uint256_t(input).slice(MICRO_LIMB_WIDTH, MICRO_LIMB_WIDTH * 2);
            limb_2 = uint256_t(input).slice(MICRO_LIMB_WIDTH * 2, MICRO_LIMB_WIDTH * 3);
            limb_3 = uint256_t(input).slice(MICRO_LIMB_WIDTH * 3, MICRO_LIMB_WIDTH * 4);
            shifted_limb = limb_3 * SHIFT_10_TO_14;
        };

    /**
     * @brief Decompose relation wide limb into 6 14-bit limbs
     *
     */
    auto decompose_relation_limb =
        [](auto& input, auto& limb_0, auto& limb_1, auto& limb_2, auto& limb_3, auto& limb_4, auto& limb_5) {
            limb_0 = uint256_t(input).slice(0, MICRO_LIMB_WIDTH);
            limb_1 = uint256_t(input).slice(MICRO_LIMB_WIDTH, MICRO_LIMB_WIDTH * 2);
            limb_2 = uint256_t(input).slice(MICRO_LIMB_WIDTH * 2, MICRO_LIMB_WIDTH * 3);
            limb_3 = uint256_t(input).slice(MICRO_LIMB_WIDTH * 3, MICRO_LIMB_WIDTH * 4);
            limb_4 = uint256_t(input).slice(MICRO_LIMB_WIDTH * 4, MICRO_LIMB_WIDTH * 5);
            limb_5 = uint256_t(input).slice(MICRO_LIMB_WIDTH * 5, MICRO_LIMB_WIDTH * 6);
        };

    // Put random values in all the non-interleaved constraint polynomials used to range constrain the values
    for (size_t i = 1; i < mini_circuit_size - 1; i += 2) {
        // P.x
        prover_polynomials.x_lo_y_hi.at(i) =
            FF(engine.get_random_uint256() & ((uint256_t(1) << LOW_WIDE_LIMB_WIDTH) - 1));
        prover_polynomials.x_hi_z_1.at(i) =
            FF(engine.get_random_uint256() & ((uint256_t(1) << HIGH_WIDE_LIMB_WIDTH) - 1));

        // P.y
        prover_polynomials.y_lo_z_2.at(i) =
            FF(engine.get_random_uint256() & ((uint256_t(1) << LOW_WIDE_LIMB_WIDTH) - 1));
        prover_polynomials.x_lo_y_hi.at(i + 1) =
            FF(engine.get_random_uint256() & ((uint256_t(1) << HIGH_WIDE_LIMB_WIDTH) - 1));

        // z1 and z2
        prover_polynomials.x_hi_z_1.at(i + 1) = FF(engine.get_random_uint256() & ((uint256_t(1) << Z_LIMB_WIDTH) - 1));
        prover_polynomials.y_lo_z_2.at(i + 1) = FF(engine.get_random_uint256() & ((uint256_t(1) << Z_LIMB_WIDTH) - 1));

        // Slice P.x into chunks
        prover_polynomials.p_x_low_limbs.at(i) = uint256_t(prover_polynomials.x_lo_y_hi.at(i)).slice(0, NUM_LIMB_BITS);
        prover_polynomials.p_x_low_limbs.at(i + 1) =
            uint256_t(prover_polynomials.x_lo_y_hi.at(i)).slice(NUM_LIMB_BITS, 2 * NUM_LIMB_BITS);
        prover_polynomials.p_x_high_limbs.at(i) = uint256_t(prover_polynomials.x_hi_z_1[i]).slice(0, NUM_LIMB_BITS);
        prover_polynomials.p_x_high_limbs.at(i + 1) =
            uint256_t(prover_polynomials.x_hi_z_1.at(i)).slice(NUM_LIMB_BITS, 2 * NUM_LIMB_BITS);

        // Slice P.y into chunks
        prover_polynomials.p_y_low_limbs.at(i) = uint256_t(prover_polynomials.y_lo_z_2[i]).slice(0, NUM_LIMB_BITS);
        prover_polynomials.p_y_low_limbs.at(i + 1) =
            uint256_t(prover_polynomials.y_lo_z_2[i]).slice(NUM_LIMB_BITS, 2 * NUM_LIMB_BITS);
        prover_polynomials.p_y_high_limbs.at(i) =
            uint256_t(prover_polynomials.x_lo_y_hi[i + 1]).slice(0, NUM_LIMB_BITS);
        prover_polynomials.p_y_high_limbs.at(i + 1) =
            uint256_t(prover_polynomials.x_lo_y_hi[i + 1]).slice(NUM_LIMB_BITS, 2 * NUM_LIMB_BITS);

        // Slice z1 and z2 into chunks
        prover_polynomials.z_low_limbs.at(i) = uint256_t(prover_polynomials.x_hi_z_1[i + 1]).slice(0, NUM_LIMB_BITS);
        prover_polynomials.z_low_limbs.at(i + 1) =
            uint256_t(prover_polynomials.y_lo_z_2[i + 1]).slice(0, NUM_LIMB_BITS);
        prover_polynomials.z_high_limbs.at(i) =
            uint256_t(prover_polynomials.x_hi_z_1[i + 1]).slice(NUM_LIMB_BITS, 2 * NUM_LIMB_BITS);
        prover_polynomials.z_high_limbs.at(i + 1) =
            uint256_t(prover_polynomials.y_lo_z_2[i + 1]).slice(NUM_LIMB_BITS, 2 * NUM_LIMB_BITS);

        // Slice accumulator
        auto tmp = uint256_t(BF::random_element(&engine));
        prover_polynomials.accumulators_binary_limbs_0.at(i) = tmp.slice(0, NUM_LIMB_BITS);
        prover_polynomials.accumulators_binary_limbs_1.at(i) = tmp.slice(NUM_LIMB_BITS, NUM_LIMB_BITS * 2);
        prover_polynomials.accumulators_binary_limbs_2.at(i) = tmp.slice(NUM_LIMB_BITS * 2, NUM_LIMB_BITS * 3);
        prover_polynomials.accumulators_binary_limbs_3.at(i) = tmp.slice(NUM_LIMB_BITS * 3, NUM_LIMB_BITS * 4);

        // Slice low limbs of P.x into range constraint microlimbs
        decompose_standard_limb(prover_polynomials.p_x_low_limbs.at(i),
                                prover_polynomials.p_x_low_limbs_range_constraint_0.at(i),
                                prover_polynomials.p_x_low_limbs_range_constraint_1.at(i),
                                prover_polynomials.p_x_low_limbs_range_constraint_2.at(i),
                                prover_polynomials.p_x_low_limbs_range_constraint_3.at(i),
                                prover_polynomials.p_x_low_limbs_range_constraint_4.at(i),
                                prover_polynomials.p_x_low_limbs_range_constraint_tail.at(i));

        decompose_standard_limb(prover_polynomials.p_x_low_limbs.at(i + 1),
                                prover_polynomials.p_x_low_limbs_range_constraint_0.at(i + 1),
                                prover_polynomials.p_x_low_limbs_range_constraint_1.at(i + 1),
                                prover_polynomials.p_x_low_limbs_range_constraint_2.at(i + 1),
                                prover_polynomials.p_x_low_limbs_range_constraint_3.at(i + 1),
                                prover_polynomials.p_x_low_limbs_range_constraint_4.at(i + 1),
                                prover_polynomials.p_x_low_limbs_range_constraint_tail.at(i + 1));

        // Slice high limbs of P.x into range constraint microlimbs
        decompose_standard_limb(prover_polynomials.p_x_high_limbs.at(i),
                                prover_polynomials.p_x_high_limbs_range_constraint_0.at(i),
                                prover_polynomials.p_x_high_limbs_range_constraint_1.at(i),
                                prover_polynomials.p_x_high_limbs_range_constraint_2.at(i),
                                prover_polynomials.p_x_high_limbs_range_constraint_3.at(i),
                                prover_polynomials.p_x_high_limbs_range_constraint_4.at(i),
                                prover_polynomials.p_x_high_limbs_range_constraint_tail.at(i));

        decompose_standard_top_limb(prover_polynomials.p_x_high_limbs.at(i + 1),
                                    prover_polynomials.p_x_high_limbs_range_constraint_0.at(i + 1),
                                    prover_polynomials.p_x_high_limbs_range_constraint_1.at(i + 1),
                                    prover_polynomials.p_x_high_limbs_range_constraint_2.at(i + 1),
                                    prover_polynomials.p_x_high_limbs_range_constraint_3.at(i + 1),
                                    prover_polynomials.p_x_high_limbs_range_constraint_4.at(i + 1));

        // Slice low limbs of P.y into range constraint microlimbs
        decompose_standard_limb(prover_polynomials.p_y_low_limbs.at(i),
                                prover_polynomials.p_y_low_limbs_range_constraint_0.at(i),
                                prover_polynomials.p_y_low_limbs_range_constraint_1.at(i),
                                prover_polynomials.p_y_low_limbs_range_constraint_2.at(i),
                                prover_polynomials.p_y_low_limbs_range_constraint_3.at(i),
                                prover_polynomials.p_y_low_limbs_range_constraint_4.at(i),
                                prover_polynomials.p_y_low_limbs_range_constraint_tail.at(i));

        decompose_standard_limb(prover_polynomials.p_y_low_limbs.at(i + 1),
                                prover_polynomials.p_y_low_limbs_range_constraint_0.at(i + 1),
                                prover_polynomials.p_y_low_limbs_range_constraint_1.at(i + 1),
                                prover_polynomials.p_y_low_limbs_range_constraint_2.at(i + 1),
                                prover_polynomials.p_y_low_limbs_range_constraint_3.at(i + 1),
                                prover_polynomials.p_y_low_limbs_range_constraint_4.at(i + 1),
                                prover_polynomials.p_y_low_limbs_range_constraint_tail.at(i + 1));

        // Slice high limbs of P.y into range constraint microlimbs
        decompose_standard_limb(prover_polynomials.p_y_high_limbs.at(i),
                                prover_polynomials.p_y_high_limbs_range_constraint_0.at(i),
                                prover_polynomials.p_y_high_limbs_range_constraint_1.at(i),
                                prover_polynomials.p_y_high_limbs_range_constraint_2.at(i),
                                prover_polynomials.p_y_high_limbs_range_constraint_3.at(i),
                                prover_polynomials.p_y_high_limbs_range_constraint_4.at(i),
                                prover_polynomials.p_y_high_limbs_range_constraint_tail.at(i));

        decompose_standard_top_limb(prover_polynomials.p_y_high_limbs.at(i + 1),
                                    prover_polynomials.p_y_high_limbs_range_constraint_0.at(i + 1),
                                    prover_polynomials.p_y_high_limbs_range_constraint_1.at(i + 1),
                                    prover_polynomials.p_y_high_limbs_range_constraint_2.at(i + 1),
                                    prover_polynomials.p_y_high_limbs_range_constraint_3.at(i + 1),
                                    prover_polynomials.p_y_high_limbs_range_constraint_4.at(i + 1));

        // Slice low limb of of z1 and z2 into range constraints
        decompose_standard_limb(prover_polynomials.z_low_limbs.at(i),
                                prover_polynomials.z_low_limbs_range_constraint_0.at(i),
                                prover_polynomials.z_low_limbs_range_constraint_1.at(i),
                                prover_polynomials.z_low_limbs_range_constraint_2.at(i),
                                prover_polynomials.z_low_limbs_range_constraint_3.at(i),
                                prover_polynomials.z_low_limbs_range_constraint_4.at(i),
                                prover_polynomials.z_low_limbs_range_constraint_tail.at(i));

        decompose_standard_limb(prover_polynomials.z_low_limbs.at(i + 1),
                                prover_polynomials.z_low_limbs_range_constraint_0.at(i + 1),
                                prover_polynomials.z_low_limbs_range_constraint_1.at(i + 1),
                                prover_polynomials.z_low_limbs_range_constraint_2.at(i + 1),
                                prover_polynomials.z_low_limbs_range_constraint_3.at(i + 1),
                                prover_polynomials.z_low_limbs_range_constraint_4.at(i + 1),
                                prover_polynomials.z_low_limbs_range_constraint_tail.at(i + 1));

        // Slice high limb of of z1 and z2 into range constraints
        decompose_standard_top_z_limb(prover_polynomials.z_high_limbs.at(i),
                                      prover_polynomials.z_high_limbs_range_constraint_0.at(i),
                                      prover_polynomials.z_high_limbs_range_constraint_1.at(i),
                                      prover_polynomials.z_high_limbs_range_constraint_2.at(i),
                                      prover_polynomials.z_high_limbs_range_constraint_3.at(i),
                                      prover_polynomials.z_high_limbs_range_constraint_4.at(i),
                                      prover_polynomials.z_high_limbs_range_constraint_tail.at(i));

        decompose_standard_top_z_limb(prover_polynomials.z_high_limbs.at(i + 1),
                                      prover_polynomials.z_high_limbs_range_constraint_0.at(i + 1),
                                      prover_polynomials.z_high_limbs_range_constraint_1.at(i + 1),
                                      prover_polynomials.z_high_limbs_range_constraint_2.at(i + 1),
                                      prover_polynomials.z_high_limbs_range_constraint_3.at(i + 1),
                                      prover_polynomials.z_high_limbs_range_constraint_4.at(i + 1),
                                      prover_polynomials.z_high_limbs_range_constraint_tail.at(i + 1));

        // Slice accumulator limbs into range constraints
        decompose_standard_limb(prover_polynomials.accumulators_binary_limbs_0.at(i),
                                prover_polynomials.accumulator_low_limbs_range_constraint_0.at(i),
                                prover_polynomials.accumulator_low_limbs_range_constraint_1.at(i),
                                prover_polynomials.accumulator_low_limbs_range_constraint_2.at(i),
                                prover_polynomials.accumulator_low_limbs_range_constraint_3.at(i),
                                prover_polynomials.accumulator_low_limbs_range_constraint_4.at(i),
                                prover_polynomials.accumulator_low_limbs_range_constraint_tail.at(i));
        decompose_standard_limb(prover_polynomials.accumulators_binary_limbs_1.at(i),
                                prover_polynomials.accumulator_low_limbs_range_constraint_0.at(i + 1),
                                prover_polynomials.accumulator_low_limbs_range_constraint_1.at(i + 1),
                                prover_polynomials.accumulator_low_limbs_range_constraint_2.at(i + 1),
                                prover_polynomials.accumulator_low_limbs_range_constraint_3.at(i + 1),
                                prover_polynomials.accumulator_low_limbs_range_constraint_4.at(i + 1),
                                prover_polynomials.accumulator_low_limbs_range_constraint_tail.at(i + 1));

        decompose_standard_limb(prover_polynomials.accumulators_binary_limbs_2.at(i),
                                prover_polynomials.accumulator_high_limbs_range_constraint_0.at(i),
                                prover_polynomials.accumulator_high_limbs_range_constraint_1.at(i),
                                prover_polynomials.accumulator_high_limbs_range_constraint_2.at(i),
                                prover_polynomials.accumulator_high_limbs_range_constraint_3.at(i),
                                prover_polynomials.accumulator_high_limbs_range_constraint_4.at(i),
                                prover_polynomials.accumulator_high_limbs_range_constraint_tail.at(i));
        decompose_standard_top_limb(prover_polynomials.accumulators_binary_limbs_3.at(i),
                                    prover_polynomials.accumulator_high_limbs_range_constraint_0.at(i + 1),
                                    prover_polynomials.accumulator_high_limbs_range_constraint_1.at(i + 1),
                                    prover_polynomials.accumulator_high_limbs_range_constraint_2.at(i + 1),
                                    prover_polynomials.accumulator_high_limbs_range_constraint_3.at(i + 1),
                                    prover_polynomials.accumulator_high_limbs_range_constraint_4.at(i + 1));

        // Slice quotient limbs into range constraints
        decompose_standard_limb(prover_polynomials.quotient_low_binary_limbs.at(i),
                                prover_polynomials.quotient_low_limbs_range_constraint_0.at(i),
                                prover_polynomials.quotient_low_limbs_range_constraint_1.at(i),
                                prover_polynomials.quotient_low_limbs_range_constraint_2.at(i),
                                prover_polynomials.quotient_low_limbs_range_constraint_3.at(i),
                                prover_polynomials.quotient_low_limbs_range_constraint_4.at(i),
                                prover_polynomials.quotient_low_limbs_range_constraint_tail.at(i));
        decompose_standard_limb(prover_polynomials.quotient_low_binary_limbs_shift.at(i),
                                prover_polynomials.quotient_low_limbs_range_constraint_0.at(i + 1),
                                prover_polynomials.quotient_low_limbs_range_constraint_1.at(i + 1),
                                prover_polynomials.quotient_low_limbs_range_constraint_2.at(i + 1),
                                prover_polynomials.quotient_low_limbs_range_constraint_3.at(i + 1),
                                prover_polynomials.quotient_low_limbs_range_constraint_4.at(i + 1),
                                prover_polynomials.quotient_low_limbs_range_constraint_tail.at(i + 1));

        decompose_standard_limb(prover_polynomials.quotient_high_binary_limbs.at(i),
                                prover_polynomials.quotient_high_limbs_range_constraint_0.at(i),
                                prover_polynomials.quotient_high_limbs_range_constraint_1.at(i),
                                prover_polynomials.quotient_high_limbs_range_constraint_2.at(i),
                                prover_polynomials.quotient_high_limbs_range_constraint_3.at(i),
                                prover_polynomials.quotient_high_limbs_range_constraint_4.at(i),
                                prover_polynomials.quotient_high_limbs_range_constraint_tail.at(i));

        decompose_top_quotient_limb(prover_polynomials.quotient_high_binary_limbs_shift.at(i),
                                    prover_polynomials.quotient_high_limbs_range_constraint_0.at(i + 1),
                                    prover_polynomials.quotient_high_limbs_range_constraint_1.at(i + 1),
                                    prover_polynomials.quotient_high_limbs_range_constraint_2.at(i + 1),
                                    prover_polynomials.quotient_high_limbs_range_constraint_3.at(i + 1),
                                    prover_polynomials.quotient_high_limbs_range_constraint_4.at(i + 1));

        // Decompose wide relation limbs into range constraints
        decompose_relation_limb(prover_polynomials.relation_wide_limbs.at(i),
                                prover_polynomials.relation_wide_limbs_range_constraint_0.at(i),
                                prover_polynomials.relation_wide_limbs_range_constraint_1.at(i),
                                prover_polynomials.relation_wide_limbs_range_constraint_2.at(i),
                                prover_polynomials.relation_wide_limbs_range_constraint_3.at(i),
                                prover_polynomials.p_x_high_limbs_range_constraint_tail.at(i + 1),
                                prover_polynomials.accumulator_high_limbs_range_constraint_tail.at(i + 1));

        decompose_relation_limb(prover_polynomials.relation_wide_limbs.at(i + 1),
                                prover_polynomials.relation_wide_limbs_range_constraint_0.at(i + 1),
                                prover_polynomials.relation_wide_limbs_range_constraint_1.at(i + 1),
                                prover_polynomials.relation_wide_limbs_range_constraint_2.at(i + 1),
                                prover_polynomials.relation_wide_limbs_range_constraint_3.at(i + 1),
                                prover_polynomials.p_y_high_limbs_range_constraint_tail.at(i + 1),
                                prover_polynomials.quotient_high_limbs_range_constraint_tail.at(i + 1));
    }

    // Check that Decomposition relation is satisfied across each row of the prover polynomials
    RelationChecker<Flavor>::check<TranslatorDecompositionRelation<FF>>(
        prover_polynomials, params, "TranslatorDecompositionRelation");
}

/**
 * @brief Test the correctness of TranslatorFlavor's  NonNativeField Relation
 *
 */
TEST_F(TranslatorRelationCorrectnessTests, NonNative)
{
    using Flavor = TranslatorFlavor;
    using Builder = Flavor::CircuitBuilder;
    using FF = typename Flavor::FF;
    using BF = typename Flavor::BF;
    using ProverPolynomials = typename Flavor::ProverPolynomials;
    using GroupElement = typename Flavor::GroupElement;

    constexpr size_t NUM_LIMB_BITS = Flavor::NUM_LIMB_BITS;
    constexpr size_t mini_circuit_size = TranslatorFlavor::MINI_CIRCUIT_SIZE;
    constexpr size_t mini_circuit_size_without_masking =
        TranslatorFlavor::MINI_CIRCUIT_SIZE - TranslatorFlavor::NUM_MASKED_ROWS_END;

    auto& engine = numeric::get_debug_randomness();

    auto op_queue = std::make_shared<bb::ECCOpQueue>();
    op_queue->no_op_ultra_only();
    op_queue->random_op_ultra_only();
    op_queue->random_op_ultra_only();
    op_queue->random_op_ultra_only();

    // Generate random EccOpQueue actions

    for (size_t i = 0; i < (mini_circuit_size >> 1) / 2; i++) {
        switch (engine.get_random_uint8() & 3) {
        case 0:
            op_queue->no_op_ultra_only();
            break;
        case 1:
            op_queue->eq_and_reset();
            break;
        case 2:
            op_queue->add_accumulate(GroupElement::random_element(&engine));
            break;
        case 3:
            op_queue->mul_accumulate(GroupElement::random_element(&engine), FF::random_element(&engine));
            break;
        }
    }
    op_queue->merge();
    for (size_t i = 0; i < 100; i++) {
        switch (engine.get_random_uint8() & 3) {
        case 0:
            op_queue->no_op_ultra_only();
            break;
        case 1:
            op_queue->eq_and_reset();
            break;
        case 2:
            op_queue->add_accumulate(GroupElement::random_element(&engine));
            break;
        case 3:
            op_queue->mul_accumulate(GroupElement::random_element(&engine), FF::random_element(&engine));
            break;
        }
    }
    op_queue->random_op_ultra_only();
    op_queue->random_op_ultra_only();
    op_queue->merge(MergeSettings::APPEND, ECCOpQueue::OP_QUEUE_SIZE - op_queue->get_current_subtable_size());

    const auto batching_challenge_v = BF::random_element(&engine);
    const auto evaluation_input_x = BF::random_element(&engine);

    // Generating all the values is pretty tedious, so just use CircuitBuilder
    auto circuit_builder = TranslatorCircuitBuilder(batching_challenge_v, evaluation_input_x, op_queue);

    // The non-native field relation uses limbs of evaluation_input_x and powers of batching_challenge_v as inputs
    RelationParameters<FF> params;
    auto v_power = BF::one();
    for (size_t i = 0; i < 4 /*Number of powers of v that we need {1,2,3,4}*/; i++) {
        v_power *= batching_challenge_v;
        auto uint_v_power = uint256_t(v_power);
        params.batching_challenge_v.at(i) = { uint_v_power.slice(0, NUM_LIMB_BITS),
                                              uint_v_power.slice(NUM_LIMB_BITS, NUM_LIMB_BITS * 2),
                                              uint_v_power.slice(NUM_LIMB_BITS * 2, NUM_LIMB_BITS * 3),
                                              uint_v_power.slice(NUM_LIMB_BITS * 3, NUM_LIMB_BITS * 4),
                                              uint_v_power };
    }
    auto uint_input_x = uint256_t(evaluation_input_x);
    params.evaluation_input_x = { uint_input_x.slice(0, NUM_LIMB_BITS),
                                  uint_input_x.slice(NUM_LIMB_BITS, NUM_LIMB_BITS * 2),
                                  uint_input_x.slice(NUM_LIMB_BITS * 2, NUM_LIMB_BITS * 3),
                                  uint_input_x.slice(NUM_LIMB_BITS * 3, NUM_LIMB_BITS * 4),
                                  uint_input_x };

    // Create storage for polynomials
    ProverPolynomials prover_polynomials = TranslatorFlavor::ProverPolynomials();
    constexpr size_t full_circuit_size = Flavor::MINI_CIRCUIT_SIZE * Flavor::CONCATENATION_GROUP_SIZE;

    // Reallocate lagrange polynomials to full circuit size for manual testing
    prover_polynomials.lagrange_even_in_minicircuit = typename Flavor::Polynomial(full_circuit_size);
    prover_polynomials.lagrange_odd_in_minicircuit = typename Flavor::Polynomial(full_circuit_size);

    // Copy values of wires used in the non-native field relation from the circuit builder
    for (size_t i = Builder::NUM_NO_OPS_START + Builder::NUM_RANDOM_OPS_START;
         i < circuit_builder.num_gates() - Builder::NUM_RANDOM_OPS_END;
         i++) {
        prover_polynomials.op.at(i) = circuit_builder.get_variable(circuit_builder.wires[circuit_builder.OP][i]);
        prover_polynomials.p_x_low_limbs.at(i) =
            circuit_builder.get_variable(circuit_builder.wires[circuit_builder.P_X_LOW_LIMBS][i]);
        prover_polynomials.p_x_high_limbs.at(i) =
            circuit_builder.get_variable(circuit_builder.wires[circuit_builder.P_X_HIGH_LIMBS][i]);
        prover_polynomials.p_y_low_limbs.at(i) =
            circuit_builder.get_variable(circuit_builder.wires[circuit_builder.P_Y_LOW_LIMBS][i]);
        prover_polynomials.p_y_high_limbs.at(i) =
            circuit_builder.get_variable(circuit_builder.wires[circuit_builder.P_Y_HIGH_LIMBS][i]);
        prover_polynomials.z_low_limbs.at(i) =
            circuit_builder.get_variable(circuit_builder.wires[circuit_builder.Z_LOW_LIMBS][i]);
        prover_polynomials.z_high_limbs.at(i) =
            circuit_builder.get_variable(circuit_builder.wires[circuit_builder.Z_HIGH_LIMBS][i]);
        prover_polynomials.accumulators_binary_limbs_0.at(i) =
            circuit_builder.get_variable(circuit_builder.wires[circuit_builder.ACCUMULATORS_BINARY_LIMBS_0][i]);
        prover_polynomials.accumulators_binary_limbs_1.at(i) =
            circuit_builder.get_variable(circuit_builder.wires[circuit_builder.ACCUMULATORS_BINARY_LIMBS_1][i]);
        prover_polynomials.accumulators_binary_limbs_2.at(i) =
            circuit_builder.get_variable(circuit_builder.wires[circuit_builder.ACCUMULATORS_BINARY_LIMBS_2][i]);
        prover_polynomials.accumulators_binary_limbs_3.at(i) =
            circuit_builder.get_variable(circuit_builder.wires[circuit_builder.ACCUMULATORS_BINARY_LIMBS_3][i]);
        prover_polynomials.quotient_low_binary_limbs.at(i) =
            circuit_builder.get_variable(circuit_builder.wires[circuit_builder.QUOTIENT_LOW_BINARY_LIMBS][i]);
        prover_polynomials.quotient_high_binary_limbs.at(i) =
            circuit_builder.get_variable(circuit_builder.wires[circuit_builder.QUOTIENT_HIGH_BINARY_LIMBS][i]);
        prover_polynomials.relation_wide_limbs.at(i) =
            circuit_builder.get_variable(circuit_builder.wires[circuit_builder.RELATION_WIDE_LIMBS][i]);
    }

    // Fill in lagrange odd polynomial
    for (size_t i = Flavor::RESULT_ROW; i < mini_circuit_size_without_masking; i += 2) {
        prover_polynomials.lagrange_even_in_minicircuit.at(i) = 1;
        prover_polynomials.lagrange_odd_in_minicircuit.at(i + 1) = 1;
    }

    // Check that Non-Native Field relation is satisfied across each row of the prover polynomials
    RelationChecker<Flavor>::check<TranslatorNonNativeFieldRelation<FF>>(
        prover_polynomials, params, "TranslatorNonNativeFieldRelation");
}

TEST_F(TranslatorRelationCorrectnessTests, ZeroKnowledgePermutation)
{
    using Flavor = TranslatorFlavor;
    using FF = typename Flavor::FF;
    using ProverPolynomials = typename Flavor::ProverPolynomials;

    auto& engine = numeric::get_debug_randomness();

    TranslatorProvingKey key{};
    key.proving_key = std::make_shared<typename Flavor::ProvingKey>();
    ProverPolynomials& prover_polynomials = key.proving_key->polynomials;

    // Fill required relation parameters
    RelationParameters<FF> params{ .beta = FF::random_element(), .gamma = FF::random_element() };

    // Populate the group polynomials with appropriate values and also enough random values to mask their commitment
    // and evaluation
    auto fill_polynomial_with_random_14_bit_values = [&](auto& polynomial) {
        for (size_t i = polynomial.start_index(); i < polynomial.end_index() - NUM_DISABLED_ROWS_IN_SUMCHECK; i++) {
            polynomial.at(i) = engine.get_random_uint16() & ((1 << Flavor::MICRO_LIMB_BITS) - 1);
        }
        for (size_t i = polynomial.end_index() - NUM_DISABLED_ROWS_IN_SUMCHECK; i < polynomial.end_index(); i++) {
            polynomial.at(i) = FF::random_element();
        }
    };

    for (const auto& group : prover_polynomials.get_groups_to_be_concatenated()) {
        for (auto& poly : group) {
            // Skip null padding slots (empty zero polynomials in group 4)
            if (poly.is_empty()) {
                continue;
            }
            fill_polynomial_with_random_14_bit_values(poly);
        }
    }

    key.compute_lagrange_polynomials();
    key.compute_concatenated_polynomials();
    key.compute_extra_range_constraint_numerator();
    key.compute_translator_range_constraint_ordered_polynomials();

    // Compute the grand product polynomial
    compute_grand_product<Flavor, bb::TranslatorPermutationRelation<FF>>(prover_polynomials, params);

    // Check that permutation relation is satisfied across each row of the prover polynomials
    auto perm_failures = RelationChecker<Flavor>::check<TranslatorPermutationRelation<FF>>(
        prover_polynomials, params, "TranslatorPermutationRelation");
    EXPECT_TRUE(perm_failures.empty());
    auto delta_failures = RelationChecker<Flavor>::check<TranslatorDeltaRangeConstraintRelation<FF>>(
        prover_polynomials, params, "TranslatorDeltaRangeConstraintRelation");
    EXPECT_TRUE(delta_failures.empty());
}

TEST_F(TranslatorRelationCorrectnessTests, ZeroKnowledgeDeltaRange)
{
    using Flavor = TranslatorFlavor;
    using FF = typename Flavor::FF;
    using ProverPolynomials = typename Flavor::ProverPolynomials;
    auto& engine = numeric::get_debug_randomness();

    TranslatorProvingKey key;
    key.proving_key = std::make_shared<typename Flavor::ProvingKey>();
    ProverPolynomials& prover_polynomials = key.proving_key->polynomials;

    const size_t dyadic_circuit_size_without_masking = TranslatorProvingKey::dyadic_circuit_size_without_masking;

    key.compute_lagrange_polynomials();

    // Create a vector and fill with necessary steps for the DeltaRangeConstraint relation
    auto sorted_steps = TranslatorProvingKey::get_sorted_steps();
    std::vector<uint64_t> vector_for_sorting(sorted_steps.begin(), sorted_steps.end());

    // Add random values in the appropriate range to fill the leftover space (before masking region)
    for (size_t i = sorted_steps.size();
         i < prover_polynomials.ordered_range_constraints_0.size() - Flavor::MAX_RANDOM_VALUES_PER_ORDERED;
         i++) {
        vector_for_sorting.emplace_back(engine.get_random_uint16() & ((1 << Flavor::MICRO_LIMB_BITS) - 1));
    }

    // Get ordered polynomials
    auto polynomial_pointers = std::vector{ &prover_polynomials.ordered_range_constraints_0,
                                            &prover_polynomials.ordered_range_constraints_1,
                                            &prover_polynomials.ordered_range_constraints_2,
                                            &prover_polynomials.ordered_range_constraints_3,
                                            &prover_polynomials.ordered_range_constraints_4 };

    std::sort(vector_for_sorting.begin(), vector_for_sorting.end());

    // Add masking values
    for (size_t i = dyadic_circuit_size_without_masking; i < key.dyadic_circuit_size; i++) {
        vector_for_sorting.emplace_back(FF::random_element());
    }

    // Copy values, transforming them into Finite Field elements
    std::transform(vector_for_sorting.cbegin(),
                   vector_for_sorting.cend(),
                   prover_polynomials.ordered_range_constraints_0.coeffs().begin(),
                   [](uint64_t in) { return FF(in); });

    // Copy the same polynomial into the 4 other ordered polynomials (they are not the same in an actual proof, but
    // we only need to check the correctness of the relation and it acts independently on each polynomial)
    for (size_t i = 0; i < 4; ++i) {
        std::copy(prover_polynomials.ordered_range_constraints_0.coeffs().begin(),
                  prover_polynomials.ordered_range_constraints_0.coeffs().end(),
                  polynomial_pointers[i + 1]->coeffs().begin());
    }

    // Check that DeltaRangeConstraint relation is satisfied across each row of the prover polynomials
    auto delta_range_failures = RelationChecker<Flavor>::check<TranslatorDeltaRangeConstraintRelation<FF>>(
        prover_polynomials, RelationParameters<FF>(), "TranslatorDeltaRangeConstraintRelation");
    EXPECT_TRUE(delta_range_failures.empty());
}

/**
 * @brief Test that compute_concatenated_polynomials() correctly maps wire values into concatenated polys.
 * @details Verifies that non-masking positions contain the original wire values, masking positions contain
 * random masking values, null padding slots (group 4, lanes 13-15) are zero, and position 0 in each block
 * (below start_index=1) is zero.
 */
TEST_F(TranslatorRelationCorrectnessTests, ConcatenatedPolynomialLayout)
{
    using Flavor = TranslatorFlavor;
    using FF = typename Flavor::FF;

    auto& engine = numeric::get_debug_randomness();

    constexpr size_t MINI = Flavor::MINI_CIRCUIT_SIZE;

    TranslatorProvingKey key{};
    key.proving_key = std::make_shared<typename Flavor::ProvingKey>();
    auto& pp = key.proving_key->polynomials;

    // Fill group wire polynomials with deterministic 14-bit values in circuit region, random values in masking rows
    auto groups = pp.get_groups_to_be_concatenated();
    for (size_t i = 0; i < groups.size(); i++) {
        for (size_t j = 0; j < Flavor::CONCATENATION_GROUP_SIZE; j++) {
            auto& poly = groups[i][j];
            if (poly.is_empty()) {
                continue;
            }
            // Fill circuit region with deterministic 14-bit values
            for (size_t k = poly.start_index(); k < poly.end_index() - NUM_DISABLED_ROWS_IN_SUMCHECK; k++) {
                poly.at(k) = FF(engine.get_random_uint16() & ((1 << Flavor::MICRO_LIMB_BITS) - 1));
            }
            // Fill masking rows with random FF values
            for (size_t k = poly.end_index() - NUM_DISABLED_ROWS_IN_SUMCHECK; k < poly.end_index(); k++) {
                poly.at(k) = FF::random_element();
            }
        }
    }

    key.compute_concatenated_polynomials();

    auto concatenated = pp.get_concatenated();

    // Re-fetch groups (they are RefVectors, so point to same data)
    auto groups_after = pp.get_groups_to_be_concatenated();

    for (size_t i = 0; i < groups_after.size(); i++) {
        for (size_t j = 0; j < Flavor::CONCATENATION_GROUP_SIZE; j++) {
            auto& poly = groups_after[i][j];

            // Null padding slots in group 4 (lanes 13-15): all positions should be zero
            if (i == 4 && j >= 13) {
                for (size_t k = 0; k < MINI; k++) {
                    EXPECT_EQ(concatenated[i][j * MINI + k], FF(0))
                        << "Null padding not zero at group=" << i << " lane=" << j << " row=" << k;
                }
                continue;
            }

            // Position 0 in each block should be zero (below start_index=1)
            EXPECT_EQ(concatenated[i][j * MINI + 0], FF(0)) << "Position 0 not zero at group=" << i << " lane=" << j;

            // Non-zero region: values should match original wire values
            for (size_t k = poly.start_index(); k < poly.end_index(); k++) {
                EXPECT_EQ(concatenated[i][j * MINI + k], poly[k])
                    << "Mismatch at group=" << i << " lane=" << j << " row=" << k;
            }
        }
    }
}

/**
 * @brief Test that split_concatenated_random_coefficients_to_ordered() redistributes all random values
 * from the 4 range-constraint concatenated polys into the 5 ordered polys at contiguous end positions.
 * @details Verifies that all 256 random values from scattered masking positions appear in ordered polys,
 * and non-masking positions in ordered polys have only in-range sorted values.
 */
TEST_F(TranslatorRelationCorrectnessTests, RandomnessRedistributionIntegrity)
{
    using Flavor = TranslatorFlavor;
    using FF = typename Flavor::FF;

    auto& engine = numeric::get_debug_randomness();

    constexpr size_t MINI = Flavor::MINI_CIRCUIT_SIZE;
    constexpr size_t full_circuit_size = MINI * Flavor::CONCATENATION_GROUP_SIZE;

    TranslatorProvingKey key{};
    key.proving_key = std::make_shared<typename Flavor::ProvingKey>();
    auto& pp = key.proving_key->polynomials;

    // Fill group wire polynomials
    for (const auto& group : pp.get_groups_to_be_concatenated()) {
        for (auto& poly : group) {
            if (poly.is_empty()) {
                continue;
            }
            for (size_t k = poly.start_index(); k < poly.end_index() - NUM_DISABLED_ROWS_IN_SUMCHECK; k++) {
                poly.at(k) = FF(engine.get_random_uint16() & ((1 << Flavor::MICRO_LIMB_BITS) - 1));
            }
            for (size_t k = poly.end_index() - NUM_DISABLED_ROWS_IN_SUMCHECK; k < poly.end_index(); k++) {
                poly.at(k) = FF::random_element();
            }
        }
    }

    key.compute_concatenated_polynomials();
    key.compute_extra_range_constraint_numerator();

    // Collect random values from scattered masking positions in concatenated[0..3] BEFORE redistribution
    auto concatenated = pp.get_concatenated();
    std::multiset<uint256_t> random_values_from_concat;
    for (size_t i = 0; i < 4; i++) { // Only first 4 (range constraint) concatenated polys
        for (size_t j = 0; j < Flavor::CONCATENATION_GROUP_SIZE; j++) {
            size_t block_masking_start = j * MINI + (MINI - NUM_DISABLED_ROWS_IN_SUMCHECK);
            size_t block_masking_end = j * MINI + MINI;
            for (size_t k = block_masking_start; k < block_masking_end; k++) {
                random_values_from_concat.insert(uint256_t(concatenated[i][k]));
            }
        }
    }

    // Total expected: 4 concat polys * 16 blocks * NUM_DISABLED_ROWS_IN_SUMCHECK rows
    const size_t expected_total = 4 * Flavor::CONCATENATION_GROUP_SIZE * NUM_DISABLED_ROWS_IN_SUMCHECK;
    EXPECT_EQ(random_values_from_concat.size(), expected_total);

    // Now compute ordered polynomials (which calls split_concatenated_random_coefficients_to_ordered)
    key.compute_translator_range_constraint_ordered_polynomials();

    // Collect random values from contiguous masking region at end of ordered polys.
    // The random values from the 4 concatenated polys (4*16*4 = 256 values) are redistributed across 5 ordered polys,
    // with each ordered poly getting at most MAX_RANDOM_VALUES_PER_ORDERED positions. Not all positions may be filled,
    // so we collect only non-padding (non-zero) values. Since random FF elements are zero with negligible probability
    // (1/p), this is safe.
    auto ordered = pp.get_ordered_range_constraints();
    std::multiset<uint256_t> random_values_from_ordered;
    for (size_t i = 0; i < ordered.size(); i++) {
        for (size_t pos = full_circuit_size - Flavor::MAX_RANDOM_VALUES_PER_ORDERED; pos < full_circuit_size; pos++) {
            FF val = ordered[i][pos];
            if (val != FF(0)) {
                random_values_from_ordered.insert(uint256_t(val));
            }
        }
    }

    // The multisets should be equal (same values with same multiplicities)
    EXPECT_EQ(random_values_from_concat, random_values_from_ordered);

    // Verify non-masking region of ordered polys has values in [0, 16383]
    const size_t max_range_value = (1 << Flavor::MICRO_LIMB_BITS) - 1;
    for (size_t i = 0; i < ordered.size(); i++) {
        for (size_t pos = 1; pos < full_circuit_size - Flavor::MAX_RANDOM_VALUES_PER_ORDERED; pos++) {
            uint256_t val = uint256_t(ordered[i][pos]);
            EXPECT_LE(val, max_range_value) << "Out-of-range value in ordered poly " << i << " at position " << pos;
        }
    }
}

/**
 * @brief Test values at critical positions around block boundaries in concatenated polys.
 * @details Verifies that sentinel circuit values and masking sentinels appear at the correct positions,
 * and that block transitions (last masking row -> first row of next block) are correct.
 */
TEST_F(TranslatorRelationCorrectnessTests, BlockBoundaryEdgeCases)
{
    using Flavor = TranslatorFlavor;
    using FF = typename Flavor::FF;

    constexpr size_t MINI = Flavor::MINI_CIRCUIT_SIZE;

    TranslatorProvingKey key{};
    key.proving_key = std::make_shared<typename Flavor::ProvingKey>();
    auto& pp = key.proving_key->polynomials;

    const FF circuit_sentinel(42);
    const FF masking_sentinel(9999);

    // Fill wires with sentinels
    auto groups = pp.get_groups_to_be_concatenated();
    for (size_t i = 0; i < groups.size(); i++) {
        for (size_t j = 0; j < Flavor::CONCATENATION_GROUP_SIZE; j++) {
            auto& poly = groups[i][j];
            if (poly.is_empty()) {
                continue;
            }
            // Circuit region: fill with circuit_sentinel
            for (size_t k = poly.start_index(); k < poly.end_index() - NUM_DISABLED_ROWS_IN_SUMCHECK; k++) {
                poly.at(k) = circuit_sentinel;
            }
            // Masking region: fill with masking_sentinel
            for (size_t k = poly.end_index() - NUM_DISABLED_ROWS_IN_SUMCHECK; k < poly.end_index(); k++) {
                poly.at(k) = masking_sentinel;
            }
        }
    }

    key.compute_concatenated_polynomials();

    auto concatenated = pp.get_concatenated();

    // Check boundary positions for each block in each group
    for (size_t i = 0; i < groups.size(); i++) {
        for (size_t j = 0; j < Flavor::CONCATENATION_GROUP_SIZE; j++) {
            if (i == 4 && j >= 13) {
                continue; // skip null padding
            }

            // Last non-masking row: j*MINI + MINI - NUM_MASKED - 1
            // Note: NUM_DISABLED_ROWS_IN_SUMCHECK = NUM_MASKED_ROWS_END (== 4 for translator)
            size_t last_circuit_row = j * MINI + (MINI - NUM_DISABLED_ROWS_IN_SUMCHECK - 1);
            EXPECT_EQ(concatenated[i][last_circuit_row], circuit_sentinel)
                << "Last circuit row mismatch at group=" << i << " block=" << j;

            // First masking row: j*MINI + MINI - NUM_MASKED
            size_t first_masking_row = j * MINI + (MINI - NUM_DISABLED_ROWS_IN_SUMCHECK);
            EXPECT_EQ(concatenated[i][first_masking_row], masking_sentinel)
                << "First masking row mismatch at group=" << i << " block=" << j;

            // Last masking row: j*MINI + MINI - 1
            size_t last_masking_row = j * MINI + MINI - 1;
            EXPECT_EQ(concatenated[i][last_masking_row], masking_sentinel)
                << "Last masking row mismatch at group=" << i << " block=" << j;

            // First row of next block (if exists): should be zero (position 0 below start_index)
            if (j + 1 < Flavor::CONCATENATION_GROUP_SIZE) {
                size_t next_block_row_0 = (j + 1) * MINI + 0;
                EXPECT_EQ(concatenated[i][next_block_row_0], FF(0))
                    << "Next block row 0 not zero at group=" << i << " block=" << j;

                // Second row of next block: should be circuit_sentinel (first circuit value, start_index=1)
                // But only if not a null padding slot
                if (!(i == 4 && (j + 1) >= 13)) {
                    size_t next_block_row_1 = (j + 1) * MINI + 1;
                    EXPECT_EQ(concatenated[i][next_block_row_1], circuit_sentinel)
                        << "Next block row 1 mismatch at group=" << i << " block=" << j;
                }
            }
        }
    }
}

/**
 * @brief Test the boundary between sorted values and masking in ordered polynomials.
 * @details Verifies that lagrange_real_last is at the correct position, ordered values are non-descending,
 * the max range value appears at the last non-masking position, and position 0 is zero.
 */
TEST_F(TranslatorRelationCorrectnessTests, OrderedPolynomialBoundary)
{
    using Flavor = TranslatorFlavor;
    using FF = typename Flavor::FF;

    auto& engine = numeric::get_debug_randomness();

    constexpr size_t MINI = Flavor::MINI_CIRCUIT_SIZE;
    constexpr size_t full_circuit_size = MINI * Flavor::CONCATENATION_GROUP_SIZE;
    const size_t max_range_value = (1 << Flavor::MICRO_LIMB_BITS) - 1;

    TranslatorProvingKey key{};
    key.proving_key = std::make_shared<typename Flavor::ProvingKey>();
    auto& pp = key.proving_key->polynomials;

    // Fill group wire polynomials with random 14-bit values and random masking values
    for (const auto& group : pp.get_groups_to_be_concatenated()) {
        for (auto& poly : group) {
            if (poly.is_empty()) {
                continue;
            }
            for (size_t k = poly.start_index(); k < poly.end_index() - NUM_DISABLED_ROWS_IN_SUMCHECK; k++) {
                poly.at(k) = FF(engine.get_random_uint16() & ((1 << Flavor::MICRO_LIMB_BITS) - 1));
            }
            for (size_t k = poly.end_index() - NUM_DISABLED_ROWS_IN_SUMCHECK; k < poly.end_index(); k++) {
                poly.at(k) = FF::random_element();
            }
        }
    }

    key.compute_lagrange_polynomials();
    key.compute_extra_range_constraint_numerator();
    key.compute_concatenated_polynomials();
    key.compute_translator_range_constraint_ordered_polynomials();

    auto ordered = pp.get_ordered_range_constraints();
    const size_t last_non_masking = full_circuit_size - Flavor::MAX_RANDOM_VALUES_PER_ORDERED - 1;

    // The last non-masking position should hold the max range value (sorted_steps start from max)
    for (size_t i = 0; i < ordered.size(); i++) {
        EXPECT_EQ(ordered[i][last_non_masking], FF(max_range_value))
            << "Max range value not at last_non_masking for ordered poly " << i;
    }

    // Ordered values should be non-descending in [1, last_non_masking]
    for (size_t i = 0; i < ordered.size(); i++) {
        for (size_t pos = 2; pos <= last_non_masking; pos++) {
            uint256_t prev = uint256_t(ordered[i][pos - 1]);
            uint256_t curr = uint256_t(ordered[i][pos]);
            EXPECT_LE(prev, curr) << "Non-monotonic at ordered poly " << i << " position " << pos;
        }
    }

    // Position 0 in each ordered poly should be 0 (virtual zero for shift)
    for (size_t i = 0; i < ordered.size(); i++) {
        EXPECT_EQ(ordered[i][0], FF(0)) << "Position 0 not zero for ordered poly " << i;
    }
}

/**
 * @brief Test that all masking-related lagrange selectors have correct values at every critical boundary.
 * @details Checks lagrange_masking (scattered), lagrange_masking_adjacent (scattered + 1 row before),
 * lagrange_ordered_masking (contiguous at end), lagrange_ordered_masking_adjacent (contiguous + 1),
 * and lagrange_real_last at their boundary positions.
 */
TEST_F(TranslatorRelationCorrectnessTests, LagrangeSelectorBoundaryCorrectness)
{
    using Flavor = TranslatorFlavor;
    using FF = typename Flavor::FF;

    constexpr size_t MINI = Flavor::MINI_CIRCUIT_SIZE;
    constexpr size_t full_circuit_size = MINI * Flavor::CONCATENATION_GROUP_SIZE;
    constexpr size_t NUM_MASKED = Flavor::NUM_MASKED_ROWS_END;

    TranslatorProvingKey key{};
    key.proving_key = std::make_shared<typename Flavor::ProvingKey>();
    auto& pp = key.proving_key->polynomials;

    key.compute_lagrange_polynomials();

    // --- lagrange_masking (scattered): 1 at last NUM_MASKED rows of each block ---
    for (size_t j = 0; j < Flavor::CONCATENATION_GROUP_SIZE; j++) {
        size_t block_masking_start = j * MINI + (MINI - NUM_MASKED);
        // Row before masking should be 0
        EXPECT_EQ(pp.lagrange_masking[block_masking_start - 1], FF(0))
            << "lagrange_masking should be 0 before masking block " << j;
        // All masking rows should be 1
        for (size_t k = block_masking_start; k < j * MINI + MINI; k++) {
            EXPECT_EQ(pp.lagrange_masking[k], FF(1)) << "lagrange_masking should be 1 at block=" << j << " pos=" << k;
        }
    }

    // --- lagrange_masking_adjacent: 1 at masking rows AND row before each masking block ---
    for (size_t j = 0; j < Flavor::CONCATENATION_GROUP_SIZE; j++) {
        size_t block_masking_start = j * MINI + (MINI - NUM_MASKED);
        // Row before masking: should be 1 (adjacent)
        if (block_masking_start > 0) {
            EXPECT_EQ(pp.lagrange_masking_adjacent[block_masking_start - 1], FF(1))
                << "lagrange_masking_adjacent should be 1 at row before masking block " << j;
        }
        // Two rows before masking: should be 0
        if (block_masking_start > 1) {
            EXPECT_EQ(pp.lagrange_masking_adjacent[block_masking_start - 2], FF(0))
                << "lagrange_masking_adjacent should be 0 two rows before masking block " << j;
        }
        // All masking rows should be 1
        for (size_t k = block_masking_start; k < j * MINI + MINI; k++) {
            EXPECT_EQ(pp.lagrange_masking_adjacent[k], FF(1))
                << "lagrange_masking_adjacent should be 1 at masking block=" << j << " pos=" << k;
        }
    }

    // --- lagrange_ordered_masking (contiguous at end) ---
    EXPECT_EQ(pp.lagrange_ordered_masking[full_circuit_size - Flavor::MAX_RANDOM_VALUES_PER_ORDERED - 1], FF(0))
        << "lagrange_ordered_masking should be 0 one position before masking region";
    for (size_t i = full_circuit_size - Flavor::MAX_RANDOM_VALUES_PER_ORDERED; i < full_circuit_size; i++) {
        EXPECT_EQ(pp.lagrange_ordered_masking[i], FF(1)) << "lagrange_ordered_masking should be 1 at position " << i;
    }

    // --- lagrange_ordered_masking_adjacent (contiguous + 1) ---
    EXPECT_EQ(pp.lagrange_ordered_masking_adjacent[full_circuit_size - Flavor::MAX_RANDOM_VALUES_PER_ORDERED - 2],
              FF(0))
        << "lagrange_ordered_masking_adjacent should be 0 two positions before masking region";
    for (size_t i = full_circuit_size - Flavor::MAX_RANDOM_VALUES_PER_ORDERED - 1; i < full_circuit_size; i++) {
        EXPECT_EQ(pp.lagrange_ordered_masking_adjacent[i], FF(1))
            << "lagrange_ordered_masking_adjacent should be 1 at position " << i;
    }

    // --- lagrange_real_last ---
    const size_t real_last_pos = full_circuit_size - Flavor::MAX_RANDOM_VALUES_PER_ORDERED - 1;
    EXPECT_EQ(pp.lagrange_real_last[real_last_pos], FF(1)) << "lagrange_real_last should be 1 at real_last position";
    EXPECT_EQ(pp.lagrange_real_last[real_last_pos - 1], FF(0))
        << "lagrange_real_last should be 0 before real_last position";
    EXPECT_EQ(pp.lagrange_real_last[real_last_pos + 1], FF(0))
        << "lagrange_real_last should be 0 after real_last position";
}
