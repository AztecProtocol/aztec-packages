// Steps of MegaZK Chonk Recursive Verifier — boomerang analysis tests.
//
// Verification flow:
//   step0 : OinkVerifier (vk_hash, num_pub_assert, commitments, eta/beta/gamma/alpha)
//   step1 : step2_padding_and_challenges (padding_indicator_array + gate_challenges dyadic powers)
//   step2 : (reserved; step2 == step 3 in zero-indexed naming below uses "step3" for sumcheck)
//   step3 : SumcheckVerifier (16 rounds × check_sum + partially_evaluate)
//   step4 : ShpleminiVerifier::compute_batch_opening_claim (gemini + shplonk)
//   step5 : KZG::reduce_verify_batch_opening_claim (W_receive + masking + batch_mul)
//
// Multi-block snapshot helpers and fingerprint constants live in recursion_constraints_helper.hpp.

#include "barretenberg/boomerang_value_detection/graph_description_acir.hpp"
#include "barretenberg/commitment_schemes/claim_batcher.hpp"
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/chonk_recursion_constraints.hpp"
#include "barretenberg/dsl/acir_format/mock_verifier_inputs.hpp"
#include "barretenberg/dsl/acir_format/utils.hpp"
#include "barretenberg/flavor/mega_zk_recursive_flavor.hpp"
#include "barretenberg/honk/proof_length.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_helper.hpp"
#include "barretenberg/stdlib/primitives/padding_indicator_array/padding_indicator_array.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/ultra_honk/oink_verifier.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include "barretenberg/ultra_honk/verifier_instance.hpp"
#include <algorithm>
#include <array>
#include <fstream>
#include <gtest/gtest.h>
#include <optional>
#include <random>
#include <string>
#include <utility>
#include <vector>

using namespace bb;
using namespace acir_format;
using namespace cdg;

// ============================================================================
// Anonymous namespace: low-level helpers
// ============================================================================
namespace {

// ── Types shared across tests ─────────────────────────────────────────────────
using Builder = UltraCircuitBuilder;
using RecursiveFlavor = MegaZKRecursiveFlavor_<Builder>;
using IO = stdlib::recursion::honk::HidingKernelIO<Builder>;
using Curve = RecursiveFlavor::Curve;
using FF = RecursiveFlavor::FF;
using Shplemini = ShpleminiVerifier_<Curve, RecursiveFlavor::HasZK>;
using ClaimBatcher = ClaimBatcher_<Curve>;
using field_ct = stdlib::field_t<Builder>;
using Transcript = RecursiveFlavor::Transcript;
using RecursiveVK = RecursiveFlavor::VerificationKey;
using VKAndHash = RecursiveFlavor::VKAndHash;
using VerifierInst = VerifierInstance_<RecursiveFlavor>;
using StdlibProof = stdlib::Proof<Builder>;

// ── Mock-circuit setup helpers ────────────────────────────────────────────────

// Build a RecursionConstraint + witness vector for a mock MegaZK proof.
// num_acir_pub_inputs: ACIR-level public inputs (0 is common for testing).
static AcirProgram make_mock_acir_program(size_t num_acir_pub_inputs = 0)
{
    const size_t dyadic_size = 1 << MegaZKFlavor::VIRTUAL_LOG_N;
    auto native_vk = create_mock_honk_vk<MegaZKFlavor, IO>(dyadic_size, num_acir_pub_inputs);
    // create_mock_chonk_proof returns just the mega HonkProof (wrapped in ChonkProof)
    auto native_chonk = create_mock_chonk_proof<Builder>(num_acir_pub_inputs);

    AcirProgram program;
    RecursionConstraint constraint =
        recursion_data_to_recursion_constraint(program.witness,
                                               native_chonk, // full ChonkProof as field elements (mega+goblin)
                                               native_vk->to_field_elements(),
                                               native_vk->hash(),
                                               bb::fr::zero(), // predicate = 1 (zero means disabled in new API)
                                               num_acir_pub_inputs,
                                               PROOF_TYPE::CHONK);

    // Predicate is unused in Chonk; fix to constant 1
    program.witness.pop_back();
    constraint.predicate = WitnessOrConstant<bb::fr>::from_constant(bb::fr::one());

    program.constraints.max_witness_index = static_cast<uint32_t>(program.witness.size() - 1);
    program.constraints.num_acir_opcodes = 1;
    program.constraints.chonk_recursion_constraints = { constraint };
    program.constraints.original_opcode_indices =
        AcirFormatOriginalOpcodeIndices{ .chonk_recursion_constraints = { 0 } };

    return program;
}

// Build and return a Builder containing the full MegaZK recursive verification circuit.
[[maybe_unused]] static Builder build_full_circuit(size_t num_acir_pub_inputs = 0)
{
    AcirProgram program = make_mock_acir_program(num_acir_pub_inputs);
    return create_circuit<Builder>(program, { .has_ipa_claim = true });
}

// ── Verifier-component struct for step-by-step construction ──────────────────

// Builder stored in unique_ptr so field_t context pointers (created with &builder)
// remain valid after setup_verifier_components returns — a plain Builder value member
// would be moved, invalidating those pointers.
struct VerifierComponents {
    std::unique_ptr<Builder> builder_ptr;
    std::shared_ptr<VKAndHash> vk_and_hash;
    std::shared_ptr<Transcript> transcript;
    std::shared_ptr<VerifierInst> verifier_instance;
    StdlibProof mega_stdlib_proof;
    size_t num_public_inputs = 0;
    size_t log_n = 0;
    // VK witness indices — needed to construct RecursionConstraint for oink validators
    std::vector<uint32_t> key_indices;
    uint32_t key_hash_idx = 0;

    Builder& builder() { return *builder_ptr; }
    const Builder& builder() const { return *builder_ptr; }
};

// Reconstruct verifier components from an ACIR recursion constraint.
// Does NOT call any verifier step — the caller drives step-by-step execution.
static VerifierComponents setup_verifier_components(size_t num_acir_pub_inputs = 0)
{
    AcirProgram program = make_mock_acir_program(num_acir_pub_inputs);
    const auto& constraint = program.constraints.chonk_recursion_constraints[0];

    auto builder_ptr = std::make_unique<Builder>(program.witness, program.constraints.public_inputs, false);
    Builder& builder = *builder_ptr;

    auto key_fields = fields_from_witnesses(builder, constraint.key);
    auto recursive_vk = std::make_shared<RecursiveVK>(key_fields);

    auto vk_hash_ct = field_ct::from_witness_index(&builder, constraint.key_hash);
    auto vk_and_hash = std::make_shared<VKAndHash>(recursive_vk, vk_hash_ct);

    std::vector<uint32_t> proof_indices = add_public_inputs_to_proof(constraint.proof, constraint.public_inputs);
    auto proof_fields = fields_from_witnesses(builder, proof_indices);
    StdlibProof stdlib_proof(proof_fields);

    auto transcript = std::make_shared<Transcript>();
    transcript->load_proof(stdlib_proof);

    auto verifier_instance = std::make_shared<VerifierInst>(vk_and_hash);

    VerifierComponents vc;
    vc.builder_ptr = std::move(builder_ptr);
    vc.vk_and_hash = vk_and_hash;
    vc.transcript = transcript;
    vc.verifier_instance = verifier_instance;
    vc.mega_stdlib_proof = std::move(stdlib_proof);
    vc.num_public_inputs = acir_format::HIDING_KERNEL_PUBLIC_INPUTS_SIZE + num_acir_pub_inputs;
    vc.log_n = static_cast<size_t>(MegaZKFlavor::VIRTUAL_LOG_N);
    vc.key_indices = constraint.key;
    vc.key_hash_idx = constraint.key_hash;
    return vc;
}

struct OinkValidationInputs {
    RecursionConstraint constraint;
    std::vector<uint32_t> proof_body_witnesses;
};

static std::vector<uint32_t> extract_proof_body_witnesses(const RecursionConstraint& constraint);

struct AcirOinkValidationContext {
    VerifierComponents vc;
    OinkValidationInputs inputs;
};

static OinkValidationInputs make_oink_validation_inputs(const VerifierComponents& vc, size_t num_acir_pub_inputs = 0)
{
    OinkValidationInputs out;
    out.constraint.key = vc.key_indices;
    out.constraint.key_hash = vc.key_hash_idx;
    out.constraint.proof_type = PROOF_TYPE::CHONK;
    out.constraint.predicate = WitnessOrConstant<bb::fr>::from_constant(bb::fr::one());
    if (num_acir_pub_inputs > 0) {
        AcirProgram program = make_mock_acir_program(num_acir_pub_inputs);
        out.constraint.public_inputs = program.constraints.chonk_recursion_constraints[0].public_inputs;
    }
    const size_t proof_body_offset = acir_format::HIDING_KERNEL_PUBLIC_INPUTS_SIZE;
    if (proof_body_offset > vc.mega_stdlib_proof.size()) {
        return out;
    }
    out.proof_body_witnesses.reserve(vc.mega_stdlib_proof.size() - proof_body_offset);
    for (size_t idx = proof_body_offset; idx < vc.mega_stdlib_proof.size(); ++idx) {
        const auto& field = vc.mega_stdlib_proof[idx];
        out.proof_body_witnesses.push_back(field.get_witness_index());
    }
    out.constraint.proof = out.proof_body_witnesses;
    return out;
}

static AcirOinkValidationContext setup_acir_oink_validation_context(size_t num_acir_pub_inputs = 0)
{
    AcirProgram program = make_mock_acir_program(num_acir_pub_inputs);
    const auto constraint = program.constraints.chonk_recursion_constraints[0];

    AcirOinkValidationContext ctx;
    ctx.vc = setup_verifier_components(num_acir_pub_inputs);
    ctx.inputs.constraint = constraint;
    ctx.inputs.proof_body_witnesses = extract_proof_body_witnesses(constraint);
    return ctx;
}

struct SumcheckStepOutput {
    SumcheckOutput<RecursiveFlavor> sumcheck_output;
    std::array<RecursiveFlavor::Commitment, NUM_LIBRA_COMMITMENTS> libra_commitments;
};

static void run_oink_verifier_step(VerifierComponents& vc)
{
    OinkVerifier<RecursiveFlavor> oink{ vc.verifier_instance, vc.transcript, vc.num_public_inputs };
    oink.verify();
}

static std::vector<FF> run_padding_indicator_array_step(VerifierComponents& vc)
{
    std::vector<FF> padding_indicator_array(vc.log_n, FF{ 1 });
    if constexpr (RecursiveFlavor::HasZK && RecursiveFlavor::USE_PADDING) {
        auto vk_ptr = vc.verifier_instance->get_vk();
        padding_indicator_array =
            stdlib::compute_padding_indicator_array<Curve, RecursiveFlavor::VIRTUAL_LOG_N>(vk_ptr->log_circuit_size);
    }
    vc.verifier_instance->gate_challenges =
        vc.transcript->template get_dyadic_powers_of_challenge<FF>("Sumcheck:gate_challenge", vc.log_n);

    return padding_indicator_array;
}

static SumcheckStepOutput run_sumcheck_step(VerifierComponents& vc, const std::vector<FF>& padding_indicator_array)
{
    using Commitment = RecursiveFlavor::Commitment;

    std::array<Commitment, NUM_LIBRA_COMMITMENTS> libra_commitments{};
    if constexpr (RecursiveFlavor::HasZK) {
        libra_commitments[0] =
            vc.transcript->template receive_from_prover<Commitment>("Libra:concatenation_commitment");
    }

    SumcheckVerifier<RecursiveFlavor> sumcheck(vc.transcript, vc.verifier_instance->alpha, vc.log_n);
    SumcheckOutput<RecursiveFlavor> sumcheck_output = sumcheck.verify(
        vc.verifier_instance->relation_parameters, vc.verifier_instance->gate_challenges, padding_indicator_array);

    if constexpr (RecursiveFlavor::HasZK) {
        libra_commitments[1] = vc.transcript->template receive_from_prover<Commitment>("Libra:grand_sum_commitment");
        libra_commitments[2] = vc.transcript->template receive_from_prover<Commitment>("Libra:quotient_commitment");
    }

    return { std::move(sumcheck_output), std::move(libra_commitments) };
}

static ShpleminiVerifierOutput_<Curve, RecursiveFlavor::HasZK> run_shplemini_step(
    VerifierComponents& vc,
    const std::vector<FF>& padding_indicator_array,
    SumcheckOutput<RecursiveFlavor>& sumcheck_output,
    const std::array<RecursiveFlavor::Commitment, NUM_LIBRA_COMMITMENTS>& libra_commitments)
{
    using Commitment = RecursiveFlavor::Commitment;
    using VerifierCommitments = RecursiveFlavor::VerifierCommitments;

    VerifierCommitments commitments{ vc.verifier_instance->get_vk(), vc.verifier_instance->witness_commitments };
    if constexpr (RecursiveFlavor::HasZK) {
        commitments.gemini_masking_poly = vc.verifier_instance->gemini_masking_commitment;
    }

    using ClaimBatch = ClaimBatcher::Batch;
    ClaimBatcher claim_batcher{
        .unshifted = ClaimBatch{ commitments.get_unshifted(), sumcheck_output.claimed_evaluations.get_unshifted() },
        .shifted = ClaimBatch{ commitments.get_to_be_shifted(), sumcheck_output.claimed_evaluations.get_shifted() }
    };

    Commitment one_commitment = Commitment::one(&vc.builder());
    return Shplemini::compute_batch_opening_claim(padding_indicator_array,
                                                  claim_batcher,
                                                  sumcheck_output.challenge,
                                                  one_commitment,
                                                  vc.transcript,
                                                  RecursiveFlavor::REPEATED_COMMITMENTS,
                                                  libra_commitments,
                                                  sumcheck_output.claimed_libra_evaluation);
}

static void run_kzg_step(VerifierComponents& vc,
                         ShpleminiVerifierOutput_<Curve, RecursiveFlavor::HasZK>& shplemini_output)
{
    using KZG = bb::KZG<Curve>;

    const size_t msm_size = RecursiveFlavor::FINAL_PCS_MSM_SIZE(vc.log_n);
    KZG::reduce_verify_batch_opening_claim(std::move(shplemini_output.batch_opening_claim), vc.transcript, msm_size);
}

struct MegaZKChallengeWitnessIndices {
    recursion_helpers::OinkTranscriptSqueezeChallenges oink;
    recursion_helpers::Step2Challenge step2;
    recursion_helpers::SumcheckChallenges sumcheck;
    recursion_helpers::ShpleminiChallenges shplemini;
    recursion_helpers::KZGMaskingChallenge kzg;
};

struct MegaZKStepDebugTrace {
    VerifierComponents vc;
    MegaZKChallengeWitnessIndices challenge_witness_indices;
    std::vector<size_t> all_squeeze_gates;
    std::set<size_t> consumed_squeezes_before_kzg;
    recursion_helpers::BlockSnapshot before_kzg;
    recursion_helpers::BlockSnapshot after_kzg;
};

template <typename Trace = MegaZKStepDebugTrace>
static Trace execute_all_megazk_steps_and_save_challenge_witness_indices(size_t num_acir_pub_inputs = 0)
{
    Trace trace{ .vc = setup_verifier_components(num_acir_pub_inputs) };
    std::set<size_t> consumed_squeeze_gates;

    auto refresh_squeezes = [&]() {
        trace.all_squeeze_gates = recursion_helpers::find_all_transcript_squeeze_gates(trace.vc.builder());
    };
    auto mark_consumed = [&](const auto& challenges) {
        consumed_squeeze_gates.insert(challenges.squeeze_gate_indices.begin(), challenges.squeeze_gate_indices.end());
    };

    run_oink_verifier_step(trace.vc);
    refresh_squeezes();
    trace.challenge_witness_indices.oink =
        recursion_helpers::oink_challenges(trace.vc.builder(), trace.all_squeeze_gates);
    mark_consumed(trace.challenge_witness_indices.oink);

    std::vector<FF> padding_indicator_array = run_padding_indicator_array_step(trace.vc);
    refresh_squeezes();
    trace.challenge_witness_indices.step2 =
        recursion_helpers::step2_challenge(trace.vc.builder(), trace.all_squeeze_gates, consumed_squeeze_gates);
    mark_consumed(trace.challenge_witness_indices.step2);

    SumcheckStepOutput sumcheck_step = run_sumcheck_step(trace.vc, padding_indicator_array);
    refresh_squeezes();
    trace.challenge_witness_indices.sumcheck =
        recursion_helpers::sumcheck_challenges(trace.vc.builder(), trace.all_squeeze_gates, consumed_squeeze_gates);
    mark_consumed(trace.challenge_witness_indices.sumcheck);

    auto shplemini_output = run_shplemini_step(
        trace.vc, padding_indicator_array, sumcheck_step.sumcheck_output, sumcheck_step.libra_commitments);
    refresh_squeezes();
    trace.challenge_witness_indices.shplemini =
        recursion_helpers::shplemini_challenges(trace.vc.builder(), trace.all_squeeze_gates, consumed_squeeze_gates);
    mark_consumed(trace.challenge_witness_indices.shplemini);

    trace.consumed_squeezes_before_kzg = consumed_squeeze_gates;
    trace.before_kzg = recursion_helpers::BlockSnapshot::capture(trace.vc.builder());

    run_kzg_step(trace.vc, shplemini_output);
    refresh_squeezes();
    trace.challenge_witness_indices.kzg =
        recursion_helpers::kzg_masking_challenge(trace.vc.builder(), trace.all_squeeze_gates, consumed_squeeze_gates);
    mark_consumed(trace.challenge_witness_indices.kzg);
    trace.after_kzg = recursion_helpers::BlockSnapshot::capture(trace.vc.builder());

    return trace;
}

static MegaZKChallengeWitnessIndices extract_megazk_challenge_witness_indices_from_squeeze_gates(
    Builder& builder, const std::vector<size_t>& all_squeeze_gates)
{
    MegaZKChallengeWitnessIndices indices;
    std::set<size_t> consumed_squeeze_gates;
    auto mark_consumed = [&](const auto& challenges) {
        consumed_squeeze_gates.insert(challenges.squeeze_gate_indices.begin(), challenges.squeeze_gate_indices.end());
    };

    indices.oink = recursion_helpers::oink_challenges(builder, all_squeeze_gates);
    mark_consumed(indices.oink);
    indices.step2 = recursion_helpers::step2_challenge(builder, all_squeeze_gates, consumed_squeeze_gates);
    mark_consumed(indices.step2);
    indices.sumcheck = recursion_helpers::sumcheck_challenges(builder, all_squeeze_gates, consumed_squeeze_gates);
    mark_consumed(indices.sumcheck);
    indices.shplemini = recursion_helpers::shplemini_challenges(builder, all_squeeze_gates, consumed_squeeze_gates);
    mark_consumed(indices.shplemini);
    indices.kzg = recursion_helpers::kzg_masking_challenge(builder, all_squeeze_gates, consumed_squeeze_gates);

    return indices;
}

static void expect_megazk_challenge_witness_indices_eq(const MegaZKChallengeWitnessIndices& actual,
                                                       const MegaZKChallengeWitnessIndices& expected)
{
    EXPECT_EQ(actual.oink.valid, expected.oink.valid);
    EXPECT_EQ(actual.oink.eta, expected.oink.eta);
    EXPECT_EQ(actual.oink.beta, expected.oink.beta);
    EXPECT_EQ(actual.oink.gamma, expected.oink.gamma);
    EXPECT_EQ(actual.oink.alpha, expected.oink.alpha);
    EXPECT_EQ(actual.oink.squeeze_gate_indices, expected.oink.squeeze_gate_indices);

    EXPECT_EQ(actual.step2.valid, expected.step2.valid);
    EXPECT_EQ(actual.step2.gate_challenge_0, expected.step2.gate_challenge_0);
    EXPECT_EQ(actual.step2.squeeze_gate, expected.step2.squeeze_gate);
    EXPECT_EQ(actual.step2.squeeze_gate_indices, expected.step2.squeeze_gate_indices);

    EXPECT_EQ(actual.sumcheck.valid, expected.sumcheck.valid);
    for (size_t idx = 0; idx < actual.sumcheck.u.size(); ++idx) {
        EXPECT_EQ(actual.sumcheck.u[idx], expected.sumcheck.u[idx]);
    }
    EXPECT_EQ(actual.sumcheck.zk_correction, expected.sumcheck.zk_correction);
    EXPECT_EQ(actual.sumcheck.squeeze_gate_indices, expected.sumcheck.squeeze_gate_indices);

    EXPECT_EQ(actual.shplemini.valid, expected.shplemini.valid);
    EXPECT_EQ(actual.shplemini.rho, expected.shplemini.rho);
    EXPECT_EQ(actual.shplemini.gemini_r, expected.shplemini.gemini_r);
    EXPECT_EQ(actual.shplemini.shplonk_nu, expected.shplemini.shplonk_nu);
    EXPECT_EQ(actual.shplemini.shplonk_z, expected.shplemini.shplonk_z);
    EXPECT_EQ(actual.shplemini.squeeze_gate_indices, expected.shplemini.squeeze_gate_indices);

    EXPECT_EQ(actual.kzg.valid, expected.kzg.valid);
    EXPECT_EQ(actual.kzg.masking_challenge, expected.kzg.masking_challenge);
    EXPECT_EQ(actual.kzg.squeeze_gate, expected.kzg.squeeze_gate);
    EXPECT_EQ(actual.kzg.squeeze_gate_indices, expected.kzg.squeeze_gate_indices);
}

template <typename Builder_, typename Block_> static size_t block_index_for(Builder_& bld, Block_& block)
{
    auto blocks = bld.blocks.get();
    for (size_t block_idx = 0; block_idx < blocks.size(); ++block_idx) {
        if (&blocks[block_idx] == &block) {
            return block_idx;
        }
    }
    return blocks.size();
}

template <typename Builder_, typename Block_>
static size_t block_snapshot_size(Builder_& bld, const recursion_helpers::BlockSnapshot& snap, Block_& block)
{
    const size_t block_idx = block_index_for(bld, block);
    return block_idx < snap.sizes.size() ? snap.sizes[block_idx] : 0;
}

template <typename Builder_, typename Block_>
static size_t block_delta(Builder_& bld,
                          const recursion_helpers::BlockSnapshot& before,
                          const recursion_helpers::BlockSnapshot& after,
                          Block_& block)
{
    return block_snapshot_size(bld, after, block) - block_snapshot_size(bld, before, block);
}

// Compute block hash over a specific block index range
template <typename Builder_> static size_t block_hash(Builder_& bld, size_t block_idx, size_t start, size_t end)
{
    if (start >= end)
        return 0;
    auto& arith = bld.blocks.arithmetic;
    if (&bld.blocks.get()[block_idx] == &arith) {
        return recursion_helpers::calculate_hash_arithmetic_block(bld, start, end);
    }
    return sha256_helpers::compute_selector_hash(0, bld.blocks.get()[block_idx], start, end - 1);
}

struct KZGValidationSetup {
    VerifierComponents vc;
    MegaZKChallengeWitnessIndices challenge_witness_indices;
    std::vector<size_t> all_squeeze_gates;
    std::set<size_t> consumed_squeezes_before_kzg;
    recursion_helpers::BlockSnapshot before_kzg;
    recursion_helpers::BlockSnapshot after_kzg;
};

static KZGValidationSetup build_kzg_validation_circuit()
{
    auto trace = execute_all_megazk_steps_and_save_challenge_witness_indices(0);
    return {
        .vc = std::move(trace.vc),
        .challenge_witness_indices = std::move(trace.challenge_witness_indices),
        .all_squeeze_gates = std::move(trace.all_squeeze_gates),
        .consumed_squeezes_before_kzg = std::move(trace.consumed_squeezes_before_kzg),
        .before_kzg = std::move(trace.before_kzg),
        .after_kzg = std::move(trace.after_kzg),
    };
}

static bool is_constant_fix_witness_gate(Builder& builder, size_t gate_idx)
{
    return recursion_helpers::is_fix_witness_gate(builder, gate_idx);
}

static size_t find_hashable_kzg_arithmetic_gate(Builder& builder,
                                                const recursion_helpers::BlockSnapshot& before,
                                                const recursion_helpers::BlockSnapshot& after)
{
    auto& arith = builder.blocks.arithmetic;
    const size_t start = block_snapshot_size(builder, before, arith);
    const size_t end = block_snapshot_size(builder, after, arith);
    for (size_t gate_idx = start; gate_idx < end; ++gate_idx) {
        if (!is_constant_fix_witness_gate(builder, gate_idx)) {
            return gate_idx;
        }
    }
    return end;
}

struct KZGArithmeticLocations {
    size_t w_receive_start = 0;
    size_t masking_challenge_start = 0;
    size_t batch_mul_start = 0;
    bool valid = false;
};

static bool matches_arithmetic_fingerprint(Builder& builder,
                                           size_t start,
                                           const recursion_helpers::FunctionFingerprint& fingerprint)
{
    auto& arith = builder.blocks.arithmetic;
    if (start + fingerprint.gate_count > arith.size()) {
        return false;
    }
    const size_t prefix_hash =
        recursion_helpers::calculate_hash_arithmetic_block(builder, start, start + fingerprint.fingerprint_size);
    if (prefix_hash != fingerprint.prefix_hash) {
        return false;
    }
    return recursion_helpers::calculate_hash_arithmetic_block(builder, start, start + fingerprint.gate_count) ==
           fingerprint.full_hash;
}

static KZGArithmeticLocations locate_kzg_arithmetic_locations(Builder& builder,
                                                              const std::vector<size_t>& all_squeezes,
                                                              const std::set<size_t>& consumed_squeezes_before_kzg)
{
    KZGArithmeticLocations locations;
    auto masking_challenge =
        recursion_helpers::kzg_masking_challenge(builder, all_squeezes, consumed_squeezes_before_kzg);
    if (!masking_challenge.valid) {
        return locations;
    }

    auto& arith = builder.blocks.arithmetic;
    for (size_t masking_start = 0; masking_start <= masking_challenge.squeeze_gate; ++masking_start) {
        const bool contains_masking_squeeze =
            masking_start <= masking_challenge.squeeze_gate &&
            masking_challenge.squeeze_gate < masking_start + KZGVerification::MASKING_CHALLENGE_ARITHMETIC.gate_count;
        if (!contains_masking_squeeze ||
            !matches_arithmetic_fingerprint(builder, masking_start, KZGVerification::MASKING_CHALLENGE_ARITHMETIC)) {
            continue;
        }
        if (masking_start < KZGVerification::TRANSCRIPT_RECEIVE_KZG_W_ARITHMETIC.gate_count) {
            continue;
        }

        const size_t w_receive_start = masking_start - KZGVerification::TRANSCRIPT_RECEIVE_KZG_W_ARITHMETIC.gate_count;
        const size_t batch_mul_start = masking_start + KZGVerification::MASKING_CHALLENGE_ARITHMETIC.gate_count;
        if (batch_mul_start > arith.size()) {
            continue;
        }
        if (!matches_arithmetic_fingerprint(
                builder, w_receive_start, KZGVerification::TRANSCRIPT_RECEIVE_KZG_W_ARITHMETIC)) {
            continue;
        }
        if (!matches_arithmetic_fingerprint(builder, batch_mul_start, KZGVerification::BATCH_MUL_ARITHMETIC)) {
            continue;
        }

        return { w_receive_start, masking_start, batch_mul_start, true };
    }

    return locations;
}

template <typename Block>
static bool arithmetic_range_has_witness_in_block(Builder& builder,
                                                  cdg::StaticAnalyzer_<bb::fr, Builder>& analyzer,
                                                  size_t arithmetic_start,
                                                  size_t arithmetic_end,
                                                  Block& target_block,
                                                  const char* label)
{
    auto& arith = builder.blocks.arithmetic;
    const size_t target_block_idx = block_index_for(builder, target_block);
    std::set<uint32_t> visited_real_indices;

    for (size_t gate_idx = arithmetic_start; gate_idx < arithmetic_end; ++gate_idx) {
        std::array<uint32_t, 4> wires = {
            arith.w_l()[gate_idx], arith.w_r()[gate_idx], arith.w_o()[gate_idx], arith.w_4()[gate_idx]
        };
        for (uint32_t witness_idx : wires) {
            const uint32_t real_idx = builder.real_variable_index[witness_idx];
            if (!visited_real_indices.insert(real_idx).second) {
                continue;
            }
            for (const auto& [block_idx, target_gate_idx] : analyzer.get_variable_gates(real_idx)) {
                if (block_idx == target_block_idx) {
                    info(label,
                         ": witness ",
                         witness_idx,
                         " real ",
                         real_idx,
                         " links arithmetic gate ",
                         gate_idx,
                         " to target gate ",
                         target_gate_idx);
                    return true;
                }
            }
        }
    }

    return false;
}

// Block indices aligned with recursion_helpers::compute_block_deltas naming (pub_inputs=0 .. poseidon2_int=8).
constexpr size_t BLOCK_INDEX_ARITHMETIC = 2;
constexpr size_t BLOCK_INDEX_MEMORY = 5;
constexpr size_t BLOCK_INDEX_NNF = 6;
constexpr size_t BLOCK_INDEX_POSEIDON2_EXT = 7;
constexpr size_t BLOCK_INDEX_POSEIDON2_INT = 8;

struct BlockFingerprintExpectation {
    size_t block_index;
    const recursion_helpers::FunctionFingerprint* fp;
};

struct StageFingerprintSegment {
    size_t block_index;
    size_t start;
    size_t end;
};

static const char* block_kind_name(size_t block_index)
{
    switch (block_index) {
    case BLOCK_INDEX_ARITHMETIC:
        return "arithmetic";
    case BLOCK_INDEX_MEMORY:
        return "memory";
    case BLOCK_INDEX_NNF:
        return "nnf";
    case BLOCK_INDEX_POSEIDON2_EXT:
        return "poseidon2_ext";
    case BLOCK_INDEX_POSEIDON2_INT:
        return "poseidon2_int";
    default:
        return "unknown";
    }
}

static recursion_helpers::FunctionFingerprint compute_fingerprint_at(Builder& builder,
                                                                     size_t block_index,
                                                                     size_t start,
                                                                     size_t end)
{
    const size_t gate_count = end - start;
    const size_t fingerprint_size = std::min(recursion_helpers::SCANNER_FINGERPRINT_SIZE, gate_count);
    auto& block = builder.blocks.get()[block_index];

    const auto compute_hash = [&](size_t range_start, size_t range_end) {
        if (range_start == range_end) {
            return size_t{ 0 };
        }
        if (block_index == BLOCK_INDEX_ARITHMETIC) {
            return recursion_helpers::calculate_hash_arithmetic_block(builder, range_start, range_end);
        }
        return sha256_helpers::compute_selector_hash(0, block, range_start, range_end - 1);
    };

    return recursion_helpers::FunctionFingerprint{
        .gate_count = gate_count,
        .prefix_hash = compute_hash(start, start + fingerprint_size),
        .full_hash = compute_hash(start, end),
        .fingerprint_size = fingerprint_size,
    };
}

static void write_stage_fingerprint(std::ostream& out,
                                    Builder& builder,
                                    const char* stage_tag,
                                    const std::vector<StageFingerprintSegment>& segments)
{
    out << stage_tag << "\n";
    for (const auto& segment : segments) {
        auto fp = compute_fingerprint_at(builder, segment.block_index, segment.start, segment.end);
        out << "  block[" << segment.block_index << "] " << block_kind_name(segment.block_index)
            << " gates=" << fp.gate_count << " fingerprint20=0x" << std::hex << fp.prefix_hash << " full_hash=0x"
            << fp.full_hash << std::dec << "\n";
    }
}

static StageFingerprintSegment segment_from_fp(size_t block_index,
                                               size_t start,
                                               const recursion_helpers::FunctionFingerprint& fp)
{
    return StageFingerprintSegment{ .block_index = block_index, .start = start, .end = start + fp.gate_count };
}

static void write_challenge_generation_fingerprint(std::ostream& out,
                                                   Builder& builder,
                                                   const char* stage_tag,
                                                   const recursion_helpers::ChallengeGenerationValidationResult& result,
                                                   const recursion_helpers::FunctionFingerprint& arith_fp,
                                                   const recursion_helpers::FunctionFingerprint& ext_fp,
                                                   const recursion_helpers::FunctionFingerprint& int_fp)
{
    ASSERT_TRUE(result.is_valid) << stage_tag;
    write_stage_fingerprint(out,
                            builder,
                            stage_tag,
                            { segment_from_fp(BLOCK_INDEX_ARITHMETIC, result.arithmetic_gate_start_idx, arith_fp),
                              segment_from_fp(BLOCK_INDEX_POSEIDON2_EXT,
                                              result.poseidon2_external_gate_start_idx,
                                              ext_fp),
                              segment_from_fp(BLOCK_INDEX_POSEIDON2_INT,
                                              result.poseidon2_internal_gate_start_idx,
                                              int_fp) });
}

// Pinned fingerprints live in recursion_constraints_helper.hpp; hashing matches
// recursion_helpers::matches_fingerprint_at.
static void expect_stage_matches_fingerprints(Builder& builder,
                                              const recursion_helpers::BlockSnapshot& before,
                                              const recursion_helpers::BlockSnapshot& after,
                                              const std::vector<BlockFingerprintExpectation>& expected,
                                              const char* stage_tag)
{
    auto deltas = recursion_helpers::compute_block_deltas(before, after);
    ASSERT_EQ(deltas.size(), expected.size()) << stage_tag;
    for (size_t i = 0; i < deltas.size(); ++i) {
        ASSERT_EQ(deltas[i].block_index, expected[i].block_index) << stage_tag << " seg " << i;
        ASSERT_EQ(deltas[i].delta, expected[i].fp->gate_count) << stage_tag << " seg " << i;
        const size_t bi = deltas[i].block_index;
        const size_t start_gate = bi < before.sizes.size() ? before.sizes[bi] : 0;
        auto& block = builder.blocks.get()[bi];
        EXPECT_TRUE(recursion_helpers::matches_fingerprint_at(builder, block, start_gate, *expected[i].fp))
            << stage_tag << " seg " << i << " " << deltas[i].block_name;
    }
}

static void expect_no_new_gates([[maybe_unused]] Builder& builder,
                                const recursion_helpers::BlockSnapshot& before,
                                const recursion_helpers::BlockSnapshot& after,
                                const char* stage_tag)
{
    EXPECT_EQ(recursion_helpers::compute_block_deltas(before, after).size(), 0U) << stage_tag;
}

static std::vector<uint32_t> extract_proof_body_witnesses(const RecursionConstraint& constraint)
{
    if (constraint.proof.size() <= acir_format::HIDING_KERNEL_PUBLIC_INPUTS_SIZE) {
        return {};
    }
    return { constraint.proof.begin() + acir_format::HIDING_KERNEL_PUBLIC_INPUTS_SIZE, constraint.proof.end() };
}

static size_t find_first_hashable_gate_in_range(Builder& builder, size_t start, size_t end)
{
    for (size_t gate_idx = start; gate_idx < end; ++gate_idx) {
        if (!is_constant_fix_witness_gate(builder, gate_idx)) {
            return gate_idx;
        }
    }
    return end;
}

template <typename MutateFn>
static void expect_chonk_recursion_opcode_detects_corruption(const char* label, MutateFn mutate)
{
    SCOPED_TRACE(label);

    AcirProgram program = make_mock_acir_program(0);
    Builder builder = create_circuit<Builder>(program, { .has_ipa_claim = true });
    const auto& constraint = program.constraints.chonk_recursion_constraints[0];
    const auto proof_body_witnesses = extract_proof_body_witnesses(constraint);

    ASSERT_FALSE(proof_body_witnesses.empty()) << label;
    ASSERT_TRUE(mutate(builder, constraint, proof_body_witnesses)) << label;

    AcirFormat constraint_system_copy = program.constraints;
    StaticAnalyzerAcir analyzer_acir(std::move(constraint_system_copy), std::move(builder));
    const std::unordered_set<size_t> incorrect_opcodes = analyzer_acir.get_incorrect_opcodes();

    EXPECT_TRUE(incorrect_opcodes.contains(0)) << label;
}

struct AcirKZGDiagnostics {
    std::vector<size_t> all_squeezes;
    std::set<size_t> consumed_prefix;
    std::set<size_t> consumed_named;
    recursion_helpers::KZGMaskingChallenge masking_challenge;
    KZGArithmeticLocations locations;
    KZGVerification::TranscriptReceiveValidationResult transcript_receive;
    KZGVerification::MaskingChallengeValidationResult masking_generation;
    KZGVerification::BatchMulValidationResult batch_mul;
    size_t expected_batch_mul_arithmetic_start = SIZE_MAX;
    size_t expected_batch_mul_nnf_start = SIZE_MAX;
    bool expected_batch_mul_arithmetic_fingerprint_matches = false;
    bool expected_batch_mul_nnf_fingerprint_matches = false;
    bool top_level_kzg_valid = false;
    bool w_receive_links_to_nnf = false;
    bool batch_mul_links_to_nnf = false;
    bool batch_mul_links_to_memory = false;
};

struct ArithmeticGateDebugInfo {
    size_t gate_idx = SIZE_MAX;
    size_t selector_hash = 0;
};

struct ArithmeticRangeComparison {
    std::vector<ArithmeticGateDebugInfo> lhs;
    std::vector<ArithmeticGateDebugInfo> rhs;
    size_t first_diff_idx = SIZE_MAX;
    bool lhs_has_extra_gate = false;
    bool rhs_has_extra_gate = false;
};

static std::vector<ArithmeticGateDebugInfo> collect_hashable_arithmetic_gate_infos(Builder& builder,
                                                                                   size_t start,
                                                                                   size_t end)
{
    std::vector<ArithmeticGateDebugInfo> gates;
    gates.reserve(end - start);
    for (size_t gate_idx = start; gate_idx < end; ++gate_idx) {
        if (is_constant_fix_witness_gate(builder, gate_idx)) {
            continue;
        }
        gates.push_back(ArithmeticGateDebugInfo{
            .gate_idx = gate_idx,
            .selector_hash = recursion_helpers::calculate_hash_arithmetic_block(builder, gate_idx, gate_idx + 1) });
    }
    return gates;
}

static void log_arithmetic_gate_details(Builder& builder, const char* label, size_t gate_idx)
{
    auto& arith = builder.blocks.arithmetic;
    info(label, " gate=", gate_idx);
    info("  wires(real): w_l=",
         builder.real_variable_index[arith.w_l()[gate_idx]],
         " w_r=",
         builder.real_variable_index[arith.w_r()[gate_idx]],
         " w_o=",
         builder.real_variable_index[arith.w_o()[gate_idx]],
         " w_4=",
         builder.real_variable_index[arith.w_4()[gate_idx]]);
    info("  selectors: q_m=",
         arith.q_m()[gate_idx],
         " q_c=",
         arith.q_c()[gate_idx],
         " q_1=",
         arith.q_1()[gate_idx],
         " q_2=",
         arith.q_2()[gate_idx],
         " q_3=",
         arith.q_3()[gate_idx],
         " q_4=",
         arith.q_4()[gate_idx],
         " q_arith=",
         arith.q_arith()[gate_idx]);
}

static ArithmeticRangeComparison compare_hashable_arithmetic_ranges(
    Builder& lhs_builder, size_t lhs_start, size_t lhs_end, Builder& rhs_builder, size_t rhs_start, size_t rhs_end)
{
    ArithmeticRangeComparison comparison;
    comparison.lhs = collect_hashable_arithmetic_gate_infos(lhs_builder, lhs_start, lhs_end);
    comparison.rhs = collect_hashable_arithmetic_gate_infos(rhs_builder, rhs_start, rhs_end);

    size_t idx = 0;
    while (idx < comparison.lhs.size() && idx < comparison.rhs.size() &&
           comparison.lhs[idx].selector_hash == comparison.rhs[idx].selector_hash) {
        ++idx;
    }

    if (idx == comparison.lhs.size() && idx == comparison.rhs.size()) {
        return comparison;
    }

    comparison.first_diff_idx = idx;
    if (idx < comparison.lhs.size() && idx + 1 < comparison.lhs.size() && idx < comparison.rhs.size() &&
        comparison.lhs[idx + 1].selector_hash == comparison.rhs[idx].selector_hash) {
        comparison.lhs_has_extra_gate = true;
    } else if (idx < comparison.lhs.size() && idx < comparison.rhs.size() && idx + 1 < comparison.rhs.size() &&
               comparison.lhs[idx].selector_hash == comparison.rhs[idx + 1].selector_hash) {
        comparison.rhs_has_extra_gate = true;
    }

    return comparison;
}

static AcirKZGDiagnostics collect_acir_kzg_diagnostics(Builder& builder)
{
    AcirKZGDiagnostics diagnostics;
    diagnostics.all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);

