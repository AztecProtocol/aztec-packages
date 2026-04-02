// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/goblin_avm/types.hpp"

namespace bb {

/**
 * @brief Specialization of Goblin without the Merge protocol
 *
 * @details Used when there is only one circuit (or a single merged table is provided externally), so we
 * don't need to perform a Merge. The Goblin proof consists only of ECCVM + Translator.
 * This is used by the AVM recursive verifier and the Goblin flush mechanism.
 */
class GoblinWithoutMerge : public Goblin {
  public:
    using ECCVMVerificationKey = ECCVMFlavor::VerificationKey;
    using TranslatorVerificationKey = TranslatorFlavor::VerificationKey;

    /**
     * @brief Construct for AVM case: takes a builder, adds required initial ECC ops
     */
    explicit GoblinWithoutMerge(MegaBuilder& builder,
                                const std::shared_ptr<Transcript>& transcript = std::make_shared<Transcript>());

    /**
     * @brief Construct a full proof without merge (ECCVM, Translator)
     *
     * @return GoblinWithoutMergeProof
     */
    GoblinWithoutMergeProof prove();
};
using GoblinAvm = GoblinWithoutMerge;

} // namespace bb
