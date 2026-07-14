#include "ultra_honk.test.hpp"
#include <gtest/gtest.h>

using namespace bb;

using FlavorTypes = testing::Types<UltraFlavor, UltraZKFlavor>;
TYPED_TEST_SUITE(UltraHonkTests, FlavorTypes);

/**
 * @brief Test XOR lookup using the UINT32_XOR table
 */
TYPED_TEST(UltraHonkTests, LookupXorConstraint)
{
    auto circuit_builder = UltraCircuitBuilder();

    uint32_t left_value = engine.get_random_uint32();
    uint32_t right_value = engine.get_random_uint32();

    fr left_fr(left_value);
    fr right_fr(right_value);

    uint32_t left_idx = circuit_builder.add_variable(left_fr);
    uint32_t right_idx = circuit_builder.add_variable(right_fr);

    const auto lookup_accumulators =
        plookup::get_lookup_accumulators(plookup::MultiTableId::UINT32_XOR, left_fr, right_fr, true);

    EXPECT_EQ(lookup_accumulators[plookup::ColumnIdx::C3][0], left_value ^ right_value);

    circuit_builder.create_gates_from_plookup_accumulators(
        plookup::MultiTableId::UINT32_XOR, lookup_accumulators, left_idx, right_idx);
    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

    TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
}

/**
 * @brief Test AND lookup using the UINT32_AND table
 */
TYPED_TEST(UltraHonkTests, LookupAndConstraint)
{
    auto circuit_builder = UltraCircuitBuilder();

    uint32_t left_value = engine.get_random_uint32();
    uint32_t right_value = engine.get_random_uint32();

    fr left_fr(left_value);
    fr right_fr(right_value);

    uint32_t left_idx = circuit_builder.add_variable(left_fr);
    uint32_t right_idx = circuit_builder.add_variable(right_fr);

    const auto lookup_accumulators =
        plookup::get_lookup_accumulators(plookup::MultiTableId::UINT32_AND, left_fr, right_fr, true);

    EXPECT_EQ(lookup_accumulators[plookup::ColumnIdx::C3][0], left_value & right_value);

    circuit_builder.create_gates_from_plookup_accumulators(
        plookup::MultiTableId::UINT32_AND, lookup_accumulators, left_idx, right_idx);
    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

    TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
}

/**
 * @brief Test fixed-base scalar multiplication lookup tables
 */
TYPED_TEST(UltraHonkTests, LookupFixedBaseScalarMul)
{
    auto circuit_builder = UltraCircuitBuilder();

    fr input_value = fr::random_element();
    const fr input_lo = static_cast<uint256_t>(input_value).slice(0, plookup::fixed_base::table::BITS_PER_LO_SCALAR);
    const auto input_lo_index = circuit_builder.add_variable(input_lo);

    const auto sequence_data_lo = plookup::get_lookup_accumulators(plookup::MultiTableId::FIXED_BASE_LEFT_LO, input_lo);

    const auto lookup_witnesses = circuit_builder.create_gates_from_plookup_accumulators(
        plookup::MultiTableId::FIXED_BASE_LEFT_LO, sequence_data_lo, input_lo_index);

    const size_t num_lookups = plookup::fixed_base::table::NUM_TABLES_PER_LO_MULTITABLE;

    EXPECT_EQ(num_lookups, lookup_witnesses[plookup::ColumnIdx::C1].size());

    {
        const auto mask = plookup::fixed_base::table::MAX_TABLE_SIZE - 1;

        grumpkin::g1::affine_element base_point = plookup::fixed_base::table::lhs_generator_point();
        std::vector<uint8_t> input_buf;
        write(input_buf, base_point);
        const auto offset_generators =
            grumpkin::g1::derive_generators(input_buf, plookup::fixed_base::table::NUM_TABLES_PER_LO_MULTITABLE);

        grumpkin::g1::element accumulator = base_point;
        uint256_t expected_scalar(input_lo);
        const auto table_bits = plookup::fixed_base::table::BITS_PER_TABLE;
        const auto num_tables = plookup::fixed_base::table::NUM_TABLES_PER_LO_MULTITABLE;
        for (size_t i = 0; i < num_tables; ++i) {

            auto round_scalar = circuit_builder.get_variable(lookup_witnesses[plookup::ColumnIdx::C1][i]);
            auto round_x = circuit_builder.get_variable(lookup_witnesses[plookup::ColumnIdx::C2][i]);
            auto round_y = circuit_builder.get_variable(lookup_witnesses[plookup::ColumnIdx::C3][i]);

            EXPECT_EQ(uint256_t(round_scalar), expected_scalar);

            auto next_scalar = static_cast<uint256_t>(
                (i == num_tables - 1) ? fr(0)
                                      : circuit_builder.get_variable(lookup_witnesses[plookup::ColumnIdx::C1][i + 1]));

            uint256_t slice = static_cast<uint256_t>(round_scalar) - (next_scalar << table_bits);
            EXPECT_EQ(slice, (uint256_t(input_lo) >> (i * table_bits)) & mask);

            grumpkin::g1::affine_element expected_point(accumulator * static_cast<uint256_t>(slice) +
                                                        offset_generators[i]);

            EXPECT_EQ(round_x, expected_point.x);
            EXPECT_EQ(round_y, expected_point.y);
            for (size_t j = 0; j < table_bits; ++j) {
                accumulator = accumulator.dbl();
            }
            expected_scalar >>= table_bits;
        }
    }
    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

    TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
}

/**
 * @brief Baseline test: verify that the unaltered lookup circuit is valid.
 */
