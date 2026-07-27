// Boomerang analysis and validation tests for HONK_ZK recursion constraints.
//
// This file intentionally does not modify the plain HONK validation path.

#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/HONK_ZK/honk_zk_recursion_validation.hpp"
#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/boomerang_value_detection/graph_description_acir.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/commitment_schemes/claim_batcher.hpp"
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/dsl/acir_format/honk_recursion_constraint.hpp"
#include "barretenberg/dsl/acir_format/mock_verifier_inputs.hpp"
#include "barretenberg/dsl/acir_format/utils.hpp"
#include "barretenberg/flavor/ultra_zk_recursive_flavor.hpp"
#include "barretenberg/flavor/verifier_commitments.hpp"
#include "barretenberg/honk/proof_length.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_helper.hpp"
#include "barretenberg/noir_programs_boomerang_values/poseidon2s_helpers.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/ultra_honk/oink_verifier.hpp"
#include "barretenberg/ultra_honk/verifier_instance.hpp"

#include <algorithm>
#include <array>
#include <fstream>
#include <gtest/gtest.h>
#include <memory>
#include <optional>
#include <set>
#include <string>
#include <vector>

using namespace bb;
using namespace cdg;

namespace {

using Builder = UltraCircuitBuilder;
using RecursiveFlavor = UltraZKRecursiveFlavor_<Builder>;
using NativeFlavor = RecursiveFlavor::NativeFlavor;
using IO = stdlib::recursion::honk::DefaultIO<Builder>;
using Curve = RecursiveFlavor::Curve;
using FF = RecursiveFlavor::FF;
using Commitment = RecursiveFlavor::Commitment;
using Shplemini = ShpleminiVerifier_<Curve, RecursiveFlavor::HasZK>;
using ClaimBatcher = ClaimBatcher_<Curve>;
using field_ct = stdlib::field_t<Builder>;
using Transcript = RecursiveFlavor::Transcript;
using RecursiveVK = RecursiveFlavor::VerificationKey;
using VKAndHash = RecursiveFlavor::VKAndHash;
using VerifierInst = VerifierInstance_<RecursiveFlavor>;
using StdlibProof = stdlib::Proof<Builder>;

static_assert(RecursiveFlavor::HasZK, "This test targets HONK_ZK.");

constexpr size_t BLOCK_IDX_ARITHMETIC = 2;
constexpr size_t BLOCK_IDX_MEMORY = 5;
constexpr size_t BLOCK_IDX_NNF = 6;
constexpr size_t BLOCK_IDX_POSEIDON2_EXT = 7;
constexpr size_t BLOCK_IDX_POSEIDON2_INT = 8;

static const char* block_kind_name(size_t block_index)
{
    switch (block_index) {
    case BLOCK_IDX_ARITHMETIC:
        return "arithmetic";
    case BLOCK_IDX_MEMORY:
        return "memory";
    case BLOCK_IDX_NNF:
        return "nnf";
    case BLOCK_IDX_POSEIDON2_EXT:
        return "poseidon2_ext";
    case BLOCK_IDX_POSEIDON2_INT:
        return "poseidon2_int";
    default:
        return "unknown";
    }
}

struct VerifierComponents {
    std::unique_ptr<Builder> builder_ptr;
    std::shared_ptr<VKAndHash> vk_and_hash;
    std::shared_ptr<Transcript> transcript;
    std::shared_ptr<VerifierInst> verifier_instance;
    StdlibProof stdlib_proof;
    acir_format::RecursionConstraint constraint;
    size_t num_public_inputs = 0;
    size_t log_n = 0;

    Builder& builder() { return *builder_ptr; }
    const Builder& builder() const { return *builder_ptr; }
};

static acir_format::AcirProgram make_mock_acir_program(size_t num_acir_pub_inputs = 0)
{
    const size_t log_n = static_cast<size_t>(NativeFlavor::VIRTUAL_LOG_N);
    const size_t dyadic_size = size_t{ 1 } << log_n;
    auto native_vk = acir_format::create_mock_honk_vk<NativeFlavor, IO>(dyadic_size, num_acir_pub_inputs);
    auto native_proof = acir_format::create_mock_honk_proof<NativeFlavor, IO>(num_acir_pub_inputs);

    acir_format::AcirProgram program;
    auto constraint = acir_format::recursion_data_to_recursion_constraint(program.witness,
                                                                          native_proof,
                                                                          native_vk->to_field_elements(),
                                                                          native_vk->hash(),
                                                                          bb::fr::one(),
                                                                          num_acir_pub_inputs,
                                                                          acir_format::PROOF_TYPE::HONK_ZK);
    program.witness.pop_back();
    constraint.predicate = WitnessOrConstant<bb::fr>::from_constant(bb::fr::one());

    program.constraints.max_witness_index = static_cast<uint32_t>(program.witness.size() - 1);
    program.constraints.num_acir_opcodes = 1;
    program.constraints.honk_recursion_constraints = { constraint };
    program.constraints.original_opcode_indices =
        acir_format::AcirFormatOriginalOpcodeIndices{ .honk_recursion_constraints = { 0 } };
    return program;
}

static VerifierComponents setup_honk_zk_verifier_components(size_t num_acir_pub_inputs = 0)
{
    acir_format::AcirProgram program = make_mock_acir_program(num_acir_pub_inputs);
    const auto& constraint = program.constraints.honk_recursion_constraints[0];

    auto builder_ptr = std::make_unique<Builder>(program.witness, program.constraints.public_inputs, false);
    Builder& builder = *builder_ptr;

    auto key_fields = acir_format::fields_from_witnesses(builder, constraint.key);
    auto recursive_vk = std::make_shared<RecursiveVK>(key_fields);
    auto vk_hash_ct = field_ct::from_witness_index(&builder, constraint.key_hash);
    auto vk_and_hash = std::make_shared<VKAndHash>(recursive_vk, vk_hash_ct);

    std::vector<uint32_t> proof_indices =
        acir_format::add_public_inputs_to_proof(constraint.proof, constraint.public_inputs);
    auto proof_fields = acir_format::fields_from_witnesses(builder, proof_indices);
    StdlibProof stdlib_proof(proof_fields);

    auto transcript = std::make_shared<Transcript>();
    transcript->load_proof(stdlib_proof);
    auto verifier_instance = std::make_shared<VerifierInst>(vk_and_hash);

    const size_t log_n = static_cast<size_t>(NativeFlavor::VIRTUAL_LOG_N);
    const size_t num_public_inputs =
        ProofLength::Honk<RecursiveFlavor>::derive_num_public_inputs(stdlib_proof.size(), log_n);

    VerifierComponents vc;
    vc.builder_ptr = std::move(builder_ptr);
    vc.vk_and_hash = vk_and_hash;
    vc.transcript = transcript;
    vc.verifier_instance = verifier_instance;
    vc.stdlib_proof = std::move(stdlib_proof);
    vc.constraint = constraint;
    vc.num_public_inputs = num_public_inputs;
    vc.log_n = log_n;
    return vc;
}

static void run_oink_step(VerifierComponents& vc)
{
    OinkVerifier<RecursiveFlavor> oink{ vc.verifier_instance, vc.transcript, vc.num_public_inputs };
    oink.verify();
}

static void run_gate_challenges_step(VerifierComponents& vc)
{
    vc.verifier_instance->gate_challenges =
        vc.transcript->template get_dyadic_powers_of_challenge<FF>("Sumcheck:gate_challenge", vc.log_n);
}

struct SumcheckResult {
    SumcheckOutput<RecursiveFlavor> output;
    std::array<Commitment, NUM_SMALL_IPA_COMMITMENTS> libra_commitments;
};

// Line-for-line with ultra_verifier.cpp reduce_to_pairing_check (HasZK): construct
// SumcheckVerifier *before* Libra:concatenation receive so ALPHA_POWERS lands at the
// Preprocessor→Sumcheck boundary (same as production). Prior mirror received Libra first —
// dual-shape Sumcheck vs real ACIR (honk_zk_analysis Critique Q1).
static SumcheckResult run_sumcheck_step(VerifierComponents& vc)
{
    std::array<Commitment, NUM_SMALL_IPA_COMMITMENTS> libra_commitments{};

    SumcheckVerifier<RecursiveFlavor> sumcheck(vc.transcript, vc.verifier_instance->alpha, vc.log_n);
    libra_commitments[0] = vc.transcript->template receive_from_prover<Commitment>("Libra:concatenation_commitment");
    auto output = sumcheck.verify(vc.verifier_instance->relation_parameters, vc.verifier_instance->gate_challenges);

    libra_commitments[1] = vc.transcript->template receive_from_prover<Commitment>("Libra:grand_sum_commitment");
    libra_commitments[2] = vc.transcript->template receive_from_prover<Commitment>("Libra:quotient_commitment");

    return { std::move(output), libra_commitments };
}

static ShpleminiVerifierOutput_<Curve, RecursiveFlavor::HasZK> run_shplemini_step(VerifierComponents& vc,
                                                                                  SumcheckResult& sumcheck_result)
{
    using ClaimBatch = ClaimBatcher::Batch;

    auto commitments =
        VerifierCommitmentsConstructor<RecursiveFlavor>::construct(vc.verifier_instance->get_vk(),
                                                                   vc.verifier_instance->witness_commitments,
                                                                   vc.verifier_instance->gemini_masking_commitment);

    ClaimBatcher claim_batcher{ .unshifted = ClaimBatch{ commitments.get_unshifted(),
                                                         sumcheck_result.output.claimed_evaluations.get_unshifted() },
                                .shifted = ClaimBatch{ commitments.get_to_be_shifted(),
                                                       sumcheck_result.output.claimed_evaluations.get_shifted() } };

    auto one_commitment = RecursiveFlavor::Commitment::one(&vc.builder());
    return Shplemini::compute_batch_opening_claim(claim_batcher,
                                                  sumcheck_result.output.challenge,
                                                  one_commitment,
                                                  vc.transcript,
                                                  RecursiveFlavor::REPEATED_COMMITMENTS,
                                                  sumcheck_result.libra_commitments,
                                                  sumcheck_result.output.claimed_libra_evaluation);
}

static typename bb::KZG<Curve>::PairingPointsType run_kzg_step(
    VerifierComponents& vc, ShpleminiVerifierOutput_<Curve, RecursiveFlavor::HasZK>& shplemini_output)
{
    using KZG = bb::KZG<Curve>;
    const size_t msm_size = RecursiveFlavor::FINAL_PCS_MSM_SIZE(vc.log_n);
    return KZG::reduce_verify_batch_opening_claim(
        std::move(shplemini_output.batch_opening_claim), vc.transcript, msm_size);
}

// Mirrors ultra_verifier.cpp UltraVerifier_::verify_proof Step 3 (same as bare HONK's run_output_step in
// honk_recursion_test_helpers.hpp): reconstruct the IO's own pairing-point accumulator from the (inner)
// proof's public inputs, then fold the freshly-reduced KZG pairing points into it. Unconditional — no
// `if constexpr (HasZK)` guard in production, so this must run for HONK_ZK too (see
// project_honk_review_criticals_fixed memory: HONK_ZK's mirror never ran this, so its squeeze count was
// measured against an incomplete chain).
static typename bb::KZG<Curve>::PairingPointsType run_output_step(
    VerifierComponents& vc, typename bb::KZG<Curve>::PairingPointsType& pcs_pairing_points)
{
    IO inputs;
    inputs.reconstruct_from_public(vc.verifier_instance->public_inputs);
    auto pi_pairing_points = inputs.pairing_inputs;
    pi_pairing_points.aggregate(pcs_pairing_points);
    return pi_pairing_points;
}

static void build_full_honk_zk_circuit(VerifierComponents& vc)
{
    run_oink_step(vc);
    run_gate_challenges_step(vc);
    auto sc = run_sumcheck_step(vc);
    auto shp = run_shplemini_step(vc, sc);
    auto pcs = run_kzg_step(vc, shp);
    run_output_step(vc, pcs);
}

static recursion_helpers::FunctionFingerprint compute_block_fingerprint(Builder& builder,
                                                                        size_t block_idx,
                                                                        size_t start,
                                                                        size_t end)
{
    const size_t gate_count = end - start;
    const size_t fingerprint_size = std::min(recursion_helpers::SCANNER_FINGERPRINT_SIZE, gate_count);
    auto& block = builder.blocks.get()[block_idx];

    size_t prefix_hash = 0;
    size_t full_hash = 0;

    if (block_idx == BLOCK_IDX_ARITHMETIC) {
        prefix_hash = recursion_helpers::calculate_hash_arithmetic_block(builder, start, start + fingerprint_size);
        full_hash = recursion_helpers::calculate_hash_arithmetic_block(builder, start, end);
    } else {
        namespace sha256h = sha256_helpers;
        if (fingerprint_size > 0) {
            prefix_hash = sha256h::compute_selector_hash(0, block, start, start + fingerprint_size - 1);
        }
        if (gate_count > 0) {
            full_hash = sha256h::compute_selector_hash(0, block, start, end - 1);
        }
    }

    return { gate_count, prefix_hash, full_hash, fingerprint_size };
}

static void dump_step_fingerprints(std::ostream& out,
                                   Builder& builder,
                                   const recursion_helpers::BlockSnapshot& before,
                                   const recursion_helpers::BlockSnapshot& after,
                                   const char* step_name)
{
    auto deltas = recursion_helpers::compute_block_deltas(before, after);
    out << step_name << "\n";
    for (const auto& d : deltas) {
        const size_t start = before.sizes[d.block_index];
        const size_t end = start + d.delta;
        auto fp = compute_block_fingerprint(builder, d.block_index, start, end);
        out << "  block[" << d.block_index << "] " << block_kind_name(d.block_index) << " gates=" << fp.gate_count
            << " fingerprint20=0x" << std::hex << fp.prefix_hash << " full_hash=0x" << fp.full_hash << std::dec << "\n";
    }
    if (deltas.empty()) {
        out << "  (no new gates)\n";
    }
}

static void emit_fingerprint_line(
    std::ostream& out, Builder& builder, size_t block_idx, size_t start, size_t end, const char* label)
{
    const size_t gate_count = end - start;
    if (gate_count == 0) {
        out << label << " EMPTY\n";
        return;
    }
    auto fp = compute_block_fingerprint(builder, block_idx, start, end);
    out << label << " gates=" << gate_count << " prefix20=0x" << std::hex << fp.prefix_hash << " full=0x"
        << fp.full_hash << std::dec << "\n";
}

} // namespace

class HonkZKRecursionDiscoveryTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

TEST_F(HonkZKRecursionDiscoveryTests, HonkZKMirroredBuildMatchesRealAcirCircuit)
{
    VerifierComponents vc = setup_honk_zk_verifier_components(0);
    build_full_honk_zk_circuit(vc);
    auto mirrored = recursion_helpers::BlockSnapshot::capture(vc.builder());

    acir_format::AcirProgram program = make_mock_acir_program(0);
    const auto& constraint = program.constraints.honk_recursion_constraints[0];
    Builder real_builder(program.witness, program.constraints.public_inputs, false);
    [[maybe_unused]] auto real_output =
        acir_format::create_honk_recursion_constraints<RecursiveFlavor, IO>(real_builder, constraint);
    auto real = recursion_helpers::BlockSnapshot::capture(real_builder);

    ASSERT_EQ(real.sizes.size(), mirrored.sizes.size());
    for (size_t b = 0; b < mirrored.sizes.size(); ++b) {
        EXPECT_EQ(real.sizes[b], mirrored.sizes[b])
            << "block[" << b << "] " << block_kind_name(b) << " mismatch: real=" << real.sizes[b]
            << " mirrored=" << mirrored.sizes[b];
    }
}

// Phase 1 Step 0 (honk_zk_plan): measure squeeze anchors on real UltraZK ACIR build;
// lock squeeze-keep vs cursor-migrate for Phase 3.
TEST_F(HonkZKRecursionDiscoveryTests, HonkZKPhase1ArchitectureFork)
{
    acir_format::AcirProgram program = make_mock_acir_program(0);
    const auto& constraint = program.constraints.honk_recursion_constraints[0];
    Builder builder(program.witness, program.constraints.public_inputs, false);
    [[maybe_unused]] auto output =
        acir_format::create_honk_recursion_constraints<RecursiveFlavor, IO>(builder, constraint);

    const auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    std::set<size_t> peek;
    auto oink_chal = recursion_helpers::oink_challenges(builder, all_squeezes, peek);
    const bool oink_squeeze_ok =
        oink_chal.valid && oink_chal.squeeze_gate_indices.size() == HonkZKRecursionValidation::Oink::NUM_OINK_SQUEEZES;

    bool pre_eta_fp_ok = false;
    size_t eta_gate = 0;
    if (oink_squeeze_ok) {
        std::vector<size_t> oink_sq(oink_chal.squeeze_gate_indices.begin(), oink_chal.squeeze_gate_indices.end());
        std::sort(oink_sq.begin(), oink_sq.end());
        eta_gate = oink_sq[0];
        const size_t oink_start = eta_gate + 1 - HonkZKRecursionValidation::Oink::PRE_ETA_ARITH.gate_count;
        pre_eta_fp_ok = recursion_helpers::matches_fingerprint_at(
            builder, builder.blocks.arithmetic, oink_start, HonkZKRecursionValidation::Oink::PRE_ETA_ARITH);
    }

    // 2^127 decompose squeeze pattern: dead for fr challenges after convert_full_challenge passthrough
    // on bare HONK. If oink_challenges / PRE_ETA still work here, squeeze-keep is viable for ZK.
    const char* fork = (!all_squeezes.empty() && oink_squeeze_ok && pre_eta_fp_ok) ? "squeeze-keep" : "cursor-migrate";

    std::ofstream out("honk_zk_phase1_fork.txt");
    ASSERT_TRUE(out.is_open());
    out << "# HONK_ZK Phase 1 Step 0 — architecture fork (real create_honk_recursion_constraints)\n";
    out << "squeeze_gate_count=" << all_squeezes.size() << "\n";
    out << "oink_challenges_valid=" << (oink_chal.valid ? 1 : 0) << "\n";
    out << "oink_squeeze_count=" << oink_chal.squeeze_gate_indices.size() << "\n";
    out << "eta_squeeze_gate=" << eta_gate << "\n";
    out << "pre_eta_fingerprint_ok=" << (pre_eta_fp_ok ? 1 : 0) << "\n";
    out << "phase3_architecture_fork=" << fork << "\n";
    out << "# Criterion: squeeze-keep iff squeeze_gate_count>0 AND oink_challenges_valid AND "
           "pre_eta_fingerprint_ok\n";
    out.flush();

    // Soft assert: always write fork; hard-fail only if file empty. Fork value drives Phase 3.
    EXPECT_FALSE(std::string(fork).empty());
}

