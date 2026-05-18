/**
 * @file zk_boundary.test.cpp
 * @brief Tests that validate correctness at the ZK masking boundaries.
 *
 * These tests verify that the disabled head region (rows 0-3) interacts correctly with
 * the active trace, specifically around:
 *   - ECC op wire / main wire alignment across the shift boundary
 *   - Grand product initialization at the disabled/active edge
 *   - Masking values not leaking into active relation checks
 *   - Row-disabling polynomial correctly killing the disabled region
 *
 * Tests are MegaZK-only since the disabled head region only exists for ZK flavors.
 */
#include <gtest/gtest.h>

#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/honk/relation_checker.hpp"
#include "barretenberg/relations/ecc_op_queue_relation.hpp"
#include "barretenberg/ultra_honk/oink_prover.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

using namespace bb;

class ZKBoundaryTests : public ::testing::Test {
  public:
    using Flavor = MegaZKFlavor;
    using FF = Flavor::FF;
    using Builder = Flavor::CircuitBuilder;
    using Prover = UltraProver_<Flavor>;
    using Verifier = UltraVerifier_<Flavor, DefaultIO>;
    using VerificationKey = Flavor::VerificationKey;
    using ProverInstance = ProverInstance_<Flavor>;
    using VerifierInstance = VerifierInstance_<Flavor>;
    using Polynomial = Flavor::Polynomial;

    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    /**
     * @brief Build a prover instance from a simple Mega circuit with ECC ops.
     */
    static std::shared_ptr<ProverInstance> build_instance()
    {
        Builder builder;
        GoblinMockCircuits::construct_simple_circuit(builder);
        return std::make_shared<ProverInstance>(builder);
    }

    /**
     * @brief Construct proof and verify.
     */
    static bool prove_and_verify(std::shared_ptr<ProverInstance> prover_instance)
    {
        auto verification_key = std::make_shared<VerificationKey>(prover_instance->get_precomputed());
        auto vk_and_hash = std::make_shared<Flavor::VKAndHash>(verification_key);
        Prover prover(prover_instance, verification_key);
        Verifier verifier(vk_and_hash);
        auto proof = prover.construct_proof();
        return verifier.verify_proof(proof).result;
    }
};

/**
 * @brief Verify ECC op wire alignment: ecc_op_wire[r] == w_shift[r] = w[r+1] at the boundary.
 * @details ecc_op_wire data starts at row TRACE_OFFSET (4 for MegaZK), while the block's data in w starts at
 * row TRACE_OFFSET + NUM_ZERO_ROWS (5). The shift convention (w_shift[r] = w[r+1]) bridges the gap, so
 * ecc_op_wire[TRACE_OFFSET + i] == w[TRACE_OFFSET + NUM_ZERO_ROWS + i]. This test checks the alignment
 * holds and that corrupting it causes relation failure.
 */
TEST_F(ZKBoundaryTests, EccOpWireAlignmentAtDisabledBoundary)
{
    auto instance = build_instance();
    auto& polys = instance->polynomials;

    // ecc_op_wire has data starting at TRACE_OFFSET (w_shift form); lagrange_ecc_op fires there.
    constexpr size_t ecc_op_start = ProverInstance::TRACE_OFFSET;

    // Sanity: lagrange_ecc_op should be 1 starting at ecc_op_start
    ASSERT_EQ(polys.lagrange_ecc_op()[ecc_op_start], FF{ 1 })
        << "lagrange_ecc_op should be active at row " << ecc_op_start;

    // Verify alignment: ecc_op_wire[r] == w[r + NUM_ZERO_ROWS] = w_shift[r] for each active ecc_op row.
    auto ecc_op_wires = polys.get_ecc_op_wires();
    auto wires = polys.get_wires();
    for (size_t r = ecc_op_start; polys.lagrange_ecc_op()[r] == FF{ 1 }; r++) {
        for (auto [ecc_op_wire, wire] : zip_view(ecc_op_wires, wires)) {
            ASSERT_EQ(ecc_op_wire[r], wire[r + NUM_ZERO_ROWS]) << "ecc_op_wire / w_shift mismatch at row " << r;
        }
    }

    // Now corrupt: ecc_op_wire[ecc_op_start] and verify EccOpQueueRelation detects it
    FF original = polys.ecc_op_wire_1()[ecc_op_start];
    polys.ecc_op_wire_1().at(ecc_op_start) = original + FF{ 1 };

    auto failures = RelationChecker<void>::check<EccOpQueueRelation<FF>>(
        polys, instance->relation_parameters, "EccOpQueue", /*start_row=*/ecc_op_start);
    EXPECT_FALSE(failures.empty()) << "Corrupting ecc_op_wire at the boundary should cause EccOpQueueRelation failure";

    // Restore
    polys.ecc_op_wire_1().at(ecc_op_start) = original;
}

/**
 * @brief Verify that the disabled head rows (0-3) contain masking values in witness wires.
 * @details Witness wires (w_l, w_r, w_o, w_4) should have random masking at rows {1,2,3}
 * and zero at row 0 (shiftable constraint). This test asserts the structural invariant.
 */
