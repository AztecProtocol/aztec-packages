// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/flavor/ultra_rollup_flavor.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/sumcheck/sumcheck_output.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include "barretenberg/ultra_honk/decider_proving_key.hpp"

namespace bb {

template <IsUltraOrMegaHonk Flavor_> class UltraProver_ {
  public:
    using Flavor = Flavor_;
    using FF = typename Flavor::FF;
    using Builder = typename Flavor::CircuitBuilder;
    using Commitment = typename Flavor::Commitment;
    using CommitmentKey = typename Flavor::CommitmentKey;
    using Polynomial = typename Flavor::Polynomial;
    using ProverPolynomials = typename Flavor::ProverPolynomials;
    using CommitmentLabels = typename Flavor::CommitmentLabels;
    using PCS = typename Flavor::PCS;
    using DeciderPK = DeciderProvingKey_<Flavor>;
    using HonkVK = typename Flavor::VerificationKey;
    using Transcript = typename Flavor::Transcript;

    std::shared_ptr<DeciderPK> proving_key;
    std::shared_ptr<HonkVK> honk_vk;

    std::shared_ptr<Transcript> transcript;

    bb::RelationParameters<FF> relation_parameters;

    Polynomial quotient_W;

    SumcheckOutput<Flavor> sumcheck_output;

    CommitmentKey commitment_key;

    UltraProver_(const std::shared_ptr<DeciderPK>&, const std::shared_ptr<HonkVK>&, const CommitmentKey&);

    explicit UltraProver_(const std::shared_ptr<DeciderPK>&,
                          const std::shared_ptr<HonkVK>&,
                          const std::shared_ptr<Transcript>& transcript = std::make_shared<Transcript>());

    explicit UltraProver_(Builder&,
                          const std::shared_ptr<HonkVK>&,
                          const std::shared_ptr<Transcript>& transcript = std::make_shared<Transcript>());

    explicit UltraProver_(Builder&&, const std::shared_ptr<HonkVK>&);

    BB_PROFILE void generate_gate_challenges();

    HonkProof export_proof();
    HonkProof construct_proof();
    HonkProof prove() { return construct_proof(); };
};

using UltraProver = UltraProver_<UltraFlavor>;
using UltraZKProver = UltraProver_<UltraZKFlavor>;
using UltraKeccakProver = UltraProver_<UltraKeccakFlavor>;
#ifdef STARKNET_GARAGA_FLAVORS
using UltraStarknetProver = UltraProver_<UltraStarknetFlavor>;
using UltraStarknetZKProver = UltraProver_<UltraStarknetZKFlavor>;
#endif
using UltraKeccakZKProver = UltraProver_<UltraKeccakZKFlavor>;
using MegaProver = UltraProver_<MegaFlavor>;
using MegaZKProver = UltraProver_<MegaZKFlavor>;

} // namespace bb