TEST_F(HonkZKRecursionDiscoveryTests, HonkZKStageAnalysis)
{
    VerifierComponents vc = setup_honk_zk_verifier_components(0);

    std::ofstream out("honk_zk_functions_analysis.txt");
    ASSERT_TRUE(out.is_open()) << "Failed to open honk_zk_functions_analysis.txt";

    out << "# HONK_ZK Recursion — Circuit Analysis\n";
    out << "# Flavor: UltraZKRecursiveFlavor_<UltraCircuitBuilder>\n";
    out << "# IO: DefaultIO (PairingPoints only)\n";
    out << "# Predicate: constant true\n";
    out << "# HasZK: true\n";
    out << "# log_n: " << vc.log_n << "\n\n";

    auto snap_before_oink = recursion_helpers::BlockSnapshot::capture(vc.builder());
    run_oink_step(vc);
    auto snap_after_oink = recursion_helpers::BlockSnapshot::capture(vc.builder());
    dump_step_fingerprints(out, vc.builder(), snap_before_oink, snap_after_oink, "Oink");

    auto snap_before_preproc = snap_after_oink;
    run_gate_challenges_step(vc);
    auto snap_after_preproc = recursion_helpers::BlockSnapshot::capture(vc.builder());
    dump_step_fingerprints(out, vc.builder(), snap_before_preproc, snap_after_preproc, "Preprocessor");

    auto snap_before_sumcheck = snap_after_preproc;
    auto sc_result = run_sumcheck_step(vc);
    auto snap_after_sumcheck = recursion_helpers::BlockSnapshot::capture(vc.builder());
    dump_step_fingerprints(out, vc.builder(), snap_before_sumcheck, snap_after_sumcheck, "Sumcheck");

    auto snap_before_shplemini = snap_after_sumcheck;
    auto shp_output = run_shplemini_step(vc, sc_result);
    auto snap_after_shplemini = recursion_helpers::BlockSnapshot::capture(vc.builder());
    dump_step_fingerprints(out, vc.builder(), snap_before_shplemini, snap_after_shplemini, "Shplemini");

    auto snap_before_kzg = snap_after_shplemini;
    auto pcs_pairing_points = run_kzg_step(vc, shp_output);
    auto snap_after_kzg = recursion_helpers::BlockSnapshot::capture(vc.builder());
    dump_step_fingerprints(out, vc.builder(), snap_before_kzg, snap_after_kzg, "KZG");

    auto snap_before_output = snap_after_kzg;
    run_output_step(vc, pcs_pairing_points);
    auto snap_after_output = recursion_helpers::BlockSnapshot::capture(vc.builder());
    dump_step_fingerprints(out, vc.builder(), snap_before_output, snap_after_output, "Output");

    const auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(vc.builder());
    out << "\nSqueeze chain (" << all_squeezes.size() << " total):\n";
    for (size_t i = 0; i < all_squeezes.size(); ++i) {
        out << "  [" << i << "] arith_gate=" << all_squeezes[i] << "\n";
    }

    out << "\nTotal gate counts per block:\n";
    auto blocks = vc.builder().blocks.get();
    for (size_t b = 0; b < blocks.size(); ++b) {
        if (blocks[b].size() > 0) {
            out << "  block[" << b << "] " << block_kind_name(b) << " total=" << blocks[b].size() << "\n";
        }
    }

    out.flush();
    // Post convert_full_challenge<fr>: challenge 2^127 squeeze pattern is dead.
    // Remaining squeeze is Output recursion_separator only (same as bare HONK).
    // Phase 3 path = cursor-migrate (see HonkZKPhase1ArchitectureFork / honk_zk_phase1_fork.txt).
    EXPECT_EQ(all_squeezes.size(), 1U) << "expected sole Output recursion_separator squeeze";
}

TEST_F(HonkZKRecursionDiscoveryTests, HonkZKOinkStageAnalysis)
{
    VerifierComponents vc = setup_honk_zk_verifier_components(0);

    auto snap_before_oink = recursion_helpers::BlockSnapshot::capture(vc.builder());
    run_oink_step(vc);
    auto snap_after_oink = recursion_helpers::BlockSnapshot::capture(vc.builder());

    const size_t arith_start = snap_before_oink.sizes[BLOCK_IDX_ARITHMETIC];
    const size_t nnf_start = snap_before_oink.sizes.size() > BLOCK_IDX_NNF ? snap_before_oink.sizes[BLOCK_IDX_NNF] : 0;
    const size_t ext_start =
        snap_before_oink.sizes.size() > BLOCK_IDX_POSEIDON2_EXT ? snap_before_oink.sizes[BLOCK_IDX_POSEIDON2_EXT] : 0;
    const size_t int_start =
        snap_before_oink.sizes.size() > BLOCK_IDX_POSEIDON2_INT ? snap_before_oink.sizes[BLOCK_IDX_POSEIDON2_INT] : 0;

    const auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(vc.builder());
    auto oink_chal = recursion_helpers::oink_challenges(vc.builder(), all_squeezes);
    if (!oink_chal.valid) {
        GTEST_SKIP() << "Phase 1 fork=cursor-migrate: Oink squeeze windows dead";
    }
    std::vector<size_t> sorted_squeezes(oink_chal.squeeze_gate_indices.begin(), oink_chal.squeeze_gate_indices.end());
    std::sort(sorted_squeezes.begin(), sorted_squeezes.end());
    ASSERT_EQ(sorted_squeezes.size(), 3U);

    const size_t eta = sorted_squeezes[0];
    const size_t beta_gamma = sorted_squeezes[1];
    const size_t alpha = sorted_squeezes[2];

    std::ofstream out("honk_zk_oink_stage_analysis.txt");
    ASSERT_TRUE(out.is_open());

    out << "# HONK_ZK Oink Stage Analysis\n";
    out << "# arith_start=" << arith_start << " arith_end=" << snap_after_oink.sizes[BLOCK_IDX_ARITHMETIC] << "\n";
    out << "# eta_squeeze=" << eta << " beta_gamma_squeeze=" << beta_gamma << " alpha_squeeze=" << alpha << "\n\n";

    emit_fingerprint_line(out, vc.builder(), BLOCK_IDX_ARITHMETIC, arith_start, eta + 1, "pre_eta_arith");
    emit_fingerprint_line(out, vc.builder(), BLOCK_IDX_ARITHMETIC, eta + 1, beta_gamma + 1, "post_eta_arith");
    emit_fingerprint_line(out, vc.builder(), BLOCK_IDX_ARITHMETIC, beta_gamma + 1, alpha + 1, "post_beta_gamma_arith");
    emit_fingerprint_line(
        out, vc.builder(), BLOCK_IDX_NNF, nnf_start, snap_after_oink.sizes[BLOCK_IDX_NNF], "oink_nnf_total");
    emit_fingerprint_line(out,
                          vc.builder(),
                          BLOCK_IDX_POSEIDON2_EXT,
                          ext_start,
                          snap_after_oink.sizes[BLOCK_IDX_POSEIDON2_EXT],
                          "oink_ext_total");
    emit_fingerprint_line(out,
                          vc.builder(),
                          BLOCK_IDX_POSEIDON2_INT,
                          int_start,
                          snap_after_oink.sizes[BLOCK_IDX_POSEIDON2_INT],
                          "oink_int_total");

    out.flush();
}

struct HonkZKValidatorContext {
    VerifierComponents vc;
    std::unique_ptr<cdg::StaticAnalyzer_<bb::fr, Builder>> analyzer;
    HonkZKRecursionValidation::ArithBoundaries bounds;

    explicit HonkZKValidatorContext(size_t num_pub_inputs = 0)
        : vc(setup_honk_zk_verifier_components(num_pub_inputs))
    {
        build_full_honk_zk_circuit(vc);
        analyzer = std::make_unique<cdg::StaticAnalyzer_<bb::fr, Builder>>(vc.builder(), false);
        bounds = HonkZKRecursionValidation::compute_arith_boundaries_from_oink_start();
    }
};

TEST_F(HonkZKRecursionDiscoveryTests, ValidateHonkZKOink)
{
    HonkZKValidatorContext ctx;
    auto result =
        HonkZKRecursionValidation::Oink::validate_oink<bb::fr>(ctx.vc.builder(),
                                                               *ctx.analyzer,
                                                               ctx.bounds.oink,
                                                               HonkZKRecursionValidation::Oink::SETUP_NNF_GATE_COUNT,
                                                               0,
                                                               0,
                                                               &ctx.vc.constraint,
                                                               &ctx.vc.constraint.proof);
    EXPECT_TRUE(result.arith_ok) << "arith";
    EXPECT_TRUE(result.nnf_ok) << "nnf";
    EXPECT_TRUE(result.poseidon2_ext_ok) << "p2ext";
    EXPECT_TRUE(result.poseidon2_int_ok) << "p2int";
    EXPECT_TRUE(result.acir_constraint_ok) << "vk_hash";
    EXPECT_TRUE(result.is_valid);
    EXPECT_EQ(result.arith_start, HonkZKRecursionValidation::Oink::ARITH_START);
}

