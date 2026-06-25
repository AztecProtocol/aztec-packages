// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
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

Goblin::Goblin(const std::shared_ptr<Transcript>& transcript)
    : transcript(transcript)
{}

Goblin::MergeProof Goblin::prove_merge(const std::shared_ptr<Transcript>& transcript) const
{
    BB_BENCH_NAME("Goblin::prove_merge");
    MergeProver merge_prover{ op_queue, transcript };
    return merge_prover.construct_proof();
}

void Goblin::prove_eccvm()
{
    BB_BENCH_NAME("Goblin::prove_eccvm");
    // Scope the builder so it (and any circuit data) is freed before proving
    ECCVMProver eccvm_prover = [&]() {
        ECCVMBuilder eccvm_builder(op_queue);
        return ECCVMProver(eccvm_builder, transcript);
    }();

    goblin_proof.eccvm_proof = eccvm_prover.construct_proof();

    goblin_proof.ipa_proof = eccvm_prover.ipa_proof;
    translation_batching_challenge_v = eccvm_prover.batching_challenge_v;
    evaluation_challenge_x = eccvm_prover.evaluation_challenge_x;
}

void Goblin::prove_translator()
{
    BB_BENCH_NAME("Goblin::prove_translator");
    TranslatorBuilder translator_builder(translation_batching_challenge_v, evaluation_challenge_x, op_queue, avm_mode);
    auto translator_key = std::make_shared<TranslatorProvingKey>(translator_builder);
    TranslatorProver translator_prover(translator_key, transcript);
    goblin_proof.translator_proof = translator_prover.construct_proof();
}

GoblinProof Goblin::prove()
{
    BB_BENCH_NAME("Goblin::prove");

    goblin_proof.merge_proof = prove_merge(transcript); // Use shared transcript for merge proving
    info("Goblin: num ultra ops = ", op_queue->get_ultra_ops_count());

    vinfo("prove eccvm...");
    prove_eccvm();
    vinfo("finished eccvm proving.");
    vinfo("prove translator...");
    prove_translator();
    vinfo("finished translator proving.");
    return goblin_proof;
}

/**
 * @brief Generate proof of the batch merge
 *
 * @details During Chonk, we accumulate all the ecc ops into subtables. After having accumulated the tail circuit, we
 * generate a proof of the batch merge: we take the tables T_1, .., T_N (where T_N is the table of ecc ops coming from
 * the tail circuit) and we generate a proof that T_zk || T_1 || .. || T_N = T, where T_zk is a table generated on the
 * fly by the prover to make the merged table T zero-knowledge. The consistency between the commitments sent by the
 * prover in the batch merge and the ones generated during Chonk accumulation is enforced via a hash check: each kernel
 * updates a running hash using the commitments to the ecc op tables of the circuits it folds. The final hash is passed
 * to the batch merge verifier, which uses it to enforce the consistency between the data sent by the prover and the one
 * used during accumulation.
 *
 */
void Goblin::prove_batch_merge()
{
    BB_BENCH_NAME("Goblin::prove_batch_merge");
    BatchMergeProver prover{ op_queue, CHONK_MAX_NUM_CIRCUITS };
    batch_merge_proof = prover.construct_proof();
}

/**
 * @brief Recursively verify the batch merge proof
 *
 * @param builder
 * @param hash Hash computed by the kernels during Chonk accumulation
 *
 * @details The hash commits to the data used during accumulation and is used by the batch merge verifier to enforce
 * consistency between the data sent by the prover and the one used during accumulation.
 * @return std::pair<Goblin::PairingPoints, Goblin::BatchRecursiveTableCommitments>
 */
std::pair<Goblin::PairingPoints, Goblin::BatchRecursiveTableCommitments> Goblin::recursively_verify_batch_merge(
    MegaBuilder& builder, const BatchMergeRecursiveVerifier::FF& hash) const
{
    BB_ASSERT(!batch_merge_proof.empty(), "Goblin::recursively_verify_batch_merge: no batch merge proof available");
    const stdlib::Proof<MegaBuilder> stdlib_proof(builder, batch_merge_proof);

    BatchMergeRecursiveVerifier verifier;
    auto result = verifier.reduce_to_pairing_check(stdlib_proof, hash);

    return { result.pairing_points, result.merged_commitments };
}

} // namespace bb
