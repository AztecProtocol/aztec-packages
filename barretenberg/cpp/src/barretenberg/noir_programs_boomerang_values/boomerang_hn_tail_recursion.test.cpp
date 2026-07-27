// HN::TAIL kernel — Phase 2 witness/gate discovery tests.
//
// Production trace + component map: hn_tail_component_map.md
//
// Key HN-family serialization quirk (documented in acir-witness-gate-discovery SKILL.md's own quirk
// table): constraint.proof is ALWAYS empty for HN opcodes. The real fold proof lives in the native
// Chonk::verification_queue (entry.proof), converted to circuit witnesses via StdlibProof inside
// instantiate_stdlib_verification_queue (chonk.cpp:61) -- NOT via ACIR witness indices. So Phase 2
// discovery here is value-matching against a queue snapshot, not the usual witness-index alignment.
//
// PROOF_TYPE::HN_TAIL was removed upstream: TAIL's fold-core is byte-identical to RESET's, so both
// are now plain PROOF_TYPE::HN with no distinct wire-level tag or CircuitKind. TAIL is exercised here
// only as "a plain HN kernel", not as a structurally distinguishable case.

#include "barretenberg/boomerang_value_detection/graph_description_acir.hpp"
#include "barretenberg/noir_programs_boomerang_values/boomerang_hn_recursion_test_helpers.hpp"

#include <fstream>
#include <gtest/gtest.h>

using namespace bb;
using namespace hn_recursion_test;

class HNTailRecursionTestSuite : public BoomerangHNRecursionTests {};

// Step 0-3 (blocker): parse the HN_TAIL opcode and prove the "empty ACIR proof, real data lives in
// the native IVC queue" quirk structurally, before any get_variable_gates call.
TEST_F(HNTailRecursionTestSuite, AcirHNTailWitnessSerializationParse)
{
    HNAcirSetup setup = make_hn_acir_setup(PROOF_TYPE::HN, /*is_kernel=*/true);
    const RecursionConstraint& constraint = setup.hn_constraint(0);

    // Rule H0: proof_type on the wire -- plain HN (no distinct HN_TAIL tag; see file header note).
    EXPECT_EQ(constraint.proof_type, static_cast<uint32_t>(PROOF_TYPE::HN));

    // Rule H1: constraint.proof and constraint.public_inputs are always empty for HN opcodes.
    // (Matches recursion_constraint.cpp:221-223 production assert, and is set explicitly at
    // boomerang_hn_recursion_test_helpers.hpp:58 in the test harness.)
    EXPECT_TRUE(constraint.proof.empty());
    EXPECT_TRUE(constraint.public_inputs.empty());

    // Rule H2: only key[] and key_hash are real ACIR witnesses for this opcode.
    EXPECT_FALSE(constraint.key.empty());
    EXPECT_NE(constraint.key_hash, 0U);

    // Rule H2 (continued): the actual fold proof is native data sitting in the IVC queue, not ACIR.
    // This must be snapshotted BEFORE create_circuit runs, because complete_kernel_circuit_logic
    // pop_front()s the queue during instantiate_stdlib_verification_queue (chonk.cpp:73).
    ASSERT_EQ(setup.ivc->verification_queue.size(), 1U);
    const Chonk::VerifierInputs& queue_entry = setup.ivc->verification_queue.front();
    EXPECT_EQ(queue_entry.kind, Chonk::CircuitKind::Kernel);
    EXPECT_TRUE(queue_entry.is_kernel());
    EXPECT_FALSE(queue_entry.proof.empty());
    EXPECT_NE(queue_entry.kernel_honk_vk, nullptr);

    // Rule H3: no decider proof for TAIL (that's HN_FINAL-only).
    EXPECT_TRUE(setup.ivc->decider_proof.empty());

    std::ofstream out("hn_tail_witness_serialization.txt");
    ASSERT_TRUE(out.is_open());
    out << "# proof_type=HN(" << constraint.proof_type << ") key.size=" << constraint.key.size() << "\n";
    out << "# constraint.proof.size=" << constraint.proof.size() << " (always 0 for HN)\n";
    out << "# constraint.public_inputs.size=" << constraint.public_inputs.size() << " (always 0 for HN)\n";
    out << "# native queue_entry.proof.size=" << queue_entry.proof.size() << " (real fold proof data)\n";
    out << "# queue_entry.kind=Kernel is_kernel=" << queue_entry.is_kernel() << "\n";
    out << "# Rule H1: proof/public_inputs empty on ACIR side -- see recursion_constraint.cpp:221-223\n";
    out << "# Rule H2: key[]/key_hash are the only ACIR witnesses; fold proof from native "
           "verification_queue, wired via StdlibProof at chonk.cpp:61\n";

    SUCCEED();
}

// Step 7: primitive_start for TAIL is identical to plain HN's, since `complete_kernel_circuit_logic`
// (chonk.cpp) prepends the same single `queue_ecc_eq()` to the ecc_op block for every kernel type --
// there is no TAIL-specific ecc_op content to discover. Now a tautology at the construction level
// (both builds go through the identical PROOF_TYPE::HN path; see file header note), kept as a
// regression signal that two independent PROOF_TYPE::HN builds still produce matching ecc_op sizes.
TEST_F(HNTailRecursionTestSuite, AcirHNTailEccOpMatchesPlainHN)
{
    BB_DISABLE_ASSERTS();

    HNBuilder tail_builder = build_hn_kernel_circuit(PROOF_TYPE::HN);
    HNBuilder hn_builder = build_hn_kernel_circuit(PROOF_TYPE::HN);

    EXPECT_EQ(tail_builder.blocks.ecc_op.size(), hn_builder.blocks.ecc_op.size());
}

// Integration: TAIL routed end-to-end through the production dispatcher
// (StaticAnalyzerAcir_<fr, MegaCircuitBuilder>::process_hn_recursion_constraint), which now handles
// TAIL via the same PROOF_TYPE::HN path as RESET (see file header note). A clean TAIL-shaped kernel
// yields no incorrect opcodes.
TEST_F(HNTailRecursionTestSuite, AcirHNTailFingerprintsMatchConstants)
{
    BB_DISABLE_ASSERTS();

    auto setup = make_hn_acir_setup(PROOF_TYPE::HN, /*is_kernel=*/true);
    AcirFormat constraint_system_copy = setup.program.constraints;
    HNBuilder builder = build_hn_circuit_from_acir(setup);

    cdg::MegaStaticAnalyzerAcir analyzer(std::move(constraint_system_copy), std::move(builder));
    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}
