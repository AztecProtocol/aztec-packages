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

using namespace bb;
using namespace acir_format;
using namespace cdg;

// ============================================================================
// Anonymous namespace: low-level helpers
// ============================================================================
namespace {

// Compute selector hash over an arithmetic block range, skipping fix_witness gates for
// constants (those produce spurious entries that vary with witness layout).
template <typename Builder>
size_t calculate_hash_arithmetic_block(Builder& builder, size_t start, size_t finish)
{
    auto& arith = builder.blocks.arithmetic;
    size_t hash = 0;

    for (size_t index = start; index < finish; ++index) {
        bool is_fix_witness_pattern = (arith.q_arith()[index] == bb::fr::one()) &&
                                      (arith.q_1()[index] == bb::fr::one()) && (arith.q_2()[index].is_zero()) &&
                                      (arith.q_4()[index].is_zero()) && (!arith.q_c()[index].is_zero());

        if (is_fix_witness_pattern) {
            uint32_t w_l_var = arith.w_l()[index];
            uint32_t real_w_l = builder.real_variable_index[w_l_var];

            bool is_constant = false;
            for (const auto& pair : builder.constant_variable_indices) {
                if (pair.second == real_w_l) {
                    is_constant = true;
                    break;
                }
            }
            if (is_constant) {
                continue;
            }
        }

        sha256_helpers::update_selector_hash(hash, arith, index);
    }

    return hash;
}

// ── Types shared across tests ─────────────────────────────────────────────────
using Builder        = UltraCircuitBuilder;
using RecursiveFlavor = MegaZKRecursiveFlavor_<Builder>;
using IO             = stdlib::recursion::honk::HidingKernelIO<Builder>;
using Curve          = RecursiveFlavor::Curve;
using FF             = RecursiveFlavor::FF;
using Shplemini      = ShpleminiVerifier_<Curve, RecursiveFlavor::HasZK>;
using ClaimBatcher   = ClaimBatcher_<Curve>;
using field_ct       = stdlib::field_t<Builder>;
using Transcript     = RecursiveFlavor::Transcript;
using RecursiveVK    = RecursiveFlavor::VerificationKey;
using VKAndHash      = RecursiveFlavor::VKAndHash;
using VerifierInst   = VerifierInstance_<RecursiveFlavor>;
using StdlibProof    = stdlib::Proof<Builder>;

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
    RecursionConstraint constraint = recursion_data_to_recursion_constraint(
        program.witness,
        native_chonk,             // full ChonkProof as field elements (mega+goblin)
        native_vk->to_field_elements(),
        native_vk->hash(),
        bb::fr::zero(),           // predicate = 1 (zero means disabled in new API)
        num_acir_pub_inputs,
        PROOF_TYPE::CHONK);

    // Predicate is unused in Chonk; fix to constant 1
    program.witness.pop_back();
    constraint.predicate = WitnessOrConstant<bb::fr>::from_constant(bb::fr::one());

    program.constraints.max_witness_index = static_cast<uint32_t>(program.witness.size() - 1);
    program.constraints.num_acir_opcodes   = 1;
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
    std::unique_ptr<Builder>            builder_ptr;
    std::shared_ptr<VKAndHash>          vk_and_hash;
    std::shared_ptr<Transcript>         transcript;
    std::shared_ptr<VerifierInst>       verifier_instance;
    StdlibProof                         mega_stdlib_proof;
    size_t                              num_public_inputs = 0;
    size_t                              log_n = 0;
    // VK witness indices — needed to construct RecursionConstraint for oink validators
    std::vector<uint32_t>               key_indices;
    uint32_t                            key_hash_idx = 0;

    Builder& builder() { return *builder_ptr; }
    const Builder& builder() const { return *builder_ptr; }
};