TEST_F(HonkZKRecursionDiscoveryTests, ValidateHonkZKPreprocessor)
{
    HonkZKValidatorContext ctx;
    auto oink =
        HonkZKRecursionValidation::Oink::validate_oink<bb::fr>(ctx.vc.builder(),
                                                               *ctx.analyzer,
                                                               ctx.bounds.oink,
                                                               HonkZKRecursionValidation::Oink::SETUP_NNF_GATE_COUNT,
                                                               0,
                                                               0,
                                                               &ctx.vc.constraint,
                                                               &ctx.vc.constraint.proof);
    ASSERT_TRUE(oink.is_valid);
    auto result =
        HonkZKRecursionValidation::Preprocessor::validate_preprocessor<bb::fr>(ctx.vc.builder(), *ctx.analyzer, oink);
    EXPECT_TRUE(result.is_valid);
    EXPECT_EQ(result.arith_start, oink.arith_end);
}

TEST_F(HonkZKRecursionDiscoveryTests, ValidateHonkZKSumcheck)
{
    HonkZKValidatorContext ctx;
    auto oink =
        HonkZKRecursionValidation::Oink::validate_oink<bb::fr>(ctx.vc.builder(),
                                                               *ctx.analyzer,
                                                               ctx.bounds.oink,
                                                               HonkZKRecursionValidation::Oink::SETUP_NNF_GATE_COUNT,
                                                               0,
                                                               0,
                                                               &ctx.vc.constraint,
                                                               &ctx.vc.constraint.proof);
    ASSERT_TRUE(oink.is_valid);
    auto preprocessor =
        HonkZKRecursionValidation::Preprocessor::validate_preprocessor<bb::fr>(ctx.vc.builder(), *ctx.analyzer, oink);
    ASSERT_TRUE(preprocessor.is_valid);
    auto result =
        HonkZKRecursionValidation::Sumcheck::validate_sumcheck<bb::fr>(ctx.vc.builder(), *ctx.analyzer, preprocessor);
    EXPECT_TRUE(result.is_valid);
    EXPECT_EQ(result.arith_start, preprocessor.arith_end);
}

TEST_F(HonkZKRecursionDiscoveryTests, ValidateHonkZKShplemini)
{
    HonkZKValidatorContext ctx;
    auto oink =
        HonkZKRecursionValidation::Oink::validate_oink<bb::fr>(ctx.vc.builder(),
                                                               *ctx.analyzer,
                                                               ctx.bounds.oink,
                                                               HonkZKRecursionValidation::Oink::SETUP_NNF_GATE_COUNT,
                                                               0,
                                                               0,
                                                               &ctx.vc.constraint,
                                                               &ctx.vc.constraint.proof);
    ASSERT_TRUE(oink.is_valid);
    auto preprocessor =
        HonkZKRecursionValidation::Preprocessor::validate_preprocessor<bb::fr>(ctx.vc.builder(), *ctx.analyzer, oink);
    ASSERT_TRUE(preprocessor.is_valid);
    auto sumcheck =
        HonkZKRecursionValidation::Sumcheck::validate_sumcheck<bb::fr>(ctx.vc.builder(), *ctx.analyzer, preprocessor);
    ASSERT_TRUE(sumcheck.is_valid);
    auto result =
        HonkZKRecursionValidation::Shplemini::validate_shplemini<bb::fr>(ctx.vc.builder(), *ctx.analyzer, sumcheck);
    EXPECT_TRUE(result.is_valid);
    EXPECT_EQ(result.arith_start, sumcheck.arith_end);
}

TEST_F(HonkZKRecursionDiscoveryTests, ValidateHonkZKKZG)
{
    HonkZKValidatorContext ctx;
    auto oink =
        HonkZKRecursionValidation::Oink::validate_oink<bb::fr>(ctx.vc.builder(),
                                                               *ctx.analyzer,
                                                               ctx.bounds.oink,
                                                               HonkZKRecursionValidation::Oink::SETUP_NNF_GATE_COUNT,
                                                               0,
                                                               0,
                                                               &ctx.vc.constraint,
                                                               &ctx.vc.constraint.proof);
    ASSERT_TRUE(oink.is_valid);
    auto preprocessor =
        HonkZKRecursionValidation::Preprocessor::validate_preprocessor<bb::fr>(ctx.vc.builder(), *ctx.analyzer, oink);
    ASSERT_TRUE(preprocessor.is_valid);
    auto sumcheck =
        HonkZKRecursionValidation::Sumcheck::validate_sumcheck<bb::fr>(ctx.vc.builder(), *ctx.analyzer, preprocessor);
    ASSERT_TRUE(sumcheck.is_valid);
    auto shplemini =
        HonkZKRecursionValidation::Shplemini::validate_shplemini<bb::fr>(ctx.vc.builder(), *ctx.analyzer, sumcheck);
    ASSERT_TRUE(shplemini.is_valid);
    auto result = HonkZKRecursionValidation::KZG::validate_kzg<bb::fr>(ctx.vc.builder(), *ctx.analyzer, shplemini);
    EXPECT_TRUE(result.is_valid);
    EXPECT_EQ(result.arith_start, shplemini.arith_end);
    EXPECT_TRUE(result.memory_ok);
}

TEST_F(HonkZKRecursionDiscoveryTests, ValidateHonkZKVkDeserialize)
{
    HonkZKValidatorContext ctx;
    auto result = HonkZKRecursionValidation::VkDeserialize::validate_vk_deserialize_region<bb::fr>(
        ctx.vc.builder(), *ctx.analyzer, ctx.vc.constraint);
    EXPECT_TRUE(result.arith_ok) << "arith";
    EXPECT_TRUE(result.residual_ok) << "residual";
    EXPECT_TRUE(result.nnf_ok) << "nnf";
    EXPECT_TRUE(result.commitments_ok) << "commitments";
    EXPECT_TRUE(result.is_valid);
    EXPECT_EQ(result.arith_end, HonkZKRecursionValidation::Oink::ARITH_START);
}

TEST_F(HonkZKRecursionDiscoveryTests, AcirHonkZKFingerprintsMatchConstants)
{
    acir_format::AcirProgram program = make_mock_acir_program(0);
    const auto& constraint = program.constraints.honk_recursion_constraints[0];
    Builder builder(program.witness, program.constraints.public_inputs, false);
    [[maybe_unused]] auto output =
        acir_format::create_honk_recursion_constraints<RecursiveFlavor, IO>(builder, constraint);
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
    auto result =
        HonkZKRecursionValidation::validate_honk_zk_recursion<bb::fr>(builder, analyzer, constraint, constraint.proof);
    EXPECT_TRUE(result.vk_deserialize.is_valid) << "vk_deserialize";
    EXPECT_TRUE(result.oink.is_valid) << "oink";
    EXPECT_TRUE(result.preprocessor.is_valid) << "preprocessor";
    EXPECT_TRUE(result.sumcheck.is_valid) << "sumcheck";
    EXPECT_TRUE(result.shplemini.is_valid) << "shplemini";
    EXPECT_TRUE(result.kzg.is_valid) << "kzg";
    EXPECT_TRUE(result.output.is_valid) << "output";
    EXPECT_TRUE(result.arith_coverage_valid)
        << "arith coverage " << result.arith_cursor_end << "/" << result.arith_region_end;
    EXPECT_TRUE(result.poseidon2_ext_coverage_valid);
    EXPECT_TRUE(result.poseidon2_int_coverage_valid);
    EXPECT_TRUE(result.nnf_coverage_valid);
    EXPECT_TRUE(result.memory_coverage_valid);
    EXPECT_TRUE(result.all_valid);
}

TEST_F(HonkZKRecursionDiscoveryTests, AcirHonkZKWitnessLinkInOink)
{
    acir_format::AcirProgram program = make_mock_acir_program(0);
    const auto& constraint = program.constraints.honk_recursion_constraints[0];
    Builder builder(program.witness, program.constraints.public_inputs, false);
    [[maybe_unused]] auto output =
        acir_format::create_honk_recursion_constraints<RecursiveFlavor, IO>(builder, constraint);
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
    auto result =
        HonkZKRecursionValidation::validate_honk_zk_recursion<bb::fr>(builder, analyzer, constraint, constraint.proof);
    ASSERT_TRUE(result.oink.is_valid);

    const uint32_t key_hash_real = builder.real_variable_index[constraint.key_hash];
    auto p2_gates = recursion_helpers::collect_real_witness_gates_in_block<bb::fr>(
        builder, analyzer, key_hash_real, poseidon2_helpers::poseidon2_external_block(builder));
    ASSERT_FALSE(p2_gates.empty());
    EXPECT_GE(p2_gates.front(), result.oink.poseidon2_ext_start);
    EXPECT_LT(p2_gates.front(), result.oink.poseidon2_ext_end);

    namespace HZO = HonkZKRecursionValidation::Oink;
    const size_t prefix = HZO::honk_zk_public_input_prefix_size(&constraint);
    for (size_t g = 0; g < HZO::NUM_COMMITMENT_GROUPS; ++g) {
        const auto frs = HZO::get_honk_zk_commitment_group_witness_indices(constraint.proof, g, prefix);
        ASSERT_TRUE(frs.has_value()) << "group " << g;
        bool found = false;
        for (uint32_t w : *frs) {
            const uint32_t real = builder.real_variable_index[w];
            for (const auto& [blk, gi] : analyzer.get_variable_gates(real)) {
                if (&builder.blocks.get()[blk] == &builder.blocks.arithmetic && gi >= result.oink.arith_start &&
                    gi < result.oink.arith_end) {
                    found = true;
                }
            }
        }
        EXPECT_TRUE(found) << "proof commitment group " << g << " must appear in Oink arith range";
    }
}

