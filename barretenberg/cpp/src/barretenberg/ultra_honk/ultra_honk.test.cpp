#include "barretenberg/common/serialize.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/ultra_rollup_flavor.hpp"
#include "barretenberg/honk/library/grand_product_delta.hpp"
#include "barretenberg/honk/types/aggregation_object_type.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/relations/permutation_relation.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/stdlib/pairing_points.hpp"
#include "barretenberg/stdlib/primitives/curves/grumpkin.hpp"
#include "barretenberg/stdlib_circuit_builders/mock_circuits.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/fixed_base/fixed_base.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/types.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/sumcheck/sumcheck_round.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

#include <gtest/gtest.h>

using namespace bb;

using AggregationState = stdlib::recursion::PairingPoints<UltraCircuitBuilder>;

template <typename Flavor> class UltraHonkTests : public ::testing::Test {
  public:
    using DeciderProvingKey = DeciderProvingKey_<Flavor>;
    using VerificationKey = typename Flavor::VerificationKey;
    using Prover = UltraProver_<Flavor>;
    using Verifier = UltraVerifier_<Flavor>;

    std::vector<uint32_t> add_variables(auto& circuit_builder, std::vector<bb::fr> variables)
    {
        std::vector<uint32_t> res;
        for (auto& variable : variables) {
            res.emplace_back(circuit_builder.add_variable(variable));
        }
        return res;
    }

    void set_default_pairing_points_and_ipa_claim_and_proof(UltraCircuitBuilder& builder)
    {
        AggregationState::add_default_to_public_inputs(builder);
        if constexpr (HasIPAAccumulator<Flavor>) {
            auto [stdlib_opening_claim, ipa_proof] =
                IPA<stdlib::grumpkin<UltraCircuitBuilder>>::create_fake_ipa_claim_and_proof(builder);
            stdlib_opening_claim.set_public();
            builder.ipa_proof = ipa_proof;
        }
    }

    void prove_and_verify(auto& circuit_builder, bool expected_result)
    {
        auto proving_key = std::make_shared<DeciderProvingKey>(circuit_builder);
        auto verification_key = std::make_shared<VerificationKey>(proving_key->polynomials, proving_key->metadata);
        Prover prover(proving_key, verification_key);
        auto proof = prover.construct_proof();
        if constexpr (HasIPAAccumulator<Flavor>) {
            VerifierCommitmentKey<curve::Grumpkin> ipa_verification_key(1 << CONST_ECCVM_LOG_N);
            Verifier verifier(verification_key, ipa_verification_key);
            bool verified = verifier.verify_proof(proof, proving_key->proving_key.ipa_proof);
            EXPECT_EQ(verified, expected_result);
        } else {
            Verifier verifier(verification_key);
            bool verified = verifier.verify_proof(proof);
            EXPECT_EQ(verified, expected_result);
        }
    };

  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

#ifdef STARKNET_GARAGA_FLAVORS
using FlavorTypes = testing::Types<UltraFlavor,
                                   UltraZKFlavor,
                                   UltraKeccakFlavor,
                                   UltraKeccakZKFlavor,
                                   UltraRollupFlavor,
                                   UltraStarknetFlavor,
                                   UltraStarknetZKFlavor>;
#else
using FlavorTypes =
    testing::Types<UltraFlavor, UltraZKFlavor, UltraKeccakFlavor, UltraKeccakZKFlavor, UltraRollupFlavor>;
#endif

TYPED_TEST_SUITE(UltraHonkTests, FlavorTypes);

/**
 * @brief Check that size of a ultra honk proof matches the corresponding constant
 * @details If this test FAILS, then the following (non-exhaustive) list should probably be updated as well:
 * - Proof length formula in ultra_flavor.hpp, mega_flavor.hpp, etc...
 * - ultra_transcript.test.cpp
 * - constants in yarn-project in: constants.nr, constants.gen.ts, ConstantsGen.sol, lib.nr in
 * bb_proof_verification/src, main.nr of recursive acir_tests programs. with recursive verification circuits
 * - Places that define SIZE_OF_PROOF_IF_LOGN_IS_28
 */
TYPED_TEST(UltraHonkTests, UltraProofSizeCheck)
{
    using Flavor = TypeParam;

    auto builder = typename Flavor::CircuitBuilder{};
    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(builder);
    // Construct a UH proof and ensure its size matches expectation; if not, the constant may need to be updated
    auto proving_key = std::make_shared<DeciderProvingKey_<Flavor>>(builder);
    auto verification_key =
        std::make_shared<typename Flavor::VerificationKey>(proving_key->polynomials, proving_key->metadata);
    UltraProver_<Flavor> prover(proving_key, verification_key);
    HonkProof ultra_proof = prover.construct_proof();
    size_t expected_proof_length = Flavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS + PAIRING_POINTS_SIZE;
    if (HasIPAAccumulator<Flavor>) {
        expected_proof_length += IPA_CLAIM_SIZE;
    }
    EXPECT_EQ(ultra_proof.size(), expected_proof_length);
}

/**
 * @brief A quick test to ensure that none of our polynomials are identically zero
 *
 * @note This test assumes that gates have been added by default in the composer
 * to achieve non-zero polynomials
 *
 */
TYPED_TEST(UltraHonkTests, ANonZeroPolynomialIsAGoodPolynomial)
{
    auto circuit_builder = UltraCircuitBuilder();
    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

    auto proving_key = std::make_shared<typename TestFixture::DeciderProvingKey>(circuit_builder);
    auto verification_key =
        std::make_shared<typename TypeParam::VerificationKey>(proving_key->polynomials, proving_key->metadata);
    typename TestFixture::Prover prover(proving_key, verification_key);
    auto proof = prover.construct_proof();
    auto& polynomials = proving_key->proving_key.polynomials;

    auto ensure_non_zero = [](auto& polynomial) {
        bool has_non_zero_coefficient = false;
        for (auto& coeff : polynomial.coeffs()) {
            has_non_zero_coefficient |= !coeff.is_zero();
        }
        ASSERT_TRUE(has_non_zero_coefficient);
    };

    for (auto& poly : polynomials.get_selectors()) {
        ensure_non_zero(poly);
    }

    for (auto& poly : polynomials.get_tables()) {
        ensure_non_zero(poly);
    }

    for (auto& poly : polynomials.get_wires()) {
        ensure_non_zero(poly);
    }
}

/**
 * @brief Test simple circuit with public inputs
 *
 */
TYPED_TEST(UltraHonkTests, PublicInputs)
{
    auto builder = UltraCircuitBuilder();
    size_t num_gates = 10;

    // Add some arbitrary arithmetic gates that utilize public inputs
    MockCircuits::add_arithmetic_gates_with_public_inputs(builder, num_gates);
    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(builder);

    TestFixture::prove_and_verify(builder, /*expected_result=*/true);
}

TYPED_TEST(UltraHonkTests, XorConstraint)
{
    auto circuit_builder = UltraCircuitBuilder();

    uint32_t left_value = engine.get_random_uint32();
    uint32_t right_value = engine.get_random_uint32();

    fr left_witness_value = fr{ left_value, 0, 0, 0 }.to_montgomery_form();
    fr right_witness_value = fr{ right_value, 0, 0, 0 }.to_montgomery_form();

    uint32_t left_witness_index = circuit_builder.add_variable(left_witness_value);
    uint32_t right_witness_index = circuit_builder.add_variable(right_witness_value);

    uint32_t xor_result_expected = left_value ^ right_value;

    const auto lookup_accumulators = plookup::get_lookup_accumulators(
        plookup::MultiTableId::UINT32_XOR, left_witness_value, right_witness_value, true);
    auto xor_result = lookup_accumulators[plookup::ColumnIdx::C3]
                                         [0]; // The zeroth index in the 3rd column is the fully accumulated xor

    EXPECT_EQ(xor_result, xor_result_expected);
    circuit_builder.create_gates_from_plookup_accumulators(
        plookup::MultiTableId::UINT32_XOR, lookup_accumulators, left_witness_index, right_witness_index);
    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

    TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
}

TYPED_TEST(UltraHonkTests, CreateGatesFromPlookupAccumulators)
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
 * @brief Test various failure modes for the lookup relation via bad input polynomials
 *
 */
TYPED_TEST(UltraHonkTests, LookupFailure)
{
    using DeciderProvingKey = typename TestFixture::DeciderProvingKey;
    using VerificationKey = typename TestFixture::VerificationKey;
    // Construct a circuit with lookup and arithmetic gates
    auto construct_circuit_with_lookups = [this]() {
        UltraCircuitBuilder builder;

        MockCircuits::add_lookup_gates(builder);
        MockCircuits::add_arithmetic_gates(builder);
        TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(builder);

        return builder;
    };

    auto prove_and_verify = [](auto& proving_key) {
        auto verification_key = std::make_shared<VerificationKey>(proving_key->polynomials, proving_key->metadata);
        typename TestFixture::Prover prover(proving_key, verification_key);
        auto proof = prover.construct_proof();
        if constexpr (HasIPAAccumulator<TypeParam>) {
            VerifierCommitmentKey<curve::Grumpkin> ipa_verification_key = (1 << CONST_ECCVM_LOG_N);
            typename TestFixture::Verifier verifier(verification_key, ipa_verification_key);
            return verifier.verify_proof(proof, proving_key->proving_key.ipa_proof);
        } else {
            typename TestFixture::Verifier verifier(verification_key);
            return verifier.verify_proof(proof);
        }
    };

    // Ensure the unaltered test circuit is valid
    {
        auto builder = construct_circuit_with_lookups();

        auto proving_key = std::make_shared<DeciderProvingKey>(builder);

        prove_and_verify(proving_key);
    }

    // Failure mode 1: bad read counts/tags
    {
        auto builder = construct_circuit_with_lookups();

        auto proving_key = std::make_shared<DeciderProvingKey>(builder);
        auto& polynomials = proving_key->proving_key.polynomials;

        // Erroneously update the read counts/tags at an arbitrary index
        // Note: updating only one or the other may not cause failure due to the design of the relation algebra. For
        // example, the inverse is only computed if read tags is non-zero, otherwise the inverse at the row in
        // question will be zero. So if read counts is incremented at some arbitrary index but read tags is not, the
        // inverse will be 0 and the erroneous read_counts value will get multiplied by 0 in the relation. This is
        // expected behavior.
        polynomials.lookup_inverses = polynomials.lookup_inverses.full();
        polynomials.lookup_read_counts = polynomials.lookup_read_counts.full();
        polynomials.lookup_read_counts.at(25) = 1;
        polynomials.lookup_read_tags = polynomials.lookup_read_tags.full();
        polynomials.lookup_read_tags.at(25) = 1;

        EXPECT_FALSE(prove_and_verify(proving_key));
    }

    // Failure mode 2: bad lookup gate wire value
    {
        auto builder = construct_circuit_with_lookups();

        auto proving_key = std::make_shared<DeciderProvingKey>(builder);
        auto& polynomials = proving_key->proving_key.polynomials;

        bool altered = false;
        // Find a lookup gate and alter one of the wire values
        for (auto [i, q_lookup] : polynomials.q_lookup.indexed_values()) {
            if (!q_lookup.is_zero() && polynomials.q_lookup.is_valid_set_index(i)) {
                polynomials.w_o.at(i) += 1;
                altered = true;
                break;
            }
        }
        EXPECT_TRUE(altered);
        EXPECT_FALSE(prove_and_verify(proving_key));
    }

    // Failure mode 3: erroneous lookup gate
    {
        auto builder = construct_circuit_with_lookups();

        auto proving_key = std::make_shared<DeciderProvingKey>(builder);
        auto& polynomials = proving_key->proving_key.polynomials;

        // Turn the lookup selector on for an arbitrary row where it is not already active
        polynomials.lookup_inverses = polynomials.lookup_inverses.full();
        polynomials.q_lookup = polynomials.q_lookup.full();
        EXPECT_TRUE(polynomials.q_lookup[25] != 1);
        polynomials.q_lookup.at(25) = 1;

        EXPECT_FALSE(prove_and_verify(proving_key));
    }
}

TYPED_TEST(UltraHonkTests, TestNoLookupProof)
{
    auto circuit_builder = UltraCircuitBuilder();

    for (size_t i = 0; i < 16; ++i) {
        for (size_t j = 0; j < 16; ++j) {
            uint64_t left = static_cast<uint64_t>(j);
            uint64_t right = static_cast<uint64_t>(i);
            uint32_t left_idx = circuit_builder.add_variable(fr(left));
            uint32_t right_idx = circuit_builder.add_variable(fr(right));
            uint32_t result_idx = circuit_builder.add_variable(fr(left ^ right));

            uint32_t add_idx =
                circuit_builder.add_variable(fr(left) + fr(right) + circuit_builder.get_variable(result_idx));
            circuit_builder.create_big_add_gate(
                { left_idx, right_idx, result_idx, add_idx, fr(1), fr(1), fr(1), fr(-1), fr(0) });
        }
    }
    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

    TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
}

TYPED_TEST(UltraHonkTests, TestEllipticGate)
{
    typedef grumpkin::g1::affine_element affine_element;
    typedef grumpkin::g1::element element;
    auto circuit_builder = UltraCircuitBuilder();

    affine_element p1 = affine_element::random_element();
    affine_element p2 = affine_element::random_element();

    affine_element p3(element(p1) + element(p2));

    uint32_t x1 = circuit_builder.add_variable(p1.x);
    uint32_t y1 = circuit_builder.add_variable(p1.y);
    uint32_t x2 = circuit_builder.add_variable(p2.x);
    uint32_t y2 = circuit_builder.add_variable(p2.y);
    uint32_t x3 = circuit_builder.add_variable(p3.x);
    uint32_t y3 = circuit_builder.add_variable(p3.y);

    circuit_builder.create_ecc_add_gate({ x1, y1, x2, y2, x3, y3, 1 });

    p3 = affine_element(element(p1) + element(p2));
    x3 = circuit_builder.add_variable(p3.x);
    y3 = circuit_builder.add_variable(p3.y);
    circuit_builder.create_ecc_add_gate({ x1, y1, x2, y2, x3, y3, 1 });

    p3 = affine_element(element(p1) - element(p2));
    x3 = circuit_builder.add_variable(p3.x);
    y3 = circuit_builder.add_variable(p3.y);
    circuit_builder.create_ecc_add_gate({ x1, y1, x2, y2, x3, y3, -1 });

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

    TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
}

TYPED_TEST(UltraHonkTests, NonTrivialTagPermutation)
{
    auto circuit_builder = UltraCircuitBuilder();
    fr a = fr::random_element();
    fr b = -a;

    auto a_idx = circuit_builder.add_variable(a);
    auto b_idx = circuit_builder.add_variable(b);
    auto c_idx = circuit_builder.add_variable(b);
    auto d_idx = circuit_builder.add_variable(a);

    circuit_builder.create_add_gate(
        { a_idx, b_idx, circuit_builder.zero_idx, fr::one(), fr::one(), fr::zero(), fr::zero() });
    circuit_builder.create_add_gate(
        { c_idx, d_idx, circuit_builder.zero_idx, fr::one(), fr::one(), fr::zero(), fr::zero() });

    circuit_builder.create_tag(1, 2);
    circuit_builder.create_tag(2, 1);

    circuit_builder.assign_tag(a_idx, 1);
    circuit_builder.assign_tag(b_idx, 1);
    circuit_builder.assign_tag(c_idx, 2);
    circuit_builder.assign_tag(d_idx, 2);
    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

    TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
}

TYPED_TEST(UltraHonkTests, NonTrivialTagPermutationAndCycles)
{
    auto circuit_builder = UltraCircuitBuilder();
    fr a = fr::random_element();
    fr c = -a;

    auto a_idx = circuit_builder.add_variable(a);
    auto b_idx = circuit_builder.add_variable(a);
    circuit_builder.assert_equal(a_idx, b_idx);
    auto c_idx = circuit_builder.add_variable(c);
    auto d_idx = circuit_builder.add_variable(c);
    circuit_builder.assert_equal(c_idx, d_idx);
    auto e_idx = circuit_builder.add_variable(a);
    auto f_idx = circuit_builder.add_variable(a);
    circuit_builder.assert_equal(e_idx, f_idx);
    auto g_idx = circuit_builder.add_variable(c);
    auto h_idx = circuit_builder.add_variable(c);
    circuit_builder.assert_equal(g_idx, h_idx);

    circuit_builder.create_tag(1, 2);
    circuit_builder.create_tag(2, 1);

    circuit_builder.assign_tag(a_idx, 1);
    circuit_builder.assign_tag(c_idx, 1);
    circuit_builder.assign_tag(e_idx, 2);
    circuit_builder.assign_tag(g_idx, 2);

    circuit_builder.create_add_gate(
        { b_idx, a_idx, circuit_builder.zero_idx, fr::one(), fr::neg_one(), fr::zero(), fr::zero() });
    circuit_builder.create_add_gate(
        { c_idx, g_idx, circuit_builder.zero_idx, fr::one(), -fr::one(), fr::zero(), fr::zero() });
    circuit_builder.create_add_gate(
        { e_idx, f_idx, circuit_builder.zero_idx, fr::one(), -fr::one(), fr::zero(), fr::zero() });
    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

    TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
}

TYPED_TEST(UltraHonkTests, BadTagPermutation)
{
    {
        auto circuit_builder = UltraCircuitBuilder();
        fr a = fr::random_element();
        fr b = -a;

        auto a_idx = circuit_builder.add_variable(a);
        auto b_idx = circuit_builder.add_variable(b);
        auto c_idx = circuit_builder.add_variable(b);
        auto d_idx = circuit_builder.add_variable(a + 1);

        circuit_builder.create_add_gate({ a_idx, b_idx, circuit_builder.zero_idx, 1, 1, 0, 0 });
        circuit_builder.create_add_gate({ c_idx, d_idx, circuit_builder.zero_idx, 1, 1, 0, -1 });

        circuit_builder.create_tag(1, 2);
        circuit_builder.create_tag(2, 1);

        circuit_builder.assign_tag(a_idx, 1);
        circuit_builder.assign_tag(b_idx, 1);
        circuit_builder.assign_tag(c_idx, 2);
        circuit_builder.assign_tag(d_idx, 2);
        TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

        TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/false);
    }
    // Same as above but without tag creation to check reason of failure is really tag mismatch
    {
        auto circuit_builder = UltraCircuitBuilder();
        fr a = fr::random_element();
        fr b = -a;

        auto a_idx = circuit_builder.add_variable(a);
        auto b_idx = circuit_builder.add_variable(b);
        auto c_idx = circuit_builder.add_variable(b);
        auto d_idx = circuit_builder.add_variable(a + 1);

        circuit_builder.create_add_gate({ a_idx, b_idx, circuit_builder.zero_idx, 1, 1, 0, 0 });
        circuit_builder.create_add_gate({ c_idx, d_idx, circuit_builder.zero_idx, 1, 1, 0, -1 });
        TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

        TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
    }
}