    const size_t consumed_count = recursion_helpers::NUM_OINK_SQUEEZES + recursion_helpers::NUM_STEP2_SQUEEZES +
                                  recursion_helpers::NUM_SUMCHECK_SQUEEZES + recursion_helpers::NUM_SHPLEMINI_SQUEEZES;
    if (diagnostics.all_squeezes.size() >= consumed_count) {
        diagnostics.consumed_prefix =
            std::set<size_t>(diagnostics.all_squeezes.begin(), diagnostics.all_squeezes.begin() + consumed_count);
    }

    auto oink = recursion_helpers::oink_challenges(builder, diagnostics.all_squeezes);
    if (oink.valid) {
        diagnostics.consumed_named.insert(oink.squeeze_gate_indices.begin(), oink.squeeze_gate_indices.end());
    }
    auto step2 = recursion_helpers::step2_challenge(builder, diagnostics.all_squeezes, diagnostics.consumed_named);
    if (step2.valid) {
        diagnostics.consumed_named.insert(step2.squeeze_gate_indices.begin(), step2.squeeze_gate_indices.end());
    }
    auto sumcheck =
        recursion_helpers::sumcheck_challenges(builder, diagnostics.all_squeezes, diagnostics.consumed_named);
    if (sumcheck.valid) {
        diagnostics.consumed_named.insert(sumcheck.squeeze_gate_indices.begin(), sumcheck.squeeze_gate_indices.end());
    }
    auto shplemini =
        recursion_helpers::shplemini_challenges(builder, diagnostics.all_squeezes, diagnostics.consumed_named);
    if (shplemini.valid) {
        diagnostics.consumed_named.insert(shplemini.squeeze_gate_indices.begin(), shplemini.squeeze_gate_indices.end());
    }

    diagnostics.masking_challenge =
        recursion_helpers::kzg_masking_challenge(builder, diagnostics.all_squeezes, diagnostics.consumed_prefix);
    diagnostics.locations =
        locate_kzg_arithmetic_locations(builder, diagnostics.all_squeezes, diagnostics.consumed_prefix);
    diagnostics.top_level_kzg_valid =
        KZGVerification::validate_kzg(builder, diagnostics.all_squeezes, diagnostics.consumed_prefix).is_valid;

    if (!diagnostics.masking_challenge.valid) {
        return diagnostics;
    }

    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
    diagnostics.transcript_receive =
        KZGVerification::validate_transcript_receive(builder, analyzer, diagnostics.masking_challenge.squeeze_gate);
    diagnostics.masking_generation = KZGVerification::validate_masking_challenge_generation(
        builder, analyzer, diagnostics.masking_challenge.squeeze_gate, diagnostics.transcript_receive);
    diagnostics.batch_mul = KZGVerification::validate_batch_mul(builder,
                                                                analyzer,
                                                                diagnostics.masking_challenge.squeeze_gate,
                                                                diagnostics.transcript_receive,
                                                                diagnostics.masking_generation);

    if (diagnostics.transcript_receive.is_valid && diagnostics.masking_generation.is_valid) {
        diagnostics.w_receive_links_to_nnf =
            arithmetic_range_has_witness_in_block(builder,
                                                  analyzer,
                                                  diagnostics.transcript_receive.arithmetic_gate_start_idx,
                                                  diagnostics.masking_generation.arithmetic_gate_start_idx,
                                                  builder.blocks.nnf,
                                                  "ACIR KZG:W_receive arithmetic -> NNF");

        diagnostics.expected_batch_mul_arithmetic_start = diagnostics.masking_generation.arithmetic_gate_start_idx +
                                                          KZGVerification::MASKING_CHALLENGE_ARITHMETIC.gate_count;
        diagnostics.expected_batch_mul_nnf_start = diagnostics.transcript_receive.nnf_gate_start_idx +
                                                   KZGVerification::TRANSCRIPT_RECEIVE_KZG_W_NNF.gate_count;

        diagnostics.expected_batch_mul_arithmetic_fingerprint_matches = matches_arithmetic_fingerprint(
            builder, diagnostics.expected_batch_mul_arithmetic_start, KZGVerification::BATCH_MUL_ARITHMETIC);
        diagnostics.expected_batch_mul_nnf_fingerprint_matches = recursion_helpers::matches_fingerprint_at(
            builder, builder.blocks.nnf, diagnostics.expected_batch_mul_nnf_start, KZGVerification::BATCH_MUL_NNF);

        const size_t batch_mul_end =
            diagnostics.expected_batch_mul_arithmetic_start + KZGVerification::BATCH_MUL_ARITHMETIC.gate_count;
        diagnostics.batch_mul_links_to_nnf =
            arithmetic_range_has_witness_in_block(builder,
                                                  analyzer,
                                                  diagnostics.expected_batch_mul_arithmetic_start,
                                                  batch_mul_end,
                                                  builder.blocks.nnf,
                                                  "ACIR KZG:batch_mul arithmetic -> NNF");
        diagnostics.batch_mul_links_to_memory =
            arithmetic_range_has_witness_in_block(builder,
                                                  analyzer,
                                                  diagnostics.expected_batch_mul_arithmetic_start,
                                                  batch_mul_end,
                                                  builder.blocks.memory,
                                                  "ACIR KZG:batch_mul arithmetic -> memory");
    }

    return diagnostics;
}

} // anonymous namespace

// ============================================================================
// Test fixture
// ============================================================================
class BoomerangRecursionTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

class ChonkRecursionTestSuite : public BoomerangRecursionTests {};

class BoomerangShpleminiTests : public BoomerangRecursionTests {};

class BoomerangKZGStepTests : public BoomerangRecursionTests {};