// Allocate mock VK and proof witnesses in a fresh Builder, wire up VKAndHash,
// VerifierInstance, and Transcript (proof loaded).  Does NOT call any verifier
// step — the caller drives step-by-step execution.
static VerifierComponents setup_verifier_components(size_t num_acir_pub_inputs = 0)
{
    const size_t dyadic_size       = 1 << MegaZKFlavor::VIRTUAL_LOG_N;
    const size_t log_n             = static_cast<size_t>(MegaZKFlavor::VIRTUAL_LOG_N);

    // Native mock objects
    auto native_vk     = create_mock_honk_vk<MegaZKFlavor, IO>(dyadic_size, num_acir_pub_inputs);
    auto native_proof  = create_mock_honk_proof<MegaZKFlavor, IO>(num_acir_pub_inputs);

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
    auto key_fields  = fields_from_witnesses(builder, key_indices);
    auto recursive_vk = std::make_shared<RecursiveVK>(key_fields);

    // ── VK hash ───────────────────────────────────────────────────────────────
    auto native_hash  = native_vk->hash();
    uint32_t hash_idx = builder.add_variable(native_hash);
    auto vk_hash_ct   = field_ct::from_witness_index(&builder, hash_idx);
    auto vk_and_hash  = std::make_shared<VKAndHash>(recursive_vk, vk_hash_ct);

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
    vc.builder_ptr      = std::move(builder_ptr);
    vc.vk_and_hash      = vk_and_hash;
    vc.transcript       = transcript;
    vc.verifier_instance = verifier_instance;
    vc.mega_stdlib_proof = std::move(stdlib_proof);
    vc.num_public_inputs = num_public_inputs;
    vc.log_n            = log_n;
    vc.key_indices      = key_indices;
    vc.key_hash_idx     = hash_idx;
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
        vc.verifier_instance->relation_parameters,
        vc.verifier_instance->gate_challenges,
        padding_indicator_array);

    if constexpr (RecursiveFlavor::HasZK) {
        libra_commitments[1] =
            vc.transcript->template receive_from_prover<Commitment>("Libra:grand_sum_commitment");
        libra_commitments[2] =
            vc.transcript->template receive_from_prover<Commitment>("Libra:quotient_commitment");
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

    VerifierCommitments commitments{ vc.verifier_instance->get_vk(),
                                     vc.verifier_instance->witness_commitments };
    if constexpr (RecursiveFlavor::HasZK) {
        commitments.gemini_masking_poly = vc.verifier_instance->gemini_masking_commitment;
    }

    using ClaimBatch = ClaimBatcher::Batch;
    ClaimBatcher claim_batcher{
        .unshifted = ClaimBatch{ commitments.get_unshifted(),
                                 sumcheck_output.claimed_evaluations.get_unshifted() },
        .shifted   = ClaimBatch{ commitments.get_to_be_shifted(),
                                 sumcheck_output.claimed_evaluations.get_shifted() }
    };

    Commitment one_commitment = Commitment::one(&vc.builder());
    return Shplemini::compute_batch_opening_claim(
        padding_indicator_array,
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
    KZG::reduce_verify_batch_opening_claim(
        std::move(shplemini_output.batch_opening_claim), vc.transcript, msm_size);
}

template <typename Builder_, typename Block_>
static size_t block_index_for(Builder_& bld, Block_& block)
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
static size_t block_snapshot_size(
    Builder_& bld, const recursion_helpers::BlockSnapshot& snap, Block_& block)
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
template <typename Builder_>
static size_t block_hash(Builder_& bld, size_t block_idx, size_t start, size_t end)
{
    if (start >= end) return 0;
    auto& arith = bld.blocks.arithmetic;
    if (&bld.blocks.get()[block_idx] == &arith) {
        return calculate_hash_arithmetic_block(bld, start, end);
    }
    return sha256_helpers::compute_selector_hash(0, bld.blocks.get()[block_idx], start, end - 1);
}

// Print per-block deltas with FunctionFingerprint info
static void print_function_all_blocks(
    const std::string& fn_name,
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
        info("    block[", d.block_index, "] (", d.block_name, "): +", d.delta,
             " hash=0x", std::hex, bh, std::dec);
    }
}

