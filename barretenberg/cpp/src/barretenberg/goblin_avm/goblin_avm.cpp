// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
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

GoblinAvm::GoblinAvm(MegaBuilder& builder, const std::shared_ptr<Transcript>& avm_transcript)
{
    // Set members of base Goblin class
    avm_mode = true;
    op_queue = builder.op_queue;
    transcript = avm_transcript;

    // Construct zk columns to match Translator's expected structure
    op_queue->construct_zk_columns();
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