TEST_F(ChonkRecursionTestSuite, AcirChonkFunctionAnalysis)
{
    AcirProgram program = make_mock_acir_program(0);
    Builder builder = create_circuit<Builder>(program, { .has_ipa_claim = true });
    const auto& constraint = program.constraints.chonk_recursion_constraints[0];
    const auto proof_body_witnesses = extract_proof_body_witnesses(constraint);
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);

    std::ofstream out("megazk_functions_analysis.txt");
    ASSERT_TRUE(out.is_open());

    const auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    ASSERT_GE(all_squeezes.size(), recursion_helpers::NUM_TOTAL_WITH_KZG_SQUEEZES);

    // ── OinkVerifier ─────────────────────────────────────────────────────────
    namespace OV = OinkVerifierValidation;
    const auto oink_gates = OV::extract_oink_squeeze_gates(builder);
    ASSERT_EQ(oink_gates.size(), recursion_helpers::NUM_OINK_SQUEEZES);

    auto eta = OV::validate_eta_stage<bb::fr>(builder, analyzer, oink_gates[0]);
    ASSERT_TRUE(eta.is_valid);
    auto beta_gamma = OV::validate_beta_gamma_stage<bb::fr>(builder, analyzer, oink_gates[1]);
    ASSERT_TRUE(beta_gamma.is_valid);
    auto alpha = OV::validate_alpha_stage<bb::fr>(builder, analyzer, oink_gates[2]);
    ASSERT_TRUE(alpha.is_valid);

    const size_t vk_arith_start =
        eta.arith_start -
        (OV::PRE_ETA_COMMITMENT_GROUPS.size() * OV::SINGLE_COMMITMENT_ARITHMETIC.gate_count) -
        OV::VK_HASH_ARITHMETIC.gate_count;

    uint32_t key_hash_real = builder.real_variable_index[constraint.key_hash];
    auto key_hash_external_gates = OV::collect_real_witness_gates_in_block<bb::fr>(
        builder, analyzer, key_hash_real, builder.blocks.poseidon2_external);
    std::optional<size_t> vk_ext_start;
    std::optional<size_t> vk_int_start;
    for (size_t gate_idx : key_hash_external_gates) {
        vk_ext_start = recursion_helpers::find_fingerprint_range_containing_gate(
            builder, builder.blocks.poseidon2_external, gate_idx, OV::VK_HASH_POSEIDON2_EXT);
        if (!vk_ext_start.has_value()) {
            continue;
        }
        auto linked_internal = recursion_helpers::collect_linked_gates(builder,
                                                                       analyzer,
                                                                       builder.blocks.poseidon2_external,
                                                                       *vk_ext_start,
                                                                       *vk_ext_start +
                                                                           OV::VK_HASH_POSEIDON2_EXT.gate_count,
                                                                       builder.blocks.poseidon2_internal);
        vk_int_start = recursion_helpers::find_fingerprint_range_at_or_after_any_gate(
            builder, builder.blocks.poseidon2_internal, linked_internal, OV::VK_HASH_POSEIDON2_INT);
        if (vk_int_start.has_value()) {
            break;
        }
    }
    ASSERT_TRUE(vk_ext_start.has_value());
    ASSERT_TRUE(vk_int_start.has_value());

    write_stage_fingerprint(out,
                            builder,
                            "Oink:vk_hash",
                            { segment_from_fp(BLOCK_INDEX_ARITHMETIC, vk_arith_start, OV::VK_HASH_ARITHMETIC),
                              segment_from_fp(BLOCK_INDEX_POSEIDON2_EXT, *vk_ext_start, OV::VK_HASH_POSEIDON2_EXT),
                              segment_from_fp(BLOCK_INDEX_POSEIDON2_INT, *vk_int_start, OV::VK_HASH_POSEIDON2_INT) });
    write_stage_fingerprint(out, builder, "Oink:public_inputs", {});

    static constexpr std::array<const char*, OV::PRE_ETA_COMMITMENT_GROUPS.size()> PRE_ETA_NAMES = { {
        "Oink:gemini_masking_commitment",
        "Oink:w_l",
        "Oink:w_r",
        "Oink:w_o",
        "Oink:ecc_op_wire_commitment_0",
        "Oink:ecc_op_wire_commitment_1",
        "Oink:ecc_op_wire_commitment_2",
        "Oink:ecc_op_wire_commitment_3",
        "Oink:databus_commitment_0",
        "Oink:databus_commitment_1",
        "Oink:databus_commitment_2",
        "Oink:databus_commitment_3",
        "Oink:databus_commitment_4",
        "Oink:databus_commitment_5",
        "Oink:databus_commitment_6",
        "Oink:databus_commitment_7",
    } };
    for (size_t i = 0; i < OV::PRE_ETA_COMMITMENT_GROUPS.size(); ++i) {
        OV::CommitmentReceiveValidationResult result;
        ASSERT_TRUE(OV::validate_commitment_group_full<bb::fr>(
            builder, analyzer, proof_body_witnesses, OV::PRE_ETA_COMMITMENT_GROUPS[i], &result, false))
            << PRE_ETA_NAMES[i];
        write_stage_fingerprint(out,
                                builder,
                                PRE_ETA_NAMES[i],
                                { segment_from_fp(BLOCK_INDEX_ARITHMETIC,
                                                  result.arith_start,
                                                  OV::SINGLE_COMMITMENT_ARITHMETIC),
                                  segment_from_fp(BLOCK_INDEX_NNF, result.nnf_start, OV::SINGLE_COMMITMENT_NNF) });
    }
    write_stage_fingerprint(out,
                            builder,
                            "Oink:eta",
                            { segment_from_fp(BLOCK_INDEX_ARITHMETIC, eta.arith_start, OV::ETA_ARITHMETIC),
                              segment_from_fp(BLOCK_INDEX_POSEIDON2_EXT,
                                              eta.poseidon2_ext_start,
                                              OV::ETA_POSEIDON2_EXT),
                              segment_from_fp(BLOCK_INDEX_POSEIDON2_INT,
                                              eta.poseidon2_int_start,
                                              OV::ETA_POSEIDON2_INT) });

    static constexpr std::array<const char*, OV::POST_ETA_COMMITMENT_GROUPS.size()> POST_ETA_NAMES = { {
        "Oink:lookup_read_counts",
        "Oink:lookup_read_tags",
        "Oink:w_4",
    } };
    for (size_t i = 0; i < OV::POST_ETA_COMMITMENT_GROUPS.size(); ++i) {
        OV::CommitmentReceiveValidationResult result;
        ASSERT_TRUE(OV::validate_commitment_group_full<bb::fr>(
            builder, analyzer, proof_body_witnesses, OV::POST_ETA_COMMITMENT_GROUPS[i], &result, false))
            << POST_ETA_NAMES[i];
        write_stage_fingerprint(out,
                                builder,
                                POST_ETA_NAMES[i],
                                { segment_from_fp(BLOCK_INDEX_ARITHMETIC,
                                                  result.arith_start,
                                                  OV::SINGLE_COMMITMENT_ARITHMETIC),
                                  segment_from_fp(BLOCK_INDEX_NNF, result.nnf_start, OV::SINGLE_COMMITMENT_NNF) });
    }

    write_stage_fingerprint(out,
                            builder,
                            "Oink:beta_gamma",
                            { segment_from_fp(BLOCK_INDEX_ARITHMETIC,
                                              beta_gamma.arith_start,
                                              OV::BETA_GAMMA_ARITHMETIC),
                              segment_from_fp(BLOCK_INDEX_POSEIDON2_EXT,
                                              beta_gamma.poseidon2_ext_start,
                                              OV::BETA_GAMMA_POSEIDON2_EXT),
                              segment_from_fp(BLOCK_INDEX_POSEIDON2_INT,
                                              beta_gamma.poseidon2_int_start,
                                              OV::BETA_GAMMA_POSEIDON2_INT) });

    static constexpr std::array<const char*, OV::POST_BETA_GAMMA_COMMITMENT_GROUPS.size()> POST_BETA_GAMMA_NAMES = { {
        "Oink:lookup_inverses",
        "Oink:databus_inverse_commitment_0",
        "Oink:databus_inverse_commitment_1",
        "Oink:databus_inverse_commitment_2",
    } };
    for (size_t i = 0; i < OV::POST_BETA_GAMMA_COMMITMENT_GROUPS.size(); ++i) {
        OV::CommitmentReceiveValidationResult result;
        ASSERT_TRUE(OV::validate_commitment_group_full<bb::fr>(
            builder, analyzer, proof_body_witnesses, OV::POST_BETA_GAMMA_COMMITMENT_GROUPS[i], &result, false))
            << POST_BETA_GAMMA_NAMES[i];
        write_stage_fingerprint(out,
                                builder,
                                POST_BETA_GAMMA_NAMES[i],
                                { segment_from_fp(BLOCK_INDEX_ARITHMETIC,
                                                  result.arith_start,
                                                  OV::SINGLE_COMMITMENT_ARITHMETIC),
                                  segment_from_fp(BLOCK_INDEX_NNF, result.nnf_start, OV::SINGLE_COMMITMENT_NNF) });
    }

    std::vector<uint32_t> public_input_reals;
    public_input_reals.reserve(constraint.public_inputs.size());
    for (uint32_t witness_idx : constraint.public_inputs) {
        public_input_reals.push_back(builder.real_variable_index[witness_idx]);
    }
    auto delta = OV::validate_public_input_delta_stage<bb::fr>(builder,
                                                               analyzer,
                                                               beta_gamma.beta,
                                                               beta_gamma.gamma,
                                                               builder.real_variable_index[constraint.key[2]],
                                                               public_input_reals);
    ASSERT_TRUE(delta.is_valid);
    write_stage_fingerprint(out,
                            builder,
                            "Oink:public_input_delta",
                            { segment_from_fp(BLOCK_INDEX_ARITHMETIC,
                                              delta.arith_start,
                                              OV::PUBLIC_INPUT_DELTA_ARITHMETIC) });

    OV::CommitmentReceiveValidationResult z_perm;
    ASSERT_TRUE(OV::validate_commitment_group_full<bb::fr>(
        builder, analyzer, proof_body_witnesses, OV::Z_PERM_GROUP, &z_perm, false));
    write_stage_fingerprint(out,
                            builder,
                            "Oink:z_perm",
                            { segment_from_fp(BLOCK_INDEX_ARITHMETIC,
                                              z_perm.arith_start,
                                              OV::SINGLE_COMMITMENT_ARITHMETIC),
                              segment_from_fp(BLOCK_INDEX_NNF, z_perm.nnf_start, OV::SINGLE_COMMITMENT_NNF) });

    write_stage_fingerprint(out,
                            builder,
                            "Oink:alpha",
                            { segment_from_fp(BLOCK_INDEX_ARITHMETIC, alpha.arith_start, OV::ALPHA_ARITHMETIC),
                              segment_from_fp(BLOCK_INDEX_POSEIDON2_EXT,
                                              alpha.poseidon2_ext_start,
                                              OV::ALPHA_POSEIDON2_EXT),
                              segment_from_fp(BLOCK_INDEX_POSEIDON2_INT,
                                              alpha.poseidon2_int_start,
                                              OV::ALPHA_POSEIDON2_INT) });

    // ── Padding and gate challenges ───────────────────────────────────────────
    namespace PV = PaddingIndicatorArrayValidation;
    auto padding = recursion_helpers::validate_compute_padding_array_step<bb::fr>(builder, analyzer, constraint);
    ASSERT_TRUE(padding.valid);
    write_stage_fingerprint(out,
                            builder,
                            "Padding:compute_padding_indicator_array",
                            { segment_from_fp(BLOCK_INDEX_ARITHMETIC,
                                              padding.start_gate,
                                              PV::COMPUTE_PADDING_INDICATOR_ARRAY_ARITHMETIC) });

    const std::set<size_t> consumed_oink(all_squeezes.begin(),
                                         all_squeezes.begin() + recursion_helpers::NUM_OINK_SQUEEZES);
    auto step2 = recursion_helpers::step2_challenge(builder, all_squeezes, consumed_oink);
    ASSERT_TRUE(step2.valid);
    auto gate_challenge = recursion_helpers::validate_challenges_generation<bb::fr>(
        builder,
        analyzer,
        step2.squeeze_gate,
        PV::GATE_CHALLENGE_DYADIC_POWERS_ARITHMETIC,
        PV::GATE_CHALLENGE_DYADIC_POWERS_POSEIDON2_EXT,
        PV::GATE_CHALLENGE_DYADIC_POWERS_POSEIDON2_INT);
    write_challenge_generation_fingerprint(out,
                                           builder,
                                           "Padding:gate_challenge",
                                           gate_challenge,
                                           PV::GATE_CHALLENGE_DYADIC_POWERS_ARITHMETIC,
                                           PV::GATE_CHALLENGE_DYADIC_POWERS_POSEIDON2_EXT,
                                           PV::GATE_CHALLENGE_DYADIC_POWERS_POSEIDON2_INT);

    // ── Sumcheck ──────────────────────────────────────────────────────────────
    namespace SV = SumcheckValidation;
    const size_t sumcheck_consumed_count = recursion_helpers::NUM_OINK_SQUEEZES + recursion_helpers::NUM_STEP2_SQUEEZES;
    const std::set<size_t> consumed_before_sumcheck(all_squeezes.begin(),
                                                   all_squeezes.begin() + sumcheck_consumed_count);
    auto sumcheck_gates = recursion_helpers::take_unclaimed_squeezes(
        all_squeezes, consumed_before_sumcheck, recursion_helpers::NUM_SUMCHECK_SQUEEZES);
    ASSERT_EQ(sumcheck_gates.size(), recursion_helpers::NUM_SUMCHECK_SQUEEZES);

    auto prefix = SV::validate_sumcheck_prefix<bb::fr>(builder, analyzer, sumcheck_gates[0]);
    ASSERT_TRUE(prefix.is_valid);
    auto concat = SV::validate_libra_commitment_receive<bb::fr>(builder,
                                                                analyzer,
                                                                prefix.concat_commit_arith_start,
                                                                SV::LIBRA_CONCAT_COMMIT_ARITHMETIC,
                                                                SV::LIBRA_CONCAT_COMMIT_NNF,
                                                                "concat_commitment");
    ASSERT_TRUE(concat.is_valid);
    write_stage_fingerprint(out,
                            builder,
                            "Sumcheck:Libra_concatenation_commitment",
                            { segment_from_fp(BLOCK_INDEX_ARITHMETIC,
                                              concat.arithmetic_gate_start_idx,
                                              SV::LIBRA_CONCAT_COMMIT_ARITHMETIC),
                              segment_from_fp(BLOCK_INDEX_NNF,
                                              concat.nnf_gate_start_idx,
                                              SV::LIBRA_CONCAT_COMMIT_NNF) });
    auto libra_challenge = recursion_helpers::validate_challenges_generation<bb::fr>(
        builder,
        analyzer,
        sumcheck_gates[0],
        SV::ZK_HANDLER_LIBRA_CHALLENGE_ARITHMETIC,
        SV::ZK_HANDLER_LIBRA_CHALLENGE_POSEIDON2_EXT,
        SV::ZK_HANDLER_LIBRA_CHALLENGE_POSEIDON2_INT);
    write_challenge_generation_fingerprint(out,
                                           builder,
                                           "Sumcheck:Libra_challenge",
                                           libra_challenge,
                                           SV::ZK_HANDLER_LIBRA_CHALLENGE_ARITHMETIC,
                                           SV::ZK_HANDLER_LIBRA_CHALLENGE_POSEIDON2_EXT,
                                           SV::ZK_HANDLER_LIBRA_CHALLENGE_POSEIDON2_INT);
    write_stage_fingerprint(out,
                            builder,
                            "Sumcheck:initialize_target_sum",
                            { segment_from_fp(BLOCK_INDEX_ARITHMETIC,
                                              prefix.init_target_sum_arith_start,
                                              SV::ZK_HANDLER_INIT_TARGET_SUM_ARITHMETIC) });

    size_t sumcheck_cursor = prefix.init_target_sum_arith_end;
    for (size_t round_idx = 0; round_idx < recursion_helpers::NUM_SUMCHECK_ROUNDS; ++round_idx) {
        auto round = SV::validate_sumcheck_round<bb::fr>(
            builder, analyzer, round_idx, sumcheck_gates[round_idx + 1], sumcheck_cursor);
        ASSERT_TRUE(round.is_valid) << round_idx;
        auto u = recursion_helpers::validate_challenges_generation<bb::fr>(builder,
                                                                          analyzer,
                                                                          sumcheck_gates[round_idx + 1],
                                                                          SV::ROUND_U_ARITHMETIC,
                                                                          SV::ROUND_U_POSEIDON2_EXT,
                                                                          SV::ROUND_U_POSEIDON2_INT);
        write_challenge_generation_fingerprint(out,
                                               builder,
                                               ("Sumcheck:u_" + std::to_string(round_idx)).c_str(),
                                               u,
                                               SV::ROUND_U_ARITHMETIC,
                                               SV::ROUND_U_POSEIDON2_EXT,
                                               SV::ROUND_U_POSEIDON2_INT);
        size_t offset = u.arithmetic_gate_start_idx + SV::ROUND_U_ARITHMETIC.gate_count;
        const auto& check_sum_fp =
            (round_idx == 15) ? SV::ROUND15_CHECK_SUM_ARITHMETIC : SV::ROUND_CHECK_SUM_ARITHMETIC;
        const auto& next_target_fp = (round_idx == 15) ? SV::ROUND15_COMPUTE_NEXT_TARGET_SUM_ARITHMETIC
                                                       : SV::ROUND_COMPUTE_NEXT_TARGET_SUM_ARITHMETIC;
        const auto& gate_sep_fp = [&]() -> const recursion_helpers::FunctionFingerprint& {
            if (round_idx == 15) {
                return SV::ROUND15_GATE_SEP_ARITHMETIC;
            }
            if (round_idx == 0) {
                return SV::ROUND_GATE_SEP_R0_ARITHMETIC;
            }
            return SV::ROUND_GATE_SEP_ARITHMETIC;
        }();
        write_stage_fingerprint(out,
                                builder,
                                ("Sumcheck:check_sum_" + std::to_string(round_idx)).c_str(),
                                { segment_from_fp(BLOCK_INDEX_ARITHMETIC, offset, check_sum_fp) });
        offset += check_sum_fp.gate_count;
        write_stage_fingerprint(out,
                                builder,
                                ("Sumcheck:compute_next_target_sum_" + std::to_string(round_idx)).c_str(),
                                { segment_from_fp(BLOCK_INDEX_ARITHMETIC, offset, next_target_fp) });
        offset += next_target_fp.gate_count;
        write_stage_fingerprint(out,
                                builder,
                                ("Sumcheck:gate_separators_partially_evaluate_" + std::to_string(round_idx)).c_str(),
                                { segment_from_fp(BLOCK_INDEX_ARITHMETIC, offset, gate_sep_fp) });
        sumcheck_cursor = round.arith_end;
    }

    write_stage_fingerprint(out,
                            builder,
                            "Sumcheck:compute_full_relation_purported_value",
                            { segment_from_fp(BLOCK_INDEX_ARITHMETIC,
                                              sumcheck_cursor,
                                              SV::COMPUTE_FULL_RELATION_ARITHMETIC) });
    sumcheck_cursor += SV::COMPUTE_FULL_RELATION_ARITHMETIC.gate_count;
    write_stage_fingerprint(out,
                            builder,
                            "Sumcheck:row_disabling_evaluate_at_challenge",
                            { segment_from_fp(BLOCK_INDEX_ARITHMETIC,
                                              sumcheck_cursor,
                                              SV::ROW_DISABLING_ARITHMETIC) });
    sumcheck_cursor += SV::ROW_DISABLING_ARITHMETIC.gate_count;
    write_stage_fingerprint(out,
                            builder,
                            "Sumcheck:libra_correction",
                            { segment_from_fp(BLOCK_INDEX_ARITHMETIC,
                                              sumcheck_cursor,
                                              SV::LIBRA_CORRECTION_ARITHMETIC) });
    sumcheck_cursor += SV::LIBRA_CORRECTION_ARITHMETIC.gate_count;
    auto grand_sum = SV::validate_libra_commitment_receive<bb::fr>(builder,
                                                                   analyzer,
                                                                   sumcheck_cursor,
                                                                   SV::LIBRA_GRAND_SUM_COMMIT_ARITHMETIC,
                                                                   SV::LIBRA_GRAND_SUM_COMMIT_NNF,
                                                                   "grand_sum_commitment");
    ASSERT_TRUE(grand_sum.is_valid);
    write_stage_fingerprint(out,
                            builder,
                            "Sumcheck:Libra_grand_sum_commitment",
                            { segment_from_fp(BLOCK_INDEX_ARITHMETIC,
                                              grand_sum.arithmetic_gate_start_idx,
                                              SV::LIBRA_GRAND_SUM_COMMIT_ARITHMETIC),
                              segment_from_fp(BLOCK_INDEX_NNF,
                                              grand_sum.nnf_gate_start_idx,
                                              SV::LIBRA_GRAND_SUM_COMMIT_NNF) });
    sumcheck_cursor += SV::LIBRA_GRAND_SUM_COMMIT_ARITHMETIC.gate_count;
    auto quotient = SV::validate_libra_commitment_receive<bb::fr>(builder,
                                                                  analyzer,
                                                                  sumcheck_cursor,
                                                                  SV::LIBRA_QUOTIENT_COMMIT_ARITHMETIC,
                                                                  SV::LIBRA_QUOTIENT_COMMIT_NNF,
                                                                  "quotient_commitment");
    ASSERT_TRUE(quotient.is_valid);
    write_stage_fingerprint(out,
                            builder,
                            "Sumcheck:Libra_quotient_commitment",
                            { segment_from_fp(BLOCK_INDEX_ARITHMETIC,
                                              quotient.arithmetic_gate_start_idx,
                                              SV::LIBRA_QUOTIENT_COMMIT_ARITHMETIC),
                              segment_from_fp(BLOCK_INDEX_NNF,
                                              quotient.nnf_gate_start_idx,
                                              SV::LIBRA_QUOTIENT_COMMIT_NNF) });

    // ── Shplemini ─────────────────────────────────────────────────────────────
    namespace SH = ShpleminiVerification;
    const size_t shplemini_consumed_count = recursion_helpers::NUM_OINK_SQUEEZES +
                                            recursion_helpers::NUM_STEP2_SQUEEZES +
                                            recursion_helpers::NUM_SUMCHECK_SQUEEZES;
    const std::set<size_t> consumed_before_shplemini(all_squeezes.begin(),
                                                     all_squeezes.begin() + shplemini_consumed_count);
    auto shplemini_gates = recursion_helpers::take_unclaimed_squeezes(
        all_squeezes, consumed_before_shplemini, recursion_helpers::NUM_SHPLEMINI_SQUEEZES);
    ASSERT_EQ(shplemini_gates.size(), recursion_helpers::NUM_SHPLEMINI_SQUEEZES);

    auto rho = recursion_helpers::validate_challenges_generation<bb::fr>(
        builder, analyzer, shplemini_gates[0], SH::RHO_ARITHMETIC, SH::RHO_POSEIDON2_EXT, SH::RHO_POSEIDON2_INT);
    write_challenge_generation_fingerprint(
        out, builder, "Shplemini:rho", rho, SH::RHO_ARITHMETIC, SH::RHO_POSEIDON2_EXT, SH::RHO_POSEIDON2_INT);
    auto fold = SH::validate_gemini_fold_commitments<bb::fr>(builder, analyzer, shplemini_gates[0], shplemini_gates[1]);
    ASSERT_TRUE(fold.is_valid);
    write_stage_fingerprint(out,
                            builder,
                            "Shplemini:Gemini_fold_commitments",
                            { segment_from_fp(BLOCK_INDEX_ARITHMETIC,
                                              fold.arithmetic_gate_start_idx,
                                              SH::GEMINI_FOLD_COMMITMENTS_ARITHMETIC),
                              segment_from_fp(BLOCK_INDEX_NNF,
                                              fold.nnf_gate_start_idx,
                                              SH::GEMINI_FOLD_COMMITMENTS_NNF) });
    auto gemini_r = recursion_helpers::validate_challenges_generation<bb::fr>(builder,
                                                                              analyzer,
                                                                              shplemini_gates[1],
                                                                              SH::GEMINI_R_ARITHMETIC,
                                                                              SH::GEMINI_R_POSEIDON2_EXT,
                                                                              SH::GEMINI_R_POSEIDON2_INT);
    write_challenge_generation_fingerprint(out,
                                           builder,
                                           "Shplemini:Gemini_r",
                                           gemini_r,
                                           SH::GEMINI_R_ARITHMETIC,
                                           SH::GEMINI_R_POSEIDON2_EXT,
                                           SH::GEMINI_R_POSEIDON2_INT);
    write_stage_fingerprint(out, builder, "Shplemini:Gemini_fold_neg_evaluations", {});
    auto eval_powers = SH::validate_evaluation_challenge_powers(builder, gemini_r.arithmetic_gate_start_idx);
    ASSERT_TRUE(eval_powers.is_valid);
    write_stage_fingerprint(out,
                            builder,
                            "Shplemini:Gemini_evaluation_challenge_powers",
                            { segment_from_fp(BLOCK_INDEX_ARITHMETIC,
                                              eval_powers.arithmetic_gate_start_idx,
                                              SH::GEMINI_EVALUATION_CHALLENGE_POWERS_ARITHMETIC) });
    write_stage_fingerprint(out, builder, "Shplemini:Gemini_interleaved_evaluations", {});
    write_stage_fingerprint(out, builder, "Shplemini:Libra_evaluations", {});
    auto nu = recursion_helpers::validate_challenges_generation<bb::fr>(builder,
                                                                        analyzer,
                                                                        shplemini_gates[2],
                                                                        SH::SHPLONK_NU_ARITHMETIC,
                                                                        SH::SHPLONK_NU_POSEIDON2_EXT,
                                                                        SH::SHPLONK_NU_POSEIDON2_INT);
    write_challenge_generation_fingerprint(out,
                                           builder,
                                           "Shplemini:Shplonk_nu",
                                           nu,
                                           SH::SHPLONK_NU_ARITHMETIC,
                                           SH::SHPLONK_NU_POSEIDON2_EXT,
                                           SH::SHPLONK_NU_POSEIDON2_INT);
    auto batching_powers = SH::validate_shplonk_batching_challenge_powers(builder, nu.arithmetic_gate_start_idx);
    ASSERT_TRUE(batching_powers.is_valid);
    write_stage_fingerprint(out,
                            builder,
                            "Shplemini:Shplonk_batching_challenge_powers",
                            { segment_from_fp(BLOCK_INDEX_ARITHMETIC,
                                              batching_powers.arithmetic_gate_start_idx,
                                              SH::SHPLONK_BATCHING_CHALLENGE_POWERS_ARITHMETIC) });
    auto q = SH::validate_shplonk_q<bb::fr>(builder, analyzer, batching_powers.arithmetic_gate_start_idx);
    ASSERT_TRUE(q.is_valid);
    write_stage_fingerprint(out,
                            builder,
                            "Shplemini:Shplonk_Q",
                            { segment_from_fp(BLOCK_INDEX_ARITHMETIC,
                                              q.arithmetic_gate_start_idx,
                                              SH::SHPLONK_Q_ARITHMETIC),
                              segment_from_fp(BLOCK_INDEX_NNF, q.nnf_gate_start_idx, SH::SHPLONK_Q_NNF) });
    auto z = recursion_helpers::validate_challenges_generation<bb::fr>(builder,
                                                                       analyzer,
                                                                       shplemini_gates[3],
                                                                       SH::SHPLONK_Z_ARITHMETIC,
                                                                       SH::SHPLONK_Z_POSEIDON2_EXT,
                                                                       SH::SHPLONK_Z_POSEIDON2_INT);
    write_challenge_generation_fingerprint(out,
                                           builder,
                                           "Shplemini:Shplonk_z",
                                           z,
                                           SH::SHPLONK_Z_ARITHMETIC,
                                           SH::SHPLONK_Z_POSEIDON2_EXT,
                                           SH::SHPLONK_Z_POSEIDON2_INT);
    size_t shplemini_cursor = z.arithmetic_gate_start_idx + SH::SHPLONK_Z_ARITHMETIC.gate_count;
    const std::array<std::pair<const char*, const recursion_helpers::FunctionFingerprint*>, 9> shplemini_tail = { {
        { "Shplemini:Shplonk_inverse_gemini_denominators", &SH::SHPLONK_INVERSE_GEMINI_DENOMINATORS_ARITHMETIC },
        { "Shplemini:ClaimBatcher_compute_scalars", &SH::CLAIM_BATCHER_COMPUTE_SCALARS_ARITHMETIC },
        { "Shplemini:ClaimBatcher_update_batch_mul_inputs", &SH::CLAIM_BATCHER_UPDATE_BATCH_MUL_INPUTS_ARITHMETIC },
        { "Shplemini:Gemini_fold_pos_evaluations", &SH::GEMINI_FOLD_POS_EVALUATIONS_ARITHMETIC },
        { "Shplemini:batch_gemini_claims_received_from_prover", &SH::BATCH_GEMINI_CLAIMS_ARITHMETIC },
        { "Shplemini:A0_constant_terms", &SH::A0_CONSTANT_TERMS_ARITHMETIC },
        { "Shplemini:remove_repeated_commitments", &SH::REMOVE_REPEATED_COMMITMENTS_ARITHMETIC },
        { "Shplemini:add_zk_data", &SH::ADD_ZK_DATA_ARITHMETIC },
        { "Shplemini:check_libra_evaluations_consistency", &SH::CHECK_LIBRA_EVALUATIONS_CONSISTENCY_ARITHMETIC },
    } };
    for (const auto& [name, fp] : shplemini_tail) {
        write_stage_fingerprint(
            out, builder, name, { segment_from_fp(BLOCK_INDEX_ARITHMETIC, shplemini_cursor, *fp) });
        shplemini_cursor += fp->gate_count;
    }
    write_stage_fingerprint(out, builder, "Shplemini:finalize_batch_opening_claim", {});

    // ── KZG ──────────────────────────────────────────────────────────────────
    const size_t kzg_consumed_count = recursion_helpers::NUM_OINK_SQUEEZES + recursion_helpers::NUM_STEP2_SQUEEZES +
                                      recursion_helpers::NUM_SUMCHECK_SQUEEZES +
                                      recursion_helpers::NUM_SHPLEMINI_SQUEEZES;
    const std::set<size_t> consumed_before_kzg(all_squeezes.begin(), all_squeezes.begin() + kzg_consumed_count);
    auto masking_challenge = recursion_helpers::kzg_masking_challenge(builder, all_squeezes, consumed_before_kzg);
    ASSERT_TRUE(masking_challenge.valid);
    auto transcript_receive =
        KZGVerification::validate_transcript_receive(builder, analyzer, masking_challenge.squeeze_gate);
    ASSERT_TRUE(transcript_receive.is_valid);
    auto masking_generation = KZGVerification::validate_masking_challenge_generation(
        builder, analyzer, masking_challenge.squeeze_gate, transcript_receive);
    ASSERT_TRUE(masking_generation.is_valid);
    auto batch_mul = KZGVerification::validate_batch_mul(
        builder, analyzer, masking_challenge.squeeze_gate, transcript_receive, masking_generation);
    ASSERT_TRUE(batch_mul.is_valid);

    write_stage_fingerprint(out,
                            builder,
                            "KZG:W_receive",
                            { segment_from_fp(BLOCK_INDEX_ARITHMETIC,
                                              transcript_receive.arithmetic_gate_start_idx,
                                              KZGVerification::TRANSCRIPT_RECEIVE_KZG_W_ARITHMETIC),
                              segment_from_fp(BLOCK_INDEX_NNF,
                                              transcript_receive.nnf_gate_start_idx,
                                              KZGVerification::TRANSCRIPT_RECEIVE_KZG_W_NNF) });
    write_stage_fingerprint(out,
                            builder,
                            "KZG:masking_challenge",
                            { segment_from_fp(BLOCK_INDEX_ARITHMETIC,
                                              masking_generation.arithmetic_gate_start_idx,
                                              KZGVerification::MASKING_CHALLENGE_ARITHMETIC),
                              segment_from_fp(BLOCK_INDEX_POSEIDON2_EXT,
                                              masking_generation.poseidon2_external_gate_start_idx,
                                              KZGVerification::MASKING_CHALLENGE_POSEIDON2_EXT),
                              segment_from_fp(BLOCK_INDEX_POSEIDON2_INT,
                                              masking_generation.poseidon2_internal_gate_start_idx,
                                              KZGVerification::MASKING_CHALLENGE_POSEIDON2_INT) });
    write_stage_fingerprint(out,
                            builder,
                            "KZG:batch_mul",
                            { segment_from_fp(BLOCK_INDEX_ARITHMETIC,
                                              batch_mul.arithmetic_gate_start_idx,
                                              KZGVerification::BATCH_MUL_ARITHMETIC),
                              segment_from_fp(BLOCK_INDEX_MEMORY,
                                              batch_mul.memory_gate_start_idx,
                                              KZGVerification::BATCH_MUL_MEMORY),
                              segment_from_fp(BLOCK_INDEX_NNF,
                                              batch_mul.nnf_gate_start_idx,
                                              KZGVerification::BATCH_MUL_NNF) });
    write_stage_fingerprint(out, builder, "KZG:negate_W", {});
}