TEST_F(HonkZKRecursionDiscoveryTests, RejectsCorruptedHonkZKOink)
{
    HonkZKValidatorContext ctx;
    auto& builder = ctx.vc.builder();
    auto& arith = builder.blocks.arithmetic;
    const size_t gate = HonkZKRecursionValidation::Oink::ARITH_START;
    ASSERT_LT(gate, arith.size());
    arith.q_m().set(gate, arith.q_m()[gate] + bb::fr::one());
    auto result =
        HonkZKRecursionValidation::Oink::validate_oink<bb::fr>(builder,
                                                               *ctx.analyzer,
                                                               HonkZKRecursionValidation::Oink::ARITH_START,
                                                               HonkZKRecursionValidation::Oink::SETUP_NNF_GATE_COUNT,
                                                               0,
                                                               0,
                                                               &ctx.vc.constraint,
                                                               nullptr);
    EXPECT_FALSE(result.is_valid);
}

TEST_F(HonkZKRecursionDiscoveryTests, RejectsCorruptedHonkZKVkDeserializeRegion)
{
    HonkZKValidatorContext ctx;
    auto& builder = ctx.vc.builder();
    auto& arith = builder.blocks.arithmetic;
    const size_t gate = HonkZKRecursionValidation::VkDeserialize::PRIMITIVE_START_ARITH;
    ASSERT_LT(gate, arith.size());
    arith.q_m().set(gate, arith.q_m()[gate] + bb::fr::one());
    auto result = HonkZKRecursionValidation::VkDeserialize::validate_vk_deserialize_region<bb::fr>(
        builder, *ctx.analyzer, ctx.vc.constraint);
    EXPECT_FALSE(result.is_valid);
}

TEST_F(HonkZKRecursionDiscoveryTests, RejectsCorruptedHonkZKPreprocessor)
{
    HonkZKValidatorContext ctx;
    auto& builder = ctx.vc.builder();
    const auto bounds = HonkZKRecursionValidation::compute_arith_boundaries_from_oink_start();
    const size_t gate = bounds.preproc;
    ASSERT_LT(gate, builder.blocks.arithmetic.size());
    builder.blocks.arithmetic.q_m().set(gate, builder.blocks.arithmetic.q_m()[gate] + bb::fr::one());

    auto oink =
        HonkZKRecursionValidation::Oink::validate_oink<bb::fr>(builder,
                                                               *ctx.analyzer,
                                                               HonkZKRecursionValidation::Oink::ARITH_START,
                                                               HonkZKRecursionValidation::Oink::SETUP_NNF_GATE_COUNT,
                                                               0,
                                                               0,
                                                               &ctx.vc.constraint,
                                                               nullptr);
    ASSERT_TRUE(oink.is_valid);
    auto pre = HonkZKRecursionValidation::Preprocessor::validate_preprocessor<bb::fr>(builder, *ctx.analyzer, oink);
    EXPECT_FALSE(pre.is_valid);
}

TEST_F(HonkZKRecursionDiscoveryTests, RejectsCorruptedHonkZKSumcheck)
{
    HonkZKValidatorContext ctx;
    auto& builder = ctx.vc.builder();
    const auto bounds = HonkZKRecursionValidation::compute_arith_boundaries_from_oink_start();
    const size_t gate = bounds.sumcheck;
    ASSERT_LT(gate, builder.blocks.arithmetic.size());
    builder.blocks.arithmetic.q_m().set(gate, builder.blocks.arithmetic.q_m()[gate] + bb::fr::one());

    auto oink =
        HonkZKRecursionValidation::Oink::validate_oink<bb::fr>(builder,
                                                               *ctx.analyzer,
                                                               HonkZKRecursionValidation::Oink::ARITH_START,
                                                               HonkZKRecursionValidation::Oink::SETUP_NNF_GATE_COUNT,
                                                               0,
                                                               0,
                                                               &ctx.vc.constraint,
                                                               nullptr);
    ASSERT_TRUE(oink.is_valid);
    auto pre = HonkZKRecursionValidation::Preprocessor::validate_preprocessor<bb::fr>(builder, *ctx.analyzer, oink);
    ASSERT_TRUE(pre.is_valid);
    auto sc = HonkZKRecursionValidation::Sumcheck::validate_sumcheck<bb::fr>(builder, *ctx.analyzer, pre);
    EXPECT_FALSE(sc.is_valid);
}

TEST_F(HonkZKRecursionDiscoveryTests, RejectsCorruptedHonkZKShplemini)
{
    HonkZKValidatorContext ctx;
    auto& builder = ctx.vc.builder();
    const auto bounds = HonkZKRecursionValidation::compute_arith_boundaries_from_oink_start();
    const size_t gate = bounds.shplemini;
    ASSERT_LT(gate, builder.blocks.arithmetic.size());
    builder.blocks.arithmetic.q_m().set(gate, builder.blocks.arithmetic.q_m()[gate] + bb::fr::one());

    auto oink =
        HonkZKRecursionValidation::Oink::validate_oink<bb::fr>(builder,
                                                               *ctx.analyzer,
                                                               HonkZKRecursionValidation::Oink::ARITH_START,
                                                               HonkZKRecursionValidation::Oink::SETUP_NNF_GATE_COUNT,
                                                               0,
                                                               0,
                                                               &ctx.vc.constraint,
                                                               nullptr);
    ASSERT_TRUE(oink.is_valid);
    auto pre = HonkZKRecursionValidation::Preprocessor::validate_preprocessor<bb::fr>(builder, *ctx.analyzer, oink);
    ASSERT_TRUE(pre.is_valid);
    auto sc = HonkZKRecursionValidation::Sumcheck::validate_sumcheck<bb::fr>(builder, *ctx.analyzer, pre);
    ASSERT_TRUE(sc.is_valid);
    auto sh = HonkZKRecursionValidation::Shplemini::validate_shplemini<bb::fr>(builder, *ctx.analyzer, sc);
    EXPECT_FALSE(sh.is_valid);
}

TEST_F(HonkZKRecursionDiscoveryTests, RejectsCorruptedHonkZKKZGDeepOffset)
{
    HonkZKValidatorContext ctx;
    auto& builder = ctx.vc.builder();
    const size_t kzg_start = HonkZKRecursionValidation::compute_arith_boundaries_from_oink_start().kzg;
    const size_t gate = kzg_start + HonkZKRecursionValidation::KZG::ARITH_TOTAL.gate_count - 10;
    ASSERT_LT(gate, builder.blocks.arithmetic.size());
    builder.blocks.arithmetic.q_m().set(gate, builder.blocks.arithmetic.q_m()[gate] + bb::fr::one());

    auto oink =
        HonkZKRecursionValidation::Oink::validate_oink<bb::fr>(builder,
                                                               *ctx.analyzer,
                                                               HonkZKRecursionValidation::Oink::ARITH_START,
                                                               HonkZKRecursionValidation::Oink::SETUP_NNF_GATE_COUNT,
                                                               0,
                                                               0,
                                                               &ctx.vc.constraint,
                                                               nullptr);
    ASSERT_TRUE(oink.is_valid);
    auto pre = HonkZKRecursionValidation::Preprocessor::validate_preprocessor<bb::fr>(builder, *ctx.analyzer, oink);
    ASSERT_TRUE(pre.is_valid);
    auto sc = HonkZKRecursionValidation::Sumcheck::validate_sumcheck<bb::fr>(builder, *ctx.analyzer, pre);
    ASSERT_TRUE(sc.is_valid);
    auto sh = HonkZKRecursionValidation::Shplemini::validate_shplemini<bb::fr>(builder, *ctx.analyzer, sc);
    ASSERT_TRUE(sh.is_valid);
    auto kzg = HonkZKRecursionValidation::KZG::validate_kzg<bb::fr>(builder, *ctx.analyzer, sh);
    EXPECT_FALSE(kzg.is_valid);
}