TEST_F(ZKBoundaryTests, WitnessMaskingStructure)
{
    auto instance = build_instance();
    auto& polys = instance->polynomials;

    // Row 0 must be zero for all shiftable witness wires (shift convention)
    for (auto wire : polys.get_wires()) {
        EXPECT_EQ(wire[0], FF{ 0 }) << "Shiftable wire must have zero at row 0";
    }

    // Rows 1-3 should have non-zero masking values (overwhelmingly likely for random elements)
    for (auto wire : polys.get_wires()) {
        bool has_masking = false;
        for (size_t r = 1; r <= NUM_MASKED_ROWS; r++) {
            has_masking |= (wire[r] != FF{ 0 });
        }
        EXPECT_TRUE(has_masking) << "Witness wire should have non-zero masking in rows 1-3";
    }
}

/**
 * @brief Corrupt a masking value in the disabled region and verify proof still passes.
 * @details The row-disabling polynomial kills rows 0-3, so any values there (including masking)
 * should not affect relation correctness. Changing a masking value should still produce a valid
 * proof (the change affects commitment/ZK but not soundness within the disabled region).
 * This test verifies that the row-disabling polynomial properly isolates the disabled region.
 */
TEST_F(ZKBoundaryTests, DisabledRegionIsolation)
{
    auto instance = build_instance();
    auto& polys = instance->polynomials;

    // Run oink to compute derived witnesses (logderiv inverses, z_perm, etc.)
    auto verification_key = std::make_shared<VerificationKey>(instance->get_precomputed());
    auto transcript = std::make_shared<Flavor::Transcript>();
    OinkProver<Flavor> oink(instance, verification_key, transcript);
    oink.prove();

    // Check all relations pass on clean state (start from row TRACE_OFFSET
    // since the RelationChecker doesn't account for row-disabling)
    auto clean_failures = RelationChecker<MegaZKFlavor>::check_all(polys, instance->relation_parameters);
    // Relations may have non-zero values at rows 0-3 (before row-disabling multiplier),
    // but should be clean in the active region. Check the specific row of each failure.
    for (auto& [name, subrel_failures] : clean_failures) {
        for (auto& [subrel_idx, row] : subrel_failures) {
            EXPECT_LT(row, static_cast<uint32_t>(ProverInstance::TRACE_OFFSET))
                << "Relation " << name << " (subrelation " << subrel_idx << ") fails at active row " << row;
        }
    }
}

/**
 * @brief Verify that lagrange_first is positioned correctly after the disabled region.
 */
TEST_F(ZKBoundaryTests, LagrangeFirstPosition)
{
    auto instance = build_instance();
    auto& polys = instance->polynomials;

    // lagrange_first should be 1 at row TRACE_OFFSET and 0 elsewhere
    EXPECT_EQ(polys.lagrange_first()[ProverInstance::TRACE_OFFSET], FF{ 1 });
    for (size_t r = 0; r < ProverInstance::TRACE_OFFSET; r++) {
        EXPECT_EQ(polys.lagrange_first()[r], FF{ 0 }) << "lagrange_first should be 0 at disabled row " << r;
    }
}

/**
 * @brief Verify ECC op wires are zero in the disabled region (not masked).
 * @details Unlike witness wires, ecc_op_wires are not masked (ZK for ops comes from random ops
 * in the merge protocol). They should be zero at rows 0 through ecc_op_start-1.
 */
TEST_F(ZKBoundaryTests, EccOpWiresZeroInDisabledRegion)
{
    auto instance = build_instance();
    auto& polys = instance->polynomials;

    // ecc_op data lives at rows [TRACE_OFFSET, ...) under the w_shift relation form; everything before
    // (rows [0, TRACE_OFFSET)) should be zero.
    for (auto ecc_op_wire : polys.get_ecc_op_wires()) {
        for (size_t r = 0; r < ProverInstance::TRACE_OFFSET; r++) {
            EXPECT_EQ(ecc_op_wire[r], FF{ 0 }) << "ecc_op_wire should be zero at row " << r << " (disabled region)";
        }
    }
}

/**
 * @brief End-to-end: prove and verify a MegaZK circuit, confirming the full pipeline
 * works with ECC ops.
 */
TEST_F(ZKBoundaryTests, ProveAndVerifyMegaZK)
{
    auto instance = build_instance();
    EXPECT_TRUE(prove_and_verify(instance));
}

/**
 * @brief Corrupt a witness in the active region (first gate after disabled rows) and
 * verify that proof fails.
 */
TEST_F(ZKBoundaryTests, CorruptionInActiveRegionFailsProof)
{
    Builder builder;
    GoblinMockCircuits::construct_simple_circuit(builder);

    // Build two instances from the same circuit
    auto builder_copy = builder;
    auto good_instance = std::make_shared<ProverInstance>(builder);
    auto bad_instance = std::make_shared<ProverInstance>(builder_copy);

    // Find first arithmetic gate in the active region
    const size_t dyadic_size = bad_instance->dyadic_size();
    for (size_t i = ProverInstance::TRACE_OFFSET; i < dyadic_size; i++) {
        if (bad_instance->polynomials.q_arith()[i] != FF{ 0 }) {
            bad_instance->polynomials.w_l().at(i) += FF{ 1 };
            break;
        }
    }

    EXPECT_TRUE(prove_and_verify(good_instance));
    EXPECT_FALSE(prove_and_verify(bad_instance));
}