TEST_F(ChonkRecursionTestSuite, AcirChonkFingerprintsMatchConstants)
{
    AcirProgram program = make_mock_acir_program(0);
    Builder builder = create_circuit<Builder>(program, { .has_ipa_claim = true });
    const auto constraint = program.constraints.chonk_recursion_constraints[0];

    AcirFormat constraint_system_copy = program.constraints;
    StaticAnalyzerAcir analyzer_acir(std::move(constraint_system_copy), std::move(builder));

    EXPECT_TRUE(analyzer_acir.process_chonk_recursion_constraint(&constraint));
}

TEST_F(BoomerangShpleminiTests, ShpleminiComputeBatchOpeningClaimBlockAnalysis)
{
    info("");
    info("=== ShpleminiComputeBatchOpeningClaimFingerprintRegression ===");

    auto vc = setup_verifier_components(0);
    Builder& builder = vc.builder();
    auto snap = [&]() { return recursion_helpers::BlockSnapshot::capture(builder); };

    run_oink_verifier_step(vc);
    std::vector<FF> padding_indicator_array = run_padding_indicator_array_step(vc);
    SumcheckStepOutput sumcheck_step = run_sumcheck_step(vc, padding_indicator_array);

    using Commitment = RecursiveFlavor::Commitment;
    using VerifierCommitments = RecursiveFlavor::VerifierCommitments;
    using GeminiVerifier = GeminiVerifier_<Curve>;
    using ShplonkVerifier = ShplonkVerifier_<Curve>;

    VerifierCommitments commitments{ vc.verifier_instance->get_vk(), vc.verifier_instance->witness_commitments };
    if constexpr (RecursiveFlavor::HasZK) {
        commitments.gemini_masking_poly = vc.verifier_instance->gemini_masking_commitment;
    }

    using ClaimBatch = ClaimBatcher::Batch;
    ClaimBatcher claim_batcher{ .unshifted =
                                    ClaimBatch{ commitments.get_unshifted(),
                                                sumcheck_step.sumcheck_output.claimed_evaluations.get_unshifted() },
                                .shifted =
                                    ClaimBatch{ commitments.get_to_be_shifted(),
                                                sumcheck_step.sumcheck_output.claimed_evaluations.get_shifted() } };

    const size_t virtual_log_n = sumcheck_step.sumcheck_output.challenge.size();
    const bool committed_sumcheck = false;
    FF batched_evaluation = FF{ 0 };

    auto before_rho = snap();
    const FF gemini_batching_challenge = vc.transcript->template get_challenge<FF>("rho");
    expect_stage_matches_fingerprints(builder,
                                      before_rho,
                                      snap(),
                                      { { BLOCK_INDEX_ARITHMETIC, &ShpleminiVerification::RHO_ARITHMETIC },
                                        { BLOCK_INDEX_POSEIDON2_EXT, &ShpleminiVerification::RHO_POSEIDON2_EXT },
                                        { BLOCK_INDEX_POSEIDON2_INT, &ShpleminiVerification::RHO_POSEIDON2_INT } },
                                      "Shplemini:rho");

    auto before_fold_commitments = snap();
    const std::vector<Commitment> fold_commitments = GeminiVerifier::get_fold_commitments(virtual_log_n, vc.transcript);
    expect_stage_matches_fingerprints(
        builder,
        before_fold_commitments,
        snap(),
        { { BLOCK_INDEX_ARITHMETIC, &ShpleminiVerification::GEMINI_FOLD_COMMITMENTS_ARITHMETIC },
          { BLOCK_INDEX_NNF, &ShpleminiVerification::GEMINI_FOLD_COMMITMENTS_NNF } },
        "Shplemini:Gemini_fold_commitments");

    auto before_gemini_r = snap();
    const FF gemini_evaluation_challenge = vc.transcript->template get_challenge<FF>("Gemini:r");
    expect_stage_matches_fingerprints(builder,
                                      before_gemini_r,
                                      snap(),
                                      { { BLOCK_INDEX_ARITHMETIC, &ShpleminiVerification::GEMINI_R_ARITHMETIC },
                                        { BLOCK_INDEX_POSEIDON2_EXT, &ShpleminiVerification::GEMINI_R_POSEIDON2_EXT },
                                        { BLOCK_INDEX_POSEIDON2_INT, &ShpleminiVerification::GEMINI_R_POSEIDON2_INT } },
                                      "Shplemini:Gemini_r");

    auto before_fold_neg_evaluations = snap();
    const std::vector<FF> gemini_fold_neg_evaluations =
        GeminiVerifier::get_gemini_evaluations(virtual_log_n, vc.transcript);
    expect_no_new_gates(builder, before_fold_neg_evaluations, snap(), "Shplemini:Gemini_fold_neg_evaluations");

    FF p_pos = FF(0);
    FF p_neg = FF(0);
    if (claim_batcher.interleaved) {
        auto before_interleaved_evaluations = snap();
        p_pos = vc.transcript->template receive_from_prover<FF>("Gemini:P_pos");
        p_neg = vc.transcript->template receive_from_prover<FF>("Gemini:P_neg");
        expect_no_new_gates(
            builder, before_interleaved_evaluations, snap(), "Shplemini:Gemini_interleaved_evaluations");
    }

    auto before_gemini_eval_powers = snap();
    const std::vector<FF> gemini_eval_challenge_powers =
        gemini::powers_of_evaluation_challenge(gemini_evaluation_challenge, virtual_log_n);
    expect_stage_matches_fingerprints(
        builder,
        before_gemini_eval_powers,
        snap(),
        { { BLOCK_INDEX_ARITHMETIC, &ShpleminiVerification::GEMINI_EVALUATION_CHALLENGE_POWERS_ARITHMETIC } },
        "Shplemini:Gemini_evaluation_challenge_powers");

    std::array<FF, NUM_SMALL_IPA_EVALUATIONS> libra_evaluations;
    if constexpr (RecursiveFlavor::HasZK) {
        auto before_libra_evaluations = snap();
        libra_evaluations[0] = vc.transcript->template receive_from_prover<FF>("Libra:concatenation_eval");
        libra_evaluations[1] = vc.transcript->template receive_from_prover<FF>("Libra:shifted_grand_sum_eval");
        libra_evaluations[2] = vc.transcript->template receive_from_prover<FF>("Libra:grand_sum_eval");
        libra_evaluations[3] = vc.transcript->template receive_from_prover<FF>("Libra:quotient_eval");
        if constexpr (Curve::is_stdlib_type) {
            for (auto& eval : libra_evaluations) {
                eval.clear_round_provenance();
            }
        }
        expect_no_new_gates(builder, before_libra_evaluations, snap(), "Shplemini:Libra_evaluations");
    }

    auto before_shplonk_nu = snap();
    const FF shplonk_batching_challenge = vc.transcript->template get_challenge<FF>("Shplonk:nu");
    expect_stage_matches_fingerprints(
        builder,
        before_shplonk_nu,
        snap(),
        { { BLOCK_INDEX_ARITHMETIC, &ShpleminiVerification::SHPLONK_NU_ARITHMETIC },
          { BLOCK_INDEX_POSEIDON2_EXT, &ShpleminiVerification::SHPLONK_NU_POSEIDON2_EXT },
          { BLOCK_INDEX_POSEIDON2_INT, &ShpleminiVerification::SHPLONK_NU_POSEIDON2_INT } },
        "Shplemini:Shplonk_nu");

    auto before_shplonk_batching_powers = snap();
    const std::vector<FF> shplonk_batching_challenge_powers = compute_shplonk_batching_challenge_powers(
        shplonk_batching_challenge, virtual_log_n, RecursiveFlavor::HasZK, committed_sumcheck);
    expect_stage_matches_fingerprints(
        builder,
        before_shplonk_batching_powers,
        snap(),
        { { BLOCK_INDEX_ARITHMETIC, &ShpleminiVerification::SHPLONK_BATCHING_CHALLENGE_POWERS_ARITHMETIC } },
        "Shplemini:Shplonk_batching_challenge_powers");

    auto before_q_commitment = snap();
    const auto q_commitment = vc.transcript->template receive_from_prover<Commitment>("Shplonk:Q");
    expect_stage_matches_fingerprints(builder,
                                      before_q_commitment,
                                      snap(),
                                      { { BLOCK_INDEX_ARITHMETIC, &ShpleminiVerification::SHPLONK_Q_ARITHMETIC },
                                        { BLOCK_INDEX_NNF, &ShpleminiVerification::SHPLONK_Q_NNF } },
                                      "Shplemini:Shplonk_Q");

    std::vector<Commitment> batch_mul_commitments{ q_commitment };

    auto before_shplonk_z = snap();
    const FF shplonk_evaluation_challenge = vc.transcript->template get_challenge<FF>("Shplonk:z");
    expect_stage_matches_fingerprints(
        builder,
        before_shplonk_z,
        snap(),
        { { BLOCK_INDEX_ARITHMETIC, &ShpleminiVerification::SHPLONK_Z_ARITHMETIC },
          { BLOCK_INDEX_POSEIDON2_EXT, &ShpleminiVerification::SHPLONK_Z_POSEIDON2_EXT },
          { BLOCK_INDEX_POSEIDON2_INT, &ShpleminiVerification::SHPLONK_Z_POSEIDON2_INT } },
        "Shplemini:Shplonk_z");

    FF constant_term_accumulator = FF(0);
    std::vector<FF> scalars;
    scalars.emplace_back(FF(1));

    auto before_inverse_denominators = snap();
    const std::vector<FF> inverse_vanishing_evals = ShplonkVerifier::compute_inverted_gemini_denominators(
        shplonk_evaluation_challenge, gemini_eval_challenge_powers);
    expect_stage_matches_fingerprints(
        builder,
        before_inverse_denominators,
        snap(),
        { { BLOCK_INDEX_ARITHMETIC, &ShpleminiVerification::SHPLONK_INVERSE_GEMINI_DENOMINATORS_ARITHMETIC } },
        "Shplemini:Shplonk_inverse_gemini_denominators");

    auto before_claim_batcher_scalars = snap();
    claim_batcher.compute_scalars_for_each_batch(
        inverse_vanishing_evals, shplonk_batching_challenge, gemini_evaluation_challenge);
    expect_stage_matches_fingerprints(
        builder,
        before_claim_batcher_scalars,
        snap(),
        { { BLOCK_INDEX_ARITHMETIC, &ShpleminiVerification::CLAIM_BATCHER_COMPUTE_SCALARS_ARITHMETIC } },
        "Shplemini:ClaimBatcher_compute_scalars");

    FF shplonk_interleaving_batching_pos = FF{ 0 };
    FF shplonk_interleaving_batching_neg = FF{ 0 };
    auto before_batcher_update = snap();
    if (claim_batcher.interleaved) {
        const size_t interleaved_pos_index = 2 * virtual_log_n;
        const size_t interleaved_neg_index = interleaved_pos_index + 1;
        shplonk_interleaving_batching_pos = shplonk_batching_challenge_powers[interleaved_pos_index];
        shplonk_interleaving_batching_neg = shplonk_batching_challenge_powers[interleaved_neg_index];
        constant_term_accumulator +=
            claim_batcher.interleaved->shplonk_denominator *
            (p_pos * shplonk_interleaving_batching_pos + p_neg * shplonk_interleaving_batching_neg);
    }
    claim_batcher.update_batch_mul_inputs_and_batched_evaluation(batch_mul_commitments,
                                                                 scalars,
                                                                 batched_evaluation,
                                                                 gemini_batching_challenge,
                                                                 shplonk_interleaving_batching_pos,
                                                                 shplonk_interleaving_batching_neg);
    expect_stage_matches_fingerprints(
        builder,
        before_batcher_update,
        snap(),
        { { BLOCK_INDEX_ARITHMETIC, &ShpleminiVerification::CLAIM_BATCHER_UPDATE_BATCH_MUL_INPUTS_ARITHMETIC } },
        "Shplemini:ClaimBatcher_update_batch_mul_inputs");

    auto before_fold_pos_evaluations = snap();
    const std::vector<FF> gemini_fold_pos_evaluations =
        GeminiVerifier::compute_fold_pos_evaluations(padding_indicator_array,
                                                     batched_evaluation,
                                                     sumcheck_step.sumcheck_output.challenge,
                                                     gemini_eval_challenge_powers,
                                                     gemini_fold_neg_evaluations,
                                                     p_neg);
    expect_stage_matches_fingerprints(
        builder,
        before_fold_pos_evaluations,
        snap(),
        { { BLOCK_INDEX_ARITHMETIC, &ShpleminiVerification::GEMINI_FOLD_POS_EVALUATIONS_ARITHMETIC } },
        "Shplemini:Gemini_fold_pos_evaluations");

    auto before_batch_gemini_claims = snap();
    Shplemini::batch_gemini_claims_received_from_prover(padding_indicator_array,
                                                        fold_commitments,
                                                        gemini_fold_neg_evaluations,
                                                        gemini_fold_pos_evaluations,
                                                        inverse_vanishing_evals,
                                                        shplonk_batching_challenge_powers,
                                                        batch_mul_commitments,
                                                        scalars,
                                                        constant_term_accumulator);
    expect_stage_matches_fingerprints(
        builder,
        before_batch_gemini_claims,
        snap(),
        { { BLOCK_INDEX_ARITHMETIC, &ShpleminiVerification::BATCH_GEMINI_CLAIMS_ARITHMETIC } },
        "Shplemini:batch_gemini_claims_received_from_prover");

    auto before_a0_constant_terms = snap();
    const FF& full_a_0_pos = gemini_fold_pos_evaluations[0];
    const FF a_0_pos = full_a_0_pos - p_pos;
    constant_term_accumulator += a_0_pos * inverse_vanishing_evals[0];
    constant_term_accumulator +=
        gemini_fold_neg_evaluations[0] * shplonk_batching_challenge * inverse_vanishing_evals[1];
    expect_stage_matches_fingerprints(
        builder,
        before_a0_constant_terms,
        snap(),
        { { BLOCK_INDEX_ARITHMETIC, &ShpleminiVerification::A0_CONSTANT_TERMS_ARITHMETIC } },
        "Shplemini:A0_constant_terms");

    auto before_remove_repeated = snap();
    Shplemini::remove_repeated_commitments(
        batch_mul_commitments, scalars, RecursiveFlavor::REPEATED_COMMITMENTS, RecursiveFlavor::HasZK);
    expect_stage_matches_fingerprints(
        builder,
        before_remove_repeated,
        snap(),
        { { BLOCK_INDEX_ARITHMETIC, &ShpleminiVerification::REMOVE_REPEATED_COMMITMENTS_ARITHMETIC } },
        "Shplemini:remove_repeated_commitments");

    bool consistency_checked = true;
    if constexpr (RecursiveFlavor::HasZK) {
        auto before_add_zk_data = snap();
        Shplemini::add_zk_data(virtual_log_n,
                               batch_mul_commitments,
                               scalars,
                               constant_term_accumulator,
                               sumcheck_step.libra_commitments,
                               libra_evaluations,
                               gemini_evaluation_challenge,
                               shplonk_batching_challenge_powers,
                               shplonk_evaluation_challenge);
        expect_stage_matches_fingerprints(
            builder,
            before_add_zk_data,
            snap(),
            { { BLOCK_INDEX_ARITHMETIC, &ShpleminiVerification::ADD_ZK_DATA_ARITHMETIC } },
            "Shplemini:add_zk_data");

        auto before_libra_consistency = snap();
        consistency_checked = SmallSubgroupIPAVerifier<Curve>::check_libra_evaluations_consistency(
            libra_evaluations,
            gemini_evaluation_challenge,
            sumcheck_step.sumcheck_output.challenge,
            sumcheck_step.sumcheck_output.claimed_libra_evaluation);
        expect_stage_matches_fingerprints(
            builder,
            before_libra_consistency,
            snap(),
            { { BLOCK_INDEX_ARITHMETIC, &ShpleminiVerification::CHECK_LIBRA_EVALUATIONS_CONSISTENCY_ARITHMETIC } },
            "Shplemini:check_libra_evaluations_consistency");
    }

    auto before_finalize_claim = snap();
    Commitment one_commitment = Commitment::one(&builder);
    batch_mul_commitments.emplace_back(one_commitment);
    scalars.emplace_back(constant_term_accumulator);
    BatchOpeningClaim<Curve> batch_opening_claim{ batch_mul_commitments, scalars, shplonk_evaluation_challenge };
    ShpleminiVerifierOutput_<Curve, RecursiveFlavor::HasZK> output{ batch_opening_claim };
    if constexpr (RecursiveFlavor::HasZK) {
        output.consistency_checked = consistency_checked;
    }
    expect_no_new_gates(builder, before_finalize_claim, snap(), "Shplemini:finalize_batch_opening_claim");

    EXPECT_EQ(output.batch_opening_claim.commitments.size(), output.batch_opening_claim.scalars.size());
    info("=== ShpleminiComputeBatchOpeningClaimFingerprintRegression COMPLETE ===");
}

TEST_F(BoomerangShpleminiTests, ValidateShplemini)
{
    auto trace = execute_all_megazk_steps_and_save_challenge_witness_indices(0);
    Builder& builder = trace.vc.builder();
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
    EXPECT_TRUE(ShpleminiVerification::validate_shplemini<bb::fr>(builder, analyzer));
}

TEST_F(BoomerangKZGStepTests, ValidateKZG)
{
    auto setup = build_kzg_validation_circuit();
    Builder& builder = setup.vc.builder();

    auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    EXPECT_EQ(all_squeezes.size(), recursion_helpers::NUM_TOTAL_WITH_KZG_SQUEEZES);
    EXPECT_EQ(all_squeezes, setup.all_squeeze_gates);
    expect_megazk_challenge_witness_indices_eq(
        extract_megazk_challenge_witness_indices_from_squeeze_gates(builder, all_squeezes),
        setup.challenge_witness_indices);
    EXPECT_TRUE(KZGVerification::validate_kzg(builder, all_squeezes, setup.consumed_squeezes_before_kzg).is_valid);
}

TEST_F(BoomerangKZGStepTests, ValidateTranscriptReceive)
{
    auto setup = build_kzg_validation_circuit();
    Builder& builder = setup.vc.builder();
    auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    auto locations = locate_kzg_arithmetic_locations(builder, all_squeezes, setup.consumed_squeezes_before_kzg);
    ASSERT_TRUE(locations.valid);

    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
    auto result = KZGVerification::validate_transcript_receive(builder, analyzer, locations.masking_challenge_start);

    EXPECT_TRUE(result.is_valid);
    EXPECT_EQ(result.arithmetic_gate_start_idx, locations.w_receive_start);
    EXPECT_NE(result.nnf_gate_start_idx, SIZE_MAX);
}

TEST_F(BoomerangKZGStepTests, ValidateTranscriptReceiveAcceptsMaskingChallengeSqueezeGateAnchor)
{
    auto setup = build_kzg_validation_circuit();
    Builder& builder = setup.vc.builder();
    auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    auto locations = locate_kzg_arithmetic_locations(builder, all_squeezes, setup.consumed_squeezes_before_kzg);
    ASSERT_TRUE(locations.valid);

    auto masking_challenge =
        recursion_helpers::kzg_masking_challenge(builder, all_squeezes, setup.consumed_squeezes_before_kzg);
    ASSERT_TRUE(masking_challenge.valid);

    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
    auto result = KZGVerification::validate_transcript_receive(builder, analyzer, masking_challenge.squeeze_gate);
    const size_t masking_challenge_start =
        result.arithmetic_gate_start_idx + KZGVerification::TRANSCRIPT_RECEIVE_KZG_W_ARITHMETIC.gate_count;

    ASSERT_TRUE(result.is_valid);
    EXPECT_EQ(masking_challenge_start, locations.masking_challenge_start);
    EXPECT_LE(masking_challenge_start, masking_challenge.squeeze_gate);
    EXPECT_LT(masking_challenge.squeeze_gate,
              masking_challenge_start + KZGVerification::MASKING_CHALLENGE_ARITHMETIC.gate_count);
    info("KZG masking_challenge squeeze gate ",
         masking_challenge.squeeze_gate,
         masking_challenge.squeeze_gate == masking_challenge_start ? " is " : " is not ",
         "the masking_challenge arithmetic start ",
         masking_challenge_start);
}

TEST_F(BoomerangKZGStepTests, ValidateMaskingChallengeGeneration)
{
    auto setup = build_kzg_validation_circuit();
    Builder& builder = setup.vc.builder();
    auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    auto locations = locate_kzg_arithmetic_locations(builder, all_squeezes, setup.consumed_squeezes_before_kzg);
    ASSERT_TRUE(locations.valid);
    auto masking_challenge =
        recursion_helpers::kzg_masking_challenge(builder, all_squeezes, setup.consumed_squeezes_before_kzg);
    ASSERT_TRUE(masking_challenge.valid);

    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
    auto transcript_receive =
        KZGVerification::validate_transcript_receive(builder, analyzer, masking_challenge.squeeze_gate);
    ASSERT_TRUE(transcript_receive.is_valid);

    auto result = KZGVerification::validate_masking_challenge_generation(
        builder, analyzer, masking_challenge.squeeze_gate, transcript_receive);

    EXPECT_TRUE(result.is_valid);
    EXPECT_EQ(result.arithmetic_gate_start_idx, locations.masking_challenge_start);
    EXPECT_NE(result.poseidon2_external_gate_start_idx, SIZE_MAX);
    EXPECT_NE(result.poseidon2_internal_gate_start_idx, SIZE_MAX);
}

TEST_F(BoomerangKZGStepTests, ValidateMaskingChallengeGenerationDetectsCorruptedArithmeticGate)
{
    auto setup = build_kzg_validation_circuit();
    Builder& builder = setup.vc.builder();
    auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    auto locations = locate_kzg_arithmetic_locations(builder, all_squeezes, setup.consumed_squeezes_before_kzg);
    ASSERT_TRUE(locations.valid);
    auto masking_challenge =
        recursion_helpers::kzg_masking_challenge(builder, all_squeezes, setup.consumed_squeezes_before_kzg);
    ASSERT_TRUE(masking_challenge.valid);

    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
    auto transcript_receive =
        KZGVerification::validate_transcript_receive(builder, analyzer, masking_challenge.squeeze_gate);
    ASSERT_TRUE(transcript_receive.is_valid);

    auto& arith = builder.blocks.arithmetic;
    size_t gate_to_corrupt = locations.masking_challenge_start;
    const size_t masking_challenge_end =
        locations.masking_challenge_start + KZGVerification::MASKING_CHALLENGE_ARITHMETIC.gate_count;
    while (gate_to_corrupt < masking_challenge_end && is_constant_fix_witness_gate(builder, gate_to_corrupt)) {
        ++gate_to_corrupt;
    }
    ASSERT_LT(gate_to_corrupt, masking_challenge_end);
    arith.q_c().set(gate_to_corrupt, arith.q_c()[gate_to_corrupt] + bb::fr::one());

    auto result = KZGVerification::validate_masking_challenge_generation(
        builder, analyzer, masking_challenge.squeeze_gate, transcript_receive);

    EXPECT_FALSE(result.is_valid);
    EXPECT_EQ(result.arithmetic_gate_start_idx, SIZE_MAX);
}

TEST_F(BoomerangKZGStepTests, ValidateMaskingChallengeGenerationDetectsCorruptedPoseidonExternalGate)
{
    auto setup = build_kzg_validation_circuit();
    Builder& builder = setup.vc.builder();
    auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    auto masking_challenge =
        recursion_helpers::kzg_masking_challenge(builder, all_squeezes, setup.consumed_squeezes_before_kzg);
    ASSERT_TRUE(masking_challenge.valid);

    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
    auto transcript_receive =
        KZGVerification::validate_transcript_receive(builder, analyzer, masking_challenge.squeeze_gate);
    ASSERT_TRUE(transcript_receive.is_valid);
    auto result = KZGVerification::validate_masking_challenge_generation(
        builder, analyzer, masking_challenge.squeeze_gate, transcript_receive);
    ASSERT_TRUE(result.is_valid);

    auto& poseidon2_external = builder.blocks.poseidon2_external;
    const size_t poseidon2_external_end =
        result.poseidon2_external_gate_start_idx + KZGVerification::MASKING_CHALLENGE_POSEIDON2_EXT.gate_count;
    ASSERT_LE(poseidon2_external_end, poseidon2_external.size());
    for (size_t gate_idx = result.poseidon2_external_gate_start_idx; gate_idx < poseidon2_external_end; ++gate_idx) {
        poseidon2_external.q_poseidon2_external().set(
            gate_idx, poseidon2_external.q_poseidon2_external()[gate_idx] + bb::fr::one());
    }

    auto corrupted_result = KZGVerification::validate_masking_challenge_generation(
        builder, analyzer, masking_challenge.squeeze_gate, transcript_receive);

    EXPECT_FALSE(corrupted_result.is_valid);
    EXPECT_EQ(corrupted_result.arithmetic_gate_start_idx, result.arithmetic_gate_start_idx);
}

