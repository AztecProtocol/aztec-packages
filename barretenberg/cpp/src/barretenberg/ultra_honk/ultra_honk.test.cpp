#include "ultra_honk.test.hpp"
#include "barretenberg/honk/proof_length.hpp"
#include "barretenberg/honk/relation_checker.hpp"
#include "barretenberg/honk/utils/honk_key_gen.hpp"
#include "barretenberg/ultra_honk/oink_prover.hpp"

#include <gtest/gtest.h>
#include <sstream>

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

/**
 * @brief Test that a truncated proof is rejected with a clear error message
 * @details When a proof is too short, the verifier should detect this before
 *          unsigned integer underflow occurs in derive_num_public_inputs.
 */
TYPED_TEST(UltraHonkTests, TooShortProofRejected)
{
    using Flavor = TypeParam;
    using IO = typename TestFixture::IO;
    using Builder = typename Flavor::CircuitBuilder;
    using Prover = UltraProver_<Flavor>;
    using ProverInstance = ProverInstance_<Flavor>;
    using VerificationKey = typename Flavor::VerificationKey;
    using VKAndHash = typename Flavor::VKAndHash;
    using Verifier = UltraVerifier_<Flavor, IO>;
    using Proof = typename Flavor::Transcript::Proof;

    // Create a simple circuit and produce a valid proof
    Builder builder;
    MockCircuits::add_arithmetic_gates(builder);
    this->set_default_pairing_points_and_ipa_claim_and_proof(builder);

    auto prover_instance = std::make_shared<ProverInstance>(builder);
    auto vk = std::make_shared<VerificationKey>(prover_instance->get_precomputed());

    Prover prover(prover_instance, vk);
    auto proof = prover.construct_proof();

    // Truncate the proof by removing the last 10 elements
    Proof truncated_proof(proof.begin(), proof.end() - 10);

    auto vk_and_hash = std::make_shared<VKAndHash>(vk);
    Verifier verifier(vk_and_hash);
    EXPECT_THROW_WITH_MESSAGE(verifier.verify_proof(truncated_proof), "Proof size too small");
}

/**
 * @brief Test that a proof with extra elements appended is rejected
 * @details When a proof is too long, the derived num_public_inputs will be wrong,
 *          causing a mismatch with the VK's expected value.
 */
TYPED_TEST(UltraHonkTests, TooLongProofRejected)
{
    using Flavor = TypeParam;
    using IO = typename TestFixture::IO;
    using Builder = typename Flavor::CircuitBuilder;
    using Prover = UltraProver_<Flavor>;
    using ProverInstance = ProverInstance_<Flavor>;
    using VerificationKey = typename Flavor::VerificationKey;
    using VKAndHash = typename Flavor::VKAndHash;
    using Verifier = UltraVerifier_<Flavor, IO>;
    using Proof = typename Flavor::Transcript::Proof;
    using FF = typename Flavor::FF;

    // Create a simple circuit and produce a valid proof
    Builder builder;
    MockCircuits::add_arithmetic_gates(builder);
    this->set_default_pairing_points_and_ipa_claim_and_proof(builder);

    auto prover_instance = std::make_shared<ProverInstance>(builder);
    auto vk = std::make_shared<VerificationKey>(prover_instance->get_precomputed());

    Prover prover(prover_instance, vk);
    auto proof = prover.construct_proof();

    // Append extra elements to the proof
    Proof extended_proof(proof);
    for (size_t i = 0; i < 10; i++) {
        extended_proof.push_back(FF::random_element());
    }

    auto vk_and_hash = std::make_shared<VKAndHash>(vk);
    Verifier verifier(vk_and_hash);
    EXPECT_THROW_WITH_MESSAGE(verifier.verify_proof(extended_proof), "num_public_inputs mismatch");
}

/**
 * @brief Test that the dyadic size correctly jumps to the next power of 2 when the trace would otherwise
 * place lagrange_last in the ZK masking region.
 * @details For ZK flavors, the first NUM_MASKED_ROWS rows are overwritten with random values for zero-knowledge.
 * We incrementally add gates until the dyadic size doubles, verifying at each step that:
 *   (1) lagrange_last (at final_active_wire_idx) does not overlap the masking area
 *   (2) sufficient headroom exists for disabled rows
 *   (3) at the boundary, the dyadic size doubles because the previous power of 2 was too small
 * At the tightest packing (right before the jump), we also prove-and-verify.
 */