TYPED_TEST(UltraHonkTests, SortWidget)
{
    auto circuit_builder = UltraCircuitBuilder();
    fr a = fr::one();
    fr b = fr(2);
    fr c = fr(3);
    fr d = fr(4);

    auto a_idx = circuit_builder.add_variable(a);
    auto b_idx = circuit_builder.add_variable(b);
    auto c_idx = circuit_builder.add_variable(c);
    auto d_idx = circuit_builder.add_variable(d);
    circuit_builder.create_sort_constraint({ a_idx, b_idx, c_idx, d_idx });

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

    TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
}

TYPED_TEST(UltraHonkTests, SortWithEdgesGate)
{
    fr a = fr::one();
    fr b = fr(2);
    fr c = fr(3);
    fr d = fr(4);
    fr e = fr(5);
    fr f = fr(6);
    fr g = fr(7);
    fr h = fr(8);

    {
        auto circuit_builder = UltraCircuitBuilder();
        auto a_idx = circuit_builder.add_variable(a);
        auto b_idx = circuit_builder.add_variable(b);
        auto c_idx = circuit_builder.add_variable(c);
        auto d_idx = circuit_builder.add_variable(d);
        auto e_idx = circuit_builder.add_variable(e);
        auto f_idx = circuit_builder.add_variable(f);
        auto g_idx = circuit_builder.add_variable(g);
        auto h_idx = circuit_builder.add_variable(h);
        circuit_builder.create_sort_constraint_with_edges(
            { a_idx, b_idx, c_idx, d_idx, e_idx, f_idx, g_idx, h_idx }, a, h);

        TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

        TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
    }

    {
        auto circuit_builder = UltraCircuitBuilder();
        auto a_idx = circuit_builder.add_variable(a);
        auto b_idx = circuit_builder.add_variable(b);
        auto c_idx = circuit_builder.add_variable(c);
        auto d_idx = circuit_builder.add_variable(d);
        auto e_idx = circuit_builder.add_variable(e);
        auto f_idx = circuit_builder.add_variable(f);
        auto g_idx = circuit_builder.add_variable(g);
        auto h_idx = circuit_builder.add_variable(h);
        circuit_builder.create_sort_constraint_with_edges(
            { a_idx, b_idx, c_idx, d_idx, e_idx, f_idx, g_idx, h_idx }, a, g);

        TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

        TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/false);
    }
    {
        auto circuit_builder = UltraCircuitBuilder();
        auto a_idx = circuit_builder.add_variable(a);
        auto b_idx = circuit_builder.add_variable(b);
        auto c_idx = circuit_builder.add_variable(c);
        auto d_idx = circuit_builder.add_variable(d);
        auto e_idx = circuit_builder.add_variable(e);
        auto f_idx = circuit_builder.add_variable(f);
        auto g_idx = circuit_builder.add_variable(g);
        auto h_idx = circuit_builder.add_variable(h);
        circuit_builder.create_sort_constraint_with_edges(
            { a_idx, b_idx, c_idx, d_idx, e_idx, f_idx, g_idx, h_idx }, b, h);

        TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

        TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/false);
    }
    {
        auto circuit_builder = UltraCircuitBuilder();
        auto a_idx = circuit_builder.add_variable(a);
        auto c_idx = circuit_builder.add_variable(c);
        auto d_idx = circuit_builder.add_variable(d);
        auto e_idx = circuit_builder.add_variable(e);
        auto f_idx = circuit_builder.add_variable(f);
        auto g_idx = circuit_builder.add_variable(g);
        auto h_idx = circuit_builder.add_variable(h);
        auto b2_idx = circuit_builder.add_variable(fr(15));
        circuit_builder.create_sort_constraint_with_edges(
            { a_idx, b2_idx, c_idx, d_idx, e_idx, f_idx, g_idx, h_idx }, b, h);

        TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

        TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/false);
    }
    {
        auto circuit_builder = UltraCircuitBuilder();
        auto idx =
            TestFixture::add_variables(circuit_builder, { 1,  2,  5,  6,  7,  10, 11, 13, 16, 17, 20, 22, 22, 25,
                                                          26, 29, 29, 32, 32, 33, 35, 38, 39, 39, 42, 42, 43, 45 });
        circuit_builder.create_sort_constraint_with_edges(idx, 1, 45);

        TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

        TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
    }
    {
        auto circuit_builder = UltraCircuitBuilder();
        auto idx =
            TestFixture::add_variables(circuit_builder, { 1,  2,  5,  6,  7,  10, 11, 13, 16, 17, 20, 22, 22, 25,
                                                          26, 29, 29, 32, 32, 33, 35, 38, 39, 39, 42, 42, 43, 45 });
        circuit_builder.create_sort_constraint_with_edges(idx, 1, 29);

        TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

        TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/false);
    }
}

