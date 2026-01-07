// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/eccvm/eccvm_flavor.hpp"
#include "barretenberg/eccvm/eccvm_prover.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/goblin_avm/types.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/translator_vm/translator_circuit_builder.hpp"
#include "barretenberg/translator_vm/translator_flavor.hpp"
#include "barretenberg/ultra_honk/prover_instance.hpp"

namespace bb {

/**
 * @brief Specialization of Goblin for the AVM
 *
 * @details The AVM uses Goblin for recursive verification to avoid bloating circuit size due to the large number of
 * witness entities. As there is only one circuit, we don't need to perform a Merge, we can simply use as input to the
 * Goblin proof the table of ECC ops produced by the circuit containing the AVM recursive verifier. This class
 * specializes the Goblin constructor and Goblin::prove() method for the AVM case.
 */
class GoblinAvm : public Goblin {
  public:
    using ECCVMVerificationKey = ECCVMFlavor::VerificationKey;
    using TranslatorVerificationKey = TranslatorFlavor::VerificationKey;

    GoblinAvm(MegaBuilder& builder,
              CommitmentKey<curve::BN254> bn254_commitment_key = CommitmentKey<curve::BN254>(),
              const std::shared_ptr<Transcript>& transcript = std::make_shared<Transcript>());

    /**
     * @brief Constuct a full GoblinAvm proof (ECCVM, Translator)
     *
     * @return Proof
     */
    GoblinAvmProof prove();
};

} // namespace bb
