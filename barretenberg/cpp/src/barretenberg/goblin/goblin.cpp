// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "goblin.hpp"
#include "barretenberg/eccvm/eccvm_verifier.hpp"
#include "barretenberg/stdlib_circuit_builders/mock_circuits.hpp"
#include "barretenberg/translator_vm/translator_prover.hpp"
#include "barretenberg/translator_vm/translator_proving_key.hpp"
#include "barretenberg/translator_vm/translator_verifier.hpp"
#include "barretenberg/ultra_honk/merge_verifier.hpp"

namespace bb {

Goblin::Goblin(const std::shared_ptr<CommitmentKey<curve::BN254>>& bn254_commitment_key)
    : commitment_key(bn254_commitment_key)
{}

Goblin::MergeProof Goblin::prove_merge(MegaBuilder& circuit_builder)
{
    PROFILE_THIS_NAME("Goblin::merge");
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/993): Some circuits (particularly on the first call
    // to accumulate) may not have any goblin ecc ops prior to the call to merge(), so the commitment to the new
    // contribution (C_t_shift) in the merge prover will be the point at infinity. (Note: Some dummy ops are added
    // in 'add_gates_to_ensure...' but not until proving_key construction which comes later). See issue for ideas
    // about how to resolve.
    if (circuit_builder.blocks.ecc_op.size() == 0) {
        MockCircuits::construct_goblin_ecc_op_circuit(circuit_builder);
    }

    MergeProver merge_prover{ circuit_builder.op_queue, commitment_key };
    merge_proof = merge_prover.construct_proof();
    return merge_proof;
}

void Goblin::prove_eccvm()
{
    ECCVMBuilder eccvm_builder(op_queue);
    ECCVMProver eccvm_prover(eccvm_builder);
    goblin_proof.eccvm_proof = eccvm_prover.construct_proof();

    translation_batching_challenge_v = eccvm_prover.batching_challenge_v;
    evaluation_challenge_x = eccvm_prover.evaluation_challenge_x;
    transcript = eccvm_prover.transcript;
    goblin_proof.translation_evaluations = eccvm_prover.translation_evaluations;
}

void Goblin::prove_translator()
{
    PROFILE_THIS_NAME("Create TranslatorBuilder and TranslatorProver");
    TranslatorBuilder translator_builder(translation_batching_challenge_v, evaluation_challenge_x, op_queue);
    auto translator_key = std::make_shared<TranslatorProvingKey>(translator_builder, commitment_key);
    TranslatorProver translator_prover(translator_key, transcript);
    goblin_proof.translator_proof = translator_prover.construct_proof();
}

GoblinProof Goblin::prove(MergeProof merge_proof_in)
{
    PROFILE_THIS_NAME("Goblin::prove");

    info("Constructing a Goblin proof with num ultra ops = ", op_queue->get_ultra_ops_table_num_rows());

    goblin_proof.merge_proof = merge_proof_in.empty() ? std::move(merge_proof) : std::move(merge_proof_in);
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

bool Goblin::verify(const GoblinProof& proof)
{
    MergeVerifier merge_verifier;
    bool merge_verified = merge_verifier.verify_proof(proof.merge_proof);

    ECCVMVerifier eccvm_verifier{};
    bool eccvm_verified = eccvm_verifier.verify_proof(proof.eccvm_proof);

    TranslatorVerifier translator_verifier(eccvm_verifier.transcript);

    bool accumulator_construction_verified = translator_verifier.verify_proof(
        proof.translator_proof, eccvm_verifier.evaluation_challenge_x, eccvm_verifier.batching_challenge_v);

    bool translation_verified = translator_verifier.verify_translation(proof.translation_evaluations,
                                                                       eccvm_verifier.translation_masking_term_eval);

    vinfo("merge verified?: ", merge_verified);
    vinfo("eccvm verified?: ", eccvm_verified);
    vinfo("accumulator construction_verified?: ", accumulator_construction_verified);
    vinfo("translation verified?: ", translation_verified);

    return merge_verified && eccvm_verified && accumulator_construction_verified && translation_verified;
}

} // namespace bb
