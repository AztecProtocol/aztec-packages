// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "goblin_without_merge.hpp"

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

GoblinWithoutMerge::GoblinWithoutMerge(MegaBuilder& builder, const std::shared_ptr<Transcript>& avm_transcript)
    : original_is_zk(builder.op_queue->get_is_zk())
{
    // Set members of base Goblin class
    avm_mode = true;
    op_queue = builder.op_queue;
    transcript = avm_transcript;
    // The AVM proof doesn't need to be ZK
    op_queue->set_is_zk(false);

    /**
     * Add required initial ops to the op queue:
     * - Add 1 no-op (for shiftability)
     * - Add 3 no-op (in place of the 3 random ops for ZK hiding).
     * - Add 1 EQ op (op code 3 is required by Translator's relations)
     * This matches the structure expected by Translator. In Chonk, these ops are added automatically during
     * circuit accumulation, but AVM uses Goblin directly without the full Chonk IVC flow.
     *
     */
    builder.queue_ecc_no_op();
    builder.queue_ecc_no_op();
    builder.queue_ecc_no_op();
    builder.queue_ecc_no_op();
    builder.queue_ecc_eq();
}

GoblinWithoutMerge::GoblinWithoutMerge(std::shared_ptr<OpQueue>& existing_op_queue,
                                       const std::shared_ptr<Transcript>& flush_transcript)
    : original_is_zk(existing_op_queue->get_is_zk())
{
    avm_mode = true;
    op_queue = existing_op_queue;
    op_queue->set_is_zk(false);
    transcript = flush_transcript;
}

GoblinWithoutMergeProof GoblinWithoutMerge::prove()
{
    BB_BENCH_NAME("GoblinWithoutMerge::prove");

    vinfo("prove eccvm...");
    prove_eccvm();
    vinfo("finished eccvm proving.");
    vinfo("prove translator...");
    prove_translator();
    vinfo("finished translator proving.");

    // Restore original ZK setting of the op queue
    op_queue->set_is_zk(original_is_zk);

    return GoblinWithoutMergeProof{
        .eccvm_proof = std::move(goblin_proof.eccvm_proof),
        .ipa_proof = std::move(goblin_proof.ipa_proof),
        .translator_proof = std::move(goblin_proof.translator_proof),
    };
}

} // namespace bb
