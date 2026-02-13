#include "ultra_honk.test.hpp"
#include "barretenberg/honk/proof_length.hpp"
#include "barretenberg/honk/relation_checker.hpp"

#include <gtest/gtest.h>

using namespace bb;

using AggregationState = stdlib::recursion::PairingPoints<UltraCircuitBuilder>;

#ifdef STARKNET_GARAGA_FLAVORS
using FlavorTypes = testing::Types<UltraFlavor,
                                   UltraZKFlavor,
                                   UltraKeccakFlavor,
                                   UltraKeccakZKFlavor,
                                   UltraStarknetFlavor,
                                   UltraStarknetZKFlavor>;
#else
using FlavorTypes = testing::Types<UltraFlavor, UltraZKFlavor, UltraKeccakFlavor, UltraKeccakZKFlavor>;
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
TYPED_TEST(UltraHonkTests, ProofLengthCheck)
{
    using Flavor = TypeParam;
    using Builder = Flavor::CircuitBuilder;
    using IO = typename TestFixture::IO;
    using Proof = typename Flavor::Transcript::Proof;

    auto builder = Builder{};
    IO::add_default(builder);
    // Construct a UH proof and ensure its size matches expectation; if not, the constant may need to be updated
    auto prover_instance = std::make_shared<ProverInstance_<Flavor>>(builder);
    auto verification_key = std::make_shared<typename Flavor::VerificationKey>(prover_instance->get_precomputed());
    UltraProver_<Flavor> prover(prover_instance, verification_key);
    Proof ultra_proof = prover.construct_proof();
    const size_t virtual_log_n = Flavor::USE_PADDING ? CONST_PROOF_SIZE_LOG_N : prover_instance->log_dyadic_size();
    size_t expected_proof_length =
        ProofLength::Honk<Flavor>::LENGTH_WITHOUT_PUB_INPUTS(virtual_log_n) + IO::PUBLIC_INPUTS_SIZE;
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

    auto prover_instance = std::make_shared<typename TestFixture::ProverInstance>(circuit_builder);
    auto verification_key = std::make_shared<typename TypeParam::VerificationKey>(prover_instance->get_precomputed());
    typename TestFixture::Prover prover(prover_instance, verification_key);
    auto proof = prover.construct_proof();
    auto& polynomials = prover_instance->polynomials;

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

    circuit_builder.create_ecc_add_gate({ x1, y1, x2, y2, x3, y3, /*is_addition=*/true });

    p3 = affine_element(element(p1) + element(p2));
    x3 = circuit_builder.add_variable(p3.x);
    y3 = circuit_builder.add_variable(p3.y);
    circuit_builder.create_ecc_add_gate({ x1, y1, x2, y2, x3, y3, /*is_addition=*/true });

    p3 = affine_element(element(p1) - element(p2));
    x3 = circuit_builder.add_variable(p3.x);
    y3 = circuit_builder.add_variable(p3.y);
    circuit_builder.create_ecc_add_gate({ x1, y1, x2, y2, x3, y3, /*is_addition=*/false });

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

    // Range constrain the lo and hi carry outputs
    const bool is_low_70_bits = uint256_t(circuit_builder.get_variable(lo_1_idx)).get_msb() < 70;
    const bool is_high_70_bits = uint256_t(circuit_builder.get_variable(hi_1_idx)).get_msb() < 70;
    if (is_low_70_bits && is_high_70_bits) {
        // Uses more efficient NNF range check if both limbs are < 2^70
        circuit_builder.range_constrain_two_limbs(lo_1_idx, hi_1_idx, 70, 70);
    } else {
        // Fallback to default range checks
        circuit_builder.create_limbed_range_constraint(lo_1_idx, 72);
        circuit_builder.create_limbed_range_constraint(hi_1_idx, 72);
    }

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

    TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
}

TYPED_TEST(UltraHonkTests, RangeChecksOnDuplicates)
{
    auto circuit_builder = UltraCircuitBuilder();

    uint32_t a = circuit_builder.add_variable(fr(100));
    uint32_t b = circuit_builder.add_variable(fr(100));
    uint32_t c = circuit_builder.add_variable(fr(100));
    uint32_t d = circuit_builder.add_variable(fr(100));

    circuit_builder.assert_equal(a, b);
    circuit_builder.assert_equal(a, c);
    circuit_builder.assert_equal(a, d);

    circuit_builder.create_small_range_constraint(a, 1000);
    circuit_builder.create_small_range_constraint(b, 1001);
    circuit_builder.create_small_range_constraint(c, 999);
    circuit_builder.create_small_range_constraint(d, 1000);

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
    circuit_builder.create_dyadic_range_constraint(b_idx, 8, "bad range");
    circuit_builder.assert_equal(a_idx, b_idx);
    circuit_builder.create_dyadic_range_constraint(c_idx, 8, "bad range");
    circuit_builder.assert_equal(a_idx, c_idx);

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

    TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
}

/**
 * @brief Test that native verifier detects VK hash mismatch
 * @details The VKAndHash stores a precomputed hash of the VK. During verification,
 * the oink verifier computes a fresh hash and compares it. If they don't match,
 * a BB_ASSERT_EQ should trigger, catching potential VK tampering or corruption.
 */
TYPED_TEST(UltraHonkTests, NativeVKHashMismatchDetected)
{
    using Flavor = TypeParam;
    using IO = typename TestFixture::IO;
    using Builder = typename Flavor::CircuitBuilder;
    using Prover = UltraProver_<Flavor>;
    using ProverInstance = ProverInstance_<Flavor>;
    using VerificationKey = typename Flavor::VerificationKey;
    using VKAndHash = typename Flavor::VKAndHash;
    using Verifier = UltraVerifier_<Flavor, IO>;

    // Create a simple circuit
    Builder builder;
    MockCircuits::add_arithmetic_gates(builder);
    this->set_default_pairing_points_and_ipa_claim_and_proof(builder);

    // Create prover instance and VK
    auto prover_instance = std::make_shared<ProverInstance>(builder);
    auto vk = std::make_shared<VerificationKey>(prover_instance->get_precomputed());

    // Create prover and prove
    Prover prover(prover_instance, vk);
    auto proof = prover.construct_proof();
    auto vk_and_hash = std::make_shared<VKAndHash>(vk);

    // Corrupt the stored hash
    vk_and_hash->hash = fr::random_element();

    // Verification should fail with BB_ASSERT_EQ detecting the mismatch
    Verifier verifier(vk_and_hash);
    EXPECT_THROW_WITH_MESSAGE(verifier.verify_proof(proof), "VK Hash Mismatch");
}
