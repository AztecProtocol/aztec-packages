// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "goblin.hpp"

#include "barretenberg/common/assert.hpp"
#include "barretenberg/eccvm/eccvm_verifier.hpp"
#include "barretenberg/translator_vm/translator_prover.hpp"
#include "barretenberg/translator_vm/translator_proving_key.hpp"
#include "barretenberg/translator_vm/translator_verifier.hpp"
#include "barretenberg/ultra_honk/merge_verifier.hpp"
#include <utility>

namespace bb {

Goblin::Goblin(CommitmentKey<curve::BN254> bn254_commitment_key, const std::shared_ptr<Transcript>& transcript)
    : commitment_key(std::move(bn254_commitment_key))
    , transcript(transcript)
{}

void Goblin::prove_merge(const std::shared_ptr<Transcript>& transcript, const MergeSettings merge_settings)
{
    PROFILE_THIS_NAME("Goblin::merge");
    MergeProver merge_prover{ op_queue, merge_settings, commitment_key, transcript };
    merge_verification_queue.push_back(merge_prover.construct_proof());
}

void Goblin::prove_eccvm()
{
    ECCVMBuilder eccvm_builder(op_queue);
    ECCVMProver eccvm_prover(eccvm_builder, transcript);
    goblin_proof.eccvm_proof = eccvm_prover.construct_proof();

    translation_batching_challenge_v = eccvm_prover.batching_challenge_v;
    evaluation_challenge_x = eccvm_prover.evaluation_challenge_x;
}

void Goblin::prove_translator()
{
    PROFILE_THIS_NAME("Create TranslatorBuilder and TranslatorProver");
    TranslatorBuilder translator_builder(translation_batching_challenge_v, evaluation_challenge_x, op_queue);
    auto translator_key = std::make_shared<TranslatorProvingKey>(translator_builder, commitment_key);
    TranslatorProver translator_prover(translator_key, transcript);
    goblin_proof.translator_proof = translator_prover.construct_proof();
}

GoblinProof Goblin::prove(const MergeSettings merge_settings)
{
    PROFILE_THIS_NAME("Goblin::prove");

    prove_merge(transcript, merge_settings); // Use shared transcript for merge proving
    info("Constructing a Goblin proof with num ultra ops = ", op_queue->get_ultra_ops_table_num_rows());

    BB_ASSERT_EQ(merge_verification_queue.size(),
                 1U,
                 "Goblin::prove: merge_verification_queue should contain only a single proof at this stage.");
    goblin_proof.merge_proof = merge_verification_queue.back();

    {
        PROFILE_THIS_NAME("prove_eccvm");
        vinfo("prove eccvm...");
        prove_eccvm();
        vinfo("finished eccvm proving.");
    }
    {
        PROFILE_THIS_NAME("prove_translator");
        vinfo("prove translator...");
        prove_translator();
        vinfo("finished translator proving.");
    }
    return goblin_proof;
}

std::pair<Goblin::PairingPoints, Goblin::RecursiveTableCommitments> Goblin::recursively_verify_merge(
    MegaBuilder& builder,
    const RecursiveMergeCommitments& merge_commitments,
    const std::shared_ptr<RecursiveTranscript>& transcript,
    const MergeSettings merge_settings)
{
    ASSERT(!merge_verification_queue.empty());
    // Recursively verify the next merge proof in the verification queue in a FIFO manner
    const MergeProof& merge_proof = merge_verification_queue.front();
    const stdlib::Proof<MegaBuilder> stdlib_merge_proof(builder, merge_proof);

    MergeRecursiveVerifier merge_verifier{ &builder, merge_settings, transcript };
    auto [pairing_points, merged_table_commitments] =
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
    auto [merge_verified, merged_table_commitments] = merge_verifier.verify_proof(proof.merge_proof, merge_commitments);

    ECCVMVerifier eccvm_verifier(transcript);
    bool eccvm_verified = eccvm_verifier.verify_proof(proof.eccvm_proof);

    TranslatorVerifier translator_verifier(transcript);

    bool accumulator_construction_verified = translator_verifier.verify_proof(
        proof.translator_proof, eccvm_verifier.evaluation_challenge_x, eccvm_verifier.batching_challenge_v);

    bool translation_verified = translator_verifier.verify_translation(eccvm_verifier.translation_evaluations,
                                                                       eccvm_verifier.translation_masking_term_eval);

    // Verify the consistency between the commitments to polynomials representing the op queue received by translator
    // and final merge verifier
    bool op_queue_consistency_verified =
        translator_verifier.verify_consistency_with_final_merge(merged_table_commitments);

    vinfo("merge verified?: ", merge_verified);
    vinfo("eccvm verified?: ", eccvm_verified);
    vinfo("accumulator construction_verified?: ", accumulator_construction_verified);
    vinfo("translation verified?: ", translation_verified);
    vinfo("consistency verified?: ", op_queue_consistency_verified);

    return merge_verified && eccvm_verified && accumulator_construction_verified && translation_verified &&
           op_queue_consistency_verified;
}

} // namespace bb
