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

GoblinAvm::GoblinAvm(Builder& builder, const std::shared_ptr<Transcript>& avm_transcript)
{
    // Set members of base Goblin class
    avm_mode = true;
    op_queue = builder.op_queue;
    transcript = avm_transcript;

    /**
     * Add required initial ops to the op queue:
     * - Add 1 no-op (for shiftability of Translator op queue wires)
     * - Add 3 random ops (for ZK hiding of accumulation result).
     * This matches the structure expected by Translator. In Chonk, these ops are added by the tail kernel; AVM uses
     * Goblin directly without the full Chonk IVC flow, so it queues them explicitly here.
     */
    builder.queue_ecc_no_op();
    builder.queue_ecc_random_op();
    builder.queue_ecc_random_op();
    builder.queue_ecc_random_op();
    // The AVM does not need ZK, so the hiding op uses fixed (0, 0) coordinates. It is still a genuine eq-and-reset op:
    // the Translator accumulates it at RESULT_ROW and the ECCVM places it on row 1, where the equality and on-curve
    // checks are disabled.
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
