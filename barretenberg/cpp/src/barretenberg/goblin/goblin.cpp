// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "goblin.hpp"

#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/eccvm/eccvm_flavor.hpp"
#include "barretenberg/eccvm/eccvm_verifier.hpp"
#include "barretenberg/goblin/goblin_verifier.hpp"
#include "barretenberg/goblin/merge_verifier.hpp"
#include "barretenberg/translator_vm/translator_prover.hpp"
#include "barretenberg/translator_vm/translator_proving_key.hpp"
#include "barretenberg/translator_vm/translator_verifier.hpp"
#include <utility>

namespace bb {

Goblin::Goblin(CommitmentKey<curve::BN254> bn254_commitment_key, const std::shared_ptr<Transcript>& transcript)
    : commitment_key(std::move(bn254_commitment_key))
    , transcript(transcript)
{}

void Goblin::prove_merge(const std::shared_ptr<Transcript>& transcript, const MergeSettings merge_settings)
{
    BB_BENCH_NAME("Goblin::prove_merge");
    MergeProver merge_prover{ op_queue, merge_settings, commitment_key, transcript };
    merge_verification_queue.push_back(merge_prover.construct_proof());
}

void Goblin::prove_eccvm()
{
    BB_BENCH_NAME("Goblin::prove_eccvm");
    ECCVMBuilder eccvm_builder(op_queue);
    ECCVMProver eccvm_prover(eccvm_builder, transcript);
    auto [eccvm_proof, opening_claim] = eccvm_prover.construct_proof();
    goblin_proof.eccvm_proof = std::move(eccvm_proof);

    // Compute IPA proof for the opening claim
    auto ipa_transcript = std::make_shared<NativeTranscript>();
    IPA_PCS::compute_opening_proof(eccvm_prover.key->commitment_key, opening_claim, ipa_transcript);
    goblin_proof.ipa_proof = ipa_transcript->export_proof();

    translation_batching_challenge_v = eccvm_prover.batching_challenge_v;
    evaluation_challenge_x = eccvm_prover.evaluation_challenge_x;
}

void Goblin::prove_translator()
{
    BB_BENCH_NAME("Goblin::prove_translator");
    TranslatorBuilder translator_builder(translation_batching_challenge_v, evaluation_challenge_x, op_queue, avm_mode);
    auto translator_key = std::make_shared<TranslatorProvingKey>(translator_builder, commitment_key);
    TranslatorProver translator_prover(translator_key, transcript);
    goblin_proof.translator_proof = translator_prover.construct_proof();
}

GoblinProof Goblin::prove(const MergeSettings merge_settings)
{
    BB_BENCH_NAME("Goblin::prove");

    prove_merge(transcript, merge_settings); // Use shared transcript for merge proving
    info("Goblin: num ultra ops = ", op_queue->get_ultra_ops_count());

    BB_ASSERT_EQ(merge_verification_queue.size(),
                 1U,
                 "Goblin::prove: merge_verification_queue should contain only a single proof at this stage.");
    goblin_proof.merge_proof = merge_verification_queue.back();

    vinfo("prove eccvm...");
    prove_eccvm();
    vinfo("finished eccvm proving.");
    vinfo("prove translator...");
    prove_translator();
    vinfo("finished translator proving.");
    return goblin_proof;
}

/**
 * @brief Recursively verify the next merge proof in the queue.
 * @details Merge proofs are verified in FIFO order to match the circuit accumulation order.
 * Each kernel verifies the merge proof from its corresponding app circuit. Since circuits
 * are accumulated in sequence (e.g., App₀ → Kernel₀ → App₁ → Kernel₁ → ..., though
 * in practice there can be repeated kernels such as inner → reset), the merge proofs must be
 * verified in the same order to maintain consistency of the op queue commitments.
 */
std::pair<Goblin::PairingPoints, Goblin::RecursiveTableCommitments> Goblin::recursively_verify_merge(
    MegaBuilder& builder,
    const RecursiveMergeCommitments& merge_commitments,
    const std::shared_ptr<RecursiveTranscript>& transcript,
    const MergeSettings merge_settings)
{
    BB_ASSERT(!merge_verification_queue.empty());
    const MergeProof& merge_proof = merge_verification_queue.front();
    const stdlib::Proof<MegaBuilder> stdlib_merge_proof(builder, merge_proof);

    MergeRecursiveVerifier merge_verifier{ merge_settings, transcript };
    auto merge_result = merge_verifier.reduce_to_pairing_check(stdlib_merge_proof, merge_commitments);

    merge_verification_queue.pop_front(); // remove the processed proof from the queue

    return { merge_result.pairing_points, merge_result.merged_commitments };
}

void Goblin::ensure_well_formed_op_queue_for_avm(MegaBuilder& builder) const
{
    BB_ASSERT_EQ(avm_mode, true, "ensure_well_formed_op_queue should only be called for avm");
    // Add Ultra ops for the Translator (no-op + 3 random ops as prefix for translator accumulation)
    builder.queue_ecc_no_op();
    builder.queue_ecc_random_op();
    builder.queue_ecc_random_op();
    builder.queue_ecc_random_op();
    // In the AVM Recursive Verifier case, we don't need ZK; so we place a deterministic non-op as a "hiding_op", it
    // does not contribute to the actual MSM circuit.
    using Fq = curve::Grumpkin::ScalarField;
    builder.queue_ecc_hiding_op(Fq(0), Fq(0));
}

} // namespace bb