TEST_F(BoomerangKZGStepTests, ValidateMaskingChallengeGenerationDetectsCorruptedPoseidonInternalGate)
{
    auto setup = build_kzg_validation_circuit();
    Builder& builder = setup.vc.builder();
    auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    auto masking_challenge =
        recursion_helpers::kzg_masking_challenge(builder, all_squeezes, setup.consumed_squeezes_before_kzg);
    ASSERT_TRUE(masking_challenge.valid);

    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
    auto transcript_receive =
        KZGVerification::validate_transcript_receive(builder, analyzer, masking_challenge.squeeze_gate);
    ASSERT_TRUE(transcript_receive.is_valid);
    auto result = KZGVerification::validate_masking_challenge_generation(
        builder, analyzer, masking_challenge.squeeze_gate, transcript_receive);
    ASSERT_TRUE(result.is_valid);

    auto& poseidon2_internal = builder.blocks.poseidon2_internal;
    poseidon2_internal.q_poseidon2_internal().set(
        result.poseidon2_internal_gate_start_idx,
        poseidon2_internal.q_poseidon2_internal()[result.poseidon2_internal_gate_start_idx] + bb::fr::one());

    auto corrupted_result = KZGVerification::validate_masking_challenge_generation(
        builder, analyzer, masking_challenge.squeeze_gate, transcript_receive);

    EXPECT_FALSE(corrupted_result.is_valid);
    EXPECT_EQ(corrupted_result.arithmetic_gate_start_idx, result.arithmetic_gate_start_idx);
}

TEST_F(BoomerangKZGStepTests, ValidateBatchMul)
{
    auto setup = build_kzg_validation_circuit();
    Builder& builder = setup.vc.builder();
    auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    auto locations = locate_kzg_arithmetic_locations(builder, all_squeezes, setup.consumed_squeezes_before_kzg);
    ASSERT_TRUE(locations.valid);
    auto masking_challenge =
        recursion_helpers::kzg_masking_challenge(builder, all_squeezes, setup.consumed_squeezes_before_kzg);
    ASSERT_TRUE(masking_challenge.valid);

    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
    auto transcript_receive =
        KZGVerification::validate_transcript_receive(builder, analyzer, masking_challenge.squeeze_gate);
    ASSERT_TRUE(transcript_receive.is_valid);
    auto masking_challenge_generation = KZGVerification::validate_masking_challenge_generation(
        builder, analyzer, masking_challenge.squeeze_gate, transcript_receive);
    ASSERT_TRUE(masking_challenge_generation.is_valid);

    auto result = KZGVerification::validate_batch_mul(
        builder, analyzer, masking_challenge.squeeze_gate, transcript_receive, masking_challenge_generation);

    EXPECT_TRUE(result.is_valid);
    EXPECT_EQ(result.arithmetic_gate_start_idx, locations.batch_mul_start);
    EXPECT_EQ(result.nnf_gate_start_idx,
              transcript_receive.nnf_gate_start_idx + KZGVerification::TRANSCRIPT_RECEIVE_KZG_W_NNF.gate_count);
    EXPECT_NE(result.memory_gate_start_idx, SIZE_MAX);
}

TEST_F(BoomerangKZGStepTests, ValidateBatchMulDetectsCorruptedArithmeticGate)
{
    auto setup = build_kzg_validation_circuit();
    Builder& builder = setup.vc.builder();
    auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    auto locations = locate_kzg_arithmetic_locations(builder, all_squeezes, setup.consumed_squeezes_before_kzg);
    ASSERT_TRUE(locations.valid);
    auto masking_challenge =
        recursion_helpers::kzg_masking_challenge(builder, all_squeezes, setup.consumed_squeezes_before_kzg);
    ASSERT_TRUE(masking_challenge.valid);

    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
    auto transcript_receive =
        KZGVerification::validate_transcript_receive(builder, analyzer, masking_challenge.squeeze_gate);
    ASSERT_TRUE(transcript_receive.is_valid);
    auto masking_challenge_generation = KZGVerification::validate_masking_challenge_generation(
        builder, analyzer, masking_challenge.squeeze_gate, transcript_receive);
    ASSERT_TRUE(masking_challenge_generation.is_valid);
    auto result = KZGVerification::validate_batch_mul(
        builder, analyzer, masking_challenge.squeeze_gate, transcript_receive, masking_challenge_generation);
    ASSERT_TRUE(result.is_valid);

    auto& arith = builder.blocks.arithmetic;
    size_t gate_to_corrupt = result.arithmetic_gate_start_idx;
    const size_t batch_mul_arithmetic_end =
        result.arithmetic_gate_start_idx + KZGVerification::BATCH_MUL_ARITHMETIC.gate_count;
    while (gate_to_corrupt < batch_mul_arithmetic_end && is_constant_fix_witness_gate(builder, gate_to_corrupt)) {
        ++gate_to_corrupt;
    }
    ASSERT_LT(gate_to_corrupt, batch_mul_arithmetic_end);
    arith.q_c().set(gate_to_corrupt, arith.q_c()[gate_to_corrupt] + bb::fr::one());

    auto corrupted_result = KZGVerification::validate_batch_mul(
        builder, analyzer, masking_challenge.squeeze_gate, transcript_receive, masking_challenge_generation);

    EXPECT_FALSE(corrupted_result.is_valid);
    EXPECT_EQ(corrupted_result.arithmetic_gate_start_idx, result.arithmetic_gate_start_idx);
}

TEST_F(BoomerangKZGStepTests, ValidateBatchMulDetectsCorruptedNNFGate)
{
    auto setup = build_kzg_validation_circuit();
    Builder& builder = setup.vc.builder();
    auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    auto masking_challenge =
        recursion_helpers::kzg_masking_challenge(builder, all_squeezes, setup.consumed_squeezes_before_kzg);
    ASSERT_TRUE(masking_challenge.valid);

    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
    auto transcript_receive =
        KZGVerification::validate_transcript_receive(builder, analyzer, masking_challenge.squeeze_gate);
    ASSERT_TRUE(transcript_receive.is_valid);
    auto masking_challenge_generation = KZGVerification::validate_masking_challenge_generation(
        builder, analyzer, masking_challenge.squeeze_gate, transcript_receive);
    ASSERT_TRUE(masking_challenge_generation.is_valid);
    auto result = KZGVerification::validate_batch_mul(
        builder, analyzer, masking_challenge.squeeze_gate, transcript_receive, masking_challenge_generation);
    ASSERT_TRUE(result.is_valid);

    auto& nnf = builder.blocks.nnf;
    nnf.q_nnf().set(result.nnf_gate_start_idx, nnf.q_nnf()[result.nnf_gate_start_idx] + bb::fr::one());

    auto corrupted_result = KZGVerification::validate_batch_mul(
        builder, analyzer, masking_challenge.squeeze_gate, transcript_receive, masking_challenge_generation);

    EXPECT_FALSE(corrupted_result.is_valid);
    EXPECT_EQ(corrupted_result.arithmetic_gate_start_idx, result.arithmetic_gate_start_idx);
    EXPECT_EQ(corrupted_result.nnf_gate_start_idx, result.nnf_gate_start_idx);
}

TEST_F(BoomerangKZGStepTests, ValidateBatchMulDetectsCorruptedMemoryGate)
{
    auto setup = build_kzg_validation_circuit();
    Builder& builder = setup.vc.builder();
    auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    auto masking_challenge =
        recursion_helpers::kzg_masking_challenge(builder, all_squeezes, setup.consumed_squeezes_before_kzg);
    ASSERT_TRUE(masking_challenge.valid);

    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
    auto transcript_receive =
        KZGVerification::validate_transcript_receive(builder, analyzer, masking_challenge.squeeze_gate);
    ASSERT_TRUE(transcript_receive.is_valid);
    auto masking_challenge_generation = KZGVerification::validate_masking_challenge_generation(
        builder, analyzer, masking_challenge.squeeze_gate, transcript_receive);
    ASSERT_TRUE(masking_challenge_generation.is_valid);
    auto result = KZGVerification::validate_batch_mul(
        builder, analyzer, masking_challenge.squeeze_gate, transcript_receive, masking_challenge_generation);
    ASSERT_TRUE(result.is_valid);

    auto& memory = builder.blocks.memory;
    const size_t batch_mul_memory_end = result.memory_gate_start_idx + KZGVerification::BATCH_MUL_MEMORY.gate_count;
    ASSERT_LE(batch_mul_memory_end, memory.size());
    memory.q_memory().set(result.memory_gate_start_idx,
                          memory.q_memory()[result.memory_gate_start_idx] + bb::fr::one());

    auto corrupted_result = KZGVerification::validate_batch_mul(
        builder, analyzer, masking_challenge.squeeze_gate, transcript_receive, masking_challenge_generation);

    EXPECT_FALSE(corrupted_result.is_valid);
    EXPECT_EQ(corrupted_result.arithmetic_gate_start_idx, result.arithmetic_gate_start_idx);
    EXPECT_EQ(corrupted_result.nnf_gate_start_idx, result.nnf_gate_start_idx);
}

TEST_F(BoomerangKZGStepTests, ValidateTranscriptReceiveDetectsCorruptedArithmeticGate)
{
    auto setup = build_kzg_validation_circuit();
    Builder& builder = setup.vc.builder();
    auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    auto locations = locate_kzg_arithmetic_locations(builder, all_squeezes, setup.consumed_squeezes_before_kzg);
    ASSERT_TRUE(locations.valid);

    auto& arith = builder.blocks.arithmetic;
    size_t gate_to_corrupt = locations.w_receive_start;
    while (gate_to_corrupt < locations.masking_challenge_start &&
           is_constant_fix_witness_gate(builder, gate_to_corrupt)) {
        ++gate_to_corrupt;
    }
    ASSERT_LT(gate_to_corrupt, locations.masking_challenge_start);

    arith.q_c().set(gate_to_corrupt, arith.q_c()[gate_to_corrupt] + bb::fr::one());

    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
    auto result = KZGVerification::validate_transcript_receive(builder, analyzer, locations.masking_challenge_start);

    EXPECT_FALSE(result.is_valid);
    EXPECT_EQ(result.arithmetic_gate_start_idx, locations.w_receive_start);
}

TEST_F(BoomerangKZGStepTests, ValidateTranscriptReceiveDetectsCorruptedAdjacentBatchMulNNF)
{
    auto setup = build_kzg_validation_circuit();
    Builder& builder = setup.vc.builder();
    auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    auto locations = locate_kzg_arithmetic_locations(builder, all_squeezes, setup.consumed_squeezes_before_kzg);
    ASSERT_TRUE(locations.valid);

    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
    auto result = KZGVerification::validate_transcript_receive(builder, analyzer, locations.masking_challenge_start);
    ASSERT_TRUE(result.is_valid);
    ASSERT_NE(result.nnf_gate_start_idx, SIZE_MAX);

    const size_t batch_mul_nnf_start =
        result.nnf_gate_start_idx + KZGVerification::TRANSCRIPT_RECEIVE_KZG_W_NNF.gate_count;
    ASSERT_LT(batch_mul_nnf_start, builder.blocks.nnf.size());
    auto& nnf = builder.blocks.nnf;
    nnf.q_c().set(batch_mul_nnf_start, nnf.q_c()[batch_mul_nnf_start] + bb::fr::one());

    auto corrupted_result =
        KZGVerification::validate_transcript_receive(builder, analyzer, locations.masking_challenge_start);

    EXPECT_FALSE(corrupted_result.is_valid);
    EXPECT_EQ(corrupted_result.arithmetic_gate_start_idx, locations.w_receive_start);
}

TEST_F(BoomerangKZGStepTests, ValidateKZGDetectsCorruptedGate)
{
    auto setup = build_kzg_validation_circuit();
    Builder& builder = setup.vc.builder();
    auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);

    auto& arith = builder.blocks.arithmetic;
    size_t gate_to_corrupt = find_hashable_kzg_arithmetic_gate(builder, setup.before_kzg, setup.after_kzg);
    info("gate_to_corrupt == ", gate_to_corrupt);
    ASSERT_LT(gate_to_corrupt, arith.size());
    const size_t kzg_arithmetic_start = block_snapshot_size(builder, setup.before_kzg, arith);
    const size_t kzg_arithmetic_end = block_snapshot_size(builder, setup.after_kzg, arith);
    const size_t kzg_hash_before_corruption =
        recursion_helpers::calculate_hash_arithmetic_block(builder, kzg_arithmetic_start, kzg_arithmetic_end);
    const size_t hash_before_corruption =
        recursion_helpers::calculate_hash_arithmetic_block(builder, gate_to_corrupt, gate_to_corrupt + 1);
    arith.q_c().set(gate_to_corrupt, arith.q_c()[gate_to_corrupt] + bb::fr::one());
    const size_t kzg_hash_after_corruption =
        recursion_helpers::calculate_hash_arithmetic_block(builder, kzg_arithmetic_start, kzg_arithmetic_end);
    const size_t hash_after_corruption =
        recursion_helpers::calculate_hash_arithmetic_block(builder, gate_to_corrupt, gate_to_corrupt + 1);
    info("KZG arithmetic hash before q_c corruption: 0x", std::hex, kzg_hash_before_corruption);
    info("KZG arithmetic hash after q_c corruption:  0x", std::hex, kzg_hash_after_corruption, std::dec);
    EXPECT_NE(hash_before_corruption, hash_after_corruption);
    EXPECT_NE(kzg_hash_before_corruption, kzg_hash_after_corruption);

    EXPECT_FALSE(KZGVerification::validate_kzg(builder, all_squeezes, setup.consumed_squeezes_before_kzg).is_valid);
}

TEST_F(BoomerangKZGStepTests, ValidateKZGDetectsSeveralRandomlyCorruptedGates)
{
    auto setup = build_kzg_validation_circuit();
    Builder& builder = setup.vc.builder();
    auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);

    auto& arith = builder.blocks.arithmetic;
    const size_t kzg_arithmetic_start = block_snapshot_size(builder, setup.before_kzg, arith);
    const size_t kzg_arithmetic_end = block_snapshot_size(builder, setup.after_kzg, arith);

    std::vector<size_t> hashable_gates;
    hashable_gates.reserve(kzg_arithmetic_end - kzg_arithmetic_start);
    for (size_t gate_idx = kzg_arithmetic_start; gate_idx < kzg_arithmetic_end; ++gate_idx) {
        if (!is_constant_fix_witness_gate(builder, gate_idx)) {
            hashable_gates.push_back(gate_idx);
        }
    }

    constexpr size_t NUM_GATES_TO_CORRUPT = 8;
    ASSERT_GE(hashable_gates.size(), NUM_GATES_TO_CORRUPT);

    std::mt19937_64 rng(0x4b5a47ULL);
    std::uniform_int_distribution<size_t> distribution(0, hashable_gates.size() - 1);
    std::set<size_t> gates_to_corrupt;
    while (gates_to_corrupt.size() < NUM_GATES_TO_CORRUPT) {
        gates_to_corrupt.insert(hashable_gates[distribution(rng)]);
    }

    const size_t kzg_hash_before_corruption =
        recursion_helpers::calculate_hash_arithmetic_block(builder, kzg_arithmetic_start, kzg_arithmetic_end);

    size_t selector_idx = 0;
    for (size_t gate_idx : gates_to_corrupt) {
        switch (selector_idx % 5) {
        case 0:
            arith.q_c().set(gate_idx, arith.q_c()[gate_idx] + bb::fr::one());
            break;
        case 1:
            arith.q_1().set(gate_idx, arith.q_1()[gate_idx] + bb::fr::one());
            break;
        case 2:
            arith.q_2().set(gate_idx, arith.q_2()[gate_idx] + bb::fr::one());
            break;
        case 3:
            arith.q_3().set(gate_idx, arith.q_3()[gate_idx] + bb::fr::one());
            break;
        default:
            arith.q_m().set(gate_idx, arith.q_m()[gate_idx] + bb::fr::one());
            break;
        }
        ++selector_idx;
    }

    const size_t kzg_hash_after_corruption =
        recursion_helpers::calculate_hash_arithmetic_block(builder, kzg_arithmetic_start, kzg_arithmetic_end);
    EXPECT_NE(kzg_hash_before_corruption, kzg_hash_after_corruption);
    EXPECT_FALSE(KZGVerification::validate_kzg(builder, all_squeezes, setup.consumed_squeezes_before_kzg).is_valid);
}

TEST_F(BoomerangKZGStepTests, DumpMaskingChallengeStaticAnalyzerGates)
{
    auto setup = build_kzg_validation_circuit();
    Builder& builder = setup.vc.builder();
    const auto& masking_challenge = setup.challenge_witness_indices.kzg;
    ASSERT_TRUE(masking_challenge.valid);

    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
    auto variable_gates = analyzer.get_variable_gates(masking_challenge.masking_challenge);
    static const std::array<const char*, 9> block_names = { "pub_inputs",  "lookup",        "arithmetic",
                                                            "delta_range", "elliptic",      "memory",
                                                            "nnf",         "poseidon2_ext", "poseidon2_int" };
    auto blocks = builder.blocks.get();

    info("KZG masking challenge real witness index: ", masking_challenge.masking_challenge);
    info("KZG masking challenge squeeze gate: ", masking_challenge.squeeze_gate);
    info("StaticAnalyzer gates using KZG masking challenge: ", variable_gates.size());

    for (const auto& [block_idx, gate_idx] : variable_gates) {
        ASSERT_LT(block_idx, blocks.size());
        auto& block = blocks[block_idx];
        const char* block_name = block_idx < block_names.size() ? block_names[block_idx] : "unknown";
        info("  block[", block_idx, "] ", block_name, " gate=", gate_idx);
        info("    wires(real): w_l=",
             builder.real_variable_index[block.w_l()[gate_idx]],
             " w_r=",
             builder.real_variable_index[block.w_r()[gate_idx]],
             " w_o=",
             builder.real_variable_index[block.w_o()[gate_idx]],
             " w_4=",
             builder.real_variable_index[block.w_4()[gate_idx]]);
        info("    selectors: q_m=",
             block.q_m()[gate_idx],
             " q_c=",
             block.q_c()[gate_idx],
             " q_1=",
             block.q_1()[gate_idx],
             " q_2=",
             block.q_2()[gate_idx],
             " q_3=",
             block.q_3()[gate_idx],
             " q_4=",
             block.q_4()[gate_idx],
             " q_arith=",
             block.q_arith()[gate_idx],
             " q_nnf=",
             block.q_nnf()[gate_idx],
             " q_poseidon2_ext=",
             block.q_poseidon2_external()[gate_idx],
             " q_poseidon2_int=",
             block.q_poseidon2_internal()[gate_idx]);
    }
}

TEST_F(BoomerangKZGStepTests, DumpFirstKZGReceiveWitnessWithNNFGates)
{
    auto setup = build_kzg_validation_circuit();
    Builder& builder = setup.vc.builder();
    auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);

    auto masking_challenge =
        recursion_helpers::kzg_masking_challenge(builder, all_squeezes, setup.consumed_squeezes_before_kzg);
    ASSERT_TRUE(masking_challenge.valid);

    auto& arith = builder.blocks.arithmetic;
    auto arithmetic_hash = [&](size_t start, size_t end) {
        return recursion_helpers::calculate_hash_arithmetic_block(builder, start, end);
    };
    auto matches_at = [&](size_t start, const recursion_helpers::FunctionFingerprint& fp) {
        if (start + fp.gate_count > arith.size()) {
            return false;
        }
        return arithmetic_hash(start, start + fp.fingerprint_size) == fp.prefix_hash &&
               arithmetic_hash(start, start + fp.gate_count) == fp.full_hash;
    };

    size_t masking_start = arith.size();
    for (size_t start = 0; start <= masking_challenge.squeeze_gate; ++start) {
        const bool contains_masking_squeeze =
            start <= masking_challenge.squeeze_gate &&
            masking_challenge.squeeze_gate < start + KZGVerification::MASKING_CHALLENGE_ARITHMETIC.gate_count;
        if (contains_masking_squeeze && matches_at(start, KZGVerification::MASKING_CHALLENGE_ARITHMETIC)) {
            masking_start = start;
            break;
        }
    }
    ASSERT_LT(masking_start, arith.size());
    ASSERT_GE(masking_start, KZGVerification::TRANSCRIPT_RECEIVE_KZG_W_ARITHMETIC.gate_count);

    const size_t receive_start = masking_start - KZGVerification::TRANSCRIPT_RECEIVE_KZG_W_ARITHMETIC.gate_count;
    const size_t receive_end = masking_start;
    ASSERT_TRUE(matches_at(receive_start, KZGVerification::TRANSCRIPT_RECEIVE_KZG_W_ARITHMETIC));

    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
    const size_t nnf_block_idx = block_index_for(builder, builder.blocks.nnf);

    info("Scanning KZG transcript_receive_from_prover arithmetic gates [",
         receive_start,
         ", ",
         receive_end,
         ") for witnesses with NNF gates");

    for (size_t gate_idx = receive_start; gate_idx < receive_end; ++gate_idx) {
        std::array<uint32_t, 4> wires = {
            arith.w_l()[gate_idx], arith.w_r()[gate_idx], arith.w_o()[gate_idx], arith.w_4()[gate_idx]
        };
        for (uint32_t witness_idx : wires) {
            const uint32_t real_idx = builder.real_variable_index[witness_idx];
            for (const auto& [block_idx, nnf_gate_idx] : analyzer.get_variable_gates(real_idx)) {
                if (block_idx == nnf_block_idx) {
                    info("First transcript_receive_from_prover witness with NNF gates: witness=",
                         witness_idx,
                         " real=",
                         real_idx,
                         " arithmetic_gate=",
                         gate_idx,
                         " nnf_gate=",
                         nnf_gate_idx);
                    SUCCEED();
                    return;
                }
            }
        }
    }

    FAIL() << "No transcript_receive_from_prover arithmetic witness had gates in the NNF block";
}

TEST_F(BoomerangKZGStepTests, KZGWReceiveArithmeticWitnessesLinkToNNFBlock)
{
    auto setup = build_kzg_validation_circuit();
    Builder& builder = setup.vc.builder();
    auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    auto locations = locate_kzg_arithmetic_locations(builder, all_squeezes, setup.consumed_squeezes_before_kzg);
    ASSERT_TRUE(locations.valid);

    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
    EXPECT_TRUE(arithmetic_range_has_witness_in_block(builder,
                                                      analyzer,
                                                      locations.w_receive_start,
                                                      locations.masking_challenge_start,
                                                      builder.blocks.nnf,
                                                      "KZG:W_receive arithmetic -> NNF"));
}

TEST_F(BoomerangKZGStepTests, KZGMaskingChallengeArithmeticWitnessesLinkToPoseidonExternalBlock)
{
    auto setup = build_kzg_validation_circuit();
    Builder& builder = setup.vc.builder();
    auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    auto locations = locate_kzg_arithmetic_locations(builder, all_squeezes, setup.consumed_squeezes_before_kzg);
    ASSERT_TRUE(locations.valid);

    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
    const size_t masking_challenge_end =
        locations.masking_challenge_start + KZGVerification::MASKING_CHALLENGE_ARITHMETIC.gate_count;
    EXPECT_TRUE(arithmetic_range_has_witness_in_block(builder,
                                                      analyzer,
                                                      locations.masking_challenge_start,
                                                      masking_challenge_end,
                                                      builder.blocks.poseidon2_external,
                                                      "KZG:masking_challenge arithmetic -> poseidon2_external"));
}

TEST_F(BoomerangKZGStepTests, KZGMaskingChallengePoseidonExternalWitnessesLinkToInternalBlock)
{
    auto vc = setup_verifier_components(0);
    Builder& builder = vc.builder();
    auto snap = [&]() { return recursion_helpers::BlockSnapshot::capture(builder); };

    run_oink_verifier_step(vc);
    std::vector<FF> pia = run_padding_indicator_array_step(vc);
    SumcheckStepOutput sumcheck_step = run_sumcheck_step(vc, pia);
    auto shplemini_output = run_shplemini_step(vc, pia, sumcheck_step.sumcheck_output, sumcheck_step.libra_commitments);

    using Commitment = RecursiveFlavor::Commitment;
    [[maybe_unused]] auto quotient_commitment = vc.transcript->template receive_from_prover<Commitment>("KZG:W");

    auto before_masking_challenge = snap();
    [[maybe_unused]] FF masking_challenge = vc.transcript->template get_challenge<FF>("KZG:masking_challenge");
    auto after_masking_challenge = snap();

    const size_t ext_start = block_snapshot_size(builder, before_masking_challenge, builder.blocks.poseidon2_external);
    const size_t ext_end = block_snapshot_size(builder, after_masking_challenge, builder.blocks.poseidon2_external);
    const size_t int_start = block_snapshot_size(builder, before_masking_challenge, builder.blocks.poseidon2_internal);
    const size_t int_end = block_snapshot_size(builder, after_masking_challenge, builder.blocks.poseidon2_internal);

    info("KZG:masking_challenge poseidon2_external range [", ext_start, ", ", ext_end, ")");
    info("KZG:masking_challenge poseidon2_internal range [", int_start, ", ", int_end, ")");
    ASSERT_LT(ext_start, ext_end);
    ASSERT_LT(int_start, int_end);

    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
    const size_t internal_block_idx = block_index_for(builder, builder.blocks.poseidon2_internal);
    auto& ext = builder.blocks.poseidon2_external;

    for (size_t ext_gate = ext_start; ext_gate < ext_end; ++ext_gate) {
        std::array<uint32_t, 4> wires = {
            ext.w_l()[ext_gate], ext.w_r()[ext_gate], ext.w_o()[ext_gate], ext.w_4()[ext_gate]
        };
        for (uint32_t witness_idx : wires) {
            const uint32_t real_idx = builder.real_variable_index[witness_idx];
            for (const auto& [block_idx, int_gate] : analyzer.get_variable_gates(real_idx)) {
                if (block_idx == internal_block_idx && int_start <= int_gate && int_gate < int_end) {
                    info("KZG:masking_challenge poseidon2_external -> poseidon2_internal link: witness=",
                         witness_idx,
                         " real=",
                         real_idx,
                         " external_gate=",
                         ext_gate,
                         " internal_gate=",
                         int_gate);
                    SUCCEED();
                    return;
                }
            }
        }
    }

    FAIL() << "No witness linked KZG:masking_challenge poseidon2_external gates to poseidon2_internal gates";
}

