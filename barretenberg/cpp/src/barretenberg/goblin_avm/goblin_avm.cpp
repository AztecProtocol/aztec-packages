// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "goblin_avm.hpp"

#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/eccvm/eccvm_flavor.hpp"
#include "barretenberg/eccvm/eccvm_verifier.hpp"
#include "barretenberg/goblin/goblin_verifier.hpp"
#include "barretenberg/op_queue/ecc_ops_table.hpp"
#include "barretenberg/translator_vm/translator_prover.hpp"
#include "barretenberg/translator_vm/translator_proving_key.hpp"
#include "barretenberg/translator_vm/translator_verifier.hpp"
#include <utility>

namespace bb {

GoblinAvm::GoblinAvm(MegaBuilder& builder,
                     CommitmentKey<curve::BN254> bn254_commitment_key,
                     const std::shared_ptr<Transcript>& avm_transcript)
{
    // Set members of base Goblin class
    avm_mode = true;
    op_queue = builder.op_queue;
    transcript = avm_transcript;
    commitment_key = std::move(bn254_commitment_key);

    /**
     * Add required initial ops to the op queue:
     * - Add 1 no-op (for shiftability)
     * - Add 3 random ops (for ZK hiding of accumulation result).
     * This matches the structure expected by Translator. In Chonk, these ops are added automatically during
     * circuit accumulation, but AVM uses Goblin directly without the full Chonk IVC flow.
     *
     */
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1537): Assess whether two Translator variants (one
    // with ZK and one without) would be a better option
    builder.queue_ecc_no_op();
    builder.queue_ecc_random_op();
    builder.queue_ecc_random_op();
    builder.queue_ecc_random_op();
    // In the AVM Recursive Verifier case, we don't need ZK; so we place a deterministic non-op as a "hiding_op", it
    // does not contribute to the actual MSM circuit.
    using Fq = curve::Grumpkin::ScalarField;
    builder.queue_ecc_hiding_op(Fq(0), Fq(0));
}

GoblinAvmProof GoblinAvm::prove()
{
    BB_BENCH_NAME("GoblinAvm::prove");

    op_queue->merge();
    info("GoblinAvm: num ultra ops = ", op_queue->get_ultra_ops_count());

    vinfo("prove eccvm...");
    prove_eccvm();
    vinfo("finished eccvm proving.");
    vinfo("prove translator...");
    prove_translator();
    vinfo("finished translator proving.");

    return GoblinAvmProof{
        .eccvm_proof = std::move(goblin_proof.eccvm_proof),
        .ipa_proof = std::move(goblin_proof.ipa_proof),
        .translator_proof = std::move(goblin_proof.translator_proof),
    };
}

} // namespace bb
