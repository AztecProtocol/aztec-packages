#include "barretenberg/common/thread.hpp"
#include "barretenberg/honk/library/grand_product_library.hpp"
#include "barretenberg/honk/relation_checker.hpp"
#include "barretenberg/translator_vm/translator_flavor.hpp"
#include "barretenberg/translator_vm/translator_proving_key.hpp"

#include <gtest/gtest.h>
#include <unordered_set>
using namespace bb;

class TranslatorRelationCorrectnessTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

TEST_F(TranslatorRelationCorrectnessTests, DeltaRangeConstraint)
{
    using Flavor = TranslatorFlavor;
    using FF = typename Flavor::FF;
    using ProverPolynomials = typename Flavor::ProverPolynomials;
    auto& engine = numeric::get_debug_randomness();

    TranslatorProvingKey key;
    key.proving_key = std::make_shared<typename Flavor::ProvingKey>();
    ProverPolynomials& prover_polynomials = key.proving_key->polynomials;

    // Construct lagrange polynomials that are needed for Translator's DeltaRangeConstraint Relation
    prover_polynomials.lagrange_first.at(0) = 0;
    prover_polynomials.lagrange_real_last.at(key.dyadic_circuit_size - 1) = 1;

    // Create a vector and fill with necessary steps for the DeltaRangeConstraint relation
    auto sorted_steps = TranslatorProvingKey::get_sorted_steps();
    std::vector<uint64_t> vector_for_sorting(sorted_steps.begin(), sorted_steps.end());

    // Add random values to fill the leftover space
    for (size_t i = sorted_steps.size(); i < prover_polynomials.ordered_range_constraints_0.size(); i++) {
        vector_for_sorting.emplace_back(engine.get_random_uint16() & ((1 << Flavor::MICRO_LIMB_BITS) - 1));
    }

    // Get ordered polynomials
    auto polynomial_pointers = std::vector{ &prover_polynomials.ordered_range_constraints_0,
                                            &prover_polynomials.ordered_range_constraints_1,
                                            &prover_polynomials.ordered_range_constraints_2,
                                            &prover_polynomials.ordered_range_constraints_3,
                                            &prover_polynomials.ordered_range_constraints_4 };

    // Sort the vector
    std::sort(vector_for_sorting.begin(), vector_for_sorting.end());

    // Copy values, transforming them into Finite Field elements
    std::transform(vector_for_sorting.cbegin(),
                   vector_for_sorting.cend(),
                   prover_polynomials.ordered_range_constraints_0.coeffs().begin(),
                   [](uint64_t in) { return FF(in); });

    // Copy the same polynomial into the 4 other ordered polynomials (they are not the same in an actual proof, but
    // we only need to check the correctness of the relation and it acts independently on each polynomial)
    parallel_for(4, [&](size_t i) {
        std::copy(prover_polynomials.ordered_range_constraints_0.coeffs().begin(),
                  prover_polynomials.ordered_range_constraints_0.coeffs().end(),
                  polynomial_pointers[i + 1]->coeffs().begin());
    });

    // Check that DeltaRangeConstraint relation is satisfied across each row of the prover polynomials
    RelationChecker<Flavor>::check<TranslatorDeltaRangeConstraintRelation<FF>>(
        prover_polynomials, RelationParameters<FF>(), "TranslatorDeltaRangeConstraintRelation");
}

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
    constexpr size_t mini_circuit_size = Flavor::MINI_CIRCUIT_SIZE;
    // Fill in lagrange even polynomial
    for (size_t i = 2; i < mini_circuit_size - 1; i += 2) {
        prover_polynomials.lagrange_even_in_minicircuit.at(i) = 1;
        prover_polynomials.lagrange_odd_in_minicircuit.at(i + 1) = 1;
    }
    constexpr size_t NUMBER_OF_POSSIBLE_OPCODES = 4;
    constexpr std::array<uint64_t, NUMBER_OF_POSSIBLE_OPCODES> possible_opcode_values = { 0, 3, 4, 8 };

    // Assign random opcode values
    for (size_t i = 1; i < mini_circuit_size - 1; i += 2) {
        prover_polynomials.op.at(i) =
            possible_opcode_values[static_cast<size_t>(engine.get_random_uint8() % NUMBER_OF_POSSIBLE_OPCODES)];
    }

    // Initialize used lagrange polynomials
    prover_polynomials.lagrange_result_row.at(2) = 1;
    prover_polynomials.lagrange_last_in_minicircuit.at(mini_circuit_size - 1) = 1;

    // Put random values in accumulator binary limbs (values should be preserved across even->next odd shift)
    for (size_t i = 3; i < mini_circuit_size - 1; i += 2) {
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
    prover_polynomials.accumulators_binary_limbs_0.at(2) = params.accumulated_result[0];
    prover_polynomials.accumulators_binary_limbs_1.at(2) = params.accumulated_result[1];
    prover_polynomials.accumulators_binary_limbs_2.at(2) = params.accumulated_result[2];
    prover_polynomials.accumulators_binary_limbs_3.at(2) = params.accumulated_result[3];

    // Check that Opcode Constraint relation is satisfied across each row of the prover polynomials
    RelationChecker<Flavor>::check<TranslatorOpcodeConstraintRelation<FF>>(
        prover_polynomials, params, "TranslatorOpcodeConstraintRelation");

    // Check that Accumulator Transfer relation is satisfied across each row of the prover polynomials
    RelationChecker<Flavor>::check<TranslatorAccumulatorTransferRelation<FF>>(
        prover_polynomials, params, "TranslatorAccumulatorTransferRelation");

    // Check that Zero Constraint relation is satisfied across each row of the prover polynomials
    RelationChecker<Flavor>::check<TranslatorZeroConstraintsRelation<FF>>(
        prover_polynomials, params, "TranslatorZeroConstraintsRelation");
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

    // Fill in lagrange odd polynomial (the only non-witness one we are using)
    for (size_t i = 1; i < mini_circuit_size - 1; i += 2) {
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
    using FF = typename Flavor::FF;
    using BF = typename Flavor::BF;
    using ProverPolynomials = typename Flavor::ProverPolynomials;
    using GroupElement = typename Flavor::GroupElement;

    constexpr size_t NUM_LIMB_BITS = Flavor::NUM_LIMB_BITS;
    constexpr auto mini_circuit_size = TranslatorFlavor::MINI_CIRCUIT_SIZE;

    auto& engine = numeric::get_debug_randomness();

    auto op_queue = std::make_shared<bb::ECCOpQueue>();

    // Generate random EccOpQueue actions

    for (size_t i = 0; i < ((mini_circuit_size >> 1) - 2); i++) {
        switch (engine.get_random_uint8() & 3) {
        case 0:
            op_queue->empty_row_for_testing();
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

    // Copy values of wires used in the non-native field relation from the circuit builder
    for (size_t i = 1; i < circuit_builder.get_estimated_num_finalized_gates(); i++) {
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
    for (size_t i = 2; i < mini_circuit_size; i += 2) {
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

    const size_t full_circuit_size = Flavor::MINI_CIRCUIT_SIZE * Flavor::INTERLEAVING_GROUP_SIZE;
    auto& engine = numeric::get_debug_randomness();
    const size_t full_masking_offset = NUM_DISABLED_ROWS_IN_SUMCHECK * Flavor::INTERLEAVING_GROUP_SIZE;

    TranslatorProvingKey key{};
    key.proving_key = std::make_shared<typename Flavor::ProvingKey>();
    ProverPolynomials& prover_polynomials = key.proving_key->polynomials;
    const size_t dyadic_circuit_size_without_masking = full_circuit_size - full_masking_offset;

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

    for (const auto& group : prover_polynomials.get_groups_to_be_interleaved()) {
        for (auto& poly : group) {
            fill_polynomial_with_random_14_bit_values(poly);
        }
    }

    // Fill in lagrange polynomials used in the permutation relation
    prover_polynomials.lagrange_first.at(0) = 1;
    prover_polynomials.lagrange_real_last.at(dyadic_circuit_size_without_masking - 1) = 1;
    prover_polynomials.lagrange_last.at(full_circuit_size - 1) = 1;
    for (size_t i = dyadic_circuit_size_without_masking; i < full_circuit_size; i++) {
        prover_polynomials.lagrange_masking.at(i) = 1;
    }

    key.compute_interleaved_polynomials();
    key.compute_extra_range_constraint_numerator();
    key.compute_translator_range_constraint_ordered_polynomials();

    // Compute the grand product polynomial
    compute_grand_product<Flavor, bb::TranslatorPermutationRelation<FF>>(prover_polynomials, params);

    // Check that permutation relation is satisfied across each row of the prover polynomials
    RelationChecker<Flavor>::check<TranslatorPermutationRelation<FF>>(
        prover_polynomials, params, "TranslatorPermutationRelation");
    RelationChecker<Flavor>::check<TranslatorDeltaRangeConstraintRelation<FF>>(
        prover_polynomials, params, "TranslatorPermutationRelation");
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

    const size_t full_masking_offset = NUM_DISABLED_ROWS_IN_SUMCHECK * Flavor::INTERLEAVING_GROUP_SIZE;
    const size_t dyadic_circuit_size_without_masking = key.dyadic_circuit_size - full_masking_offset;

    // Construct lagrange polynomials that are needed for Translator's DeltaRangeConstraint Relation
    prover_polynomials.lagrange_first.at(0) = 0;
    prover_polynomials.lagrange_real_last.at(dyadic_circuit_size_without_masking - 1) = 1;

    for (size_t i = dyadic_circuit_size_without_masking; i < key.dyadic_circuit_size; i++) {
        prover_polynomials.lagrange_masking.at(i) = 1;
    }

    // Create a vector and fill with necessary steps for the DeltaRangeConstraint relation
    auto sorted_steps = TranslatorProvingKey::get_sorted_steps();
    std::vector<uint64_t> vector_for_sorting(sorted_steps.begin(), sorted_steps.end());

    // Add random values in the appropriate range to fill the leftover space
    for (size_t i = sorted_steps.size();
         i < prover_polynomials.ordered_range_constraints_0.size() - full_masking_offset;
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
    RelationChecker<Flavor>::check<TranslatorDeltaRangeConstraintRelation<FF>>(
        prover_polynomials, RelationParameters<FF>(), "TranslatorDeltaRangeConstraintRelation");
}