TEST_F(BoomerangKZGStepTests, KZGBatchMulArithmeticWitnessesLinkToMemoryAndNNFBlocks)
{
    auto setup = build_kzg_validation_circuit();
    Builder& builder = setup.vc.builder();
    auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    auto locations = locate_kzg_arithmetic_locations(builder, all_squeezes, setup.consumed_squeezes_before_kzg);
    ASSERT_TRUE(locations.valid);

    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
    const size_t batch_mul_end = locations.batch_mul_start + KZGVerification::BATCH_MUL_ARITHMETIC.gate_count;
    EXPECT_TRUE(arithmetic_range_has_witness_in_block(builder,
                                                      analyzer,
                                                      locations.batch_mul_start,
                                                      batch_mul_end,
                                                      builder.blocks.memory,
                                                      "KZG:batch_mul arithmetic -> memory"));
    EXPECT_TRUE(arithmetic_range_has_witness_in_block(builder,
                                                      analyzer,
                                                      locations.batch_mul_start,
                                                      batch_mul_end,
                                                      builder.blocks.nnf,
                                                      "KZG:batch_mul arithmetic -> NNF"));
}

TEST_F(BoomerangKZGStepTests, CheckBatchMulPoseidonExternalToInternalLink)
{
    auto vc = setup_verifier_components(0);
    Builder& builder = vc.builder();
    auto snap = [&]() { return recursion_helpers::BlockSnapshot::capture(builder); };

    run_oink_verifier_step(vc);
    std::vector<FF> pia = run_padding_indicator_array_step(vc);
    SumcheckStepOutput sumcheck_step = run_sumcheck_step(vc, pia);
    auto shplemini_output = run_shplemini_step(vc, pia, sumcheck_step.sumcheck_output, sumcheck_step.libra_commitments);

    using Commitment = RecursiveFlavor::Commitment;
    using Group = Curve::Group;

    auto quotient_commitment = vc.transcript->template receive_from_prover<Commitment>("KZG:W");
    FF masking_challenge = vc.transcript->template get_challenge<FF>("KZG:masking_challenge");
    shplemini_output.batch_opening_claim.commitments.emplace_back(quotient_commitment);
    shplemini_output.batch_opening_claim.scalars.emplace_back(shplemini_output.batch_opening_claim.evaluation_point);

    auto before_batch_mul = snap();
    [[maybe_unused]] Group p_0 = Group::batch_mul(shplemini_output.batch_opening_claim.commitments,
                                                  shplemini_output.batch_opening_claim.scalars,
                                                  /*max_num_bits=*/0,
                                                  /*with_edgecases=*/true,
                                                  /*masking_scalar=*/masking_challenge);
    auto after_batch_mul = snap();

    const size_t ext_start = block_snapshot_size(builder, before_batch_mul, builder.blocks.poseidon2_external);
    const size_t ext_end = block_snapshot_size(builder, after_batch_mul, builder.blocks.poseidon2_external);
    const size_t int_start = block_snapshot_size(builder, before_batch_mul, builder.blocks.poseidon2_internal);
    const size_t int_end = block_snapshot_size(builder, after_batch_mul, builder.blocks.poseidon2_internal);

    info("KZG:batch_mul poseidon2_external range [", ext_start, ", ", ext_end, ")");
    info("KZG:batch_mul poseidon2_internal range [", int_start, ", ", int_end, ")");

    if (ext_start == ext_end || int_start == int_end) {
        GTEST_SKIP() << "KZG:batch_mul does not create both poseidon2_external and poseidon2_internal gates";
    }

    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
    const size_t internal_block_idx = block_index_for(builder, builder.blocks.poseidon2_internal);
    auto& ext = builder.blocks.poseidon2_external;

    for (size_t ext_gate = ext_start; ext_gate < ext_end; ++ext_gate) {
        std::array<uint32_t, 4> wires = {
            ext.w_l()[ext_gate], ext.w_r()[ext_gate], ext.w_o()[ext_gate], ext.w_4()[ext_gate]
        };
        for (uint32_t witness_idx : wires) {
            const uint32_t real_idx = builder.real_variable_index[witness_idx];
            for (const auto& [block_idx, int_gate] : analyzer.get_variable_gates(real_idx)) {
                if (block_idx == internal_block_idx && int_start <= int_gate && int_gate < int_end) {
                    info("KZG:batch_mul poseidon2_external -> poseidon2_internal link: witness=",
                         witness_idx,
                         " real=",
                         real_idx,
                         " external_gate=",
                         ext_gate,
                         " internal_gate=",
                         int_gate);
                    SUCCEED();
                    return;
                }
            }
        }
    }

    FAIL() << "No witness linked KZG:batch_mul poseidon2_external gates to poseidon2_internal gates";
}

// ============================================================================
// KZGReduceVerifyBatchOpeningClaimBlockAnalysis  (preserved stub)
// ============================================================================
TEST_F(BoomerangKZGStepTests, KZGReduceVerifyBatchOpeningClaimBlockAnalysis)
{
    info("");
    info("=== KZGReduceVerifyBatchOpeningClaimFingerprintRegression ===");

    auto vc = setup_verifier_components(0);
    Builder& builder = vc.builder();
    auto snap = [&]() { return recursion_helpers::BlockSnapshot::capture(builder); };

    run_oink_verifier_step(vc);
    std::vector<FF> pia = run_padding_indicator_array_step(vc);
    SumcheckStepOutput sumcheck_step = run_sumcheck_step(vc, pia);
    auto shplemini_output = run_shplemini_step(vc, pia, sumcheck_step.sumcheck_output, sumcheck_step.libra_commitments);

    using Commitment = RecursiveFlavor::Commitment;
    using Group = Curve::Group;

    auto s_before_w = snap();
    auto quotient_commitment = vc.transcript->template receive_from_prover<Commitment>("KZG:W");
    expect_stage_matches_fingerprints(
        builder,
        s_before_w,
        snap(),
        { { BLOCK_INDEX_ARITHMETIC, &KZGVerification::TRANSCRIPT_RECEIVE_KZG_W_ARITHMETIC },
          { BLOCK_INDEX_NNF, &KZGVerification::TRANSCRIPT_RECEIVE_KZG_W_NNF } },
        "KZG:W_receive");

    auto s_before_masking_challenge = snap();
    FF masking_challenge = vc.transcript->template get_challenge<FF>("KZG:masking_challenge");
    expect_stage_matches_fingerprints(
        builder,
        s_before_masking_challenge,
        snap(),
        { { BLOCK_INDEX_ARITHMETIC, &KZGVerification::MASKING_CHALLENGE_ARITHMETIC },
          { BLOCK_INDEX_POSEIDON2_EXT, &KZGVerification::MASKING_CHALLENGE_POSEIDON2_EXT },
          { BLOCK_INDEX_POSEIDON2_INT, &KZGVerification::MASKING_CHALLENGE_POSEIDON2_INT } },
        "KZG:masking_challenge");

    shplemini_output.batch_opening_claim.commitments.emplace_back(quotient_commitment);
    shplemini_output.batch_opening_claim.scalars.emplace_back(shplemini_output.batch_opening_claim.evaluation_point);
    EXPECT_EQ(shplemini_output.batch_opening_claim.commitments.size(), RecursiveFlavor::FINAL_PCS_MSM_SIZE(vc.log_n));

    auto s_before_batch_mul = snap();
    [[maybe_unused]] Group p_0 = Group::batch_mul(shplemini_output.batch_opening_claim.commitments,
                                                  shplemini_output.batch_opening_claim.scalars,
                                                  /*max_num_bits=*/0,
                                                  /*with_edgecases=*/true,
                                                  /*masking_scalar=*/masking_challenge);
    expect_stage_matches_fingerprints(builder,
                                      s_before_batch_mul,
                                      snap(),
                                      { { BLOCK_INDEX_ARITHMETIC, &KZGVerification::BATCH_MUL_ARITHMETIC },
                                        { BLOCK_INDEX_MEMORY, &KZGVerification::BATCH_MUL_MEMORY },
                                        { BLOCK_INDEX_NNF, &KZGVerification::BATCH_MUL_NNF } },
                                      "KZG:batch_mul");

    auto s_before_negate_w = snap();
    Group p_1 = -quotient_commitment;
    (void)p_1;
    expect_no_new_gates(builder, s_before_negate_w, snap(), "KZG:negate_W");

    info("=== KZGReduceVerifyBatchOpeningClaimFingerprintRegression COMPLETE ===");
}

TEST_F(BoomerangKZGStepTests, DiagnoseKZGValidationFailureInAcirCircuit)
{
    AcirProgram program = make_mock_acir_program(0);
    Builder builder = create_circuit<Builder>(program, { .has_ipa_claim = true });
    auto diagnostics = collect_acir_kzg_diagnostics(builder);

    EXPECT_TRUE(diagnostics.masking_challenge.valid);
    EXPECT_TRUE(diagnostics.locations.valid);
    EXPECT_TRUE(diagnostics.top_level_kzg_valid);
    EXPECT_TRUE(diagnostics.transcript_receive.is_valid);
    EXPECT_TRUE(diagnostics.masking_generation.is_valid);
    EXPECT_TRUE(diagnostics.batch_mul.is_valid);
    EXPECT_NE(diagnostics.expected_batch_mul_arithmetic_start, SIZE_MAX);
    EXPECT_NE(diagnostics.expected_batch_mul_nnf_start, SIZE_MAX);
    EXPECT_TRUE(diagnostics.expected_batch_mul_arithmetic_fingerprint_matches);
    EXPECT_TRUE(diagnostics.expected_batch_mul_nnf_fingerprint_matches);
    EXPECT_TRUE(diagnostics.w_receive_links_to_nnf);
    EXPECT_TRUE(diagnostics.batch_mul_links_to_nnf);
    EXPECT_TRUE(diagnostics.batch_mul_links_to_memory);
}

TEST_F(BoomerangKZGStepTests, CompareStepwiseAcirAndFullAcirBatchMulArithmeticGates)
{
    auto stepwise_acir = build_kzg_validation_circuit();
    Builder& stepwise_builder = stepwise_acir.vc.builder();
    auto stepwise_locations = locate_kzg_arithmetic_locations(
        stepwise_builder, stepwise_acir.all_squeeze_gates, stepwise_acir.consumed_squeezes_before_kzg);
    ASSERT_TRUE(stepwise_locations.valid);

    AcirProgram program = make_mock_acir_program(0);
    Builder acir_builder = create_circuit<Builder>(program, { .has_ipa_claim = true });
    const auto& constraint = program.constraints.chonk_recursion_constraints[0];
    const auto proof_body_witnesses = extract_proof_body_witnesses(constraint);

    cdg::StaticAnalyzer_<bb::fr, Builder> acir_analyzer(acir_builder, false);
    ASSERT_TRUE(OinkVerifierValidation::validate_oink_verifier<bb::fr>(
        acir_builder, acir_analyzer, constraint, proof_body_witnesses));
    auto padding_step =
        recursion_helpers::validate_compute_padding_array_step<bb::fr>(acir_builder, acir_analyzer, constraint);
    ASSERT_TRUE(padding_step.valid);
    ASSERT_TRUE(SumcheckValidation::validate_sumcheck<bb::fr>(acir_builder, acir_analyzer));
    ASSERT_TRUE(ShpleminiVerification::validate_shplemini<bb::fr>(acir_builder, acir_analyzer));

    auto diagnostics = collect_acir_kzg_diagnostics(acir_builder);
    ASSERT_TRUE(diagnostics.masking_challenge.valid);
    ASSERT_TRUE(diagnostics.transcript_receive.is_valid);
    ASSERT_TRUE(diagnostics.masking_generation.is_valid);
    ASSERT_NE(diagnostics.expected_batch_mul_arithmetic_start, SIZE_MAX);

    const size_t stepwise_batch_mul_end =
        stepwise_locations.batch_mul_start + KZGVerification::BATCH_MUL_ARITHMETIC.gate_count;
    const size_t acir_batch_mul_end =
        diagnostics.expected_batch_mul_arithmetic_start + KZGVerification::BATCH_MUL_ARITHMETIC.gate_count;

    auto comparison = compare_hashable_arithmetic_ranges(stepwise_builder,
                                                         stepwise_locations.batch_mul_start,
                                                         stepwise_batch_mul_end,
                                                         acir_builder,
                                                         diagnostics.expected_batch_mul_arithmetic_start,
                                                         acir_batch_mul_end);

    info("=== Compare stepwise ACIR vs full ACIR batch_mul arithmetic ===");
    info("stepwise ACIR batch_mul start = ", stepwise_locations.batch_mul_start);
    info("full ACIR batch_mul start = ", diagnostics.expected_batch_mul_arithmetic_start);
    info("stepwise ACIR hashable gate count = ", comparison.lhs.size());
    info("full ACIR hashable gate count = ", comparison.rhs.size());
    info("first_diff_idx = ", comparison.first_diff_idx);
    info("stepwise_acir_has_extra_gate = ", comparison.lhs_has_extra_gate);
    info("full_acir_has_extra_gate = ", comparison.rhs_has_extra_gate);

    EXPECT_EQ(comparison.first_diff_idx, SIZE_MAX);
    EXPECT_FALSE(comparison.lhs_has_extra_gate);
    EXPECT_FALSE(comparison.rhs_has_extra_gate);
    EXPECT_TRUE(diagnostics.expected_batch_mul_arithmetic_fingerprint_matches);
}

TEST_F(BoomerangKZGStepTests, DumpAndDiffBatchMulArithmeticGatesStepwiseAcirVsFullAcir)
{
    // ── Stepwise ACIR reconstruction ─────────────────────────────────────────
    auto stepwise_acir = build_kzg_validation_circuit();
    Builder& stepwise_builder = stepwise_acir.vc.builder();
    auto stepwise_locs = locate_kzg_arithmetic_locations(
        stepwise_builder, stepwise_acir.all_squeeze_gates, stepwise_acir.consumed_squeezes_before_kzg);
    ASSERT_TRUE(stepwise_locs.valid) << "Stepwise ACIR KZG arithmetic locations not found";

    const size_t stepwise_start = stepwise_locs.batch_mul_start;
    const size_t stepwise_end = stepwise_locs.batch_mul_start + KZGVerification::BATCH_MUL_ARITHMETIC.gate_count;

    // ── ACIR circuit ─────────────────────────────────────────────────────────
    AcirProgram program = make_mock_acir_program(0);
    Builder acir_builder = create_circuit<Builder>(program, { .has_ipa_claim = true });
    auto acir_diag = collect_acir_kzg_diagnostics(acir_builder);
    ASSERT_TRUE(acir_diag.transcript_receive.is_valid) << "ACIR transcript_receive invalid";
    ASSERT_TRUE(acir_diag.masking_generation.is_valid) << "ACIR masking_generation invalid";
    ASSERT_NE(acir_diag.expected_batch_mul_arithmetic_start, SIZE_MAX) << "ACIR batch_mul start not found";

    const size_t acir_start = acir_diag.expected_batch_mul_arithmetic_start;
    const size_t acir_end = acir_start + KZGVerification::BATCH_MUL_ARITHMETIC.gate_count;

    // ── Write batch_mul gates to files ───────────────────────────────────────
    // Exact skip predicate from calculate_hash_arithmetic_block:
    // skip a gate iff it is a fix_witness gate AND w_l resolves to a constant variable.
    auto is_hash_skipped = [](Builder& builder, size_t gate_idx) -> bool {
        if (!recursion_helpers::is_fix_witness_gate(builder, gate_idx)) {
            return false;
        }
        auto& arith = builder.blocks.arithmetic;
        const uint32_t real_wl = builder.real_variable_index[arith.w_l()[gate_idx]];
        for (const auto& pair : builder.constant_variable_indices) {
            if (pair.second == real_wl) {
                return true;
            }
        }
        return false;
    };

    auto write_batch_mul_gates =
        [&is_hash_skipped](Builder& builder, size_t range_start, size_t range_end, const std::string& path) -> size_t {
        auto& arith = builder.blocks.arithmetic;
        std::ofstream out(path);
        size_t count = 0;
        size_t hashed_count = 0;
        for (size_t gate_idx = range_start; gate_idx < range_end; ++gate_idx) {
            const bool skipped = is_hash_skipped(builder, gate_idx);
            out << (gate_idx - range_start) << " hashed=" << (skipped ? 0 : 1) << " q_m=" << arith.q_m()[gate_idx]
                << " q_c=" << arith.q_c()[gate_idx] << " q_1=" << arith.q_1()[gate_idx]
                << " q_2=" << arith.q_2()[gate_idx] << " q_3=" << arith.q_3()[gate_idx]
                << " q_4=" << arith.q_4()[gate_idx] << " q_lookup=" << arith.q_lookup()[gate_idx]
                << " q_arith=" << arith.q_arith()[gate_idx] << "\n";
            if (!skipped) {
                ++hashed_count;
            }
            ++count;
        }
        out << "# total=" << count << " hashed=" << hashed_count << "\n";
        return count;
    };

    // All-gates files (with hashed= mark for every gate)
    const std::string stepwise_path = "stepwise_acir_kzg_arithmetic_gates.txt";
    const std::string acir_path = "acir_kzg_arithmetic_gates.txt";
    write_batch_mul_gates(stepwise_builder, stepwise_start, stepwise_end, stepwise_path);
    write_batch_mul_gates(acir_builder, acir_start, acir_end, acir_path);

    // Hashed-only files (only gates included in the hash, local index = position within hashed sequence)
    auto write_hashed_only =
        [&is_hash_skipped](Builder& builder, size_t range_start, size_t range_end, const std::string& path) -> size_t {
        auto& arith = builder.blocks.arithmetic;
        std::ofstream out(path);
        size_t hashed_pos = 0;
        for (size_t gate_idx = range_start; gate_idx < range_end; ++gate_idx) {
            if (is_hash_skipped(builder, gate_idx)) {
                continue;
            }
            out << hashed_pos << " local=" << (gate_idx - range_start) << " abs=" << gate_idx
                << " q_m=" << arith.q_m()[gate_idx] << " q_c=" << arith.q_c()[gate_idx]
                << " q_1=" << arith.q_1()[gate_idx] << " q_2=" << arith.q_2()[gate_idx]
                << " q_3=" << arith.q_3()[gate_idx] << " q_4=" << arith.q_4()[gate_idx]
                << " q_arith=" << arith.q_arith()[gate_idx] << "\n";
            ++hashed_pos;
        }
        return hashed_pos;
    };

    const std::string stepwise_hashed_path = "stepwise_acir_kzg_hashed_gates.txt";
    const std::string acir_hashed_path = "acir_kzg_hashed_gates.txt";
    const size_t stepwise_hashed = write_hashed_only(stepwise_builder, stepwise_start, stepwise_end, stepwise_hashed_path);
    const size_t acir_hashed = write_hashed_only(acir_builder, acir_start, acir_end, acir_hashed_path);

    info(
        "Stepwise ACIR batch_mul: hashed=",
        stepwise_hashed,
        " / total=",
        (stepwise_end - stepwise_start),
        " [arith ",
        stepwise_start,
        "..",
        stepwise_end,
        "]");
    info("ACIR batch_mul: hashed=",
         acir_hashed,
         " / total=",
         (acir_end - acir_start),
         " [arith ",
         acir_start,
         "..",
         acir_end,
         "]");
    info("All-gates files:    ", stepwise_path, "  ", acir_path);
    info("Hashed-only files:  ", stepwise_hashed_path, "  ", acir_hashed_path);

    // ── Positional diff: gates hashed in one circuit but not the other ────────
    const size_t gate_count = stepwise_end - stepwise_start;
    ASSERT_EQ(gate_count, acir_end - acir_start) << "Gate count mismatch";

    std::vector<size_t> full_acir_only_hashed; // local indices hashed in full ACIR but skipped in stepwise ACIR
    std::vector<size_t> stepwise_only_hashed;  // local indices hashed in stepwise ACIR but skipped in full ACIR

    for (size_t i = 0; i < gate_count; ++i) {
        const bool stepwise_skip = is_hash_skipped(stepwise_builder, stepwise_start + i);
        const bool acir_skip = is_hash_skipped(acir_builder, acir_start + i);
        if (!acir_skip && stepwise_skip) {
            full_acir_only_hashed.push_back(i);
        } else if (acir_skip && !stepwise_skip) {
            stepwise_only_hashed.push_back(i);
        }
    }

    info("Gates hashed in full ACIR but skipped in stepwise ACIR: ", full_acir_only_hashed.size());
    for (size_t local : full_acir_only_hashed) {
        info("  local=", local, " abs=", acir_start + local);
        log_arithmetic_gate_details(acir_builder, "  ACIR", acir_start + local);
        log_arithmetic_gate_details(stepwise_builder, "  stepwise", stepwise_start + local);
    }

    info("Gates hashed in stepwise ACIR but skipped in full ACIR: ", stepwise_only_hashed.size());
    for (size_t local : stepwise_only_hashed) {
        info("  local=", local, " abs=", stepwise_start + local);
        log_arithmetic_gate_details(stepwise_builder, "  stepwise", stepwise_start + local);
        log_arithmetic_gate_details(acir_builder, "  ACIR", acir_start + local);
    }

    // ── Full hash comparison against pinned BATCH_MUL_ARITHMETIC constant ────
    const size_t stepwise_full_hash =
        recursion_helpers::calculate_hash_arithmetic_block(stepwise_builder, stepwise_start, stepwise_end);
    const size_t acir_full_hash =
        recursion_helpers::calculate_hash_arithmetic_block(acir_builder, acir_start, acir_end);
    constexpr size_t PINNED_HASH = 0xed39caefb5f53b02ULL;

    info("Stepwise ACIR batch_mul full_hash = 0x", std::hex, stepwise_full_hash);
    info("ACIR batch_mul full_hash = 0x", std::hex, acir_full_hash);
    info("Pinned BATCH_MUL_ARITHMETIC full_hash = 0x", std::hex, PINNED_HASH);
    info("Stepwise ACIR == pinned: ", std::boolalpha, (stepwise_full_hash == PINNED_HASH));
    info("ACIR == pinned: ", std::boolalpha, (acir_full_hash == PINNED_HASH));
    info("Stepwise ACIR == full ACIR: ", std::boolalpha, (stepwise_full_hash == acir_full_hash));
    info(std::dec);
}

// ============================================================================
// Sumcheck analysis test suite
// ============================================================================
class BoomerangSumcheckTest : public BoomerangRecursionTests {};