TYPED_TEST(UltraHonkTests, RangeConstraint)
{
    {
        auto circuit_builder = UltraCircuitBuilder();
        auto indices = TestFixture::add_variables(circuit_builder, { 1, 2, 3, 4, 5, 6, 7, 8 });
        for (size_t i = 0; i < indices.size(); i++) {
            circuit_builder.create_new_range_constraint(indices[i], 8);
        }
        // auto ind = {a_idx,b_idx,c_idx,d_idx,e_idx,f_idx,g_idx,h_idx};
        circuit_builder.create_sort_constraint(indices);

        TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

        TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
    }
    {
        auto circuit_builder = UltraCircuitBuilder();
        auto indices = TestFixture::add_variables(circuit_builder, { 3 });
        for (size_t i = 0; i < indices.size(); i++) {
            circuit_builder.create_new_range_constraint(indices[i], 3);
        }
        // auto ind = {a_idx,b_idx,c_idx,d_idx,e_idx,f_idx,g_idx,h_idx};
        circuit_builder.create_dummy_constraints(indices);

        TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

        TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
    }
    {
        auto circuit_builder = UltraCircuitBuilder();
        auto indices = TestFixture::add_variables(circuit_builder, { 1, 2, 3, 4, 5, 6, 8, 25 });
        for (size_t i = 0; i < indices.size(); i++) {
            circuit_builder.create_new_range_constraint(indices[i], 8);
        }
        circuit_builder.create_sort_constraint(indices);

        TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

        TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/false);
    }
    {
        auto circuit_builder = UltraCircuitBuilder();
        auto indices = TestFixture::add_variables(
            circuit_builder, { 1, 2, 3, 4, 5, 6, 10, 8, 15, 11, 32, 21, 42, 79, 16, 10, 3, 26, 19, 51 });
        for (size_t i = 0; i < indices.size(); i++) {
            circuit_builder.create_new_range_constraint(indices[i], 128);
        }
        circuit_builder.create_dummy_constraints(indices);

        TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

        TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
    }
    {
        auto circuit_builder = UltraCircuitBuilder();
        auto indices = TestFixture::add_variables(
            circuit_builder, { 1, 2, 3, 80, 5, 6, 29, 8, 15, 11, 32, 21, 42, 79, 16, 10, 3, 26, 13, 14 });
        for (size_t i = 0; i < indices.size(); i++) {
            circuit_builder.create_new_range_constraint(indices[i], 79);
        }
        circuit_builder.create_dummy_constraints(indices);

        TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

        TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/false);
    }
    {
        auto circuit_builder = UltraCircuitBuilder();
        auto indices = TestFixture::add_variables(
            circuit_builder, { 1, 0, 3, 80, 5, 6, 29, 8, 15, 11, 32, 21, 42, 79, 16, 10, 3, 26, 13, 14 });
        for (size_t i = 0; i < indices.size(); i++) {
            circuit_builder.create_new_range_constraint(indices[i], 79);
        }
        circuit_builder.create_dummy_constraints(indices);

        TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

        TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/false);
    }
}

