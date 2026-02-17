// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/commitment_schemes/small_subgroup_ipa/small_subgroup_ipa.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/sumcheck/sumcheck_output.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include "barretenberg/ultra_honk/prover_instance.hpp"

namespace bb {

template <typename Flavor_> class UltraProver_ {
  public:
    using Flavor = Flavor_;
    using FF = typename Flavor::FF;
    using CommitmentKey = typename Flavor::CommitmentKey;
    using Curve = typename Flavor::Curve;
    using PCS = typename Flavor::PCS;
    using ProverInstance = ProverInstance_<Flavor>;
    using SmallSubgroupIPA = SmallSubgroupIPAProver<Flavor>;
    using HonkVK = typename Flavor::VerificationKey;
    using Transcript = typename Flavor::Transcript;
    using Proof = typename Transcript::Proof;
    using ZKData = ZKSumcheckData<Flavor>;

    explicit UltraProver_(std::shared_ptr<ProverInstance>,
                          const std::shared_ptr<HonkVK>&,
                          const std::shared_ptr<Transcript>& transcript = std::make_shared<Transcript>());

    Proof export_proof();
    Proof construct_proof();

    size_t num_public_inputs() const { return prover_instance->num_public_inputs(); }
    size_t log_dyadic_size() const { return prover_instance->log_dyadic_size(); }
    const std::shared_ptr<Transcript>& get_transcript() const { return transcript; }

  private:
    std::shared_ptr<ProverInstance> prover_instance;
    std::shared_ptr<Transcript> transcript;
    std::shared_ptr<HonkVK> honk_vk;
    SumcheckOutput<Flavor> sumcheck_output;
    ZKData zk_sumcheck_data;
    CommitmentKey commitment_key;

    size_t virtual_log_n; // Set during gate challenge generation, reused by sumcheck and PCS

    BB_PROFILE void execute_sumcheck_iop();
    BB_PROFILE void execute_pcs();
    BB_PROFILE void generate_gate_challenges();
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