TEST_F(HonkZKRecursionDiscoveryTests, RejectsCorruptedHonkZKOutput)
{
    HonkZKValidatorContext ctx;
    auto& builder = ctx.vc.builder();
    const auto bounds = HonkZKRecursionValidation::compute_arith_boundaries_from_oink_start();
    const size_t output_start = bounds.kzg + HonkZKRecursionValidation::KZG::ARITH_GATES;
    const size_t gate = output_start;
    ASSERT_LT(gate, builder.blocks.arithmetic.size());
    builder.blocks.arithmetic.q_m().set(gate, builder.blocks.arithmetic.q_m()[gate] + bb::fr::one());

    auto oink =
        HonkZKRecursionValidation::Oink::validate_oink<bb::fr>(builder,
                                                               *ctx.analyzer,
                                                               HonkZKRecursionValidation::Oink::ARITH_START,
                                                               HonkZKRecursionValidation::Oink::SETUP_NNF_GATE_COUNT,
                                                               0,
                                                               0,
                                                               &ctx.vc.constraint,
                                                               nullptr);
    ASSERT_TRUE(oink.is_valid);
    auto pre = HonkZKRecursionValidation::Preprocessor::validate_preprocessor<bb::fr>(builder, *ctx.analyzer, oink);
    ASSERT_TRUE(pre.is_valid);
    auto sc = HonkZKRecursionValidation::Sumcheck::validate_sumcheck<bb::fr>(builder, *ctx.analyzer, pre);
    ASSERT_TRUE(sc.is_valid);
    auto sh = HonkZKRecursionValidation::Shplemini::validate_shplemini<bb::fr>(builder, *ctx.analyzer, sc);
    ASSERT_TRUE(sh.is_valid);
    auto kzg = HonkZKRecursionValidation::KZG::validate_kzg<bb::fr>(builder, *ctx.analyzer, sh);
    ASSERT_TRUE(kzg.is_valid);
    auto out = HonkZKRecursionValidation::Output::validate_output<bb::fr>(builder, *ctx.analyzer, kzg);
    EXPECT_FALSE(out.is_valid);
}

TEST_F(HonkZKRecursionDiscoveryTests, RejectsCorruptedHonkZKRecursionEndToEndRealAcirBuild)
{
    acir_format::AcirProgram program = make_mock_acir_program(0);
    const auto& constraint = program.constraints.honk_recursion_constraints[0];
    Builder real_builder(program.witness, program.constraints.public_inputs, false);
    [[maybe_unused]] auto real_output =
        acir_format::create_honk_recursion_constraints<RecursiveFlavor, IO>(real_builder, constraint);

    const auto bounds = HonkZKRecursionValidation::compute_arith_boundaries_from_oink_start();
    const size_t gate = bounds.sumcheck;
    ASSERT_LT(gate, real_builder.blocks.arithmetic.size());
    real_builder.blocks.arithmetic.q_m().set(gate, real_builder.blocks.arithmetic.q_m()[gate] + bb::fr::one());

    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(real_builder, false);
    auto result = HonkZKRecursionValidation::validate_honk_zk_recursion<bb::fr>(
        real_builder, analyzer, constraint, constraint.proof);
    EXPECT_FALSE(result.is_valid);
}

TEST_F(HonkZKRecursionDiscoveryTests, ValidateHonkZKOinkCommitmentsWithAcirPublicInputs)
{
    // Baseline TZ pins 0 ACIR pub inputs for FP constants. With extra ACIR PIs the Oink
    // arith window drifts, so do not require ARITH_TOTAL match — only DefaultIO prefix
    // indexing (Phase 2 Rule C) for all 9 commitment groups on constraint.proof.
    HonkZKValidatorContext ctx(/*num_pub_inputs=*/2);
    ASSERT_FALSE(ctx.vc.constraint.public_inputs.empty());
    namespace HZO = HonkZKRecursionValidation::Oink;
    const size_t prefix = HZO::honk_zk_public_input_prefix_size(&ctx.vc.constraint);
    EXPECT_EQ(prefix, HZO::HONK_ZK_DEFAULT_IO_PUBLIC_INPUTS);
    for (size_t g = 0; g < HZO::NUM_COMMITMENT_GROUPS; ++g) {
        const auto frs = HZO::get_honk_zk_commitment_group_witness_indices(ctx.vc.constraint.proof, g, prefix);
        EXPECT_TRUE(frs.has_value()) << "group " << g << " must resolve after DefaultIO prefix with ACIR PIs present";
    }
    EXPECT_TRUE(recursion_helpers::validate_vk_hash<bb::fr>(ctx.vc.builder(), *ctx.analyzer, &ctx.vc.constraint));
}

TEST_F(HonkZKRecursionDiscoveryTests, StaticAnalyzerAcceptsHonkZKRecursion)
{
    acir_format::AcirProgram program = make_mock_acir_program(0);
    Builder builder = create_circuit<Builder>(program);
    EXPECT_GT(builder.blocks.arithmetic.size(), 0UL);
    const auto squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    EXPECT_EQ(squeezes.size(), 1U) << "Output recursion_separator only (matches bare HONK post-merge)";
}

// ============================================================================
// Phase 2 (acir-witness-gate-discovery): serialization → gate dump → primitive_start.
// Same chain as Phase 1: create_honk_recursion_constraints real build.
// ============================================================================

static size_t min_gate_in_block(Builder& builder,
                                cdg::StaticAnalyzer_<bb::fr, Builder>& analyzer,
                                uint32_t witness_idx,
                                size_t block_idx)
{
    size_t best = SIZE_MAX;
    const uint32_t real = builder.real_variable_index[witness_idx];
    auto& target = builder.blocks.get()[block_idx];
    for (const auto& [blk, gi] : analyzer.get_variable_gates(real)) {
        if (&builder.blocks.get()[blk] == &target) {
            best = std::min(best, gi);
        }
    }
    return best;
}

static void dump_slot_gates(std::ostream& out,
                            Builder& builder,
                            cdg::StaticAnalyzer_<bb::fr, Builder>& analyzer,
                            const char* part,
                            const char* slot,
                            uint32_t witness_idx)
{
    const uint32_t real = builder.real_variable_index[witness_idx];
    out << part << " " << slot << " wit=" << witness_idx << " real=" << real;
    auto gates = analyzer.get_variable_gates(real);
    out << " n=" << gates.size();
    for (const auto& [blk, gi] : gates) {
        out << " [" << blk << "]@" << gi;
    }
    out << "\n";
}

static std::optional<std::array<uint32_t, recursion_helpers::FRS_PER_COMMITMENT>> get_zk_proof_position_frs(
    const std::vector<uint32_t>& proof_indices, size_t io_prefix, size_t proof_position)
{
    const size_t base = io_prefix + proof_position * recursion_helpers::FRS_PER_COMMITMENT;
    if (base + 3 >= proof_indices.size()) {
        return std::nullopt;
    }
    return std::array<uint32_t, recursion_helpers::FRS_PER_COMMITMENT>{
        proof_indices[base], proof_indices[base + 1], proof_indices[base + 2], proof_indices[base + 3]
    };
}

TEST_F(HonkZKRecursionDiscoveryTests, AcirHonkZKWitnessSerializationParse)
{
    acir_format::AcirProgram program = make_mock_acir_program(0);
    const auto& c = program.constraints.honk_recursion_constraints[0];
    ASSERT_EQ(program.constraints.original_opcode_indices.honk_recursion_constraints.at(0), 0U);
    ASSERT_EQ(c.proof_type, acir_format::PROOF_TYPE::HONK_ZK);
    ASSERT_TRUE(c.predicate.is_constant);

    std::vector<uint32_t> proof_indices = acir_format::add_public_inputs_to_proof(c.proof, c.public_inputs);
    EXPECT_EQ(proof_indices.size(), c.proof.size() + c.public_inputs.size());

    namespace HZO = HonkZKRecursionValidation::Oink;
    namespace VD = HonkZKRecursionValidation::VkDeserialize;
    ASSERT_GT(c.key.size(), VD::FIRST_COMMITMENT_KEY_INDEX);
    const size_t prefix = HZO::honk_zk_public_input_prefix_size(&c);
    EXPECT_EQ(prefix, HZO::HONK_ZK_DEFAULT_IO_PUBLIC_INPUTS);

    // Proof positions 0..8 after DefaultIO prefix (Gemini masking + 8 Ultra wires).
    for (size_t pos = 0; pos < HZO::NUM_COMMITMENT_GROUPS; ++pos) {
        ASSERT_TRUE(get_zk_proof_position_frs(proof_indices, prefix, pos).has_value()) << "pos " << pos;
    }

    std::ofstream out("honk_zk_witness_serialization.txt");
    ASSERT_TRUE(out.is_open());
    out << "# HONK_ZK witness serialization — opcode=0 proof_type=HONK_ZK\n";
    out << "# key.size=" << c.key.size() << " proof.size=" << c.proof.size()
        << " public_inputs.size=" << c.public_inputs.size() << "\n";
    out << "# Production: honk_recursion_constraint.cpp fields_from_witnesses / from_witness_index\n";
    out << "# Rule A: proof_indices = { public_inputs | proof }\n";
    out << "# Rule B: key[i] → VK limb i; key_hash → single witness\n";
    out << "# Rule C: io_prefix=" << prefix << " (DefaultIO pairing points inside proof body); proof_position p base = "
        << "prefix + p * " << recursion_helpers::FRS_PER_COMMITMENT << "\n";
    out << "# Rule D: none (constant-true predicate; no rollup split; no write-vk)\n";
    out << "# Oink proof_position order (after prefix): 0=gemini_masking, 1..8 = Ultra wires "
           "(PRE_ETA/POST_ETA/POST_BETA/Z_PERM layouts in oink header)\n\n";

    out << "# Aligned witness table\n";
    out << "# logical_slot | source_rule | witness_index | primitive_part | role | prod_order\n";
    out << "key_hash | B | " << c.key_hash << " | Oink:vk_hash | wrapper→circuit | 5\n";
    for (size_t i = 0; i < 3 && i < c.key.size(); ++i) {
        out << "key[" << i << "] | B | " << c.key[i] << " | wrapper_scalar | wrapper | 1\n";
    }
    for (size_t i = VD::FIRST_COMMITMENT_KEY_INDEX; i < c.key.size(); ++i) {
        out << "key[" << i << "] | B | " << c.key[i] << " | VkDeserialize | circuit | 4\n";
    }
    for (size_t i = 0; i < prefix && i < proof_indices.size(); ++i) {
        out << "stitched_proof[" << i << "] | A+C | " << proof_indices[i]
            << " | Oink:public_inputs/Output | serialization | 3\n";
    }
    static constexpr const char* POS_NAMES[] = { "Oink:gemini_masking",
                                                 "Oink:w_l",
                                                 "Oink:w_r",
                                                 "Oink:w_o",
                                                 "Oink:lookup_read_counts",
                                                 "Oink:lookup_read_tags",
                                                 "Oink:w_4",
                                                 "Oink:lookup_inverses",
                                                 "Oink:z_perm" };
    for (size_t pos = 0; pos < HZO::NUM_COMMITMENT_GROUPS; ++pos) {
        const auto frs = get_zk_proof_position_frs(proof_indices, prefix, pos);
        for (size_t limb = 0; limb < recursion_helpers::FRS_PER_COMMITMENT; ++limb) {
            out << "commitment_pos" << pos << "_fr" << limb << " | C | " << (*frs)[limb] << " | " << POS_NAMES[pos]
                << " | serialization | 6\n";
        }
    }
    out << "\nfirst_primitive_part=VkDeserialize\n";
    out << "last_serialization_part_before_primitive=wrapper (no gates)\n";
    out.flush();
}