TYPED_TEST(UltraHonkTests, RangeWithGates)
{
    auto circuit_builder = UltraCircuitBuilder();
    auto idx = TestFixture::add_variables(circuit_builder, { 1, 2, 3, 4, 5, 6, 7, 8 });
    for (size_t i = 0; i < idx.size(); i++) {
        circuit_builder.create_new_range_constraint(idx[i], 8);
    }

    circuit_builder.create_add_gate({ idx[0], idx[1], circuit_builder.zero_idx, fr::one(), fr::one(), fr::zero(), -3 });
    circuit_builder.create_add_gate({ idx[2], idx[3], circuit_builder.zero_idx, fr::one(), fr::one(), fr::zero(), -7 });
    circuit_builder.create_add_gate(
        { idx[4], idx[5], circuit_builder.zero_idx, fr::one(), fr::one(), fr::zero(), -11 });
    circuit_builder.create_add_gate(
        { idx[6], idx[7], circuit_builder.zero_idx, fr::one(), fr::one(), fr::zero(), -15 });

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

    TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
}

TYPED_TEST(UltraHonkTests, RangeWithGatesWhereRangeIsNotAPowerOfTwo)
{
    auto circuit_builder = UltraCircuitBuilder();
    auto idx = TestFixture::add_variables(circuit_builder, { 1, 2, 3, 4, 5, 6, 7, 8 });
    for (size_t i = 0; i < idx.size(); i++) {
        circuit_builder.create_new_range_constraint(idx[i], 12);
    }

    circuit_builder.create_add_gate({ idx[0], idx[1], circuit_builder.zero_idx, fr::one(), fr::one(), fr::zero(), -3 });
    circuit_builder.create_add_gate({ idx[2], idx[3], circuit_builder.zero_idx, fr::one(), fr::one(), fr::zero(), -7 });
    circuit_builder.create_add_gate(
        { idx[4], idx[5], circuit_builder.zero_idx, fr::one(), fr::one(), fr::zero(), -11 });
    circuit_builder.create_add_gate(
        { idx[6], idx[7], circuit_builder.zero_idx, fr::one(), fr::one(), fr::zero(), -15 });

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

    TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
}