TYPED_TEST(UltraHonkTests, LookupFailureBaselineValid)
{
    UltraCircuitBuilder builder;
    MockCircuits::add_lookup_gates(builder);
    MockCircuits::add_arithmetic_gates(builder);
    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(builder);

    TestFixture::prove_and_verify(builder, /*expected_result=*/true);
}

/**
 * @brief Failure test: corrupted read counts and tags.
 *
 * The read_counts polynomial tracks how many times each table entry is read. The read_tags polynomial marks which rows
 * contain lookup data. Corrupting both breaks the log-derivative relation.
 *
 * Note: updating only one or the other may not cause failure due to the design of the relation algebra.
 * The inverse is only computed if read_tags is non-zero; otherwise the inverse at that row is zero.
 * So if read_counts is incremented but read_tags is not, the erroneous read_counts value gets
 * multiplied by 0 in the relation. This is expected behavior.
 */
TYPED_TEST(UltraHonkTests, LookupFailureCorruptedReadCountsAndTags)
{
    using ProverInstance = typename TestFixture::ProverInstance;

    UltraCircuitBuilder builder;
    MockCircuits::add_lookup_gates(builder);
    MockCircuits::add_arithmetic_gates(builder);
    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(builder);

    auto prover_instance = std::make_shared<ProverInstance>(builder);
    auto& polynomials = prover_instance->polynomials;

    // Erroneously update the read counts/tags at an arbitrary index
    polynomials.lookup_inverses() = polynomials.lookup_inverses().full();
    polynomials.lookup_read_counts() = polynomials.lookup_read_counts().full();
    polynomials.lookup_read_counts().at(25) = 1;
    polynomials.lookup_read_tags() = polynomials.lookup_read_tags().full();
    polynomials.lookup_read_tags().at(25) = 1;

    TestFixture::prove_and_verify(prover_instance, /*expected_result=*/false);
}

/**
 * @brief Failure test: corrupted wire value in a lookup gate.
 *
 * A lookup gate reads (w_l, w_r, w_o) from a table. Corrupting any wire value
 * means the tuple is no longer in the table, breaking the lookup argument.
 */
TYPED_TEST(UltraHonkTests, LookupFailureCorruptedWireValue)
{
    using ProverInstance = typename TestFixture::ProverInstance;

    UltraCircuitBuilder builder;
    MockCircuits::add_lookup_gates(builder);
    MockCircuits::add_arithmetic_gates(builder);
    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(builder);

    auto prover_instance = std::make_shared<ProverInstance>(builder);
    auto& polynomials = prover_instance->polynomials;

    bool altered = false;
    // Find a lookup gate and alter one of the wire values
    for (auto [i, q_lookup] : polynomials.q_lookup().indexed_values()) {
        if (!q_lookup.is_zero() && polynomials.q_lookup().is_valid_set_index(i)) {
            using LookupEntityId = typename TypeParam::ProverPolynomials::EntityId;
            polynomials[LookupEntityId::w_o].at(i) += 1;
            altered = true;
            break;
        }
    }
    ASSERT_TRUE(altered);

    TestFixture::prove_and_verify(prover_instance, /*expected_result=*/false);
}

/**
 * @brief Failure test: erroneous lookup selector activation.
 *
 * Turning on q_lookup for a row that doesn't contain valid table data
 * creates a lookup for a non-existent entry.
 */
TYPED_TEST(UltraHonkTests, LookupFailureErroneousLookupSelector)
{
    using ProverInstance = typename TestFixture::ProverInstance;

    UltraCircuitBuilder builder;
    MockCircuits::add_lookup_gates(builder);
    MockCircuits::add_arithmetic_gates(builder);
    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(builder);

    auto prover_instance = std::make_shared<ProverInstance>(builder);
    auto& polynomials = prover_instance->polynomials;

    // Turn the lookup selector on for an arbitrary row where it is not already active
    using LookupEntityId2 = typename TypeParam::ProverPolynomials::EntityId;
    polynomials[LookupEntityId2::lookup_inverses] = polynomials.lookup_inverses().full();
    polynomials[LookupEntityId2::q_lookup] = polynomials.q_lookup().full();
    ASSERT_TRUE(polynomials.q_lookup()[25] != 1);
    polynomials[LookupEntityId2::q_lookup].at(25) = 1;

    TestFixture::prove_and_verify(prover_instance, /*expected_result=*/false);
}

/**
 * @brief Test mixed XOR and AND lookups in the same circuit. In particular, two lookup tables are present.
 */
TYPED_TEST(UltraHonkTests, LookupMixedXorAndOperations)
{
    auto circuit_builder = UltraCircuitBuilder();

    // Interleave XOR and AND operations
    for (size_t k = 0; k < 5; ++k) {
        fr left_fr(engine.get_random_uint32());
        fr right_fr(engine.get_random_uint32());

        uint32_t left_idx = circuit_builder.add_variable(left_fr);
        uint32_t right_idx = circuit_builder.add_variable(right_fr);

        // XOR lookup
        const auto xor_accumulators =
            plookup::get_lookup_accumulators(plookup::MultiTableId::UINT32_XOR, left_fr, right_fr, true);
        circuit_builder.create_gates_from_plookup_accumulators(
            plookup::MultiTableId::UINT32_XOR, xor_accumulators, left_idx, right_idx);

        // AND lookup (reuse same witness indices)
        const auto and_accumulators =
            plookup::get_lookup_accumulators(plookup::MultiTableId::UINT32_AND, left_fr, right_fr, true);
        circuit_builder.create_gates_from_plookup_accumulators(
            plookup::MultiTableId::UINT32_AND, and_accumulators, left_idx, right_idx);
    }

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);
    TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
}