TEST_F(HonkZKRecursionDiscoveryTests, AcirHonkZKWitnessGateDump)
{
    acir_format::AcirProgram program = make_mock_acir_program(0);
    const auto& c = program.constraints.honk_recursion_constraints[0];
    Builder builder(program.witness, program.constraints.public_inputs, false);
    [[maybe_unused]] auto output = acir_format::create_honk_recursion_constraints<RecursiveFlavor, IO>(builder, c);
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);

    namespace HZO = HonkZKRecursionValidation::Oink;
    namespace VD = HonkZKRecursionValidation::VkDeserialize;
    const auto proof_indices = acir_format::add_public_inputs_to_proof(c.proof, c.public_inputs);
    const size_t prefix = HZO::honk_zk_public_input_prefix_size(&c);

    std::ofstream out("honk_zk_witness_gate_dump.txt");
    ASSERT_TRUE(out.is_open());
    out << "# HONK_ZK Phase 2 witness gate dump (aligned slots only)\n";
    out << "# Chain: create_honk_recursion_constraints real build\n\n";

    dump_slot_gates(out, builder, analyzer, "Oink:vk_hash", "key_hash", c.key_hash);
    for (size_t i = 0; i < 3 && i < c.key.size(); ++i) {
        dump_slot_gates(out, builder, analyzer, "wrapper_scalar", ("key[" + std::to_string(i) + "]").c_str(), c.key[i]);
    }
    for (size_t i = VD::FIRST_COMMITMENT_KEY_INDEX; i < c.key.size(); ++i) {
        dump_slot_gates(out, builder, analyzer, "VkDeserialize", ("key[" + std::to_string(i) + "]").c_str(), c.key[i]);
    }
    for (size_t pos = 0; pos < HZO::NUM_COMMITMENT_GROUPS; ++pos) {
        const auto frs = get_zk_proof_position_frs(proof_indices, prefix, pos);
        ASSERT_TRUE(frs.has_value());
        for (size_t limb = 0; limb < recursion_helpers::FRS_PER_COMMITMENT; ++limb) {
            dump_slot_gates(out,
                            builder,
                            analyzer,
                            ("Oink:comm_pos" + std::to_string(pos)).c_str(),
                            ("fr" + std::to_string(limb)).c_str(),
                            (*frs)[limb]);
        }
    }
    out.flush();
    SUCCEED();
}

TEST_F(HonkZKRecursionDiscoveryTests, AcirHonkZKPrimitiveStartDiscovery)
{
    acir_format::AcirProgram program = make_mock_acir_program(0);
    const auto& c = program.constraints.honk_recursion_constraints[0];
    Builder builder(program.witness, program.constraints.public_inputs, false);
    [[maybe_unused]] auto output = acir_format::create_honk_recursion_constraints<RecursiveFlavor, IO>(builder, c);
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
    auto& arith = builder.blocks.arithmetic;
    namespace VD = HonkZKRecursionValidation::VkDeserialize;
    namespace HZO = HonkZKRecursionValidation::Oink;

    size_t first_key_arith = SIZE_MAX;
    size_t max_key_arith = 0;
    for (size_t j = VD::FIRST_COMMITMENT_KEY_INDEX; j < c.key.size(); ++j) {
        first_key_arith =
            std::min(first_key_arith, min_gate_in_block(builder, analyzer, c.key[j], BLOCK_IDX_ARITHMETIC));
        const uint32_t real = builder.real_variable_index[c.key[j]];
        for (const auto& [blk, gi] : analyzer.get_variable_gates(real)) {
            if (&builder.blocks.get()[blk] == &arith) {
                max_key_arith = std::max(max_key_arith, gi);
            }
        }
    }
    ASSERT_NE(first_key_arith, SIZE_MAX) << "no arithmetic gate for any key[3..] commitment field";

    const size_t key_hash_p2ext = min_gate_in_block(builder, analyzer, c.key_hash, BLOCK_IDX_POSEIDON2_EXT);
    ASSERT_NE(key_hash_p2ext, SIZE_MAX) << "key_hash must link into poseidon2_external (Oink vk_hash)";

    const auto proof_indices = acir_format::add_public_inputs_to_proof(c.proof, c.public_inputs);
    const size_t prefix = HZO::honk_zk_public_input_prefix_size(&c);
    const auto g0 = get_zk_proof_position_frs(proof_indices, prefix, /*gemini_masking*/ 0);
    ASSERT_TRUE(g0.has_value());
    const size_t proof0_arith = min_gate_in_block(builder, analyzer, (*g0)[0], BLOCK_IDX_ARITHMETIC);

    // Pin primitive_start = earliest key[3..] arith gate (first circuit gates from opcode witnesses).
    // Region end = max key[3..] arith + 1 when stale ARITH FP cannot locate range.
    size_t primitive_start_arith = first_key_arith;
    size_t vk_deserialize_region_end = max_key_arith + 1;
    bool used_stale_fp = true;
    auto region_start =
        recursion_helpers::find_fingerprint_range_containing_gate(builder, arith, first_key_arith, VD::ARITH);
    if (region_start.has_value()) {
        primitive_start_arith = *region_start;
        vk_deserialize_region_end = *region_start + VD::ARITH.gate_count;
        used_stale_fp = false;
    }

    EXPECT_GE(first_key_arith, primitive_start_arith);
    EXPECT_LT(first_key_arith, vk_deserialize_region_end);

    bool key_hash_early_arith = false;
    {
        const uint32_t key_hash_real = builder.real_variable_index[c.key_hash];
        for (const auto& [blk, gi] : analyzer.get_variable_gates(key_hash_real)) {
            if (&builder.blocks.get()[blk] == &arith && gi < vk_deserialize_region_end) {
                key_hash_early_arith = true;
            }
        }
    }
    EXPECT_FALSE(key_hash_early_arith);

    const size_t serialization_end_arith = 0;
    EXPECT_GT(primitive_start_arith, serialization_end_arith);

    const bool fp_ok = recursion_helpers::matches_fingerprint_at(builder, arith, primitive_start_arith, VD::ARITH);
    auto measured =
        compute_block_fingerprint(builder, BLOCK_IDX_ARITHMETIC, primitive_start_arith, vk_deserialize_region_end);

    std::ofstream out("honk_zk_witness_gate_map.txt");
    ASSERT_TRUE(out.is_open());
    out << "# HONK_ZK Phase 2 witness gate map\n";
    out << "first_primitive_part=VkDeserialize\n";
    out << "last_serialization_part=wrapper (no gates)\n";
    out << "serialization_end_arith=" << serialization_end_arith << "\n";
    out << "primitive_start_arith=" << primitive_start_arith << " (alias circuit_build_start_arith)\n";
    out << "vk_deserialize_region_end_arith=" << vk_deserialize_region_end << "\n";
    out << "first_key_commitment_gate_arith=" << first_key_arith << "\n";
    out << "first_key_commitment_gate_nnf=none\n";
    out << "oink_vk_hash_poseidon2_ext_start=" << key_hash_p2ext << "\n";
    out << "proof_pos0_fr0_arith_gate_min=" << (proof0_arith == SIZE_MAX ? -1 : static_cast<long>(proof0_arith))
        << "\n";
    out << "key_hash_touches_arith_before_region_end=" << (key_hash_early_arith ? 1 : 0) << "\n";
    out << "early_opcode_witnesses=key[0..2](scalar,wrapper),key_hash(wrapper),proof_indices(wrapper)\n";
    out << "vk_deserialize_arith_fp_match_pinned=" << (fp_ok ? "true" : "false") << "\n";
    out << "vk_deserialize_pinned_fp_stale=" << (used_stale_fp || !fp_ok ? "true" : "false") << "\n";
    out << "measured_vk_deserialize_arith gates=" << measured.gate_count << " prefix20=0x" << std::hex
        << measured.prefix_hash << " full=0x" << measured.full_hash << std::dec << "\n";
    out << "# Phase 3: cursor-migrate from primitive_start_arith; refresh VkDeserialize::ARITH from measured_*\n";
    out << "# Gemini masking = proof_position 0 after DefaultIO prefix; Libra limbs after Sumcheck start.\n";
    out.flush();

    if (used_stale_fp) {
        EXPECT_EQ(primitive_start_arith, first_key_arith) << "when FP stale, pin equals first key[3..] arith gate";
    } else {
        EXPECT_GE(first_key_arith, primitive_start_arith);
        EXPECT_TRUE(fp_ok) << "pinned VD::ARITH must match at discovered region start";
    }
}