TYPED_TEST(UltraHonkTests, SortWidgetComplex)
{
    {

        auto circuit_builder = UltraCircuitBuilder();
        std::vector<fr> a = { 1, 3, 4, 7, 7, 8, 11, 14, 15, 15, 18, 19, 21, 21, 24, 25, 26, 27, 30, 32 };
        std::vector<uint32_t> ind;
        for (const fr& val : a)
            ind.emplace_back(circuit_builder.add_variable(val));
        circuit_builder.create_sort_constraint(ind);

        TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

        TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
    }
    {

        auto circuit_builder = UltraCircuitBuilder();
        std::vector<fr> a = { 1, 3, 4, 7, 7, 8, 16, 14, 15, 15, 18, 19, 21, 21, 24, 25, 26, 27, 30, 32 };
        std::vector<uint32_t> ind;
        for (const fr& val : a)
            ind.emplace_back(circuit_builder.add_variable(val));
        circuit_builder.create_sort_constraint(ind);

        TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

        TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/false);
    }
}

TYPED_TEST(UltraHonkTests, SortWidgetNeg)
{
    auto circuit_builder = UltraCircuitBuilder();
    fr a = fr::one();
    fr b = fr(2);
    fr c = fr(3);
    fr d = fr(8);

    auto a_idx = circuit_builder.add_variable(a);
    auto b_idx = circuit_builder.add_variable(b);
    auto c_idx = circuit_builder.add_variable(c);
    auto d_idx = circuit_builder.add_variable(d);
    circuit_builder.create_sort_constraint({ a_idx, b_idx, c_idx, d_idx });

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

    TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/false);
}

