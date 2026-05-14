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
#include <fstream>
#include <gtest/gtest.h>
#include <random>

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

// Allocate mock VK and proof witnesses in a fresh Builder, wire up VKAndHash,
// VerifierInstance, and Transcript (proof loaded).  Does NOT call any verifier
// step — the caller drives step-by-step execution.
static VerifierComponents setup_verifier_components(size_t num_acir_pub_inputs = 0)
{
    const size_t dyadic_size = 1 << MegaZKFlavor::VIRTUAL_LOG_N;
    const size_t log_n = static_cast<size_t>(MegaZKFlavor::VIRTUAL_LOG_N);

    // Native mock objects
    auto native_vk = create_mock_honk_vk<MegaZKFlavor, IO>(dyadic_size, num_acir_pub_inputs);
    auto native_proof = create_mock_honk_proof<MegaZKFlavor, IO>(num_acir_pub_inputs);

    // Heap-allocate so field_t context pointers (&builder) remain valid after return
    auto builder_ptr = std::make_unique<Builder>();
    Builder& builder = *builder_ptr;

    // ── VK witnesses ─────────────────────────────────────────────────────────
    auto native_vk_fields = native_vk->to_field_elements();
    std::vector<uint32_t> key_indices;
    key_indices.reserve(native_vk_fields.size());
    for (const auto& f : native_vk_fields) {
        key_indices.push_back(builder.add_variable(f));
    }
    auto key_fields = fields_from_witnesses(builder, key_indices);
    auto recursive_vk = std::make_shared<RecursiveVK>(key_fields);

    // ── VK hash ───────────────────────────────────────────────────────────────
    auto native_hash = native_vk->hash();
    uint32_t hash_idx = builder.add_variable(native_hash);
    auto vk_hash_ct = field_ct::from_witness_index(&builder, hash_idx);
    auto vk_and_hash = std::make_shared<VKAndHash>(recursive_vk, vk_hash_ct);

    // ── Proof witnesses ───────────────────────────────────────────────────────
    StdlibProof stdlib_proof(builder, native_proof);

    // ── Transcript ────────────────────────────────────────────────────────────
    auto transcript = std::make_shared<Transcript>();
    transcript->load_proof(stdlib_proof);

    // ── VerifierInstance ─────────────────────────────────────────────────────
    auto verifier_instance = std::make_shared<VerifierInst>(vk_and_hash);

    // Derive num_public_inputs from proof size
    const size_t num_public_inputs =
        ProofLength::Honk<RecursiveFlavor>::derive_num_public_inputs(native_proof.size(), log_n);

    VerifierComponents vc;
    vc.builder_ptr = std::move(builder_ptr);
    vc.vk_and_hash = vk_and_hash;
    vc.transcript = transcript;
    vc.verifier_instance = verifier_instance;
    vc.mega_stdlib_proof = std::move(stdlib_proof);
    vc.num_public_inputs = num_public_inputs;
    vc.log_n = log_n;
    vc.key_indices = key_indices;
    vc.key_hash_idx = hash_idx;
    return vc;
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

// Print per-block deltas with FunctionFingerprint info
static void print_function_all_blocks(const std::string& fn_name,
                                      Builder& bld,
                                      const recursion_helpers::BlockSnapshot& before,
                                      const recursion_helpers::BlockSnapshot& after)
{
    auto deltas = recursion_helpers::compute_block_deltas(before, after);
    if (deltas.empty()) {
        return;
    }
    info("  [", fn_name, "]");
    for (const auto& d : deltas) {
        size_t bh = block_hash(bld, d.block_index, before.sizes[d.block_index], after.sizes[d.block_index]);
        info("    block[", d.block_index, "] (", d.block_name, "): +", d.delta, " hash=0x", std::hex, bh, std::dec);
    }
}

static void write_function_block_data(std::ofstream& out,
                                      const std::string& fn_name,
                                      Builder& bld,
                                      const recursion_helpers::BlockSnapshot& before,
                                      const recursion_helpers::BlockSnapshot& after)
{
    out << fn_name << "\n";

    auto deltas = recursion_helpers::compute_block_deltas(before, after);
    for (const auto& d : deltas) {
        const size_t start = before.sizes[d.block_index];
        const size_t end = after.sizes[d.block_index];
        const size_t fingerprint_end = std::min(start + static_cast<size_t>(20), end);
        const size_t fingerprint = block_hash(bld, d.block_index, start, fingerprint_end);
        const size_t full_hash = block_hash(bld, d.block_index, start, end);

        out << "  block[" << d.block_index << "] " << d.block_name << " gates=" << d.delta << " fingerprint20=0x"
            << std::hex << fingerprint << " full_hash=0x" << full_hash << std::dec << "\n";
    }
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
    auto& arith = builder.blocks.arithmetic;
    bool is_fix_witness_pattern = (arith.q_arith()[gate_idx] == bb::fr::one()) &&
                                  (arith.q_1()[gate_idx] == bb::fr::one()) && arith.q_2()[gate_idx].is_zero() &&
                                  arith.q_4()[gate_idx].is_zero() && !arith.q_c()[gate_idx].is_zero();
    if (!is_fix_witness_pattern) {
        return false;
    }

    uint32_t real_w_l = builder.real_variable_index[arith.w_l()[gate_idx]];
    for (const auto& pair : builder.constant_variable_indices) {
        if (pair.second == real_w_l) {
            return true;
        }
    }
    return false;
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

} // anonymous namespace

// ============================================================================
// Test fixture
// ============================================================================
class BoomerangRecursionTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

class BoomerangShpleminiTests : public BoomerangRecursionTests {};

class BoomerangKZGStepTests : public BoomerangRecursionTests {};

TEST_F(BoomerangShpleminiTests, ShpleminiComputeBatchOpeningClaimBlockAnalysis)
{
    info("");
    info("=== ShpleminiComputeBatchOpeningClaimBlockAnalysis ===");

    auto vc = setup_verifier_components(0);
    Builder& builder = vc.builder();
    auto snap = [&]() { return recursion_helpers::BlockSnapshot::capture(builder); };
    auto write_stage =
        [&](std::ofstream& out, const std::string& stage_name, const recursion_helpers::BlockSnapshot& before) {
            write_function_block_data(out, stage_name, builder, before, snap());
        };

    run_oink_verifier_step(vc);
    std::vector<FF> padding_indicator_array = run_padding_indicator_array_step(vc);
    SumcheckStepOutput sumcheck_step = run_sumcheck_step(vc, padding_indicator_array);

    const std::string output_path =
        "/mnt/user-data/daniel/aztec-packages/barretenberg/cpp/build-debug/shplemini_functions_data.txt";
    std::ofstream out(output_path);
    ASSERT_TRUE(out.is_open()) << "Failed to open " << output_path;

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
    write_stage(out, "Shplemini:rho", before_rho);

    auto before_fold_commitments = snap();
    const std::vector<Commitment> fold_commitments = GeminiVerifier::get_fold_commitments(virtual_log_n, vc.transcript);
    write_stage(out, "Shplemini:Gemini_fold_commitments", before_fold_commitments);

    auto before_gemini_r = snap();
    const FF gemini_evaluation_challenge = vc.transcript->template get_challenge<FF>("Gemini:r");
    write_stage(out, "Shplemini:Gemini_r", before_gemini_r);

    auto before_fold_neg_evaluations = snap();
    const std::vector<FF> gemini_fold_neg_evaluations =
        GeminiVerifier::get_gemini_evaluations(virtual_log_n, vc.transcript);
    write_stage(out, "Shplemini:Gemini_fold_neg_evaluations", before_fold_neg_evaluations);

    FF p_pos = FF(0);
    FF p_neg = FF(0);
    if (claim_batcher.interleaved) {
        auto before_interleaved_evaluations = snap();
        p_pos = vc.transcript->template receive_from_prover<FF>("Gemini:P_pos");
        p_neg = vc.transcript->template receive_from_prover<FF>("Gemini:P_neg");
        write_stage(out, "Shplemini:Gemini_interleaved_evaluations", before_interleaved_evaluations);
    }

    auto before_gemini_eval_powers = snap();
    const std::vector<FF> gemini_eval_challenge_powers =
        gemini::powers_of_evaluation_challenge(gemini_evaluation_challenge, virtual_log_n);
    write_stage(out, "Shplemini:Gemini_evaluation_challenge_powers", before_gemini_eval_powers);

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
        write_stage(out, "Shplemini:Libra_evaluations", before_libra_evaluations);
    }

    auto before_shplonk_nu = snap();
    const FF shplonk_batching_challenge = vc.transcript->template get_challenge<FF>("Shplonk:nu");
    write_stage(out, "Shplemini:Shplonk_nu", before_shplonk_nu);

    auto before_shplonk_batching_powers = snap();
    const std::vector<FF> shplonk_batching_challenge_powers = compute_shplonk_batching_challenge_powers(
        shplonk_batching_challenge, virtual_log_n, RecursiveFlavor::HasZK, committed_sumcheck);
    write_stage(out, "Shplemini:Shplonk_batching_challenge_powers", before_shplonk_batching_powers);

    auto before_q_commitment = snap();
    const auto q_commitment = vc.transcript->template receive_from_prover<Commitment>("Shplonk:Q");
    write_stage(out, "Shplemini:Shplonk_Q", before_q_commitment);

    std::vector<Commitment> batch_mul_commitments{ q_commitment };

    auto before_shplonk_z = snap();
    const FF shplonk_evaluation_challenge = vc.transcript->template get_challenge<FF>("Shplonk:z");
    write_stage(out, "Shplemini:Shplonk_z", before_shplonk_z);

    FF constant_term_accumulator = FF(0);
    std::vector<FF> scalars;
    scalars.emplace_back(FF(1));

    auto before_inverse_denominators = snap();
    const std::vector<FF> inverse_vanishing_evals = ShplonkVerifier::compute_inverted_gemini_denominators(
        shplonk_evaluation_challenge, gemini_eval_challenge_powers);
    write_stage(out, "Shplemini:Shplonk_inverse_gemini_denominators", before_inverse_denominators);

    auto before_claim_batcher_scalars = snap();
    claim_batcher.compute_scalars_for_each_batch(
        inverse_vanishing_evals, shplonk_batching_challenge, gemini_evaluation_challenge);
    write_stage(out, "Shplemini:ClaimBatcher_compute_scalars", before_claim_batcher_scalars);

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
    write_stage(out, "Shplemini:ClaimBatcher_update_batch_mul_inputs", before_batcher_update);

    auto before_fold_pos_evaluations = snap();
    const std::vector<FF> gemini_fold_pos_evaluations =
        GeminiVerifier::compute_fold_pos_evaluations(padding_indicator_array,
                                                     batched_evaluation,
                                                     sumcheck_step.sumcheck_output.challenge,
                                                     gemini_eval_challenge_powers,
                                                     gemini_fold_neg_evaluations,
                                                     p_neg);
    write_stage(out, "Shplemini:Gemini_fold_pos_evaluations", before_fold_pos_evaluations);

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
    write_stage(out, "Shplemini:batch_gemini_claims_received_from_prover", before_batch_gemini_claims);

    auto before_a0_constant_terms = snap();
    const FF& full_a_0_pos = gemini_fold_pos_evaluations[0];
    const FF a_0_pos = full_a_0_pos - p_pos;
    constant_term_accumulator += a_0_pos * inverse_vanishing_evals[0];
    constant_term_accumulator +=
        gemini_fold_neg_evaluations[0] * shplonk_batching_challenge * inverse_vanishing_evals[1];
    write_stage(out, "Shplemini:A0_constant_terms", before_a0_constant_terms);

    auto before_remove_repeated = snap();
    Shplemini::remove_repeated_commitments(
        batch_mul_commitments, scalars, RecursiveFlavor::REPEATED_COMMITMENTS, RecursiveFlavor::HasZK);
    write_stage(out, "Shplemini:remove_repeated_commitments", before_remove_repeated);

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
        write_stage(out, "Shplemini:add_zk_data", before_add_zk_data);

        auto before_libra_consistency = snap();
        consistency_checked = SmallSubgroupIPAVerifier<Curve>::check_libra_evaluations_consistency(
            libra_evaluations,
            gemini_evaluation_challenge,
            sumcheck_step.sumcheck_output.challenge,
            sumcheck_step.sumcheck_output.claimed_libra_evaluation);
        write_stage(out, "Shplemini:check_libra_evaluations_consistency", before_libra_consistency);
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
    write_stage(out, "Shplemini:finalize_batch_opening_claim", before_finalize_claim);

    EXPECT_EQ(output.batch_opening_claim.commitments.size(), output.batch_opening_claim.scalars.size());
    info("Wrote Shplemini function data to ", output_path);
    info("=== ShpleminiComputeBatchOpeningClaimBlockAnalysis COMPLETE ===");
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
    EXPECT_TRUE(KZGVerification::validate_kzg(builder, all_squeezes, setup.consumed_squeezes_before_kzg));
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

    EXPECT_FALSE(KZGVerification::validate_kzg(builder, all_squeezes, setup.consumed_squeezes_before_kzg));
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
    EXPECT_FALSE(KZGVerification::validate_kzg(builder, all_squeezes, setup.consumed_squeezes_before_kzg));
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
// ShowBlockUsageByFunction
//
// Builds the MegaZK circuit step-by-step via manual replication of
// reduce_to_pairing_check, capturing block snapshots at each step.
// Prints only functions that add gates to poseidon2 blocks.
// ============================================================================
TEST_F(BoomerangShpleminiTests, ShowBlockUsageByFunction)
{
    info("");
    info("=== ShowBlockUsageByFunction (pos2-only filter) ===");

    auto vc = setup_verifier_components(0);
    Builder& builder = vc.builder();

    // ── Helper: snapshot and optional pos2-filtered print ─────────────────────
    auto snap = [&]() { return recursion_helpers::BlockSnapshot::capture(builder); };
    auto print_if_pos2 = [&](const std::string& name,
                             const recursion_helpers::BlockSnapshot& before,
                             const recursion_helpers::BlockSnapshot& after) {
        const size_t pos2_ext_delta = block_delta(builder, before, after, builder.blocks.poseidon2_external);
        const size_t pos2_int_delta = block_delta(builder, before, after, builder.blocks.poseidon2_internal);
        if (pos2_ext_delta > 0 || pos2_int_delta > 0) {
            print_function_all_blocks(name, builder, before, after);
        }
    };

    // ── step0: OinkVerifier ───────────────────────────────────────────────────
    auto s0 = snap();
    run_oink_verifier_step(vc);
    auto s1 = snap();
    print_if_pos2("step0_oink", s0, s1);
    recursion_helpers::print_block_deltas("step0_oink", s0, s1);

    // ── step1: padding_indicator_array ────────────────────────────────────────
    auto s1b = snap();
    std::vector<FF> padding_indicator_array = run_padding_indicator_array_step(vc);
    auto s2 = snap();
    print_if_pos2("step1_padding+challenges", s1b, s2);
    recursion_helpers::print_block_deltas("step1_padding+challenges", s1b, s2);

    // ── step3: Sumcheck ───────────────────────────────────────────────────────
    auto s3a = snap();
    SumcheckStepOutput sumcheck_step = run_sumcheck_step(vc, padding_indicator_array);
    auto s3b = snap();
    print_if_pos2("step3_sumcheck", s3a, s3b);
    recursion_helpers::print_block_deltas("step3_sumcheck", s3a, s3b);

    // ── step4: Shplemini::compute_batch_opening_claim ─────────────────────────
    auto s4a = snap();
    auto shplemini_output =
        run_shplemini_step(vc, padding_indicator_array, sumcheck_step.sumcheck_output, sumcheck_step.libra_commitments);
    auto s4b = snap();
    print_if_pos2("step4_shplemini", s4a, s4b);
    recursion_helpers::print_block_deltas("step4_shplemini", s4a, s4b);

    // ── step5: KZG ────────────────────────────────────────────────────────────
    auto s5a = snap();
    run_kzg_step(vc, shplemini_output);
    auto s5b = snap();
    print_if_pos2("step5_kzg", s5a, s5b);
    recursion_helpers::print_block_deltas("step5_kzg", s5a, s5b);

    info("");
    info("=== ShowBlockUsageByFunction COMPLETE ===");
}

// ============================================================================
// DecomposeKZG
//
// Builds the circuit up to the KZG step, then decomposes
// reduce_verify_batch_opening_claim into its sub-phases with per-block counts.
// Also extracts the masking_challenge witness index.
// ============================================================================
TEST_F(BoomerangKZGStepTests, DecomposeKZG)
{
    info("");
    info("=== DecomposeKZG ===");

    auto vc = setup_verifier_components(0);
    Builder& builder = vc.builder();

    // Run steps 0-4 to get the batch opening claim
    // step0: Oink
    run_oink_verifier_step(vc);

    // step1: padding + gate_challenges
    std::vector<FF> padding_indicator_array = run_padding_indicator_array_step(vc);

    using Commitment = RecursiveFlavor::Commitment;

    // step3: Sumcheck
    SumcheckStepOutput sumcheck_step = run_sumcheck_step(vc, padding_indicator_array);

    // step4: Shplemini
    auto shplemini_output =
        run_shplemini_step(vc, padding_indicator_array, sumcheck_step.sumcheck_output, sumcheck_step.libra_commitments);

    // ── Now decompose KZG step5 ───────────────────────────────────────────────
    auto snap = [&]() { return recursion_helpers::BlockSnapshot::capture(builder); };

    info("");
    info("--- KZG::reduce_verify_batch_opening_claim sub-phases ---");
    info("  Commitments in batch claim: ", shplemini_output.batch_opening_claim.commitments.size());
    info("  Scalars in batch claim:     ", shplemini_output.batch_opening_claim.scalars.size());

    // Sub-phase: W_receive (transcript->receive_from_prover("KZG:W"))
    auto s_before_W = snap();
    auto quotient_commitment = vc.transcript->template receive_from_prover<Commitment>("KZG:W");
    auto s_after_W = snap();
    recursion_helpers::print_block_deltas("KZG:W_receive", s_before_W, s_after_W);

    // Sub-phase: masking_challenge (transcript->get_challenge("KZG:masking_challenge"))
    auto s_before_mask = snap();
    FF masking_challenge = vc.transcript->template get_challenge<FF>("KZG:masking_challenge");
    auto s_after_mask = snap();
    recursion_helpers::print_block_deltas("KZG:masking_challenge", s_before_mask, s_after_mask);

    // Extract masking_challenge real witness index
    uint32_t masking_challenge_real = UINT32_MAX;
    {
        auto& arith = builder.blocks.arithmetic;
        // masking_challenge comes from a transcript squeeze → bigfield-limb combine gate pattern
        // q_arith=1, q_1=1, q_2=2^127, q_3=-1, q_4=1, q_m=0
        const bb::fr two_127 = bb::fr(2).pow(127);
        const size_t arith_start = block_snapshot_size(builder, s_before_mask, arith);
        for (size_t g = arith_start; g < arith.size(); ++g) {
            if (arith.q_arith()[g] == bb::fr::one() && arith.q_1()[g] == bb::fr::one() && arith.q_2()[g] == two_127 &&
                arith.q_3()[g] == -bb::fr::one() && arith.q_4()[g] == bb::fr::one() && arith.q_m()[g].is_zero()) {
                masking_challenge_real = builder.real_variable_index[arith.w_l()[g]];
                break;
            }
        }
    }
    info("  masking_challenge_real idx: ", masking_challenge_real);

    // Sub-phase: batch_mul
    // Add W quotient_commitment to the batch claim inputs
    shplemini_output.batch_opening_claim.commitments.push_back(quotient_commitment);
    // z (Shplonk evaluation challenge) scalar — but we need it from transcript state
    // For decomposition, just compute the full batch_mul
    auto s_before_batchmul = snap();
    using Group = Curve::Group;
    [[maybe_unused]] Group P_0 = Group::batch_mul(shplemini_output.batch_opening_claim.commitments,
                                                  shplemini_output.batch_opening_claim.scalars,
                                                  static_cast<size_t>(RecursiveFlavor::FINAL_PCS_MSM_SIZE(vc.log_n)),
                                                  /*with_edgecases=*/false,
                                                  /*masking_scalar=*/masking_challenge);
    auto s_after_batchmul = snap();
    recursion_helpers::print_block_deltas("KZG:batch_mul", s_before_batchmul, s_after_batchmul);

    // Sub-phase: P_1 = -W (negate quotient_commitment)
    auto s_before_negate = snap();
    Group P_1 = -quotient_commitment;
    (void)P_1;
    auto s_after_negate = snap();
    recursion_helpers::print_block_deltas("KZG:negate_W", s_before_negate, s_after_negate);

    // ── Summary ───────────────────────────────────────────────────────────────
    info("");
    info("=== DecomposeKZG COMPLETE ===");
    info("  W_receive arith gates:    ", block_delta(builder, s_before_W, s_after_W, builder.blocks.arithmetic));
    info("  W_receive nnf gates:      ", block_delta(builder, s_before_W, s_after_W, builder.blocks.nnf));
    info("  masking_squeeze arith:    ", block_delta(builder, s_before_mask, s_after_mask, builder.blocks.arithmetic));
    info("  masking_squeeze pos2_ext: ",
         block_delta(builder, s_before_mask, s_after_mask, builder.blocks.poseidon2_external));
    info("  masking_squeeze pos2_int: ",
         block_delta(builder, s_before_mask, s_after_mask, builder.blocks.poseidon2_internal));
    info("  batch_mul arith gates:    ",
         block_delta(builder, s_before_batchmul, s_after_batchmul, builder.blocks.arithmetic));
    info("  batch_mul nnf gates:      ", block_delta(builder, s_before_batchmul, s_after_batchmul, builder.blocks.nnf));
    info("  batch_mul memory gates:   ",
         block_delta(builder, s_before_batchmul, s_after_batchmul, builder.blocks.memory));
    info("  negate_W arith gates:     ",
         block_delta(builder, s_before_negate, s_after_negate, builder.blocks.arithmetic));
}

// ============================================================================
// KZGFingerprintStability
//
// Runs 4 different num_public_inputs configurations and computes per-block
// hashes for the KZG step. Identifies which block hashes are stable (config
// independent) and which are not.
// ============================================================================
TEST_F(BoomerangKZGStepTests, KZGFingerprintStability)
{
    info("");
    info("=== KZGFingerprintStability ===");

    const std::vector<size_t> pub_input_configs = { 0, 10, 50, 200 };

    struct KZGHashes {
        size_t arith_hash = 0;
        size_t nnf_hash = 0;
        size_t memory_hash = 0;
        size_t pos2ext_hash = 0;
        size_t pos2int_hash = 0;
        size_t arith_count = 0;
    };

    std::vector<KZGHashes> results;
    results.reserve(pub_input_configs.size());

    for (size_t num_pub : pub_input_configs) {
        auto vc = setup_verifier_components(num_pub);
        Builder& builder = vc.builder();

        // Run steps 0-4
        run_oink_verifier_step(vc);
        std::vector<FF> pia = run_padding_indicator_array_step(vc);
        SumcheckStepOutput sumcheck_step = run_sumcheck_step(vc, pia);
        auto shplemini_output =
            run_shplemini_step(vc, pia, sumcheck_step.sumcheck_output, sumcheck_step.libra_commitments);

        // Capture snapshot before KZG
        auto s_before = recursion_helpers::BlockSnapshot::capture(builder);

        // Run KZG
        run_kzg_step(vc, shplemini_output);

        auto s_after = recursion_helpers::BlockSnapshot::capture(builder);

        KZGHashes h;
        const size_t arith_start = block_snapshot_size(builder, s_before, builder.blocks.arithmetic);
        const size_t arith_end = block_snapshot_size(builder, s_after, builder.blocks.arithmetic);
        if (arith_end > arith_start) {
            h.arith_count = arith_end - arith_start;
            h.arith_hash =
                sha256_helpers::compute_selector_hash(0, builder.blocks.arithmetic, arith_start, arith_end - 1);
        }
        const size_t nnf_start = block_snapshot_size(builder, s_before, builder.blocks.nnf);
        const size_t nnf_end = block_snapshot_size(builder, s_after, builder.blocks.nnf);
        if (nnf_end > nnf_start) {
            h.nnf_hash = sha256_helpers::compute_selector_hash(0, builder.blocks.nnf, nnf_start, nnf_end - 1);
        }
        const size_t memory_start = block_snapshot_size(builder, s_before, builder.blocks.memory);
        const size_t memory_end = block_snapshot_size(builder, s_after, builder.blocks.memory);
        if (memory_end > memory_start) {
            h.memory_hash =
                sha256_helpers::compute_selector_hash(0, builder.blocks.memory, memory_start, memory_end - 1);
        }
        const size_t pos2_ext_start = block_snapshot_size(builder, s_before, builder.blocks.poseidon2_external);
        const size_t pos2_ext_end = block_snapshot_size(builder, s_after, builder.blocks.poseidon2_external);
        if (pos2_ext_end > pos2_ext_start) {
            h.pos2ext_hash = sha256_helpers::compute_selector_hash(
                0, builder.blocks.poseidon2_external, pos2_ext_start, pos2_ext_end - 1);
        }
        const size_t pos2_int_start = block_snapshot_size(builder, s_before, builder.blocks.poseidon2_internal);
        const size_t pos2_int_end = block_snapshot_size(builder, s_after, builder.blocks.poseidon2_internal);
        if (pos2_int_end > pos2_int_start) {
            h.pos2int_hash = sha256_helpers::compute_selector_hash(
                0, builder.blocks.poseidon2_internal, pos2_int_start, pos2_int_end - 1);
        }
        results.push_back(h);

        info("  pub=",
             num_pub,
             " arith=",
             h.arith_count,
             " arith_hash=0x",
             std::hex,
             h.arith_hash,
             " nnf_hash=0x",
             h.nnf_hash,
             " mem_hash=0x",
             h.memory_hash,
             " p2ext=0x",
             h.pos2ext_hash,
             " p2int=0x",
             h.pos2int_hash,
             std::dec);
    }

    // Report stability
    info("");
    info("Stability analysis:");
    auto stable = [&](auto KZGHashes::* field, const char* name) {
        bool ok = true;
        for (size_t i = 1; i < results.size(); i++) {
            if (results[i].*field != results[0].*field) {
                ok = false;
                break;
            }
        }
        info("  ", name, ": ", ok ? "STABLE (0x" : "UNSTABLE (first=0x", std::hex, results[0].*field, ")", std::dec);
    };
    stable(&KZGHashes::arith_hash, "arith");
    stable(&KZGHashes::nnf_hash, "nnf");
    stable(&KZGHashes::memory_hash, "memory");
    stable(&KZGHashes::pos2ext_hash, "pos2_ext");
    stable(&KZGHashes::pos2int_hash, "pos2_int");

    info("=== KZGFingerprintStability COMPLETE ===");
}

// ============================================================================
// DumpMultiBlockFingerprints
//
// Builds the circuit step-by-step, capturing per-function per-block fingerprints
// for all major shplemini sub-functions and KZG sub-phases.
// Output can be used to hardcode MultiBlockFingerprint constants.
// ============================================================================
TEST_F(BoomerangKZGStepTests, DumpMultiBlockFingerprints)
{
    info("");
    info("=== DumpMultiBlockFingerprints ===");

    auto vc = setup_verifier_components(0);
    Builder& builder = vc.builder();

    auto snap = [&]() { return recursion_helpers::BlockSnapshot::capture(builder); };
    auto print_fp = [&](const std::string& fn_name,
                        const recursion_helpers::BlockSnapshot& before,
                        const recursion_helpers::BlockSnapshot& after) {
        print_function_all_blocks(fn_name, builder, before, after);
    };

    // ── step0: Oink ───────────────────────────────────────────────────────────
    auto s0 = snap();
    run_oink_verifier_step(vc);
    print_fp("step0_oink", s0, snap());

    // ── step1: padding+challenges ─────────────────────────────────────────────
    auto s1a = snap();
    std::vector<FF> pia = run_padding_indicator_array_step(vc);
    print_fp("step1_padding+challenges", s1a, snap());

    // ── step3: Sumcheck (per-round fingerprints) ──────────────────────────────
    using Commitment = RecursiveFlavor::Commitment;

    // For per-round breakdown we capture the full sumcheck as one block
    auto s3a = snap();
    SumcheckStepOutput sumcheck_step = run_sumcheck_step(vc, pia);
    print_fp("step3_sumcheck", s3a, snap());

    // ── step4: Shplemini (whole block as one) ─────────────────────────────────
    auto s4a = snap();
    auto shplemini_output = run_shplemini_step(vc, pia, sumcheck_step.sumcheck_output, sumcheck_step.libra_commitments);
    print_fp("step4_shplemini", s4a, snap());

    // ── step5: KZG sub-phases ─────────────────────────────────────────────────
    auto s5W_a = snap();
    auto W_commit = vc.transcript->template receive_from_prover<Commitment>("KZG:W");
    print_fp("step5_kzg_W_receive", s5W_a, snap());

    auto s5m_a = snap();
    FF masking_challenge = vc.transcript->template get_challenge<FF>("KZG:masking_challenge");
    print_fp("step5_kzg_masking_squeeze", s5m_a, snap());

    shplemini_output.batch_opening_claim.commitments.push_back(W_commit);
    shplemini_output.batch_opening_claim.scalars.push_back(shplemini_output.batch_opening_claim.evaluation_point);
    auto s5bm_a = snap();
    using Group = Curve::Group;
    [[maybe_unused]] Group P_0_kfp = Group::batch_mul(shplemini_output.batch_opening_claim.commitments,
                                                      shplemini_output.batch_opening_claim.scalars,
                                                      /*max_num_bits=*/0,
                                                      /*with_edgecases=*/true,
                                                      /*masking_scalar=*/masking_challenge);
    print_fp("step5_kzg_batch_mul", s5bm_a, snap());

    auto s5neg_a = snap();
    Group P_1 = -W_commit;
    (void)P_1;
    print_fp("step5_kzg_negate_W", s5neg_a, snap());

    info("");
    info("=== DumpMultiBlockFingerprints COMPLETE ===");
}

// ============================================================================
// KZGBatchMulChunkDump
//
// Builds the circuit up to batch_mul, then dumps 100-gate chunk hashes for
// the arithmetic block range corresponding to batch_mul.  Writes files to
// circuit_dumps/ for offline diffing across pub_input configs.
// ============================================================================
TEST_F(BoomerangKZGStepTests, KZGBatchMulChunkDump)
{
    info("");
    info("=== KZGBatchMulChunkDump ===");

    const std::vector<size_t> pub_input_configs = { 0, 10 };
    const size_t CHUNK_SIZE = 100;

    for (size_t num_pub : pub_input_configs) {
        auto vc = setup_verifier_components(num_pub);
        Builder& builder = vc.builder();

        // Run steps 0-4
        run_oink_verifier_step(vc);
        std::vector<FF> pia = run_padding_indicator_array_step(vc);
        SumcheckStepOutput sumcheck_step = run_sumcheck_step(vc, pia);
        auto shplemini_output =
            run_shplemini_step(vc, pia, sumcheck_step.sumcheck_output, sumcheck_step.libra_commitments);

        // Receive W and masking_challenge
        using Commitment = RecursiveFlavor::Commitment;
        auto W_commit = vc.transcript->template receive_from_prover<Commitment>("KZG:W");
        FF masking_challenge = vc.transcript->template get_challenge<FF>("KZG:masking_challenge");

        // Capture arith snapshot before batch_mul
        size_t arith_start = builder.blocks.arithmetic.size();

        shplemini_output.batch_opening_claim.commitments.push_back(W_commit);
        shplemini_output.batch_opening_claim.scalars.push_back(shplemini_output.batch_opening_claim.evaluation_point);
        using Group = Curve::Group;
        [[maybe_unused]] Group P_0_kbm = Group::batch_mul(shplemini_output.batch_opening_claim.commitments,
                                                          shplemini_output.batch_opening_claim.scalars,
                                                          /*max_num_bits=*/0,
                                                          /*with_edgecases=*/true,
                                                          /*masking_scalar=*/masking_challenge);

        size_t arith_end = builder.blocks.arithmetic.size();
        size_t batch_mul_gates = arith_end - arith_start;

        // Dump chunk hashes to file
        std::string filename = "circuit_dumps/batch_mul_pub" + std::to_string(num_pub) + "_hashes.txt";
        std::ofstream out(filename);
        const size_t num_chunks = (batch_mul_gates + CHUNK_SIZE - 1) / CHUNK_SIZE;
        out << "# batch_mul arith chunk hashes (pub=" << num_pub << " total_gates=" << batch_mul_gates << ")\n";

        for (size_t c = 0; c < num_chunks; c++) {
            size_t chunk_start = arith_start + c * CHUNK_SIZE;
            size_t chunk_end = std::min(chunk_start + CHUNK_SIZE, arith_end);
            size_t h = sha256_helpers::compute_selector_hash(0, builder.blocks.arithmetic, chunk_start, chunk_end - 1);
            out << "chunk" << c << " [" << chunk_start << "," << chunk_end << ")"
                << " hash=0x" << std::hex << h << std::dec << "\n";
        }
        out.close();

        info("  pub=", num_pub, ": batch_mul arith gates=", batch_mul_gates, " chunks=", num_chunks, " -> ", filename);
    }

    info("=== KZGBatchMulChunkDump COMPLETE ===");
}

// ============================================================================
// KZGReduceVerifyBatchOpeningClaimBlockAnalysis  (preserved stub)
// ============================================================================
TEST_F(BoomerangKZGStepTests, KZGReduceVerifyBatchOpeningClaimBlockAnalysis)
{
    info("");
    info("=== KZGReduceVerifyBatchOpeningClaimBlockAnalysis ===");

    auto vc = setup_verifier_components(0);
    Builder& builder = vc.builder();
    auto snap = [&]() { return recursion_helpers::BlockSnapshot::capture(builder); };

    run_oink_verifier_step(vc);
    std::vector<FF> pia = run_padding_indicator_array_step(vc);
    SumcheckStepOutput sumcheck_step = run_sumcheck_step(vc, pia);
    auto shplemini_output = run_shplemini_step(vc, pia, sumcheck_step.sumcheck_output, sumcheck_step.libra_commitments);

    const std::string output_path =
        "/mnt/user-data/daniel/aztec-packages/barretenberg/cpp/build-debug/kzg_functions_data.txt";
    std::ofstream out(output_path);
    ASSERT_TRUE(out.is_open()) << "Failed to open " << output_path;

    using Commitment = RecursiveFlavor::Commitment;
    using Group = Curve::Group;

    auto s_before_w = snap();
    auto quotient_commitment = vc.transcript->template receive_from_prover<Commitment>("KZG:W");
    auto s_after_w = snap();
    write_function_block_data(out, "KZG:W_receive", builder, s_before_w, s_after_w);

    auto s_before_masking_challenge = snap();
    FF masking_challenge = vc.transcript->template get_challenge<FF>("KZG:masking_challenge");
    auto s_after_masking_challenge = snap();
    write_function_block_data(
        out, "KZG:masking_challenge", builder, s_before_masking_challenge, s_after_masking_challenge);

    auto s_before_update_claim = snap();
    shplemini_output.batch_opening_claim.commitments.emplace_back(quotient_commitment);
    shplemini_output.batch_opening_claim.scalars.emplace_back(shplemini_output.batch_opening_claim.evaluation_point);
    auto s_after_update_claim = snap();
    write_function_block_data(
        out, "KZG:update_batch_opening_claim", builder, s_before_update_claim, s_after_update_claim);
    EXPECT_EQ(shplemini_output.batch_opening_claim.commitments.size(), RecursiveFlavor::FINAL_PCS_MSM_SIZE(vc.log_n));

    auto s_before_batch_mul = snap();
    [[maybe_unused]] Group p_0 = Group::batch_mul(shplemini_output.batch_opening_claim.commitments,
                                                  shplemini_output.batch_opening_claim.scalars,
                                                  /*max_num_bits=*/0,
                                                  /*with_edgecases=*/true,
                                                  /*masking_scalar=*/masking_challenge);
    auto s_after_batch_mul = snap();
    write_function_block_data(out, "KZG:batch_mul", builder, s_before_batch_mul, s_after_batch_mul);

    auto s_before_negate_w = snap();
    Group p_1 = -quotient_commitment;
    (void)p_1;
    auto s_after_negate_w = snap();
    write_function_block_data(out, "KZG:negate_W", builder, s_before_negate_w, s_after_negate_w);

    info("Wrote KZG function data to ", output_path);

    info("=== KZGReduceVerifyBatchOpeningClaimBlockAnalysis COMPLETE ===");
}

// ============================================================================
// Sumcheck analysis test suite
// ============================================================================
class BoomerangSumcheckTest : public BoomerangRecursionTests {};

TEST_F(BoomerangSumcheckTest, SumcheckVerifyAnalysis)
{
    info("");
    info("=== SumcheckVerifyAnalysis ===");

    auto vc = setup_verifier_components(0);
    Builder& builder = vc.builder();
    auto snap = [&]() { return recursion_helpers::BlockSnapshot::capture(builder); };
    auto write_stage = [&](std::ofstream& out_,
                           const std::string& stage_name,
                           const recursion_helpers::BlockSnapshot& before) {
        write_function_block_data(out_, stage_name, builder, before, snap());
    };

    run_oink_verifier_step(vc);
    std::vector<FF> padding_indicator_array = run_padding_indicator_array_step(vc);

    const std::string output_path =
        "/mnt/user-data/daniel/aztec-packages/barretenberg/cpp/build-debug/sumcheck_functions_data.txt";
    std::ofstream out(output_path);
    ASSERT_TRUE(out.is_open()) << "Failed to open " << output_path;

    using SumcheckRound = SumcheckVerifierRound<RecursiveFlavor>;
    using SumcheckRoundUnivariate = SumcheckRound::SumcheckRoundUnivariate;
    using GateSep = bb::GateSeparatorPolynomial<FF>;
    using SubrelationSeparators = std::array<FF, RecursiveFlavor::NUM_SUBRELATIONS - 1>;
    using AllValues = RecursiveFlavor::AllValues;
    using Commitment = RecursiveFlavor::Commitment;

    // Libra:concatenation_commitment (ZK pre-sumcheck receive)
    auto before_concat_comm = snap();
    vc.transcript->template receive_from_prover<Commitment>("Libra:concatenation_commitment");
    write_stage(out, "Sumcheck:Libra_concatenation_commitment", before_concat_comm);

    // ZK correction handler: Libra:Sum receive
    auto before_libra_sum = snap();
    FF libra_total_sum = vc.transcript->template receive_from_prover<FF>("Libra:Sum");
    write_stage(out, "Sumcheck:ZK_correction_handler_libra_sum_receive", before_libra_sum);

    // ZK correction handler: Libra:Challenge squeeze
    auto before_libra_challenge = snap();
    FF libra_challenge = vc.transcript->template get_challenge<FF>("Libra:Challenge");
    write_stage(out, "Sumcheck:ZK_correction_handler_libra_challenge", before_libra_challenge);

    // ZK correction handler: initialize_target_sum
    SumcheckRound round;
    auto before_init_target = snap();
    round.target_total_sum = libra_total_sum * libra_challenge;
    write_stage(out, "Sumcheck:ZK_correction_handler_initialize_target_sum", before_init_target);

    GateSep gate_separators(vc.verifier_instance->gate_challenges);

    std::vector<FF> multivariate_challenge;
    multivariate_challenge.reserve(vc.log_n);

    // 16 rounds: each broken into 5 sub-stages
    for (size_t round_idx = 0; round_idx < vc.log_n; round_idx++) {
        const FF& padding_indicator = padding_indicator_array[round_idx];
        const std::string sfx = "_" + std::to_string(round_idx);

        // 1. receive round univariate from transcript
        auto before_univariate = snap();
        auto round_univariate = vc.transcript->template receive_from_prover<SumcheckRoundUnivariate>(
            "Sumcheck:univariate_" + std::to_string(round_idx));
        write_stage(out, "Sumcheck:univariate_receive" + sfx, before_univariate);

        // 2. squeeze round challenge
        auto before_challenge = snap();
        FF round_challenge = vc.transcript->template get_challenge<FF>("Sumcheck:u_" + std::to_string(round_idx));
        multivariate_challenge.emplace_back(round_challenge);
        write_stage(out, "Sumcheck:u" + sfx, before_challenge);

        // 3. check_sum: assert target_total_sum == S(0) + S(1)
        auto before_check_sum = snap();
        round.check_sum(round_univariate, padding_indicator);
        write_stage(out, "Sumcheck:check_sum" + sfx, before_check_sum);

        // 4. compute_next_target_sum: target_total_sum = S(u_i)
        auto before_next_target = snap();
        round.compute_next_target_sum(round_univariate, round_challenge, padding_indicator);
        write_stage(out, "Sumcheck:compute_next_target_sum" + sfx, before_next_target);

        // 5. gate_separators.partially_evaluate
        auto before_gate_sep = snap();
        gate_separators.partially_evaluate(round_challenge, padding_indicator);
        write_stage(out, "Sumcheck:gate_separators_partially_evaluate" + sfx, before_gate_sep);
    }

    // Receive all claimed evaluations at the sumcheck challenge
    auto before_eval_receive = snap();
    constexpr size_t NUM_POLYNOMIALS = RecursiveFlavor::NUM_ALL_ENTITIES;
    auto transcript_evaluations =
        vc.transcript->template receive_from_prover<std::array<FF, NUM_POLYNOMIALS>>("Sumcheck:evaluations");
    AllValues purported_evaluations;
    for (auto [eval, transcript_eval] : zip_view(purported_evaluations.get_all(), transcript_evaluations)) {
        eval = transcript_eval;
    }
    write_stage(out, "Sumcheck:evaluations_receive", before_eval_receive);

    // Compute full Honk relation value at the claimed evaluations
    SubrelationSeparators alphas =
        bb::initialize_relation_separator<FF, RecursiveFlavor::NUM_SUBRELATIONS - 1>(vc.verifier_instance->alpha);
    auto before_full_relation = snap();
    FF full_honk_purported_value = round.compute_full_relation_purported_value(
        purported_evaluations, vc.verifier_instance->relation_parameters, gate_separators, alphas);
    write_stage(out, "Sumcheck:compute_full_relation_purported_value", before_full_relation);

    // ZK correction: multiply by row-disabling polynomial evaluation
    auto before_row_disabling = snap();
    full_honk_purported_value *=
        bb::RowDisablingPolynomial<FF>::evaluate_at_challenge(multivariate_challenge, padding_indicator_array);
    write_stage(out, "Sumcheck:row_disabling_evaluate_at_challenge", before_row_disabling);

    // Receive Libra evaluation at the sumcheck challenge
    auto before_libra_eval = snap();
    FF libra_evaluation = vc.transcript->template receive_from_prover<FF>("Libra:claimed_evaluation");
    write_stage(out, "Sumcheck:Libra_claimed_evaluation_receive", before_libra_eval);

    // ZK correction: add libra contribution
    auto before_libra_correction = snap();
    full_honk_purported_value += libra_evaluation * libra_challenge;
    write_stage(out, "Sumcheck:libra_correction", before_libra_correction);

    // Final verification: assert computed value == target sum
    auto before_final_verify = snap();
    round.perform_final_verification(full_honk_purported_value);
    write_stage(out, "Sumcheck:perform_final_verification", before_final_verify);

    // Post-sumcheck ZK Libra commitments
    auto before_grand_sum = snap();
    vc.transcript->template receive_from_prover<Commitment>("Libra:grand_sum_commitment");
    write_stage(out, "Sumcheck:Libra_grand_sum_commitment", before_grand_sum);

    auto before_quotient = snap();
    vc.transcript->template receive_from_prover<Commitment>("Libra:quotient_commitment");
    write_stage(out, "Sumcheck:Libra_quotient_commitment", before_quotient);

    info("Wrote Sumcheck function data to ", output_path);
    info("=== SumcheckVerifyAnalysis COMPLETE ===");
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
    const std::set<size_t> consumed_before_sumcheck(squeezes_before_sumcheck.begin(),
                                                    squeezes_before_sumcheck.end());

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
        vc.transcript->template receive_from_prover<SumcheckRoundUnivariate>(
            "Sumcheck:univariate_" + std::to_string(round_idx));
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
    auto sc_gates = recursion_helpers::take_unclaimed_squeezes(all_squeezes, consumed,
                                                               recursion_helpers::NUM_SUMCHECK_SQUEEZES);
    ASSERT_EQ(sc_gates.size(), recursion_helpers::NUM_SUMCHECK_SQUEEZES);

    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);

    // Walk to round 5's check_sum start to find the gate to corrupt.
    auto prefix = SumcheckValidation::validate_sumcheck_prefix<bb::fr>(builder, analyzer, sc_gates[0]);
    ASSERT_TRUE(prefix.is_valid);
    size_t cursor = prefix.init_target_sum_arith_end;
    for (size_t r = 0; r < 5; ++r) {
        auto rd = SumcheckValidation::validate_sumcheck_round<bb::fr>(
            builder, analyzer, r, sc_gates[r + 1], cursor);
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