// ============================================================================
// Phase 3 Step 1: promote multi-block cursors + FunctionFingerprints from mirror
// stage boundaries (parity-licensed) and verify matches_fingerprint_at on real build.
// ============================================================================

TEST_F(HonkZKRecursionDiscoveryTests, AcirHonkZKPhase3CursorPromote)
{
    VerifierComponents vc = setup_honk_zk_verifier_components(0);
    auto snap_setup = recursion_helpers::BlockSnapshot::capture(vc.builder());
    run_oink_step(vc);
    auto snap_oink = recursion_helpers::BlockSnapshot::capture(vc.builder());
    run_gate_challenges_step(vc);
    auto snap_pre = recursion_helpers::BlockSnapshot::capture(vc.builder());
    auto sc_output = run_sumcheck_step(vc);
    auto snap_sc = recursion_helpers::BlockSnapshot::capture(vc.builder());
    auto shp_output = run_shplemini_step(vc, sc_output);
    auto snap_shp = recursion_helpers::BlockSnapshot::capture(vc.builder());
    auto pcs = run_kzg_step(vc, shp_output);
    auto snap_kzg = recursion_helpers::BlockSnapshot::capture(vc.builder());
    run_output_step(vc, pcs);
    auto snap_out = recursion_helpers::BlockSnapshot::capture(vc.builder());

    auto sz = [](const recursion_helpers::BlockSnapshot& s, size_t b) -> size_t {
        return b < s.sizes.size() ? s.sizes[b] : 0;
    };

    std::ofstream out("honk_zk_phase3_cursor_promote.txt");
    ASSERT_TRUE(out.is_open());
    out << "# HONK_ZK Phase 3 cursor / FP promotion (mirror stage boundaries)\n";
    out << "# Phase 2: primitive_start_arith=1709 vk_deserialize_region_end=4372\n";
    out << "setup arith=" << sz(snap_setup, BLOCK_IDX_ARITHMETIC) << " nnf=" << sz(snap_setup, BLOCK_IDX_NNF)
        << " mem=" << sz(snap_setup, BLOCK_IDX_MEMORY) << " p2ext=" << sz(snap_setup, BLOCK_IDX_POSEIDON2_EXT)
        << " p2int=" << sz(snap_setup, BLOCK_IDX_POSEIDON2_INT) << "\n";
    if (sz(snap_setup, BLOCK_IDX_NNF) > 0) {
        auto setup_nnf_fp = compute_block_fingerprint(vc.builder(), BLOCK_IDX_NNF, 0, sz(snap_setup, BLOCK_IDX_NNF));
        out << "setup_nnf gates=" << setup_nnf_fp.gate_count << " prefix=0x" << std::hex << setup_nnf_fp.prefix_hash
            << " full=0x" << setup_nnf_fp.full_hash << std::dec << "\n";
    }
    if (sz(snap_setup, BLOCK_IDX_ARITHMETIC) > 1709) {
        auto pre_prim = compute_block_fingerprint(vc.builder(), BLOCK_IDX_ARITHMETIC, 0, 1709);
        out << "pre_primitive_arith gates=" << pre_prim.gate_count << " prefix=0x" << std::hex << pre_prim.prefix_hash
            << " full=0x" << pre_prim.full_hash << std::dec << "\n";
    }

    const std::array<std::pair<const char*, const recursion_helpers::BlockSnapshot*>, 6> stages = { {
        { "Oink", &snap_oink },
        { "Preprocessor", &snap_pre },
        { "Sumcheck", &snap_sc },
        { "Shplemini", &snap_shp },
        { "KZG", &snap_kzg },
        { "Output", &snap_out },
    } };
    const recursion_helpers::BlockSnapshot* prev = &snap_setup;
    for (const auto& [name, cur] : stages) {
        out << "\n# " << name << "\n";
        for (size_t b : { BLOCK_IDX_ARITHMETIC,
                          BLOCK_IDX_MEMORY,
                          BLOCK_IDX_NNF,
                          BLOCK_IDX_POSEIDON2_EXT,
                          BLOCK_IDX_POSEIDON2_INT }) {
            const size_t lo = sz(*prev, b);
            const size_t hi = sz(*cur, b);
            if (hi <= lo) {
                continue;
            }
            auto fp = compute_block_fingerprint(vc.builder(), b, lo, hi);
            out << name << " block[" << b << "] " << block_kind_name(b) << " start=" << lo << " end=" << hi
                << " gates=" << fp.gate_count << " prefix=0x" << std::hex << fp.prefix_hash << " full=0x"
                << fp.full_hash << std::dec << "\n";
            EXPECT_TRUE(recursion_helpers::matches_fingerprint_at(vc.builder(), vc.builder().blocks.get()[b], lo, fp))
                << name << " " << block_kind_name(b) << " mirror FP self-check failed at " << lo;
        }
        prev = cur;
    }
    out.flush();

    // Real build: VkDeserialize at Phase 2 pin, then Oink arith at setup.arith.
    acir_format::AcirProgram program = make_mock_acir_program(0);
    const auto& constraint = program.constraints.honk_recursion_constraints[0];
    Builder real_builder(program.witness, program.constraints.public_inputs, false);
    [[maybe_unused]] auto real_out =
        acir_format::create_honk_recursion_constraints<RecursiveFlavor, IO>(real_builder, constraint);

    constexpr size_t primitive_start = 1709;
    constexpr recursion_helpers::FunctionFingerprint vd_arith = {
        2663, 0xec01069372bf3deaULL, 0xd9ed1c196b16b6bdULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
    };
    auto& real_arith = real_builder.blocks.arithmetic;
    const size_t oink_arith_start = sz(snap_setup, BLOCK_IDX_ARITHMETIC);
    EXPECT_TRUE(recursion_helpers::matches_fingerprint_at(real_builder, real_arith, primitive_start, vd_arith))
        << "real build VkDeserialize ARITH must match at Phase 2 primitive_start";

    const size_t vd_end = primitive_start + vd_arith.gate_count;
    auto residual = compute_block_fingerprint(real_builder, BLOCK_IDX_ARITHMETIC, vd_end, oink_arith_start);
    auto pre_oink_full =
        compute_block_fingerprint(real_builder, BLOCK_IDX_ARITHMETIC, primitive_start, oink_arith_start);
    auto oink_arith_fp = compute_block_fingerprint(
        real_builder, BLOCK_IDX_ARITHMETIC, oink_arith_start, sz(snap_oink, BLOCK_IDX_ARITHMETIC));
    EXPECT_TRUE(recursion_helpers::matches_fingerprint_at(real_builder, real_arith, oink_arith_start, oink_arith_fp))
        << "real Oink ARITH must match mirror-promoted FP at cursor " << oink_arith_start;

    out << "\n# real-build checks\n";
    out << "primitive_start_arith=" << primitive_start << "\n";
    out << "vk_deserialize_end=" << vd_end << "\n";
    out << "setup_residual gates=" << residual.gate_count << " prefix=0x" << std::hex << residual.prefix_hash
        << " full=0x" << residual.full_hash << std::dec << "\n";
    out << "pre_oink_full gates=" << pre_oink_full.gate_count << " prefix=0x" << std::hex << pre_oink_full.prefix_hash
        << " full=0x" << pre_oink_full.full_hash << std::dec << "\n";
    out << "oink_arith_start=" << oink_arith_start << " oink_arith_gates=" << oink_arith_fp.gate_count << " prefix=0x"
        << std::hex << oink_arith_fp.prefix_hash << " full=0x" << oink_arith_fp.full_hash << std::dec << "\n";
    out << "setup_nnf=" << sz(snap_setup, BLOCK_IDX_NNF) << "\n";
    out.flush();
}