TYPED_TEST(UltraHonkTests, ComposedRangeConstraint)
{
    auto circuit_builder = UltraCircuitBuilder();
    auto c = fr::random_element();
    auto d = uint256_t(c).slice(0, 133);
    auto e = fr(d);
    auto a_idx = circuit_builder.add_variable(fr(e));
    circuit_builder.create_add_gate({ a_idx, circuit_builder.zero_idx, circuit_builder.zero_idx, 1, 0, 0, -fr(e) });
    circuit_builder.decompose_into_default_range(a_idx, 134);

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

    TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
}

TYPED_TEST(UltraHonkTests, NonNativeFieldMultiplication)
{
    using fq = fq;
    auto circuit_builder = UltraCircuitBuilder();

    fq a = fq::random_element();
    fq b = fq::random_element();
    uint256_t modulus = fq::modulus;

    uint1024_t a_big = uint512_t(uint256_t(a));
    uint1024_t b_big = uint512_t(uint256_t(b));
    uint1024_t p_big = uint512_t(uint256_t(modulus));

    uint1024_t q_big = (a_big * b_big) / p_big;
    uint1024_t r_big = (a_big * b_big) % p_big;

    uint256_t q(q_big.lo.lo);
    uint256_t r(r_big.lo.lo);

    const auto split_into_limbs = [&](const uint512_t& input) {
        constexpr size_t NUM_BITS = 68;
        std::array<fr, 4> limbs;
        limbs[0] = input.slice(0, NUM_BITS).lo;
        limbs[1] = input.slice(NUM_BITS * 1, NUM_BITS * 2).lo;
        limbs[2] = input.slice(NUM_BITS * 2, NUM_BITS * 3).lo;
        limbs[3] = input.slice(NUM_BITS * 3, NUM_BITS * 4).lo;
        return limbs;
    };

    const auto get_limb_witness_indices = [&](const std::array<fr, 4>& limbs) {
        std::array<uint32_t, 4> limb_indices;
        limb_indices[0] = circuit_builder.add_variable(limbs[0]);
        limb_indices[1] = circuit_builder.add_variable(limbs[1]);
        limb_indices[2] = circuit_builder.add_variable(limbs[2]);
        limb_indices[3] = circuit_builder.add_variable(limbs[3]);
        return limb_indices;
    };
    const uint512_t BINARY_BASIS_MODULUS = uint512_t(1) << (68 * 4);
    auto modulus_limbs = split_into_limbs(BINARY_BASIS_MODULUS - uint512_t(modulus));

    const auto a_indices = get_limb_witness_indices(split_into_limbs(uint256_t(a)));
    const auto b_indices = get_limb_witness_indices(split_into_limbs(uint256_t(b)));
    const auto q_indices = get_limb_witness_indices(split_into_limbs(uint256_t(q)));
    const auto r_indices = get_limb_witness_indices(split_into_limbs(uint256_t(r)));

    non_native_multiplication_witnesses<fr> inputs{
        a_indices, b_indices, q_indices, r_indices, modulus_limbs,
    };
    const auto [lo_1_idx, hi_1_idx] = circuit_builder.evaluate_non_native_field_multiplication(inputs);
    circuit_builder.range_constrain_two_limbs(lo_1_idx, hi_1_idx, 70, 70);

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

    TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
}

