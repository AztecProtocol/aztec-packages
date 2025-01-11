#pragma once
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_rollup_flavor.hpp"
#include "barretenberg/sumcheck/sumcheck_output.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include "barretenberg/ultra_honk/decider_proving_key.hpp"

namespace bb {

template <IsUltraFlavor Flavor_> class UltraProver_ {
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
    using DeciderProvingKey = DeciderProvingKey_<Flavor>;
    using DeciderPK = DeciderProvingKey;
    using Transcript = typename Flavor::Transcript;

    std::shared_ptr<DeciderPK> proving_key;

    std::shared_ptr<Transcript> transcript;

    bb::RelationParameters<FF> relation_parameters;

    Polynomial quotient_W;

    SumcheckOutput<Flavor> sumcheck_output;

    std::shared_ptr<CommitmentKey> commitment_key;

    UltraProver_(const std::shared_ptr<DeciderPK>&, const std::shared_ptr<CommitmentKey>&);

    explicit UltraProver_(const std::shared_ptr<DeciderPK>&,
                          const std::shared_ptr<Transcript>& transcript = std::make_shared<Transcript>());

    explicit UltraProver_(Builder&);

    BB_PROFILE void generate_gate_challenges();

    HonkProof export_proof();
    HonkProof construct_proof();
    HonkProof prove() { return construct_proof(); };

  private:
    HonkProof proof;
};

using UltraProver = UltraProver_<UltraFlavor>;
using UltraKeccakProver = UltraProver_<UltraKeccakFlavor>;
using UltraStarknetProver = UltraProver_<UltraStarknetFlavor>;
using MegaProver = UltraProver_<MegaFlavor>;
using MegaZKProver = UltraProver_<MegaZKFlavor>;

} // namespace bb