TEST_F(BoomerangSumcheckTest, SumcheckVerifyAnalysis)
{
    info("");
    info("=== SumcheckVerifyFingerprintRegression ===");

    auto vc = setup_verifier_components(0);
    Builder& builder = vc.builder();
    auto snap = [&]() { return recursion_helpers::BlockSnapshot::capture(builder); };

    run_oink_verifier_step(vc);
    std::vector<FF> padding_indicator_array = run_padding_indicator_array_step(vc);

    using SumcheckRound = SumcheckVerifierRound<RecursiveFlavor>;
    using SumcheckRoundUnivariate = SumcheckRound::SumcheckRoundUnivariate;
    using GateSep = bb::GateSeparatorPolynomial<FF>;
    using SubrelationSeparators = std::array<FF, RecursiveFlavor::NUM_SUBRELATIONS - 1>;
    using AllValues = RecursiveFlavor::AllValues;
    using Commitment = RecursiveFlavor::Commitment;
    namespace SV = SumcheckValidation;

    // Libra:concatenation_commitment (ZK pre-sumcheck receive)
    auto before_concat_comm = snap();
    vc.transcript->template receive_from_prover<Commitment>("Libra:concatenation_commitment");
    expect_stage_matches_fingerprints(builder,
                                      before_concat_comm,
                                      snap(),
                                      { { BLOCK_INDEX_ARITHMETIC, &SV::LIBRA_CONCAT_COMMIT_ARITHMETIC },
                                        { BLOCK_INDEX_NNF, &SV::LIBRA_CONCAT_COMMIT_NNF } },
                                      "Sumcheck:Libra_concatenation_commitment");

    // ZK correction handler: Libra:Sum receive (no pinned fingerprint)
    FF libra_total_sum = vc.transcript->template receive_from_prover<FF>("Libra:Sum");

    // ZK correction handler: Libra:Challenge squeeze
    auto before_libra_challenge = snap();
    FF libra_challenge = vc.transcript->template get_challenge<FF>("Libra:Challenge");
    expect_stage_matches_fingerprints(builder,
                                      before_libra_challenge,
                                      snap(),
                                      { { BLOCK_INDEX_ARITHMETIC, &SV::ZK_HANDLER_LIBRA_CHALLENGE_ARITHMETIC },
                                        { BLOCK_INDEX_POSEIDON2_EXT, &SV::ZK_HANDLER_LIBRA_CHALLENGE_POSEIDON2_EXT },
                                        { BLOCK_INDEX_POSEIDON2_INT, &SV::ZK_HANDLER_LIBRA_CHALLENGE_POSEIDON2_INT } },
                                      "Sumcheck:ZK_correction_handler_libra_challenge");

    // ZK correction handler: initialize_target_sum
    SumcheckRound round;
    auto before_init_target = snap();
    round.target_total_sum = libra_total_sum * libra_challenge;
    expect_stage_matches_fingerprints(builder,
                                      before_init_target,
                                      snap(),
                                      { { BLOCK_INDEX_ARITHMETIC, &SV::ZK_HANDLER_INIT_TARGET_SUM_ARITHMETIC } },
                                      "Sumcheck:ZK_correction_handler_initialize_target_sum");

    GateSep gate_separators(vc.verifier_instance->gate_challenges);

    std::vector<FF> multivariate_challenge;
    multivariate_challenge.reserve(vc.log_n);

    // 16 rounds: fingerprinted substages mirror SumcheckValidation::validate_sumcheck_round (minus univariate).
    for (size_t round_idx = 0; round_idx < vc.log_n; round_idx++) {
        const FF& padding_indicator = padding_indicator_array[round_idx];
        const std::string sfx = "_" + std::to_string(round_idx);

        auto round_univariate = vc.transcript->template receive_from_prover<SumcheckRoundUnivariate>(
            "Sumcheck:univariate_" + std::to_string(round_idx));
        (void)round_univariate;

        auto before_challenge = snap();
        FF round_challenge = vc.transcript->template get_challenge<FF>("Sumcheck:u_" + std::to_string(round_idx));
        multivariate_challenge.emplace_back(round_challenge);
        std::string tag_u = "Sumcheck:u" + sfx;
        expect_stage_matches_fingerprints(builder,
                                          before_challenge,
                                          snap(),
                                          { { BLOCK_INDEX_ARITHMETIC, &SV::ROUND_U_ARITHMETIC },
                                            { BLOCK_INDEX_POSEIDON2_EXT, &SV::ROUND_U_POSEIDON2_EXT },
                                            { BLOCK_INDEX_POSEIDON2_INT, &SV::ROUND_U_POSEIDON2_INT } },
                                          tag_u.c_str());

        const auto& check_fp = round_idx == 15 ? SV::ROUND15_CHECK_SUM_ARITHMETIC : SV::ROUND_CHECK_SUM_ARITHMETIC;
        auto before_check_sum = snap();
        round.check_sum(round_univariate, padding_indicator);
        std::string tag_cs = "Sumcheck:check_sum" + sfx;
        expect_stage_matches_fingerprints(
            builder, before_check_sum, snap(), { { BLOCK_INDEX_ARITHMETIC, &check_fp } }, tag_cs.c_str());

        const auto& next_fp = round_idx == 15 ? SV::ROUND15_COMPUTE_NEXT_TARGET_SUM_ARITHMETIC
                                              : SV::ROUND_COMPUTE_NEXT_TARGET_SUM_ARITHMETIC;
        auto before_next_target = snap();
        round.compute_next_target_sum(round_univariate, round_challenge, padding_indicator);
        std::string tag_nt = "Sumcheck:compute_next_target_sum" + sfx;
        expect_stage_matches_fingerprints(
            builder, before_next_target, snap(), { { BLOCK_INDEX_ARITHMETIC, &next_fp } }, tag_nt.c_str());

        const auto& sep_fp = round_idx == 15  ? SV::ROUND15_GATE_SEP_ARITHMETIC
                             : round_idx == 0 ? SV::ROUND_GATE_SEP_R0_ARITHMETIC
                                              : SV::ROUND_GATE_SEP_ARITHMETIC;
        auto before_gate_sep = snap();
        gate_separators.partially_evaluate(round_challenge, padding_indicator);
        std::string tag_gs = "Sumcheck:gate_separators_partially_evaluate" + sfx;
        expect_stage_matches_fingerprints(
            builder, before_gate_sep, snap(), { { BLOCK_INDEX_ARITHMETIC, &sep_fp } }, tag_gs.c_str());
    }

    constexpr size_t NUM_POLYNOMIALS = RecursiveFlavor::NUM_ALL_ENTITIES;
    auto transcript_evaluations =
        vc.transcript->template receive_from_prover<std::array<FF, NUM_POLYNOMIALS>>("Sumcheck:evaluations");
    AllValues purported_evaluations;
    for (auto [eval, transcript_eval] : zip_view(purported_evaluations.get_all(), transcript_evaluations)) {
        eval = transcript_eval;
    }

    SubrelationSeparators alphas =
        bb::initialize_relation_separator<FF, RecursiveFlavor::NUM_SUBRELATIONS - 1>(vc.verifier_instance->alpha);
    auto before_full_relation = snap();
    FF full_honk_purported_value = round.compute_full_relation_purported_value(
        purported_evaluations, vc.verifier_instance->relation_parameters, gate_separators, alphas);
    expect_stage_matches_fingerprints(builder,
                                      before_full_relation,
                                      snap(),
                                      { { BLOCK_INDEX_ARITHMETIC, &SV::COMPUTE_FULL_RELATION_ARITHMETIC } },
                                      "Sumcheck:compute_full_relation_purported_value");

    auto before_row_disabling = snap();
    full_honk_purported_value *=
        bb::RowDisablingPolynomial<FF>::evaluate_at_challenge(multivariate_challenge, padding_indicator_array);
    expect_stage_matches_fingerprints(builder,
                                      before_row_disabling,
                                      snap(),
                                      { { BLOCK_INDEX_ARITHMETIC, &SV::ROW_DISABLING_ARITHMETIC } },
                                      "Sumcheck:row_disabling_evaluate_at_challenge");

    FF libra_evaluation = vc.transcript->template receive_from_prover<FF>("Libra:claimed_evaluation");

    auto before_libra_correction = snap();
    full_honk_purported_value += libra_evaluation * libra_challenge;
    expect_stage_matches_fingerprints(builder,
                                      before_libra_correction,
                                      snap(),
                                      { { BLOCK_INDEX_ARITHMETIC, &SV::LIBRA_CORRECTION_ARITHMETIC } },
                                      "Sumcheck:libra_correction");

    round.perform_final_verification(full_honk_purported_value);

    auto before_grand_sum = snap();
    vc.transcript->template receive_from_prover<Commitment>("Libra:grand_sum_commitment");
    expect_stage_matches_fingerprints(builder,
                                      before_grand_sum,
                                      snap(),
                                      { { BLOCK_INDEX_ARITHMETIC, &SV::LIBRA_GRAND_SUM_COMMIT_ARITHMETIC },
                                        { BLOCK_INDEX_NNF, &SV::LIBRA_GRAND_SUM_COMMIT_NNF } },
                                      "Sumcheck:Libra_grand_sum_commitment");

    auto before_quotient = snap();
    vc.transcript->template receive_from_prover<Commitment>("Libra:quotient_commitment");
    expect_stage_matches_fingerprints(builder,
                                      before_quotient,
                                      snap(),
                                      { { BLOCK_INDEX_ARITHMETIC, &SV::LIBRA_QUOTIENT_COMMIT_ARITHMETIC },
                                        { BLOCK_INDEX_NNF, &SV::LIBRA_QUOTIENT_COMMIT_NNF } },
                                      "Sumcheck:Libra_quotient_commitment");

    info("=== SumcheckVerifyFingerprintRegression COMPLETE ===");
}

TEST_F(BoomerangSumcheckTest, LibraChallengeWitnessIndex)
{
    auto vc = setup_verifier_components(0);
    Builder& builder = vc.builder();
    auto& arith = builder.blocks.arithmetic;
    auto to_real = [&](uint32_t w) { return builder.real_variable_index[w]; };

    run_oink_verifier_step(vc);
    run_padding_indicator_array_step(vc);

    // Consume squeezes from oink + step2 so we know which follow belong to sumcheck.
    auto squeezes_before_sumcheck = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    const std::set<size_t> consumed_before_sumcheck(squeezes_before_sumcheck.begin(), squeezes_before_sumcheck.end());

    // ── Replay sumcheck transcript operations only (no math needed for squeeze detection) ──

    // Pre-sumcheck ZK receive
    vc.transcript->template receive_from_prover<RecursiveFlavor::Commitment>("Libra:concatenation_commitment");

    // ZK correction handler init: Libra:Sum receive then Libra:Challenge squeeze
    vc.transcript->template receive_from_prover<FF>("Libra:Sum");
    [[maybe_unused]] FF libra_challenge = vc.transcript->template get_challenge<FF>("Libra:Challenge");

    // Record the squeeze gate just added for Libra:Challenge.
    auto squeezes_after_libra = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    ASSERT_EQ(squeezes_after_libra.size(), squeezes_before_sumcheck.size() + 1)
        << "Expected exactly one new squeeze gate after Libra:Challenge";
    const size_t libra_squeeze_gate = squeezes_after_libra.back();
    const uint32_t libra_challenge_real_idx = to_real(arith.w_l()[libra_squeeze_gate]);

    // Replay 16 round transcript operations (univariate receive + challenge squeeze per round).
    using SumcheckRoundUnivariate = SumcheckVerifierRound<RecursiveFlavor>::SumcheckRoundUnivariate;
    for (size_t round_idx = 0; round_idx < vc.log_n; round_idx++) {
        vc.transcript->template receive_from_prover<SumcheckRoundUnivariate>("Sumcheck:univariate_" +
                                                                             std::to_string(round_idx));
        vc.transcript->template get_challenge<FF>("Sumcheck:u_" + std::to_string(round_idx));
    }

    // All 17 sumcheck squeeze gates now exist in the circuit.
    auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    auto sumcheck_ch = recursion_helpers::sumcheck_challenges(builder, all_squeezes, consumed_before_sumcheck);
    ASSERT_TRUE(sumcheck_ch.valid);
    ASSERT_EQ(sumcheck_ch.squeeze_gate_indices.size(), recursion_helpers::NUM_SUMCHECK_SQUEEZES);

    // zk_correction must be the witness index of the Libra:Challenge field element.
    EXPECT_EQ(sumcheck_ch.zk_correction, libra_challenge_real_idx);
}

TEST_F(BoomerangSumcheckTest, ValidateSumcheck)
{
    auto vc = setup_verifier_components(0);
    Builder& builder = vc.builder();
    run_oink_verifier_step(vc);
    auto pia = run_padding_indicator_array_step(vc);
    run_sumcheck_step(vc, pia);

    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
    EXPECT_TRUE(SumcheckValidation::validate_sumcheck<bb::fr>(builder, analyzer));
}

TEST_F(BoomerangSumcheckTest, ValidateSumcheckDetectsCorruptedRoundArithmeticGate)
{
    auto vc = setup_verifier_components(0);
    Builder& builder = vc.builder();
    run_oink_verifier_step(vc);
    auto pia = run_padding_indicator_array_step(vc);
    run_sumcheck_step(vc, pia);

    // Find the start of round 5's check_sum arithmetic range and corrupt it.
    auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    const size_t consumed_count = recursion_helpers::NUM_OINK_SQUEEZES + recursion_helpers::NUM_STEP2_SQUEEZES;
    const std::set<size_t> consumed(all_squeezes.begin(), all_squeezes.begin() + consumed_count);
    auto sc_gates =
        recursion_helpers::take_unclaimed_squeezes(all_squeezes, consumed, recursion_helpers::NUM_SUMCHECK_SQUEEZES);
    ASSERT_EQ(sc_gates.size(), recursion_helpers::NUM_SUMCHECK_SQUEEZES);

    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);

    // Walk to round 5's check_sum start to find the gate to corrupt.
    auto prefix = SumcheckValidation::validate_sumcheck_prefix<bb::fr>(builder, analyzer, sc_gates[0]);
    ASSERT_TRUE(prefix.is_valid);
    size_t cursor = prefix.init_target_sum_arith_end;
    for (size_t r = 0; r < 5; ++r) {
        auto rd = SumcheckValidation::validate_sumcheck_round<bb::fr>(builder, analyzer, r, sc_gates[r + 1], cursor);
        ASSERT_TRUE(rd.is_valid);
        cursor = rd.arith_end;
    }
    // cursor now points to start of round 5's u_5 arithmetic range.
    // check_sum for round 5 starts at cursor + ROUND_U_ARITHMETIC.gate_count.
    const size_t check_sum_start = cursor + SumcheckValidation::ROUND_U_ARITHMETIC.gate_count;

    // Corrupt the first non-constant gate in the check_sum range.
    auto& arith = builder.blocks.arithmetic;
    arith.q_c().set(check_sum_start, arith.q_c()[check_sum_start] + bb::fr::one());

    // validate_sumcheck must now fail.
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer2(builder, false);
    EXPECT_FALSE(SumcheckValidation::validate_sumcheck<bb::fr>(builder, analyzer2));
}

// ============================================================================
// BoomerangOinkVerifierTest — per-sub-function gate distribution dump
// ============================================================================

class BoomerangOinkVerifierTest : public BoomerangRecursionTests {};

class BoomerangChonkRecursionOpcodeTest : public BoomerangRecursionTests {};

TEST_F(BoomerangOinkVerifierTest, OinkVerifierFunctionsAnalysis)
{
    info("");
    info("=== OinkVerifierFunctionsFingerprintRegression ===");

    auto acir = setup_acir_oink_validation_context(0);
    auto& vc = acir.vc;
    Builder& builder = vc.builder();
    auto snap = [&]() { return recursion_helpers::BlockSnapshot::capture(builder); };

    using Commitment = RecursiveFlavor::Commitment;
    namespace OV = OinkVerifierValidation;

    OinkVerifier<RecursiveFlavor> oink{ vc.verifier_instance, vc.transcript, vc.num_public_inputs };
    auto& rel_params = oink.relation_parameters;
    auto& witness_comms = oink.witness_comms;
    auto& comm_labels = oink.comm_labels;
    const std::string& ds = oink.domain_separator; // empty string for default domain separator

    auto vk = vc.verifier_instance->get_vk();

    auto before_vk_hash = snap();
    {
        FF vk_hash = vk->hash_with_origin_tagging(*vc.transcript);
        vc.transcript->add_to_hash_buffer(ds + "vk_hash", vk_hash);
        vc.verifier_instance->vk_and_hash->hash.assert_equal(vk_hash);
        vk->num_public_inputs.assert_equal(FF(vc.num_public_inputs),
                                           "OinkVerifier: num_public_inputs mismatch with VK");
    }
    info("Oink:vk_hash actual starts: arithmetic=",
         block_snapshot_size(builder, before_vk_hash, builder.blocks.arithmetic),
         " poseidon2_external=",
         block_snapshot_size(builder, before_vk_hash, builder.blocks.poseidon2_external),
         " poseidon2_internal=",
         block_snapshot_size(builder, before_vk_hash, builder.blocks.poseidon2_internal));
    EXPECT_TRUE(recursion_helpers::matches_fingerprint_at(builder,
                                                          builder.blocks.poseidon2_external,
                                                          block_snapshot_size(builder,
                                                                              before_vk_hash,
                                                                              builder.blocks.poseidon2_external),
                                                          OV::VK_HASH_POSEIDON2_EXT));
    EXPECT_TRUE(recursion_helpers::matches_fingerprint_at(builder,
                                                          builder.blocks.poseidon2_internal,
                                                          block_snapshot_size(builder,
                                                                              before_vk_hash,
                                                                              builder.blocks.poseidon2_internal),
                                                          OV::VK_HASH_POSEIDON2_INT));

    auto before_pub_inputs = snap();
    {
        std::vector<FF> public_inputs;
        for (size_t i = 0; i < vc.num_public_inputs; ++i) {
            public_inputs.emplace_back(
                vc.transcript->template receive_from_prover<FF>(ds + "public_input_" + std::to_string(i)));
        }
        vc.verifier_instance->public_inputs = std::move(public_inputs);
    }
    expect_no_new_gates(builder, before_pub_inputs, snap(), "Oink:public_inputs");

    if constexpr (RecursiveFlavor::HasZK) {
        auto before_masking = snap();
        vc.verifier_instance->gemini_masking_commitment =
            vc.transcript->template receive_from_prover<Commitment>("Gemini:masking_poly_comm");
        expect_stage_matches_fingerprints(builder,
                                          before_masking,
                                          snap(),
                                          { { BLOCK_INDEX_ARITHMETIC, &OV::SINGLE_COMMITMENT_ARITHMETIC },
                                            { BLOCK_INDEX_NNF, &OV::SINGLE_COMMITMENT_NNF } },
                                          "Oink:gemini_masking_commitment");
    }

    auto before_w_l = snap();
    witness_comms.w_l = vc.transcript->template receive_from_prover<Commitment>(ds + comm_labels.w_l);
    expect_stage_matches_fingerprints(builder,
                                      before_w_l,
                                      snap(),
                                      { { BLOCK_INDEX_ARITHMETIC, &OV::SINGLE_COMMITMENT_ARITHMETIC },
                                        { BLOCK_INDEX_NNF, &OV::SINGLE_COMMITMENT_NNF } },
                                      "Oink:w_l");

    auto before_w_r = snap();
    witness_comms.w_r = vc.transcript->template receive_from_prover<Commitment>(ds + comm_labels.w_r);
    expect_stage_matches_fingerprints(builder,
                                      before_w_r,
                                      snap(),
                                      { { BLOCK_INDEX_ARITHMETIC, &OV::SINGLE_COMMITMENT_ARITHMETIC },
                                        { BLOCK_INDEX_NNF, &OV::SINGLE_COMMITMENT_NNF } },
                                      "Oink:w_r");

    auto before_w_o = snap();
    witness_comms.w_o = vc.transcript->template receive_from_prover<Commitment>(ds + comm_labels.w_o);
    expect_stage_matches_fingerprints(builder,
                                      before_w_o,
                                      snap(),
                                      { { BLOCK_INDEX_ARITHMETIC, &OV::SINGLE_COMMITMENT_ARITHMETIC },
                                        { BLOCK_INDEX_NNF, &OV::SINGLE_COMMITMENT_NNF } },
                                      "Oink:w_o");

    if constexpr (IsMegaFlavor<RecursiveFlavor>) {
        for (auto [commitment, label] : zip_view(witness_comms.get_ecc_op_wires(), comm_labels.get_ecc_op_wires())) {
            auto before_ecc = snap();
            commitment = vc.transcript->template receive_from_prover<Commitment>(ds + label);
            expect_stage_matches_fingerprints(builder,
                                              before_ecc,
                                              snap(),
                                              { { BLOCK_INDEX_ARITHMETIC, &OV::SINGLE_COMMITMENT_ARITHMETIC },
                                                { BLOCK_INDEX_NNF, &OV::SINGLE_COMMITMENT_NNF } },
                                              "Oink:ecc_op_wire_commitment");
        }

        for (auto [commitment, label] :
             zip_view(witness_comms.get_databus_entities(), comm_labels.get_databus_entities())) {
            auto before_db = snap();
            commitment = vc.transcript->template receive_from_prover<Commitment>(ds + label);
            expect_stage_matches_fingerprints(builder,
                                              before_db,
                                              snap(),
                                              { { BLOCK_INDEX_ARITHMETIC, &OV::SINGLE_COMMITMENT_ARITHMETIC },
                                                { BLOCK_INDEX_NNF, &OV::SINGLE_COMMITMENT_NNF } },
                                              "Oink:databus_commitment");
        }
    }

    auto before_eta = snap();
    rel_params.compute_eta_powers(vc.transcript->template get_challenge<FF>("eta"));
    expect_stage_matches_fingerprints(builder,
                                      before_eta,
                                      snap(),
                                      { { BLOCK_INDEX_ARITHMETIC, &OV::ETA_ARITHMETIC },
                                        { BLOCK_INDEX_POSEIDON2_EXT, &OV::ETA_POSEIDON2_EXT },
                                        { BLOCK_INDEX_POSEIDON2_INT, &OV::ETA_POSEIDON2_INT } },
                                      "Oink:eta");

    auto before_lrc = snap();
    witness_comms.lookup_read_counts =
        vc.transcript->template receive_from_prover<Commitment>(ds + comm_labels.lookup_read_counts);
    expect_stage_matches_fingerprints(builder,
                                      before_lrc,
                                      snap(),
                                      { { BLOCK_INDEX_ARITHMETIC, &OV::SINGLE_COMMITMENT_ARITHMETIC },
                                        { BLOCK_INDEX_NNF, &OV::SINGLE_COMMITMENT_NNF } },
                                      "Oink:lookup_read_counts");

    auto before_lrt = snap();
    witness_comms.lookup_read_tags =
        vc.transcript->template receive_from_prover<Commitment>(ds + comm_labels.lookup_read_tags);
    expect_stage_matches_fingerprints(builder,
                                      before_lrt,
                                      snap(),
                                      { { BLOCK_INDEX_ARITHMETIC, &OV::SINGLE_COMMITMENT_ARITHMETIC },
                                        { BLOCK_INDEX_NNF, &OV::SINGLE_COMMITMENT_NNF } },
                                      "Oink:lookup_read_tags");

    auto before_w4 = snap();
    witness_comms.w_4 = vc.transcript->template receive_from_prover<Commitment>(ds + comm_labels.w_4);
    expect_stage_matches_fingerprints(builder,
                                      before_w4,
                                      snap(),
                                      { { BLOCK_INDEX_ARITHMETIC, &OV::SINGLE_COMMITMENT_ARITHMETIC },
                                        { BLOCK_INDEX_NNF, &OV::SINGLE_COMMITMENT_NNF } },
                                      "Oink:w_4");

    auto before_beta_gamma = snap();
    {
        auto [beta, gamma] =
            vc.transcript->template get_challenges<FF>(std::array<std::string, 2>{ ds + "beta", ds + "gamma" });
        rel_params.compute_beta_powers(beta);
        rel_params.gamma = gamma;
    }
    expect_stage_matches_fingerprints(builder,
                                      before_beta_gamma,
                                      snap(),
                                      { { BLOCK_INDEX_ARITHMETIC, &OV::BETA_GAMMA_ARITHMETIC },
                                        { BLOCK_INDEX_POSEIDON2_EXT, &OV::BETA_GAMMA_POSEIDON2_EXT },
                                        { BLOCK_INDEX_POSEIDON2_INT, &OV::BETA_GAMMA_POSEIDON2_INT } },
                                      "Oink:beta_gamma");

    auto before_lookup_inv = snap();
    witness_comms.lookup_inverses =
        vc.transcript->template receive_from_prover<Commitment>(ds + comm_labels.lookup_inverses);
    expect_stage_matches_fingerprints(builder,
                                      before_lookup_inv,
                                      snap(),
                                      { { BLOCK_INDEX_ARITHMETIC, &OV::SINGLE_COMMITMENT_ARITHMETIC },
                                        { BLOCK_INDEX_NNF, &OV::SINGLE_COMMITMENT_NNF } },
                                      "Oink:lookup_inverses");

    if constexpr (IsMegaFlavor<RecursiveFlavor>) {
        for (auto [commitment, label] :
             zip_view(witness_comms.get_databus_inverses(), comm_labels.get_databus_inverses())) {
            auto before_dbi = snap();
            commitment = vc.transcript->template receive_from_prover<Commitment>(ds + label);
            expect_stage_matches_fingerprints(builder,
                                              before_dbi,
                                              snap(),
                                              { { BLOCK_INDEX_ARITHMETIC, &OV::SINGLE_COMMITMENT_ARITHMETIC },
                                                { BLOCK_INDEX_NNF, &OV::SINGLE_COMMITMENT_NNF } },
                                              "Oink:databus_inverse_commitment");
        }
    }

    auto before_pid = snap();
    rel_params.public_input_delta = compute_public_input_delta<RecursiveFlavor>(
        vc.verifier_instance->public_inputs, rel_params.beta, rel_params.gamma, vk->pub_inputs_offset);
    expect_stage_matches_fingerprints(builder,
                                      before_pid,
                                      snap(),
                                      { { BLOCK_INDEX_ARITHMETIC, &OV::PUBLIC_INPUT_DELTA_ARITHMETIC } },
                                      "Oink:public_input_delta");

    auto before_z_perm = snap();
    witness_comms.z_perm = vc.transcript->template receive_from_prover<Commitment>(ds + comm_labels.z_perm);
    expect_stage_matches_fingerprints(builder,
                                      before_z_perm,
                                      snap(),
                                      { { BLOCK_INDEX_ARITHMETIC, &OV::SINGLE_COMMITMENT_ARITHMETIC },
                                        { BLOCK_INDEX_NNF, &OV::SINGLE_COMMITMENT_NNF } },
                                      "Oink:z_perm");

    auto before_alpha = snap();
    vc.verifier_instance->alpha = vc.transcript->template get_challenge<FF>(ds + "alpha");
    expect_stage_matches_fingerprints(builder,
                                      before_alpha,
                                      snap(),
                                      { { BLOCK_INDEX_ARITHMETIC, &OV::ALPHA_ARITHMETIC },
                                        { BLOCK_INDEX_POSEIDON2_EXT, &OV::ALPHA_POSEIDON2_EXT },
                                        { BLOCK_INDEX_POSEIDON2_INT, &OV::ALPHA_POSEIDON2_INT } },
                                      "Oink:alpha");

    vc.verifier_instance->witness_commitments = witness_comms;
    vc.verifier_instance->relation_parameters = rel_params;

    info("=== OinkVerifierFunctionsFingerprintRegression COMPLETE ===");
}