TYPED_TEST(UltraHonkTests, Rom)
{
    auto circuit_builder = UltraCircuitBuilder();

    uint32_t rom_values[8]{
        circuit_builder.add_variable(fr::random_element()), circuit_builder.add_variable(fr::random_element()),
        circuit_builder.add_variable(fr::random_element()), circuit_builder.add_variable(fr::random_element()),
        circuit_builder.add_variable(fr::random_element()), circuit_builder.add_variable(fr::random_element()),
        circuit_builder.add_variable(fr::random_element()), circuit_builder.add_variable(fr::random_element()),
    };

    size_t rom_id = circuit_builder.create_ROM_array(8);

    for (size_t i = 0; i < 8; ++i) {
        circuit_builder.set_ROM_element(rom_id, i, rom_values[i]);
    }

    uint32_t a_idx = circuit_builder.read_ROM_array(rom_id, circuit_builder.add_variable(5));
    EXPECT_EQ(a_idx != rom_values[5], true);
    uint32_t b_idx = circuit_builder.read_ROM_array(rom_id, circuit_builder.add_variable(4));
    uint32_t c_idx = circuit_builder.read_ROM_array(rom_id, circuit_builder.add_variable(1));

    const auto d_value =
        circuit_builder.get_variable(a_idx) + circuit_builder.get_variable(b_idx) + circuit_builder.get_variable(c_idx);
    uint32_t d_idx = circuit_builder.add_variable(d_value);

    circuit_builder.create_big_add_gate({
        a_idx,
        b_idx,
        c_idx,
        d_idx,
        1,
        1,
        1,
        -1,
        0,
    });
    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

    TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
}