static void write_function_block_data(
    std::ofstream& out,
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

        out << "  block[" << d.block_index << "] " << d.block_name
            << " gates=" << d.delta
            << " fingerprint20=0x" << std::hex << fingerprint
            << " full_hash=0x" << full_hash << std::dec << "\n";
    }
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
    auto shplemini_output = run_shplemini_step(
        vc,
        padding_indicator_array,
        sumcheck_step.sumcheck_output,
        sumcheck_step.libra_commitments);
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
    auto shplemini_output = run_shplemini_step(
        vc,
        padding_indicator_array,
        sumcheck_step.sumcheck_output,
        sumcheck_step.libra_commitments);

    // ── Now decompose KZG step5 ───────────────────────────────────────────────
    auto snap = [&]() { return recursion_helpers::BlockSnapshot::capture(builder); };

    info("");
    info("--- KZG::reduce_verify_batch_opening_claim sub-phases ---");
    info("  Commitments in batch claim: ", shplemini_output.batch_opening_claim.commitments.size());
    info("  Scalars in batch claim:     ", shplemini_output.batch_opening_claim.scalars.size());

    // Sub-phase: W_receive (transcript->receive_from_prover("KZG:W"))
    auto s_before_W = snap();
    auto quotient_commitment =
        vc.transcript->template receive_from_prover<Commitment>("KZG:W");
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
            if (arith.q_arith()[g] == bb::fr::one() && arith.q_1()[g] == bb::fr::one() &&
                arith.q_2()[g] == two_127 && arith.q_3()[g] == -bb::fr::one() &&
                arith.q_4()[g] == bb::fr::one() && arith.q_m()[g].is_zero()) {
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
    [[maybe_unused]] Group P_0 = Group::batch_mul(
        shplemini_output.batch_opening_claim.commitments,
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
    info("  masking_squeeze arith:    ",
         block_delta(builder, s_before_mask, s_after_mask, builder.blocks.arithmetic));
    info("  masking_squeeze pos2_ext: ",
         block_delta(builder, s_before_mask, s_after_mask, builder.blocks.poseidon2_external));
    info("  masking_squeeze pos2_int: ",
         block_delta(builder, s_before_mask, s_after_mask, builder.blocks.poseidon2_internal));
    info("  batch_mul arith gates:    ",
         block_delta(builder, s_before_batchmul, s_after_batchmul, builder.blocks.arithmetic));
    info("  batch_mul nnf gates:      ",
         block_delta(builder, s_before_batchmul, s_after_batchmul, builder.blocks.nnf));
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
        size_t arith_hash   = 0;
        size_t nnf_hash     = 0;
        size_t memory_hash  = 0;
        size_t pos2ext_hash = 0;
        size_t pos2int_hash = 0;
        size_t arith_count  = 0;
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
        auto shplemini_output = run_shplemini_step(
            vc, pia, sumcheck_step.sumcheck_output, sumcheck_step.libra_commitments);

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
            h.arith_hash = sha256_helpers::compute_selector_hash(
                0, builder.blocks.arithmetic,
                arith_start, arith_end - 1);
        }
        const size_t nnf_start = block_snapshot_size(builder, s_before, builder.blocks.nnf);
        const size_t nnf_end = block_snapshot_size(builder, s_after, builder.blocks.nnf);
        if (nnf_end > nnf_start) {
            h.nnf_hash = sha256_helpers::compute_selector_hash(
                0, builder.blocks.nnf,
                nnf_start, nnf_end - 1);
        }
        const size_t memory_start = block_snapshot_size(builder, s_before, builder.blocks.memory);
        const size_t memory_end = block_snapshot_size(builder, s_after, builder.blocks.memory);
        if (memory_end > memory_start) {
            h.memory_hash = sha256_helpers::compute_selector_hash(
                0, builder.blocks.memory, memory_start, memory_end - 1);
        }
        const size_t pos2_ext_start = block_snapshot_size(builder, s_before, builder.blocks.poseidon2_external);
        const size_t pos2_ext_end = block_snapshot_size(builder, s_after, builder.blocks.poseidon2_external);
        if (pos2_ext_end > pos2_ext_start) {
            h.pos2ext_hash = sha256_helpers::compute_selector_hash(
                0, builder.blocks.poseidon2_external,
                pos2_ext_start, pos2_ext_end - 1);
        }
        const size_t pos2_int_start = block_snapshot_size(builder, s_before, builder.blocks.poseidon2_internal);
        const size_t pos2_int_end = block_snapshot_size(builder, s_after, builder.blocks.poseidon2_internal);
        if (pos2_int_end > pos2_int_start) {
            h.pos2int_hash = sha256_helpers::compute_selector_hash(
                0, builder.blocks.poseidon2_internal,
                pos2_int_start, pos2_int_end - 1);
        }
        results.push_back(h);

        info("  pub=", num_pub, " arith=", h.arith_count,
             " arith_hash=0x", std::hex, h.arith_hash,
             " nnf_hash=0x", h.nnf_hash,
             " mem_hash=0x", h.memory_hash,
             " p2ext=0x", h.pos2ext_hash,
             " p2int=0x", h.pos2int_hash, std::dec);
    }

    // Report stability
    info("");
    info("Stability analysis:");
    auto stable = [&](auto KZGHashes::*field, const char* name) {
        bool ok = true;
        for (size_t i = 1; i < results.size(); i++) {
            if (results[i].*field != results[0].*field) { ok = false; break; }
        }
        info("  ", name, ": ", ok ? "STABLE (0x" : "UNSTABLE (first=0x",
             std::hex, results[0].*field, ")", std::dec);
    };
    stable(&KZGHashes::arith_hash,   "arith");
    stable(&KZGHashes::nnf_hash,     "nnf");
    stable(&KZGHashes::memory_hash,  "memory");
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
    auto shplemini_output = run_shplemini_step(
        vc, pia, sumcheck_step.sumcheck_output, sumcheck_step.libra_commitments);
    print_fp("step4_shplemini", s4a, snap());

    // ── step5: KZG sub-phases ─────────────────────────────────────────────────
    auto s5W_a = snap();
    auto W_commit = vc.transcript->template receive_from_prover<Commitment>("KZG:W");
    print_fp("step5_kzg_W_receive", s5W_a, snap());

    auto s5m_a = snap();
    FF masking_challenge = vc.transcript->template get_challenge<FF>("KZG:masking_challenge");
    print_fp("step5_kzg_masking_squeeze", s5m_a, snap());

    shplemini_output.batch_opening_claim.commitments.push_back(W_commit);
    auto s5bm_a = snap();
    using Group = Curve::Group;
    [[maybe_unused]] Group P_0_kfp = Group::batch_mul(
        shplemini_output.batch_opening_claim.commitments,
        shplemini_output.batch_opening_claim.scalars,
        static_cast<size_t>(RecursiveFlavor::FINAL_PCS_MSM_SIZE(vc.log_n)),
        /*with_edgecases=*/false,
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
        auto shplemini_output = run_shplemini_step(
            vc, pia, sumcheck_step.sumcheck_output, sumcheck_step.libra_commitments);

        // Receive W and masking_challenge
        using Commitment = RecursiveFlavor::Commitment;
        auto W_commit = vc.transcript->template receive_from_prover<Commitment>("KZG:W");
        FF masking_challenge = vc.transcript->template get_challenge<FF>("KZG:masking_challenge");

        // Capture arith snapshot before batch_mul
        size_t arith_start = builder.blocks.arithmetic.size();

        shplemini_output.batch_opening_claim.commitments.push_back(W_commit);
        using Group = Curve::Group;
        [[maybe_unused]] Group P_0_kbm = Group::batch_mul(
            shplemini_output.batch_opening_claim.commitments,
            shplemini_output.batch_opening_claim.scalars,
            static_cast<size_t>(RecursiveFlavor::FINAL_PCS_MSM_SIZE(vc.log_n)),
            /*with_edgecases=*/false,
            /*masking_scalar=*/masking_challenge);

        size_t arith_end = builder.blocks.arithmetic.size();
        size_t batch_mul_gates = arith_end - arith_start;

        // Dump chunk hashes to file
        std::string filename = "circuit_dumps/batch_mul_pub" + std::to_string(num_pub) + "_hashes.txt";
        std::ofstream out(filename);
        const size_t num_chunks = (batch_mul_gates + CHUNK_SIZE - 1) / CHUNK_SIZE;
        out << "# batch_mul arith chunk hashes (pub=" << num_pub
            << " total_gates=" << batch_mul_gates << ")\n";

        for (size_t c = 0; c < num_chunks; c++) {
            size_t chunk_start = arith_start + c * CHUNK_SIZE;
            size_t chunk_end   = std::min(chunk_start + CHUNK_SIZE, arith_end);
            size_t h = sha256_helpers::compute_selector_hash(
                0, builder.blocks.arithmetic, chunk_start, chunk_end - 1);
            out << "chunk" << c << " [" << chunk_start << "," << chunk_end << ")"
                << " hash=0x" << std::hex << h << std::dec << "\n";
        }
        out.close();

        info("  pub=", num_pub, ": batch_mul arith gates=", batch_mul_gates,
             " chunks=", num_chunks, " -> ", filename);
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
    auto shplemini_output = run_shplemini_step(
        vc, pia, sumcheck_step.sumcheck_output, sumcheck_step.libra_commitments);

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
    shplemini_output.batch_opening_claim.scalars.emplace_back(
        shplemini_output.batch_opening_claim.evaluation_point);
    auto s_after_update_claim = snap();
    write_function_block_data(out, "KZG:update_batch_opening_claim", builder, s_before_update_claim, s_after_update_claim);
    EXPECT_EQ(shplemini_output.batch_opening_claim.commitments.size(),
              RecursiveFlavor::FINAL_PCS_MSM_SIZE(vc.log_n));

    auto s_before_batch_mul = snap();
    [[maybe_unused]] Group p_0 = Group::batch_mul(
        shplemini_output.batch_opening_claim.commitments,
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