TEST_F(BoomerangOinkVerifierTest, FingerprintConstantsMatchDump)
{
    auto acir = setup_acir_oink_validation_context(0);
    auto& vc = acir.vc;
    run_oink_verifier_step(vc);
    const auto& inputs = acir.inputs;
    Builder& builder = vc.builder();
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);

    auto vk_result = OinkVerifierValidation::validate_vk_hash_stage<bb::fr>(builder, analyzer, inputs.constraint);
    ASSERT_TRUE(vk_result.is_valid);
    EXPECT_TRUE(recursion_helpers::matches_fingerprint_at(
        builder, builder.blocks.arithmetic, vk_result.arith_start, OinkVerifierValidation::VK_HASH_ARITHMETIC));
    EXPECT_TRUE(recursion_helpers::matches_fingerprint_at(builder,
                                                          builder.blocks.poseidon2_external,
                                                          vk_result.poseidon2_ext_start,
                                                          OinkVerifierValidation::VK_HASH_POSEIDON2_EXT));
    EXPECT_TRUE(recursion_helpers::matches_fingerprint_at(builder,
                                                          builder.blocks.poseidon2_internal,
                                                          vk_result.poseidon2_int_start,
                                                          OinkVerifierValidation::VK_HASH_POSEIDON2_INT));

    auto commitment_result =
        OinkVerifierValidation::validate_commitment_receive_fingerprint<bb::fr>(builder,
                                                                                analyzer,
                                                                                inputs.proof_body_witnesses[0],
                                                                                inputs.proof_body_witnesses[1],
                                                                                inputs.proof_body_witnesses[2],
                                                                                inputs.proof_body_witnesses[3]);
    ASSERT_TRUE(commitment_result.is_valid);
    EXPECT_TRUE(recursion_helpers::matches_fingerprint_at(builder,
                                                          builder.blocks.arithmetic,
                                                          commitment_result.arith_start,
                                                          OinkVerifierValidation::SINGLE_COMMITMENT_ARITHMETIC));
    EXPECT_TRUE(recursion_helpers::matches_fingerprint_at(
        builder, builder.blocks.nnf, commitment_result.nnf_start, OinkVerifierValidation::SINGLE_COMMITMENT_NNF));

    auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    auto oink = recursion_helpers::oink_challenges(builder, all_squeezes);
    ASSERT_TRUE(oink.valid);
    std::vector<size_t> oink_gates(oink.squeeze_gate_indices.begin(), oink.squeeze_gate_indices.end());

    auto eta_result = OinkVerifierValidation::validate_eta_stage<bb::fr>(builder, analyzer, oink_gates[0]);
    ASSERT_TRUE(eta_result.is_valid);
    EXPECT_TRUE(recursion_helpers::matches_fingerprint_at(
        builder, builder.blocks.arithmetic, eta_result.arith_start, OinkVerifierValidation::ETA_ARITHMETIC));
    EXPECT_TRUE(recursion_helpers::matches_fingerprint_at(builder,
                                                          builder.blocks.poseidon2_external,
                                                          eta_result.poseidon2_ext_start,
                                                          OinkVerifierValidation::ETA_POSEIDON2_EXT));
    EXPECT_TRUE(recursion_helpers::matches_fingerprint_at(builder,
                                                          builder.blocks.poseidon2_internal,
                                                          eta_result.poseidon2_int_start,
                                                          OinkVerifierValidation::ETA_POSEIDON2_INT));

    auto bg_result = OinkVerifierValidation::validate_beta_gamma_stage<bb::fr>(builder, analyzer, oink_gates[1]);
    ASSERT_TRUE(bg_result.is_valid);
    EXPECT_TRUE(recursion_helpers::matches_fingerprint_at(
        builder, builder.blocks.arithmetic, bg_result.arith_start, OinkVerifierValidation::BETA_GAMMA_ARITHMETIC));
    EXPECT_TRUE(recursion_helpers::matches_fingerprint_at(builder,
                                                          builder.blocks.poseidon2_external,
                                                          bg_result.poseidon2_ext_start,
                                                          OinkVerifierValidation::BETA_GAMMA_POSEIDON2_EXT));
    EXPECT_TRUE(recursion_helpers::matches_fingerprint_at(builder,
                                                          builder.blocks.poseidon2_internal,
                                                          bg_result.poseidon2_int_start,
                                                          OinkVerifierValidation::BETA_GAMMA_POSEIDON2_INT));

    auto delta_result = OinkVerifierValidation::validate_public_input_delta_stage<bb::fr>(
        builder, analyzer, bg_result.beta, bg_result.gamma, builder.real_variable_index[inputs.constraint.key[2]], {});
    ASSERT_TRUE(delta_result.is_valid);
    EXPECT_TRUE(recursion_helpers::matches_fingerprint_at(builder,
                                                          builder.blocks.arithmetic,
                                                          delta_result.arith_start,
                                                          OinkVerifierValidation::PUBLIC_INPUT_DELTA_ARITHMETIC));

    auto alpha_result = OinkVerifierValidation::validate_alpha_stage<bb::fr>(builder, analyzer, oink_gates[2]);
    ASSERT_TRUE(alpha_result.is_valid);
    EXPECT_TRUE(recursion_helpers::matches_fingerprint_at(
        builder, builder.blocks.arithmetic, alpha_result.arith_start, OinkVerifierValidation::ALPHA_ARITHMETIC));
    EXPECT_TRUE(recursion_helpers::matches_fingerprint_at(builder,
                                                          builder.blocks.poseidon2_external,
                                                          alpha_result.poseidon2_ext_start,
                                                          OinkVerifierValidation::ALPHA_POSEIDON2_EXT));
    EXPECT_TRUE(recursion_helpers::matches_fingerprint_at(builder,
                                                          builder.blocks.poseidon2_internal,
                                                          alpha_result.poseidon2_int_start,
                                                          OinkVerifierValidation::ALPHA_POSEIDON2_INT));
}

TEST_F(BoomerangOinkVerifierTest, ValidateVkHashStage)
{
    auto acir = setup_acir_oink_validation_context(0);
    auto& vc = acir.vc;
    run_oink_verifier_step(vc);
    const auto& inputs = acir.inputs;
    Builder& builder = vc.builder();
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);

    auto result = OinkVerifierValidation::validate_vk_hash_stage<bb::fr>(builder, analyzer, inputs.constraint);
    ASSERT_TRUE(result.is_valid);
    ASSERT_NE(result.arith_start, SIZE_MAX);
    ASSERT_NE(result.poseidon2_ext_start, SIZE_MAX);
    ASSERT_NE(result.poseidon2_int_start, SIZE_MAX);

    EXPECT_TRUE(recursion_helpers::matches_fingerprint_at(
        builder, builder.blocks.arithmetic, result.arith_start, OinkVerifierValidation::VK_HASH_ARITHMETIC));
    EXPECT_EQ(result.arith_end, result.arith_start + OinkVerifierValidation::VK_HASH_ARITHMETIC.gate_count);
    EXPECT_TRUE(recursion_helpers::matches_fingerprint_at(builder,
                                                          builder.blocks.poseidon2_external,
                                                          result.poseidon2_ext_start,
                                                          OinkVerifierValidation::VK_HASH_POSEIDON2_EXT));
    EXPECT_TRUE(recursion_helpers::matches_fingerprint_at(builder,
                                                          builder.blocks.poseidon2_internal,
                                                          result.poseidon2_int_start,
                                                          OinkVerifierValidation::VK_HASH_POSEIDON2_INT));
}

TEST_F(BoomerangOinkVerifierTest, ValidateEtaStage)
{
    auto acir = setup_acir_oink_validation_context(0);
    auto& vc = acir.vc;
    run_oink_verifier_step(vc);
    Builder& builder = vc.builder();
    auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    auto oink = recursion_helpers::oink_challenges(builder, all_squeezes);
    ASSERT_TRUE(oink.valid);
    std::vector<size_t> oink_gates(oink.squeeze_gate_indices.begin(), oink.squeeze_gate_indices.end());

    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
    auto result = OinkVerifierValidation::validate_eta_stage<bb::fr>(builder, analyzer, oink_gates[0]);
    EXPECT_TRUE(result.is_valid);
    EXPECT_NE(result.eta_two, UINT32_MAX);
    EXPECT_NE(result.eta_three, UINT32_MAX);
}

TEST_F(BoomerangOinkVerifierTest, ValidateBetaGammaStage)
{
    auto acir = setup_acir_oink_validation_context(0);
    auto& vc = acir.vc;
    run_oink_verifier_step(vc);
    Builder& builder = vc.builder();
    auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    auto oink = recursion_helpers::oink_challenges(builder, all_squeezes);
    ASSERT_TRUE(oink.valid);
    std::vector<size_t> oink_gates(oink.squeeze_gate_indices.begin(), oink.squeeze_gate_indices.end());

    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
    auto result = OinkVerifierValidation::validate_beta_gamma_stage<bb::fr>(builder, analyzer, oink_gates[1]);
    EXPECT_TRUE(result.is_valid);
    EXPECT_NE(result.beta_sqr, UINT32_MAX);
    EXPECT_NE(result.beta_cube, UINT32_MAX);
    EXPECT_NE(result.gamma, UINT32_MAX);
}

TEST_F(BoomerangOinkVerifierTest, ValidateAlphaStage)
{
    auto acir = setup_acir_oink_validation_context(0);
    auto& vc = acir.vc;
    run_oink_verifier_step(vc);
    Builder& builder = vc.builder();
    auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    auto oink = recursion_helpers::oink_challenges(builder, all_squeezes);
    ASSERT_TRUE(oink.valid);
    std::vector<size_t> oink_gates(oink.squeeze_gate_indices.begin(), oink.squeeze_gate_indices.end());

    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
    auto result = OinkVerifierValidation::validate_alpha_stage<bb::fr>(builder, analyzer, oink_gates[2]);
    EXPECT_TRUE(result.is_valid);
    EXPECT_NE(result.alpha, UINT32_MAX);
}

TEST_F(BoomerangOinkVerifierTest, ValidateCommitmentReceiveFingerprint)
{
    auto acir = setup_acir_oink_validation_context(0);
    auto& vc = acir.vc;
    run_oink_verifier_step(vc);
    const auto& inputs = acir.inputs;
    Builder& builder = vc.builder();
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);

    const auto result =
        OinkVerifierValidation::validate_commitment_receive_fingerprint<bb::fr>(builder,
                                                                                analyzer,
                                                                                inputs.proof_body_witnesses[0],
                                                                                inputs.proof_body_witnesses[1],
                                                                                inputs.proof_body_witnesses[2],
                                                                                inputs.proof_body_witnesses[3]);
    EXPECT_TRUE(result.is_valid);
    EXPECT_NE(result.nnf_start, SIZE_MAX);
}

TEST_F(BoomerangOinkVerifierTest, ValidatePublicInputDeltaStage)
{
    auto acir = setup_acir_oink_validation_context(0);
    auto& vc = acir.vc;
    run_oink_verifier_step(vc);
    const auto& inputs = acir.inputs;
    Builder& builder = vc.builder();
    auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    auto oink = recursion_helpers::oink_challenges(builder, all_squeezes);
    ASSERT_TRUE(oink.valid);
    std::vector<size_t> oink_gates(oink.squeeze_gate_indices.begin(), oink.squeeze_gate_indices.end());

    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
    auto bg = OinkVerifierValidation::validate_beta_gamma_stage<bb::fr>(builder, analyzer, oink_gates[1]);
    ASSERT_TRUE(bg.is_valid);

    auto result = OinkVerifierValidation::validate_public_input_delta_stage<bb::fr>(
        builder, analyzer, bg.beta, bg.gamma, builder.real_variable_index[inputs.constraint.key[2]], {});
    EXPECT_TRUE(result.is_valid);
}

TEST_F(BoomerangOinkVerifierTest, ValidateOinkVerifier)
{
    auto acir = setup_acir_oink_validation_context(0);
    auto& vc = acir.vc;
    run_oink_verifier_step(vc);
    const auto& inputs = acir.inputs;
    Builder& builder = vc.builder();
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);

    EXPECT_TRUE(OinkVerifierValidation::validate_oink_verifier<bb::fr>(
        builder, analyzer, inputs.constraint, inputs.proof_body_witnesses));
}

TEST_F(BoomerangOinkVerifierTest, ValidateOinkVerifierDetectsCorruptedVkHash)
{
    auto acir = setup_acir_oink_validation_context(0);
    auto& vc = acir.vc;
    run_oink_verifier_step(vc);
    const auto& inputs = acir.inputs;
    Builder& builder = vc.builder();
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);

    auto vk_result = OinkVerifierValidation::validate_vk_hash_stage<bb::fr>(builder, analyzer, inputs.constraint);
    ASSERT_TRUE(vk_result.is_valid);
    builder.blocks.arithmetic.q_1().set(vk_result.arith_start + 10,
                                        builder.blocks.arithmetic.q_1()[vk_result.arith_start + 10] + bb::fr::one());

    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer2(builder, false);
    EXPECT_FALSE(OinkVerifierValidation::validate_oink_verifier<bb::fr>(
        builder, analyzer2, inputs.constraint, inputs.proof_body_witnesses));
}

TEST_F(BoomerangOinkVerifierTest, ValidateOinkVerifierDetectsCorruptedEtaChallenge)
{
    auto acir = setup_acir_oink_validation_context(0);
    auto& vc = acir.vc;
    run_oink_verifier_step(vc);
    const auto& inputs = acir.inputs;
    Builder& builder = vc.builder();
    auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    auto oink = recursion_helpers::oink_challenges(builder, all_squeezes);
    ASSERT_TRUE(oink.valid);
    std::vector<size_t> oink_gates(oink.squeeze_gate_indices.begin(), oink.squeeze_gate_indices.end());
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);

    auto eta_result = OinkVerifierValidation::validate_eta_stage<bb::fr>(builder, analyzer, oink_gates[0]);
    ASSERT_TRUE(eta_result.is_valid);
    builder.blocks.arithmetic.q_1().set(eta_result.arith_start + 5,
                                        builder.blocks.arithmetic.q_1()[eta_result.arith_start + 5] + bb::fr::one());

    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer2(builder, false);
    EXPECT_FALSE(OinkVerifierValidation::validate_oink_verifier<bb::fr>(
        builder, analyzer2, inputs.constraint, inputs.proof_body_witnesses));
}

TEST_F(BoomerangOinkVerifierTest, ValidateOinkVerifierDetectsCorruptedAlphaStage)
{
    auto acir = setup_acir_oink_validation_context(0);
    auto& vc = acir.vc;
    run_oink_verifier_step(vc);
    const auto& inputs = acir.inputs;
    Builder& builder = vc.builder();
    auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    auto oink = recursion_helpers::oink_challenges(builder, all_squeezes);
    ASSERT_TRUE(oink.valid);
    std::vector<size_t> oink_gates(oink.squeeze_gate_indices.begin(), oink.squeeze_gate_indices.end());
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);

    auto alpha_result = OinkVerifierValidation::validate_alpha_stage<bb::fr>(builder, analyzer, oink_gates[2]);
    ASSERT_TRUE(alpha_result.is_valid);
    builder.blocks.arithmetic.q_1().set(alpha_result.arith_start + 5,
                                        builder.blocks.arithmetic.q_1()[alpha_result.arith_start + 5] + bb::fr::one());

    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer2(builder, false);
    EXPECT_FALSE(OinkVerifierValidation::validate_oink_verifier<bb::fr>(
        builder, analyzer2, inputs.constraint, inputs.proof_body_witnesses));
}

TEST_F(BoomerangOinkVerifierTest, ValidateOinkVerifierDetectsCorruptedPublicInputDelta)
{
    auto acir = setup_acir_oink_validation_context(0);
    auto& vc = acir.vc;
    run_oink_verifier_step(vc);
    const auto& inputs = acir.inputs;
    Builder& builder = vc.builder();
    auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    auto oink = recursion_helpers::oink_challenges(builder, all_squeezes);
    ASSERT_TRUE(oink.valid);
    std::vector<size_t> oink_gates(oink.squeeze_gate_indices.begin(), oink.squeeze_gate_indices.end());
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);

    auto bg = OinkVerifierValidation::validate_beta_gamma_stage<bb::fr>(builder, analyzer, oink_gates[1]);
    ASSERT_TRUE(bg.is_valid);
    auto delta_result = OinkVerifierValidation::validate_public_input_delta_stage<bb::fr>(
        builder, analyzer, bg.beta, bg.gamma, builder.real_variable_index[inputs.constraint.key[2]], {});
    ASSERT_TRUE(delta_result.is_valid);
    builder.blocks.arithmetic.q_c().set(delta_result.arith_start + 5,
                                        builder.blocks.arithmetic.q_c()[delta_result.arith_start + 5] + bb::fr::one());

    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer2(builder, false);
    EXPECT_FALSE(OinkVerifierValidation::validate_oink_verifier<bb::fr>(
        builder, analyzer2, inputs.constraint, inputs.proof_body_witnesses));
}

TEST_F(BoomerangOinkVerifierTest, LegacyAndNewValidatorParity)
{
    auto acir = setup_acir_oink_validation_context(0);
    auto& vc = acir.vc;
    run_oink_verifier_step(vc);
    const auto& inputs = acir.inputs;
    Builder& builder = vc.builder();
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);

    bool legacy = recursion_helpers::validate_oink_subcircuit<bb::fr>(
        builder, analyzer, inputs.constraint, inputs.proof_body_witnesses);
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer2(builder, false);
    bool new_val = OinkVerifierValidation::validate_oink_verifier<bb::fr>(
        builder, analyzer2, inputs.constraint, inputs.proof_body_witnesses);

    EXPECT_EQ(legacy, new_val);
    EXPECT_TRUE(new_val);
}

TEST_F(BoomerangChonkRecursionOpcodeTest, DetectsCorruptedOinkGate)
{
    expect_chonk_recursion_opcode_detects_corruption(
        "oink",
        [](Builder& builder, const RecursionConstraint& constraint, const std::vector<uint32_t>& proof_body_witnesses) {
            cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
            auto vk_result = OinkVerifierValidation::validate_vk_hash_stage<bb::fr>(builder, analyzer, constraint);
            if (!vk_result.is_valid) {
                return false;
            }

            const size_t gate_to_corrupt =
                find_first_hashable_gate_in_range(builder, vk_result.arith_start, vk_result.arith_end);
            if (gate_to_corrupt >= vk_result.arith_end) {
                return false;
            }

            builder.blocks.arithmetic.q_c().set(gate_to_corrupt,
                                                builder.blocks.arithmetic.q_c()[gate_to_corrupt] + bb::fr::one());
            return !proof_body_witnesses.empty();
        });
}

TEST_F(BoomerangChonkRecursionOpcodeTest, DetectsCorruptedPaddingArrayGate)
{
    expect_chonk_recursion_opcode_detects_corruption(
        "padding_array",
        [](Builder& builder, const RecursionConstraint& constraint, const std::vector<uint32_t>& proof_body_witnesses) {
            cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
            auto padding =
                recursion_helpers::validate_compute_padding_array_step<bb::fr>(builder, analyzer, constraint);
            if (!padding.valid) {
                return false;
            }

            const size_t gate_to_corrupt = find_first_hashable_gate_in_range(
                builder,
                padding.start_gate,
                padding.start_gate + recursion_helpers::COMPUTE_PADDING_INDICATOR_ARRAY_NUM_GATES);
            if (gate_to_corrupt >= padding.start_gate + recursion_helpers::COMPUTE_PADDING_INDICATOR_ARRAY_NUM_GATES) {
                return false;
            }

            builder.blocks.arithmetic.q_c().set(gate_to_corrupt,
                                                builder.blocks.arithmetic.q_c()[gate_to_corrupt] + bb::fr::one());
            return !proof_body_witnesses.empty();
        });
}

TEST_F(BoomerangChonkRecursionOpcodeTest, DetectsCorruptedSumcheckGate)
{
    expect_chonk_recursion_opcode_detects_corruption(
        "sumcheck",
        [](Builder& builder, const RecursionConstraint& constraint, const std::vector<uint32_t>& proof_body_witnesses) {
            cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
            auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);
            auto oink = recursion_helpers::oink_challenges(builder, all_squeezes);
            if (!oink.valid) {
                return false;
            }
            auto step2 = recursion_helpers::step2_challenge(builder, all_squeezes, oink.squeeze_gate_indices);
            if (!step2.valid) {
                return false;
            }

            std::set<size_t> consumed = oink.squeeze_gate_indices;
            consumed.insert(step2.squeeze_gate_indices.begin(), step2.squeeze_gate_indices.end());
            auto sc_gates = recursion_helpers::take_unclaimed_squeezes(
                all_squeezes, consumed, recursion_helpers::NUM_SUMCHECK_SQUEEZES);
            if (sc_gates.size() != recursion_helpers::NUM_SUMCHECK_SQUEEZES) {
                return false;
            }

            auto prefix = SumcheckValidation::validate_sumcheck_prefix<bb::fr>(builder, analyzer, sc_gates[0]);
            if (!prefix.is_valid) {
                return false;
            }

            const size_t gate_to_corrupt = find_first_hashable_gate_in_range(
                builder, prefix.init_target_sum_arith_start, prefix.init_target_sum_arith_end);
            if (gate_to_corrupt >= prefix.init_target_sum_arith_end) {
                return false;
            }

            builder.blocks.arithmetic.q_c().set(gate_to_corrupt,
                                                builder.blocks.arithmetic.q_c()[gate_to_corrupt] + bb::fr::one());
            return constraint.proof_type == PROOF_TYPE::CHONK && !proof_body_witnesses.empty();
        });
}

TEST_F(BoomerangChonkRecursionOpcodeTest, DetectsCorruptedShpleminiGate)
{
    expect_chonk_recursion_opcode_detects_corruption(
        "shplemini",
        [](Builder& builder, const RecursionConstraint& constraint, const std::vector<uint32_t>& proof_body_witnesses) {
            cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
            auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);
            auto oink = recursion_helpers::oink_challenges(builder, all_squeezes);
            if (!oink.valid) {
                return false;
            }
            auto step2 = recursion_helpers::step2_challenge(builder, all_squeezes, oink.squeeze_gate_indices);
            if (!step2.valid) {
                return false;
            }

            std::set<size_t> consumed = oink.squeeze_gate_indices;
            consumed.insert(step2.squeeze_gate_indices.begin(), step2.squeeze_gate_indices.end());
            auto sumcheck = recursion_helpers::sumcheck_challenges(builder, all_squeezes, consumed);
            if (!sumcheck.valid) {
                return false;
            }
            consumed.insert(sumcheck.squeeze_gate_indices.begin(), sumcheck.squeeze_gate_indices.end());

            auto shplemini = recursion_helpers::shplemini_challenges(builder, all_squeezes, consumed);
            if (!shplemini.valid || shplemini.squeeze_gate_indices.empty()) {
                return false;
            }
            std::vector<size_t> shplemini_gates(shplemini.squeeze_gate_indices.begin(),
                                                shplemini.squeeze_gate_indices.end());
            auto rho =
                recursion_helpers::validate_challenges_generation<bb::fr>(builder,
                                                                          analyzer,
                                                                          shplemini_gates[0],
                                                                          ShpleminiVerification::RHO_ARITHMETIC,
                                                                          ShpleminiVerification::RHO_POSEIDON2_EXT,
                                                                          ShpleminiVerification::RHO_POSEIDON2_INT);
            if (!rho.is_valid) {
                return false;
            }

            const size_t gate_to_corrupt = find_first_hashable_gate_in_range(
                builder,
                rho.arithmetic_gate_start_idx,
                rho.arithmetic_gate_start_idx + ShpleminiVerification::RHO_ARITHMETIC.gate_count);
            if (gate_to_corrupt >= rho.arithmetic_gate_start_idx + ShpleminiVerification::RHO_ARITHMETIC.gate_count) {
                return false;
            }

            builder.blocks.arithmetic.q_c().set(gate_to_corrupt,
                                                builder.blocks.arithmetic.q_c()[gate_to_corrupt] + bb::fr::one());
            return constraint.proof_type == PROOF_TYPE::CHONK && !proof_body_witnesses.empty();
        });
}

// ============================================================================
// BoomerangPaddingIndicatorArrayTest — padding array + gate challenges fingerprints
// ============================================================================

class BoomerangPaddingIndicatorArrayTest : public BoomerangRecursionTests {};

TEST_F(BoomerangPaddingIndicatorArrayTest, PaddingIndicatorArrayAnalysis)
{
    info("");
    info("=== PaddingIndicatorArrayFingerprintRegression ===");

    auto vc = setup_verifier_components(0);
    Builder& builder = vc.builder();
    auto snap = [&]() { return recursion_helpers::BlockSnapshot::capture(builder); };
    namespace PIA = PaddingIndicatorArrayValidation;

    run_oink_verifier_step(vc);

    if constexpr (RecursiveFlavor::HasZK && RecursiveFlavor::USE_PADDING) {
        auto vk_ptr = vc.verifier_instance->get_vk();
        auto before_pia = snap();
        [[maybe_unused]] auto padding_indicator_array =
            stdlib::compute_padding_indicator_array<Curve, RecursiveFlavor::VIRTUAL_LOG_N>(vk_ptr->log_circuit_size);
        expect_stage_matches_fingerprints(
            builder,
            before_pia,
            snap(),
            { { BLOCK_INDEX_ARITHMETIC, &PIA::COMPUTE_PADDING_INDICATOR_ARRAY_ARITHMETIC } },
            "PaddingIndicatorArray:compute_padding_indicator_array");
    }

    auto before_gate_challenges = snap();
    vc.verifier_instance->gate_challenges =
        vc.transcript->template get_dyadic_powers_of_challenge<FF>("Sumcheck:gate_challenge", vc.log_n);
    expect_stage_matches_fingerprints(
        builder,
        before_gate_challenges,
        snap(),
        { { BLOCK_INDEX_ARITHMETIC, &PIA::GATE_CHALLENGE_DYADIC_POWERS_ARITHMETIC },
          { BLOCK_INDEX_POSEIDON2_EXT, &PIA::GATE_CHALLENGE_DYADIC_POWERS_POSEIDON2_EXT },
          { BLOCK_INDEX_POSEIDON2_INT, &PIA::GATE_CHALLENGE_DYADIC_POWERS_POSEIDON2_INT } },
        "PaddingIndicatorArray:gate_challenges");

    info("=== PaddingIndicatorArrayFingerprintRegression COMPLETE ===");
}

TEST_F(BoomerangPaddingIndicatorArrayTest, ValidatePaddingIndicatorArray)
{
    auto vc = setup_verifier_components(0);
    Builder& builder = vc.builder();

    run_oink_verifier_step(vc);
    run_padding_indicator_array_step(vc);

    auto inputs = make_oink_validation_inputs(vc);
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);

    auto result = recursion_helpers::validate_compute_padding_array_step<bb::fr>(builder, analyzer, inputs.constraint);
    EXPECT_TRUE(result.valid);
}

TEST_F(BoomerangPaddingIndicatorArrayTest, ValidatePaddingIndicatorArrayDetectsMissingRangeConstraint)
{
    auto vc = setup_verifier_components(0);
    Builder& builder = vc.builder();

    run_oink_verifier_step(vc);
    run_padding_indicator_array_step(vc);

    auto inputs = make_oink_validation_inputs(vc);

    // First pass: locate suffix[0]'s gate so we know the start_gate.
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
    auto result = recursion_helpers::validate_compute_padding_array_step<bb::fr>(builder, analyzer, inputs.constraint);
    ASSERT_TRUE(result.valid);

    // Corrupt: break the union-find link between suffix[0] and zero_idx.
    // suffix[0] is the output wire of the gate at start_gate + 28 (last suffix product gate).
    // Window layout: 14 prefix [0..13] + 15 suffix [14..28] + 14 Lagrange [29..42] + 15 adds [43..57].
    constexpr size_t SUFFIX_0_GATE_OFFSET = 28;
    auto& ab = builder.blocks.arithmetic;
    uint32_t suffix_0_wire = ab.w_o()[result.start_gate + SUFFIX_0_GATE_OFFSET];

    // Point suffix_0's real variable to a fresh non-zero variable, severing the zero alias.
    uint32_t dummy_idx = builder.add_variable(bb::fr(42));
    builder.real_variable_index[builder.real_variable_index[suffix_0_wire]] = dummy_idx;
    // Also update suffix_0_wire itself in case its real_variable_index points directly to itself.
    builder.real_variable_index[suffix_0_wire] = dummy_idx;

    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer2(builder, false);
    auto result2 =
        recursion_helpers::validate_compute_padding_array_step<bb::fr>(builder, analyzer2, inputs.constraint);
    EXPECT_FALSE(result2.valid);
}