TYPED_TEST(UltraHonkTests, Ram)
{
    auto circuit_builder = UltraCircuitBuilder();

    uint32_t ram_values[8]{
        circuit_builder.add_variable(fr::random_element()), circuit_builder.add_variable(fr::random_element()),
        circuit_builder.add_variable(fr::random_element()), circuit_builder.add_variable(fr::random_element()),
        circuit_builder.add_variable(fr::random_element()), circuit_builder.add_variable(fr::random_element()),
        circuit_builder.add_variable(fr::random_element()), circuit_builder.add_variable(fr::random_element()),
    };

    size_t ram_id = circuit_builder.create_RAM_array(8);

    for (size_t i = 0; i < 8; ++i) {
        circuit_builder.init_RAM_element(ram_id, i, ram_values[i]);
    }

    uint32_t a_idx = circuit_builder.read_RAM_array(ram_id, circuit_builder.add_variable(5));
    EXPECT_EQ(a_idx != ram_values[5], true);

    uint32_t b_idx = circuit_builder.read_RAM_array(ram_id, circuit_builder.add_variable(4));
    uint32_t c_idx = circuit_builder.read_RAM_array(ram_id, circuit_builder.add_variable(1));

    circuit_builder.write_RAM_array(ram_id, circuit_builder.add_variable(4), circuit_builder.add_variable(500));
    uint32_t d_idx = circuit_builder.read_RAM_array(ram_id, circuit_builder.add_variable(4));

    EXPECT_EQ(circuit_builder.get_variable(d_idx), 500);

    // ensure these vars get used in another arithmetic gate
    const auto e_value = circuit_builder.get_variable(a_idx) + circuit_builder.get_variable(b_idx) +
                         circuit_builder.get_variable(c_idx) + circuit_builder.get_variable(d_idx);
    uint32_t e_idx = circuit_builder.add_variable(e_value);

    circuit_builder.create_big_add_gate(
        {
            a_idx,
            b_idx,
            c_idx,
            d_idx,
            -1,
            -1,
            -1,
            -1,
            0,
        },
        true);
    circuit_builder.create_big_add_gate(
        {
            circuit_builder.zero_idx,
            circuit_builder.zero_idx,
            circuit_builder.zero_idx,
            e_idx,
            0,
            0,
            0,
            0,
            0,
        },
        false);

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

    TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
}

TYPED_TEST(UltraHonkTests, RangeChecksOnDuplicates)
{
    auto circuit_builder = UltraCircuitBuilder();

    uint32_t a = circuit_builder.add_variable(100);
    uint32_t b = circuit_builder.add_variable(100);
    uint32_t c = circuit_builder.add_variable(100);
    uint32_t d = circuit_builder.add_variable(100);

    circuit_builder.assert_equal(a, b);
    circuit_builder.assert_equal(a, c);
    circuit_builder.assert_equal(a, d);

    circuit_builder.create_new_range_constraint(a, 1000);
    circuit_builder.create_new_range_constraint(b, 1001);
    circuit_builder.create_new_range_constraint(c, 999);
    circuit_builder.create_new_range_constraint(d, 1000);

    circuit_builder.create_big_add_gate(
        {
            a,
            b,
            c,
            d,
            0,
            0,
            0,
            0,
            0,
        },
        false);

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

    TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
}

// Ensure copy constraints added on variables smaller than 2^14, which have been previously
// range constrained, do not break the set equivalence checks because of indices mismatch.
// 2^14 is DEFAULT_PLOOKUP_RANGE_BITNUM i.e. the maximum size before a variable gets sliced
// before range constraints are applied to it.
TYPED_TEST(UltraHonkTests, RangeConstraintSmallVariable)
{
    auto circuit_builder = UltraCircuitBuilder();

    uint16_t mask = (1 << 8) - 1;
    int a = engine.get_random_uint16() & mask;
    uint32_t a_idx = circuit_builder.add_variable(fr(a));
    uint32_t b_idx = circuit_builder.add_variable(fr(a));
    ASSERT_NE(a_idx, b_idx);
    uint32_t c_idx = circuit_builder.add_variable(fr(a));
    ASSERT_NE(c_idx, b_idx);
    circuit_builder.create_range_constraint(b_idx, 8, "bad range");
    circuit_builder.assert_equal(a_idx, b_idx);
    circuit_builder.create_range_constraint(c_idx, 8, "bad range");
    circuit_builder.assert_equal(a_idx, c_idx);

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

    TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
}
