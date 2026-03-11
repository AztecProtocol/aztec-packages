// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/flavor/flavor_concepts.hpp"
#include "barretenberg/flavor/multi_mega_flavor.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"

namespace bb {

/**
 * @brief Prover for MultiMega flavors using interleaved commitments.
 * @details Inherits from UltraProver_ to reuse sumcheck, gate challenges, and export_proof.
 *          Overrides construct_proof() with interleaved oink + PCS flow.
 *
 * @tparam Flavor_ MultiMegaFlavor or MultiMegaZKFlavor
 */
template <IsMultiMegaFlavor Flavor_> class MultiHonkProver_ : public UltraProver_<Flavor_> {
    using Base = UltraProver_<Flavor_>;

  public:
    using Flavor = Flavor_;
    using typename Base::CommitmentKey;
    using typename Base::Curve;
    using typename Base::FF;
    using Polynomial = typename Flavor::Polynomial;
    using typename Base::Proof;
    using typename Base::ProverInstance;
    using typename Base::SmallSubgroupIPA;
    using typename Base::Transcript;
    using Builder = typename Flavor::CircuitBuilder;
    using PCS = typename Flavor::PCS;

    // Storage for interleaved commitments from OinkProver
    typename Flavor::InterleavedCommitments interleaved_commitments;

    MultiHonkProver_(const std::shared_ptr<ProverInstance>&,
                     const std::shared_ptr<typename Base::HonkVK>&,
                     const CommitmentKey&);

    explicit MultiHonkProver_(const std::shared_ptr<ProverInstance>&,
                              const std::shared_ptr<typename Base::HonkVK>&,
                              const std::shared_ptr<Transcript>& transcript = std::make_shared<Transcript>());

    explicit MultiHonkProver_(Builder&,
                              const std::shared_ptr<typename Base::HonkVK>&,
                              const std::shared_ptr<Transcript>& transcript = std::make_shared<Transcript>());

    explicit MultiHonkProver_(Builder&&, const std::shared_ptr<typename Base::HonkVK>&);

    Proof construct_proof();
    Proof prove() { return construct_proof(); }

  private:
    void execute_pcs();
};

using MultiHonkProver = MultiHonkProver_<MultiMegaFlavor>;

} // namespace bb
