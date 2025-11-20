// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "goblin.hpp"

#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/eccvm/eccvm_flavor.hpp"
#include "barretenberg/eccvm/eccvm_verifier.hpp"
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
    ECCVMFlavor::PCS::compute_opening_proof(eccvm_prover.key->commitment_key, opening_claim, ipa_transcript);
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

std::pair<Goblin::PairingPoints, Goblin::RecursiveTableCommitments> Goblin::recursively_verify_merge(
    MegaBuilder& builder,
    const RecursiveMergeCommitments& merge_commitments,
    const std::shared_ptr<RecursiveTranscript>& transcript,
    const MergeSettings merge_settings)
{
    BB_ASSERT(!merge_verification_queue.empty());
    // Recursively verify the next merge proof in the verification queue in a FIFO manner
    const MergeProof& merge_proof = merge_verification_queue.front();
    const stdlib::Proof<MegaBuilder> stdlib_merge_proof(builder, merge_proof);

    MergeRecursiveVerifier merge_verifier{ merge_settings, transcript };
    auto [pairing_points, merged_table_commitments, degree_check_passed, concatenation_check_passed] =
        merge_verifier.verify_proof(stdlib_merge_proof, merge_commitments);

    merge_verification_queue.pop_front(); // remove the processed proof from the queue

    return { pairing_points, merged_table_commitments };
}

bool Goblin::verify(const GoblinProof& proof,
                    const MergeCommitments& merge_commitments,
                    const std::shared_ptr<Transcript>& transcript,
                    const MergeSettings merge_settings)
{
    MergeVerifier merge_verifier(merge_settings, transcript);
    auto [merge_pairing_points, merged_table_commitments, degree_check_passed, concatenation_check_passed] =
        merge_verifier.verify_proof(proof.merge_proof, merge_commitments);
    bool merge_verified = merge_pairing_points.check() && degree_check_passed && concatenation_check_passed;

    ECCVMVerifier_<ECCVMFlavor> eccvm_verifier(transcript);
    auto opening_claim = eccvm_verifier.verify_proof(proof.eccvm_proof);

    // Verify IPA opening
    auto ipa_transcript = std::make_shared<NativeTranscript>(proof.ipa_proof);
    bool ipa_verified =
        ECCVMFlavor::PCS::reduce_verify(eccvm_verifier.key->pcs_verification_key, opening_claim, ipa_transcript);

    vinfo("eccvm ipa verified?: ", ipa_verified);
    bool eccvm_verified = ipa_verified && eccvm_verifier.sumcheck_verified && eccvm_verifier.consistency_checked &&
                          eccvm_verifier.translation_masking_consistency_checked;

    TranslatorVerifier translator_verifier(transcript);

    // Get translation data from ECCVM verifier to pass to Translator verifier
    TranslatorInputData translator_input = eccvm_verifier.get_translator_input_data();
    // Pass merge commitments as op queue wire commitments (they represent the same data)
    bool translator_verified = translator_verifier.verify_proof(proof.translator_proof,
                                                                translator_input.evaluation_challenge_x,
                                                                translator_input.batching_challenge_v,
                                                                translator_input.accumulated_result,
                                                                merged_table_commitments);

    vinfo("merge verified?: ", merge_verified);
    vinfo("eccvm verified?: ", eccvm_verified);
    vinfo("translator verified?: ", translator_verified);

    return merge_verified && eccvm_verified && translator_verified;
}

void Goblin::ensure_well_formed_op_queue_for_avm(MegaBuilder& builder) const
{
    BB_ASSERT_EQ(avm_mode, true, "ensure_well_formed_op_queue should only be called for avm");
    builder.queue_ecc_no_op();
    builder.queue_ecc_random_op();
    builder.queue_ecc_random_op();
    builder.queue_ecc_random_op();
}

} // namespace bb