TYPED_TEST(UltraHonkTests, DyadicSizeJumpsToProtectMaskingArea)
{
    using Flavor = TypeParam;
    if constexpr (!Flavor::HasZK) {
        GTEST_SKIP() << "Masking area only exists for ZK flavors";
    } else {
        using Builder = typename Flavor::CircuitBuilder;
        using ProverInstance = ProverInstance_<Flavor>;

        // Determine the baseline dyadic size (pairing points + finalization overhead, no user gates)
        Builder baseline_builder;
        this->set_default_pairing_points_and_ipa_claim_and_proof(baseline_builder);
        auto baseline_instance = std::make_shared<ProverInstance>(baseline_builder);
        const size_t baseline_dyadic = baseline_instance->dyadic_size();

        // The disabled head region (rows 0..TRACE_OFFSET-1)
        // is always present. Verify that the active trace starts after the disabled region and that
        // the dyadic size doubles when the trace gets tightly packed.
        size_t prev_dyadic = 0;
        bool found_jump = false;
        for (size_t num_extra_gates = 0; num_extra_gates <= baseline_dyadic; num_extra_gates++) {
            Builder builder;
            if (num_extra_gates > 0) {
                MockCircuits::add_arithmetic_gates(builder, num_extra_gates);
            }
            this->set_default_pairing_points_and_ipa_claim_and_proof(builder);

            auto prover_instance = std::make_shared<ProverInstance>(builder);

            const size_t dyadic_size = prover_instance->dyadic_size();
            const size_t final_active_idx = prover_instance->get_final_active_wire_idx();

            // Invariant: active trace doesn't overlap the disabled head region
            ASSERT_GE(final_active_idx, ProverInstance::TRACE_OFFSET)
                << "final_active_idx (" << final_active_idx << ") is within the disabled head region";

            if (prev_dyadic != 0 && dyadic_size > prev_dyadic) {
                // Dyadic size should exactly double
                EXPECT_EQ(dyadic_size, 2 * prev_dyadic);

                // Prove and verify at the tightest packing (right before the jump)
                Builder tight_builder;
                MockCircuits::add_arithmetic_gates(tight_builder, num_extra_gates - 1);
                this->set_default_pairing_points_and_ipa_claim_and_proof(tight_builder);
                auto tight_instance = std::make_shared<ProverInstance>(tight_builder);
                this->prove_and_verify(tight_instance, /*expected_result=*/true);

                found_jump = true;
                break;
            }

            prev_dyadic = dyadic_size;
        }

        EXPECT_TRUE(found_jump) << "should have found a dyadic size jump within " << baseline_dyadic << " extra gates";
    }
}

/**
 * @brief Verify that dyadic circuit size accounts for lookup tables placed at the lookup block's trace offset.
 * @details Tables are allocated starting at lookup.trace_offset() (>= TRACE_OFFSET). The dyadic size must be large
 * enough to contain them. This test populates a XOR lookup table and checks that the offset is past the disabled
 * region and the dyadic size accommodates tables_end = table_offset + tables_size.
 */
TYPED_TEST(UltraHonkTests, DyadicSizeAccountsForTableOffset)
{
    using Flavor = TypeParam;
    using Builder = typename Flavor::CircuitBuilder;
    using IO = typename TestFixture::IO;

    // Test with several lookup table types of varying sizes
    for (auto table_id : { plookup::MultiTableId::UINT32_XOR,
                           plookup::MultiTableId::UINT32_AND,
                           plookup::MultiTableId::SHA256_CH_INPUT }) {
        auto builder = Builder{};
        uint32_t left_idx = builder.add_variable(fr(engine.get_random_uint32()));
        uint32_t right_idx = builder.add_variable(fr(engine.get_random_uint32()));
        auto accumulators = plookup::get_lookup_accumulators(
            table_id, builder.get_variable(left_idx), builder.get_variable(right_idx), true);
        builder.create_gates_from_plookup_accumulators(table_id, accumulators, left_idx, right_idx);
        IO::add_default(builder);

        auto prover_instance = std::make_shared<ProverInstance_<Flavor>>(builder);

        const size_t tables_size = builder.get_tables_size();
        ASSERT_GT(tables_size, 0) << "expected non-empty lookup tables";

        const size_t table_offset = builder.blocks.lookup.trace_offset();
        const size_t tables_end = table_offset + tables_size;

        EXPECT_GE(table_offset, ProverInstance_<Flavor>::TRACE_OFFSET)
            << "lookup block should be past the disabled region";
        EXPECT_GE(prover_instance->dyadic_size(), tables_end)
            << "dyadic size (" << prover_instance->dyadic_size() << ") must accommodate tables_end (" << tables_end
            << ") for table_offset=" << table_offset << " tables_size=" << tables_size;
    }
}

