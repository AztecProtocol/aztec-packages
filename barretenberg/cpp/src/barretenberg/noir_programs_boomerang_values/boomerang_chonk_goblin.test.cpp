#include "barretenberg/chonk/chonk_proof.hpp"
#include "barretenberg/chonk/chonk_verifier.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/commitment_schemes/small_subgroup_ipa/small_subgroup_ipa_utils.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/mock_verifier_inputs.hpp"
#include "barretenberg/dsl/acir_format/recursion_constraint.hpp"
#include "barretenberg/dsl/acir_format/utils.hpp"
#include "barretenberg/flavor/mega_zk_recursive_flavor.hpp"
#include "barretenberg/goblin/goblin_verifier.hpp"
#include "barretenberg/noir_programs_boomerang_values/boomerang_chonk_eccvm_translator_verification.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_helper.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib/primitives/field/field_utils.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include <algorithm>
#include <array>
#include <fstream>
#include <gtest/gtest.h>
#include <memory>
#include <optional>
#include <ostream>
#include <set>
#include <string>
#include <vector>

using namespace bb;
using namespace acir_format;

namespace {

using Builder = UltraCircuitBuilder;
using RecursiveFlavor = MegaZKRecursiveFlavor_<Builder>;
using IO = stdlib::recursion::honk::HidingKernelIO<Builder>;
using Transcript = bb::GoblinRecursiveVerifier::Transcript;
using field_ct = stdlib::field_t<Builder>;

// Build a RecursionConstraint + witness vector for a mock MegaZK proof.
// num_acir_pub_inputs: ACIR-level public inputs (0 is common for testing).
AcirProgram make_mock_acir_program(size_t num_acir_pub_inputs = 0)
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

// Block indices aligned with recursion_helpers::compute_block_deltas naming (pub_inputs=0 .. poseidon2_int=8).
constexpr size_t BLOCK_INDEX_ARITHMETIC = 2;
constexpr size_t BLOCK_INDEX_ELLIPTIC = 4;
constexpr size_t BLOCK_INDEX_MEMORY = 5;
constexpr size_t BLOCK_INDEX_NNF = 6;
constexpr size_t BLOCK_INDEX_POSEIDON2_EXT = 7;
constexpr size_t BLOCK_INDEX_POSEIDON2_INT = 8;

struct StageFingerprintSegment {
    size_t block_index;
    size_t start;
    size_t end;
};

const char* block_kind_name(size_t block_index)
{
    switch (block_index) {
    case BLOCK_INDEX_ARITHMETIC:
        return "arithmetic";
    case BLOCK_INDEX_ELLIPTIC:
        return "elliptic";
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

recursion_helpers::FunctionFingerprint compute_fingerprint_at(Builder& builder,
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

template <typename Block>
std::vector<size_t> find_all_fingerprint_starts(Builder& builder,
                                                Block& block,
                                                const recursion_helpers::FunctionFingerprint& fp)
{
    std::vector<size_t> starts;
    if (fp.gate_count > block.size()) {
        return starts;
    }
    for (size_t start = 0; start + fp.gate_count <= block.size(); ++start) {
        if (recursion_helpers::matches_fingerprint_at(builder, block, start, fp)) {
            starts.push_back(start);
        }
    }
    return starts;
}

MergeVerifierVerification::KzgReduceVerifyBatchOpeningClaimValidation validate_merge_kzg_reduce_for_eccvm(
    Builder& builder)
{
    MergeVerifierVerification::KzgReduceVerifyBatchOpeningClaimValidation merge_kzg_reduce;

    const auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    const size_t consumed_count = recursion_helpers::NUM_OINK_SQUEEZES + recursion_helpers::NUM_STEP2_SQUEEZES +
                                  recursion_helpers::NUM_SUMCHECK_SQUEEZES + recursion_helpers::NUM_SHPLEMINI_SQUEEZES;
    EXPECT_GE(all_squeezes.size(), consumed_count + recursion_helpers::NUM_KZG_SQUEEZES);
    if (all_squeezes.size() < consumed_count + recursion_helpers::NUM_KZG_SQUEEZES) {
        return merge_kzg_reduce;
    }

    const std::set<size_t> consumed_prefix(all_squeezes.begin(),
                                           all_squeezes.begin() + static_cast<ptrdiff_t>(consumed_count));
    auto kzg_validation = KZGVerification::validate_kzg(builder, all_squeezes, consumed_prefix);
    EXPECT_TRUE(kzg_validation.is_valid);
    if (!kzg_validation.is_valid) {
        return merge_kzg_reduce;
    }

    auto kernel_io = KernelIOVerification::validate_kernel_io_part(builder, kzg_validation.batch_mul);
    EXPECT_TRUE(kernel_io.is_valid);
    if (!kernel_io.is_valid) {
        return merge_kzg_reduce;
    }

    auto merge_table_commitments = MergeVerifierVerification::validate_merge_table_commitments(builder, kernel_io);
    EXPECT_TRUE(merge_table_commitments.is_valid);
    if (!merge_table_commitments.is_valid) {
        return merge_kzg_reduce;
    }

    auto degree_check_challenges = MergeVerifierVerification::validate_degree_check_challenges(
        builder, merge_table_commitments, kzg_validation.masking_challenge_generation);
    EXPECT_TRUE(degree_check_challenges.is_valid);
    if (!degree_check_challenges.is_valid) {
        return merge_kzg_reduce;
    }

    auto reversed_batched_left_tables = MergeVerifierVerification::validate_reversed_batched_left_tables(
        builder, merge_table_commitments, degree_check_challenges);
    EXPECT_TRUE(reversed_batched_left_tables.is_valid);
    if (!reversed_batched_left_tables.is_valid) {
        return merge_kzg_reduce;
    }

    auto shplonk_batching_challenges = MergeVerifierVerification::validate_shplonk_batching_challenges(
        builder, degree_check_challenges, reversed_batched_left_tables);
    EXPECT_TRUE(shplonk_batching_challenges.is_valid);
    if (!shplonk_batching_challenges.is_valid) {
        return merge_kzg_reduce;
    }

    auto kappa = MergeVerifierVerification::validate_kappa(builder, shplonk_batching_challenges);
    EXPECT_TRUE(kappa.is_valid);
    if (!kappa.is_valid) {
        return merge_kzg_reduce;
    }

    auto concatenation_identities = MergeVerifierVerification::validate_check_concatenation_identities(builder, kappa);
    EXPECT_TRUE(concatenation_identities.is_valid);
    if (!concatenation_identities.is_valid) {
        return merge_kzg_reduce;
    }

    auto degree_identity = MergeVerifierVerification::validate_check_degree_identity(builder, concatenation_identities);
    EXPECT_TRUE(degree_identity.is_valid);
    if (!degree_identity.is_valid) {
        return merge_kzg_reduce;
    }

    auto shplonk_batched_quotient = MergeVerifierVerification::validate_shplonk_batched_quotient(
        builder, reversed_batched_left_tables, degree_identity);
    EXPECT_TRUE(shplonk_batched_quotient.is_valid);
    if (!shplonk_batched_quotient.is_valid) {
        return merge_kzg_reduce;
    }

    auto shplonk_opening_challenge =
        MergeVerifierVerification::validate_shplonk_opening_challenge(builder, shplonk_batched_quotient, kappa);
    EXPECT_TRUE(shplonk_opening_challenge.is_valid);
    if (!shplonk_opening_challenge.is_valid) {
        return merge_kzg_reduce;
    }

    auto prepare_batched_opening_claim =
        MergeVerifierVerification::validate_prepare_batched_opening_claim(builder, shplonk_opening_challenge);
    EXPECT_TRUE(prepare_batched_opening_claim.is_valid);
    if (!prepare_batched_opening_claim.is_valid) {
        return merge_kzg_reduce;
    }

    merge_kzg_reduce =
        MergeVerifierVerification::validate_kzg_reduce_verify_batch_opening_claim(builder,
                                                                                  prepare_batched_opening_claim,
                                                                                  shplonk_batched_quotient,
                                                                                  shplonk_opening_challenge,
                                                                                  kzg_validation.batch_mul);
    EXPECT_TRUE(merge_kzg_reduce.is_valid);
    return merge_kzg_reduce;
}

[[maybe_unused]] void write_stage_fingerprint(std::ostream& out,
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

using GoblinMergeVerifier = GoblinRecursiveVerifier::MergeVerifier;
using GoblinEccvmVerifier = GoblinRecursiveVerifier::ECCVMVerifier;
using GoblinTranslatorVerifier = GoblinRecursiveVerifier::TranslatorVerifier;

GoblinMergeVerifier::ReductionResult execute_merge_verifier_part(
    const std::shared_ptr<Transcript>& transcript,
    const GoblinStdlibProof& goblin_proof,
    const GoblinMergeVerifier::InputCommitments& merge_commitments)
{
    using FF = GoblinMergeVerifier::FF;
    using Commitment = GoblinMergeVerifier::Commitment;
    using TableCommitments = GoblinMergeVerifier::TableCommitments;
    using PairingPoints = GoblinMergeVerifier::PairingPoints;
    using PCS = GoblinMergeVerifier::PCS;
    using Curve = stdlib::bn254<Builder>;

    static const std::vector<std::string> labels_degree_check = { "LEFT_TABLE_DEGREE_CHECK_0",
                                                                  "LEFT_TABLE_DEGREE_CHECK_1",
                                                                  "LEFT_TABLE_DEGREE_CHECK_2",
                                                                  "LEFT_TABLE_DEGREE_CHECK_3" };
    static const std::vector<std::string> labels_shplonk_batching_challenges = {
        "SHPLONK_MERGE_BATCHING_CHALLENGE_0",  "SHPLONK_MERGE_BATCHING_CHALLENGE_1",
        "SHPLONK_MERGE_BATCHING_CHALLENGE_2",  "SHPLONK_MERGE_BATCHING_CHALLENGE_3",
        "SHPLONK_MERGE_BATCHING_CHALLENGE_4",  "SHPLONK_MERGE_BATCHING_CHALLENGE_5",
        "SHPLONK_MERGE_BATCHING_CHALLENGE_6",  "SHPLONK_MERGE_BATCHING_CHALLENGE_7",
        "SHPLONK_MERGE_BATCHING_CHALLENGE_8",  "SHPLONK_MERGE_BATCHING_CHALLENGE_9",
        "SHPLONK_MERGE_BATCHING_CHALLENGE_10", "SHPLONK_MERGE_BATCHING_CHALLENGE_11",
        "SHPLONK_MERGE_BATCHING_CHALLENGE_12"
    };

    Builder& builder = *goblin_proof.merge_proof[0].get_context();
    std::ofstream out("/mnt/user-data/daniel/aztec-packages/barretenberg/cpp/build-debug/"
                      "goblin_merge_verifier_functions_analysis.txt");
    EXPECT_TRUE(out.is_open());

    const auto write_stage_from_snapshots = [&](const char* stage_tag,
                                                const recursion_helpers::BlockSnapshot& before,
                                                const recursion_helpers::BlockSnapshot& after) {
        std::vector<StageFingerprintSegment> segments;
        for (const auto& delta : recursion_helpers::compute_block_deltas(before, after)) {
            const size_t start = delta.block_index < before.sizes.size() ? before.sizes[delta.block_index] : 0;
            const size_t end = delta.block_index < after.sizes.size() ? after.sizes[delta.block_index] : start;
            segments.push_back({ .block_index = delta.block_index, .start = start, .end = end });
        }
        write_stage_fingerprint(out, builder, stage_tag, segments);
    };

    transcript->load_proof(goblin_proof.merge_proof);

    auto before = recursion_helpers::BlockSnapshot::capture(builder);
    const FF shift_size = transcript->template receive_from_prover<FF>("shift_size");
    auto after = recursion_helpers::BlockSnapshot::capture(builder);
    write_stage_from_snapshots("Merge:shift_size", before, after);

    BB_ASSERT_GT(uint32_t(shift_size.get_value()), 0U, "Shift size should always be bigger than 0");

    TableCommitments merged_table_commitments;
    std::vector<Commitment> table_commitments;
    table_commitments.reserve((3 * GoblinMergeVerifier::NUM_WIRES) + 1);
    for (size_t idx = 0; idx < GoblinMergeVerifier::NUM_WIRES; ++idx) {
        table_commitments.emplace_back(merge_commitments.T_prev_commitments[idx]);
    }
    for (size_t idx = 0; idx < GoblinMergeVerifier::NUM_WIRES; ++idx) {
        table_commitments.emplace_back(merge_commitments.t_commitments[idx]);
    }

    before = recursion_helpers::BlockSnapshot::capture(builder);
    for (size_t idx = 0; idx < GoblinMergeVerifier::NUM_WIRES; ++idx) {
        table_commitments.emplace_back(
            transcript->template receive_from_prover<Commitment>("MERGED_TABLE_" + std::to_string(idx)));
        merged_table_commitments[idx] = table_commitments.back();
    }
    after = recursion_helpers::BlockSnapshot::capture(builder);
    write_stage_from_snapshots("Merge:merged_table_commitments", before, after);

    before = recursion_helpers::BlockSnapshot::capture(builder);
    std::vector<FF> degree_check_challenges = transcript->template get_challenges<FF>(labels_degree_check);
    after = recursion_helpers::BlockSnapshot::capture(builder);
    write_stage_from_snapshots("Merge:degree_check_challenges", before, after);

    before = recursion_helpers::BlockSnapshot::capture(builder);
    table_commitments.emplace_back(
        transcript->template receive_from_prover<Commitment>("REVERSED_BATCHED_LEFT_TABLES"));
    after = recursion_helpers::BlockSnapshot::capture(builder);
    write_stage_from_snapshots("Merge:reversed_batched_left_tables", before, after);

    before = recursion_helpers::BlockSnapshot::capture(builder);
    std::vector<FF> shplonk_batching_challenges =
        transcript->template get_challenges<FF>(labels_shplonk_batching_challenges);
    after = recursion_helpers::BlockSnapshot::capture(builder);
    write_stage_from_snapshots("Merge:shplonk_batching_challenges", before, after);

    before = recursion_helpers::BlockSnapshot::capture(builder);
    const FF kappa = transcript->template get_challenge<FF>("kappa");
    const FF kappa_inv = kappa.invert();
    const FF pow_kappa = kappa.pow(shift_size);
    const FF pow_kappa_minus_one = pow_kappa * kappa_inv;
    after = recursion_helpers::BlockSnapshot::capture(builder);
    write_stage_from_snapshots("Merge:kappa", before, after);

    std::vector<FF> evals;
    evals.reserve((3 * GoblinMergeVerifier::NUM_WIRES) + 1);
    before = recursion_helpers::BlockSnapshot::capture(builder);
    for (size_t idx = 0; idx < GoblinMergeVerifier::NUM_WIRES; ++idx) {
        evals.emplace_back(transcript->template receive_from_prover<FF>("LEFT_TABLE_EVAL_" + std::to_string(idx)));
    }
    for (size_t idx = 0; idx < GoblinMergeVerifier::NUM_WIRES; ++idx) {
        evals.emplace_back(transcript->template receive_from_prover<FF>("RIGHT_TABLE_EVAL_" + std::to_string(idx)));
    }
    for (size_t idx = 0; idx < GoblinMergeVerifier::NUM_WIRES; ++idx) {
        evals.emplace_back(transcript->template receive_from_prover<FF>("MERGED_TABLE_EVAL_" + std::to_string(idx)));
    }
    evals.emplace_back(transcript->template receive_from_prover<FF>("REVERSED_BATCHED_LEFT_TABLES_EVAL"));
    after = recursion_helpers::BlockSnapshot::capture(builder);
    write_stage_from_snapshots("Merge:evaluations", before, after);

    before = recursion_helpers::BlockSnapshot::capture(builder);
    bool concatenation_verified = true;
    FF concatenation_diff(0);
    for (size_t idx = 0; idx < GoblinMergeVerifier::NUM_WIRES; idx++) {
        concatenation_diff = evals[idx] + (pow_kappa * evals[idx + GoblinMergeVerifier::NUM_WIRES]) -
                             evals[idx + (2 * GoblinMergeVerifier::NUM_WIRES)];
        concatenation_verified = concatenation_verified && concatenation_diff.get_value().is_zero();
        concatenation_diff.assert_equal(FF(0), "assert_equal: merge concatenation identity failed in Merge Verifier");
    }
    after = recursion_helpers::BlockSnapshot::capture(builder);
    write_stage_from_snapshots("Merge:check_concatenation_identities", before, after);

    before = recursion_helpers::BlockSnapshot::capture(builder);
    bool degree_check_verified = true;
    FF degree_check_diff(0);
    for (size_t idx = 0; idx < GoblinMergeVerifier::NUM_WIRES; ++idx) {
        degree_check_diff += evals[idx] * degree_check_challenges[idx];
    }
    degree_check_diff -= evals.back() * pow_kappa_minus_one;
    degree_check_verified = degree_check_verified && degree_check_diff.get_value().is_zero();
    degree_check_diff.assert_equal(FF(0), "assert_equal: merge degree identity failed in Merge Verifier");
    after = recursion_helpers::BlockSnapshot::capture(builder);
    write_stage_from_snapshots("Merge:check_degree_identity", before, after);

    before = recursion_helpers::BlockSnapshot::capture(builder);
    Commitment shplonk_batched_quotient =
        transcript->template receive_from_prover<Commitment>("SHPLONK_BATCHED_QUOTIENT");
    after = recursion_helpers::BlockSnapshot::capture(builder);
    write_stage_from_snapshots("Merge:shplonk_batched_quotient", before, after);

    before = recursion_helpers::BlockSnapshot::capture(builder);
    FF shplonk_opening_challenge = transcript->template get_challenge<FF>("shplonk_opening_challenge");
    after = recursion_helpers::BlockSnapshot::capture(builder);
    write_stage_from_snapshots("Merge:shplonk_opening_challenge", before, after);

    const auto prepare_batched_opening_claim = [&](std::vector<Commitment>& input_table_commitments,
                                                   Commitment input_shplonk_batched_quotient,
                                                   const FF& input_shplonk_opening_challenge,
                                                   std::vector<FF>& input_shplonk_batching_challenges,
                                                   const FF& input_kappa,
                                                   const FF& input_kappa_inv,
                                                   const std::vector<FF>& input_evals) {
        BatchOpeningClaim<Curve> claim;
        claim.commitments = { std::move(input_shplonk_batched_quotient) };
        for (auto& commitment : input_table_commitments) {
            claim.commitments.emplace_back(std::move(commitment));
        }
        claim.commitments.emplace_back(Commitment::one(input_kappa.get_context()));

        claim.scalars = { -(input_shplonk_opening_challenge - input_kappa) };
        for (auto& scalar : input_shplonk_batching_challenges) {
            claim.scalars.emplace_back(std::move(scalar));
        }
        claim.scalars.back() *= (input_shplonk_opening_challenge - input_kappa) *
                                (input_shplonk_opening_challenge - input_kappa_inv).invert();

        claim.scalars.emplace_back(FF(0));
        for (size_t idx = 0; idx < input_evals.size(); idx++) {
            if (idx < input_evals.size() - 1) {
                claim.scalars.back() -= input_evals[idx] * claim.scalars[idx + 1];
            } else {
                claim.scalars.back() -= claim.scalars[idx + 1] * input_evals.back() *
                                        (input_shplonk_opening_challenge - input_kappa) *
                                        (input_shplonk_opening_challenge - input_kappa_inv).invert();
            }
        }
        claim.evaluation_point = { input_shplonk_opening_challenge };
        return claim;
    };

    // Prepare batched opening claim to be passed to KZG
    before = recursion_helpers::BlockSnapshot::capture(builder);
    BatchOpeningClaim<Curve> batch_opening_claim = prepare_batched_opening_claim(table_commitments,
                                                                                 std::move(shplonk_batched_quotient),
                                                                                 shplonk_opening_challenge,
                                                                                 shplonk_batching_challenges,
                                                                                 kappa,
                                                                                 kappa_inv,
                                                                                 evals);
    after = recursion_helpers::BlockSnapshot::capture(builder);
    write_stage_from_snapshots("Merge:prepare_batched_opening_claim", before, after);

    BB_ASSERT(batch_opening_claim.commitments.size() == GoblinMergeVerifier::MERGE_BATCHED_CLAIM_SIZE);
    BB_ASSERT(batch_opening_claim.scalars.size() == GoblinMergeVerifier::MERGE_BATCHED_CLAIM_SIZE);

    before = recursion_helpers::BlockSnapshot::capture(builder);
    PairingPoints pairing_points = PCS::reduce_verify_batch_opening_claim(std::move(batch_opening_claim), transcript);
    after = recursion_helpers::BlockSnapshot::capture(builder);
    write_stage_from_snapshots("Merge:kzg_reduce_verify_batch_opening_claim", before, after);

    vinfo("Merge Verifier: degree check passed: ", degree_check_verified ? "true" : "false");
    vinfo("Merge Verifier: concatenation check passed: ", concatenation_verified ? "true" : "false");

    return { pairing_points, merged_table_commitments, degree_check_verified && concatenation_verified };
}

struct EccvmVerifierPartOutput {
    GoblinEccvmVerifier::ReductionResult reduction_result;
    GoblinEccvmVerifier::TranslatorInputData translator_input;
};

EccvmVerifierPartOutput execute_eccvm_verifier_part(const std::shared_ptr<Transcript>& transcript,
                                                    const GoblinStdlibProof& goblin_proof)
{
    Builder& builder = *goblin_proof.eccvm_proof[0].get_context();
    std::ofstream out("/mnt/user-data/daniel/aztec-packages/barretenberg/cpp/build-debug/"
                      "goblin_eccvm_verifier_functions_analysis.txt");
    EXPECT_TRUE(out.is_open());

    const auto write_stage_from_snapshots = [&](const char* stage_tag,
                                                const recursion_helpers::BlockSnapshot& before,
                                                const recursion_helpers::BlockSnapshot& after) {
        std::vector<StageFingerprintSegment> segments;
        for (const auto& delta : recursion_helpers::compute_block_deltas(before, after)) {
            const size_t start = delta.block_index < before.sizes.size() ? before.sizes[delta.block_index] : 0;
            const size_t end = delta.block_index < after.sizes.size() ? after.sizes[delta.block_index] : start;
            segments.push_back({ .block_index = delta.block_index, .start = start, .end = end });
        }
        write_stage_fingerprint(out, builder, stage_tag, segments);
    };

    auto before = recursion_helpers::BlockSnapshot::capture(builder);
    GoblinEccvmVerifier eccvm_verifier{ transcript, goblin_proof.eccvm_proof };
    auto after = recursion_helpers::BlockSnapshot::capture(builder);
    write_stage_from_snapshots("ECCVM:constructor", before, after);

    before = recursion_helpers::BlockSnapshot::capture(builder);
    auto eccvm_result = eccvm_verifier.reduce_to_ipa_opening();
    after = recursion_helpers::BlockSnapshot::capture(builder);
    write_stage_from_snapshots("ECCVM:reduce_to_ipa_opening", before, after);

    before = recursion_helpers::BlockSnapshot::capture(builder);
    auto translator_input = eccvm_verifier.get_translator_input_data();
    after = recursion_helpers::BlockSnapshot::capture(builder);
    write_stage_from_snapshots("ECCVM:get_translator_input_data", before, after);

    return { .reduction_result = std::move(eccvm_result), .translator_input = std::move(translator_input) };
}

GoblinTranslatorVerifier::ReductionResult execute_translator_part(
    const std::shared_ptr<Transcript>& transcript,
    const GoblinStdlibProof& goblin_proof,
    const GoblinEccvmVerifier::TranslatorInputData& translator_input,
    const GoblinMergeVerifier::ReductionResult& merge_result)
{
    Builder& builder = *goblin_proof.translator_proof[0].get_context();
    std::ofstream out("/mnt/user-data/daniel/aztec-packages/barretenberg/cpp/build-debug/"
                      "goblin_translator_verifier_functions_analysis.txt");
    EXPECT_TRUE(out.is_open());

    const auto write_stage_from_snapshots = [&](const char* stage_tag,
                                                const recursion_helpers::BlockSnapshot& before,
                                                const recursion_helpers::BlockSnapshot& after) {
        std::vector<StageFingerprintSegment> segments;
        for (const auto& delta : recursion_helpers::compute_block_deltas(before, after)) {
            const size_t start = delta.block_index < before.sizes.size() ? before.sizes[delta.block_index] : 0;
            const size_t end = delta.block_index < after.sizes.size() ? after.sizes[delta.block_index] : start;
            segments.push_back({ .block_index = delta.block_index, .start = start, .end = end });
        }
        write_stage_fingerprint(out, builder, stage_tag, segments);
    };

    auto before = recursion_helpers::BlockSnapshot::capture(builder);
    GoblinTranslatorVerifier translator_verifier{ transcript,
                                                  goblin_proof.translator_proof,
                                                  translator_input.evaluation_challenge_x,
                                                  translator_input.batching_challenge_v,
                                                  translator_input.accumulated_result,
                                                  merge_result.merged_commitments };
    auto after = recursion_helpers::BlockSnapshot::capture(builder);
    write_stage_from_snapshots("Translator:constructor", before, after);

    before = recursion_helpers::BlockSnapshot::capture(builder);
    auto result = translator_verifier.reduce_to_pairing_check();
    after = recursion_helpers::BlockSnapshot::capture(builder);
    write_stage_from_snapshots("Translator:reduce_to_pairing_check", before, after);
    return result;
}

void execute_goblin_part(Builder& builder, const RecursionConstraint& constraint)
{
    using RecursiveVK = ChonkRecursiveVerifier::VK;
    using RecursiveVKAndHash = ChonkRecursiveVerifier::VKAndHash;
    using HidingKernelVerifier = MegaZKRecursiveVerifier;
    using HidingKernelIO = stdlib::recursion::honk::HidingKernelIO<Builder>;
    using MergeCommitments = GoblinRecursiveVerifier::MergeVerifier::InputCommitments;

    std::vector<uint32_t> proof_indices = add_public_inputs_to_proof(constraint.proof, constraint.public_inputs);
    std::vector<field_ct> key_fields = fields_from_witnesses(builder, constraint.key);
    std::vector<field_ct> proof_fields = fields_from_witnesses(builder, proof_indices);
    field_ct vk_hash = field_ct::from_witness_index(&builder, constraint.key_hash);

    auto mega_vk = std::make_shared<RecursiveVK>(key_fields);
    auto mega_vk_and_hash = std::make_shared<RecursiveVKAndHash>(mega_vk, vk_hash);
    ChonkStdlibProof stdlib_proof = ChonkStdlibProof::from_field_elements(proof_fields);

    auto transcript = std::make_shared<Transcript>();
    std::ofstream kernel_io_out(
        "/mnt/user-data/daniel/aztec-packages/barretenberg/cpp/build-debug/kernel_io_functions_data.txt");
    EXPECT_TRUE(kernel_io_out.is_open());

    const auto write_kernel_io_stage_from_snapshots = [&](const char* stage_tag,
                                                          const recursion_helpers::BlockSnapshot& before,
                                                          const recursion_helpers::BlockSnapshot& after) {
        std::vector<StageFingerprintSegment> segments;
        for (const auto& delta : recursion_helpers::compute_block_deltas(before, after)) {
            const size_t start = delta.block_index < before.sizes.size() ? before.sizes[delta.block_index] : 0;
            const size_t end = delta.block_index < after.sizes.size() ? after.sizes[delta.block_index] : start;
            segments.push_back({ .block_index = delta.block_index, .start = start, .end = end });
        }
        write_stage_fingerprint(kernel_io_out, builder, stage_tag, segments);
    };

    HidingKernelVerifier mega_verifier{ mega_vk_and_hash, transcript };
    [[maybe_unused]] auto mega_output = mega_verifier.reduce_to_pairing_check(stdlib_proof.mega_proof);

    HidingKernelIO kernel_io;
    auto before = recursion_helpers::BlockSnapshot::capture(builder);
    kernel_io.reconstruct_from_public(mega_verifier.get_public_inputs());
    auto after = recursion_helpers::BlockSnapshot::capture(builder);
    write_kernel_io_stage_from_snapshots("KernelIO:reconstruct_from_public", before, after);

    const auto calldata_commitment = mega_verifier.get_calldata_commitment();

    before = recursion_helpers::BlockSnapshot::capture(builder);
    kernel_io.kernel_return_data.incomplete_assert_equal(calldata_commitment);
    after = recursion_helpers::BlockSnapshot::capture(builder);
    write_kernel_io_stage_from_snapshots("KernelIO:kernel_return_data_assert_equal", before, after);

    MergeCommitments merge_commitments{ .t_commitments = mega_verifier.get_ecc_op_wires(),
                                        .T_prev_commitments = kernel_io.ecc_op_tables };

    auto merge_result = execute_merge_verifier_part(transcript, stdlib_proof.goblin_proof, merge_commitments);
    auto eccvm_output = execute_eccvm_verifier_part(transcript, stdlib_proof.goblin_proof);
    auto translator_result =
        execute_translator_part(transcript, stdlib_proof.goblin_proof, eccvm_output.translator_input, merge_result);

    const auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    const size_t consumed_count = recursion_helpers::NUM_OINK_SQUEEZES + recursion_helpers::NUM_STEP2_SQUEEZES +
                                  recursion_helpers::NUM_SUMCHECK_SQUEEZES + recursion_helpers::NUM_SHPLEMINI_SQUEEZES;
    ASSERT_GE(all_squeezes.size(), consumed_count + recursion_helpers::NUM_KZG_SQUEEZES);
    const std::set<size_t> consumed_prefix(all_squeezes.begin(),
                                           all_squeezes.begin() + static_cast<ptrdiff_t>(consumed_count));

    auto masking_challenge = recursion_helpers::kzg_masking_challenge(builder, all_squeezes, consumed_prefix);
    ASSERT_TRUE(masking_challenge.valid);

    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
    auto transcript_receive =
        KZGVerification::validate_transcript_receive(builder, analyzer, masking_challenge.squeeze_gate);
    ASSERT_TRUE(transcript_receive.is_valid);
    auto masking_generation = KZGVerification::validate_masking_challenge_generation(
        builder, analyzer, masking_challenge.squeeze_gate, transcript_receive);
    ASSERT_TRUE(masking_generation.is_valid);
    auto batch_mul = KZGVerification::validate_batch_mul(
        builder, analyzer, masking_challenge.squeeze_gate, transcript_receive, masking_generation);
    ASSERT_TRUE(batch_mul.is_valid);

    auto kernel_io_validation = KernelIOVerification::validate_kernel_io_part(builder, batch_mul);
    info("kernel_io_validation.is_valid == ", kernel_io_validation.is_valid);
    ASSERT_TRUE(kernel_io_validation.is_valid);
    auto merge_kzg_reduce = validate_merge_kzg_reduce_for_eccvm(builder);
    info("merge_kzg_reduce == ", merge_kzg_reduce.is_valid);
    ASSERT_TRUE(merge_kzg_reduce.is_valid);
    auto eccvm_validation = ECCVMTranslatorVerification::validate_eccvm_part(builder, merge_kzg_reduce, analyzer);
    ASSERT_TRUE(eccvm_validation.is_valid);
    auto translator_validation = ECCVMTranslatorVerification::validate_translator_part(builder, eccvm_validation);
    ASSERT_TRUE(translator_validation.is_valid);

    [[maybe_unused]] bool all_checks_passed = merge_result.reduction_succeeded &&
                                              eccvm_output.reduction_result.reduction_succeeded &&
                                              translator_result.reduction_succeeded;
}

} // namespace

class ChonkRecursionGoblinPartTestSuite : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

TEST_F(ChonkRecursionGoblinPartTestSuite, GoblinPartAnalysis)
{
    AcirProgram program = make_mock_acir_program(0);
    Builder builder{ program.witness, program.constraints.public_inputs, false };
    const auto& constraint = program.constraints.chonk_recursion_constraints[0];

    execute_goblin_part(builder, constraint);
}

TEST_F(ChonkRecursionGoblinPartTestSuite, EccvmEllipticStartFromSharedWitnesses)
{
    using EccvmValidation = ECCVMTranslatorVerification::EccvmPartValidation;

    AcirProgram program = make_mock_acir_program(0);
    Builder builder{ program.witness, program.constraints.public_inputs, false };
    const auto& constraint = program.constraints.chonk_recursion_constraints[0];

    execute_goblin_part(builder, constraint);

    auto& elliptic = builder.blocks.elliptic;

    auto merge_kzg_reduce = validate_merge_kzg_reduce_for_eccvm(builder);
    ASSERT_TRUE(merge_kzg_reduce.is_valid);
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
    auto eccvm_validation = ECCVMTranslatorVerification::validate_eccvm_part(builder, merge_kzg_reduce, analyzer);
    ASSERT_TRUE(eccvm_validation.is_valid);
    const auto elliptic_starts =
        find_all_fingerprint_starts(builder, elliptic, EccvmValidation::REDUCE_TO_IPA_OPENING_ELLIPTIC);

    ASSERT_EQ(elliptic_starts.size(), 1U);

    const size_t actual_elliptic_start = elliptic_starts[0];
    EXPECT_EQ(eccvm_validation.elliptic_gate_start_idx, actual_elliptic_start);
}