/**
 * @brief Verify that witness polynomials have masking values in the reserved head region.
 * @details Wires, z_perm, and lookup polynomials should have non-zero random values at rows 1..NUM_MASKED_ROWS.
 */
TYPED_TEST(UltraHonkTests, WitnessPolynomialsMasked)
{
    using Flavor = TypeParam;
    if constexpr (!Flavor::HasZK) {
        GTEST_SKIP() << "Masking only applies to ZK flavors";
    } else {
        using Builder = typename Flavor::CircuitBuilder;
        using IO = typename TestFixture::IO;

        auto builder = Builder{};
        IO::add_default(builder);
        auto prover_instance = std::make_shared<ProverInstance_<Flavor>>(builder);

        auto check_masked = [](const auto& poly, const std::string& label) {
            bool has_masking = false;
            for (size_t j = 0; j < NUM_MASKED_ROWS; j++) {
                has_masking |= !poly[NUM_ZERO_ROWS + j].is_zero();
            }
            EXPECT_TRUE(has_masking) << label << " should be masked";
        };

        auto& polys = prover_instance->polynomials;
        check_masked(polys.w_l(), "w_l");
        check_masked(polys.w_r(), "w_r");
        check_masked(polys.w_o(), "w_o");
        check_masked(polys.w_4(), "w_4");
        check_masked(polys.z_perm(), "z_perm");
        check_masked(polys.lookup_read_counts(), "lookup_read_counts");
        check_masked(polys.lookup_read_tags(), "lookup_read_tags");
        check_masked(polys.lookup_inverses(), "lookup_inverses");
    }
}

/**
 * @brief Verify that REPEATED_COMMITMENTS indices correctly pair to-be-shifted and shifted commitments.
 * @details Mirrors the Shplemini vector construction: [Q, unshifted..., to_be_shifted...] with
 * offset = HasZK ? 2 : 1, then checks the same index pairs that remove_repeated_commitments asserts.
 */
TYPED_TEST(UltraHonkTests, RepeatedCommitmentsIndicesCorrect)
{
    using Flavor = TypeParam;
    using Builder = typename Flavor::CircuitBuilder;
    using IO = typename TestFixture::IO;
    using CommitmentKey = typename Flavor::CommitmentKey;
    using Commitment = typename Flavor::Commitment;

    auto builder = Builder{};
    IO::add_default(builder);
    auto prover_instance = std::make_shared<ProverInstance_<Flavor>>(builder);
    CommitmentKey ck(prover_instance->dyadic_size());

    auto unshifted = prover_instance->polynomials.get_unshifted();
    auto to_be_shifted = prover_instance->polynomials.get_to_be_shifted();

    constexpr auto repeated = Flavor::REPEATED_COMMITMENTS;
    ASSERT_EQ(to_be_shifted.size(), repeated.first.count);

    // Build the commitment vector exactly as Shplemini does: [Q, unshifted..., to_be_shifted...]
    std::vector<Commitment> commitments;
    commitments.push_back(Commitment::one()); // dummy Q
    for (auto& poly : unshifted) {
        commitments.push_back(ck.commit(poly));
    }
    for (auto& poly : to_be_shifted) {
        commitments.push_back(ck.commit(poly));
    }

    // Same offset logic as remove_repeated_commitments
    constexpr size_t offset = Flavor::HasZK ? 2 : 1;
    for (size_t i = 0; i < repeated.first.count; i++) {
        EXPECT_EQ(commitments[repeated.first.original_start + offset + i],
                  commitments[repeated.first.duplicate_start + offset + i])
            << "REPEATED_COMMITMENTS commitment mismatch at index " << i;
    }
}

namespace {
size_t count_occurrences(const std::string& haystack, const std::string& needle)
{
    size_t count = 0;
    for (size_t pos = haystack.find(needle); pos != std::string::npos;
         pos = haystack.find(needle, pos + needle.size())) {
        ++count;
    }
    return count;
}
} // namespace

// Finding #1: the Solidity VK generator hand-codes the G1 emission list. Couple the number of
// emitted G1 points to the flavor's precomputed entity count so the list cannot silently drift.
TEST(HonkKeyGen, EmittedG1CountMatchesPrecomputedEntities)
{
    using VerificationKey = UltraKeccakFlavor::VerificationKey;
    auto vk = std::make_shared<VerificationKey>();

    std::ostringstream os;
    output_vk_sol_ultra_honk(os, vk, "TestHonkVerificationKey", /*include_types_import=*/true);

    EXPECT_EQ(count_occurrences(os.str(), "Honk.G1Point"), VerificationKey::size());
}
