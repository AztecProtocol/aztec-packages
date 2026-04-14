// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Federico], commit: 0e37cb8}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================
#pragma once

#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/sumcheck/sumcheck_output.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include "barretenberg/vm2/constraining/flavor.hpp"

namespace bb::avm2 {

class AvmProver {
  public:
    using Flavor = AvmFlavor;
    using FF = Flavor::FF;
    using PCS = Flavor::PCS;
    using Curve = Flavor::Curve;
    using PCSCommitmentKey = Flavor::CommitmentKey;
    using ProvingKey = Flavor::ProvingKey;
    using VerificationKey = Flavor::VerificationKey;
    using Polynomial = Flavor::Polynomial;
    using ProverPolynomials = Flavor::ProverPolynomials;
    using Transcript = Flavor::Transcript;
    using Proof = HonkProof;

    explicit AvmProver(std::shared_ptr<ProvingKey> input_proving_key,
                       std::shared_ptr<VerificationKey> vk,
                       const PCSCommitmentKey& commitment_key);
    AvmProver(AvmProver&& prover) = default;
    virtual ~AvmProver() = default;

    void execute_preamble_round();
    void execute_public_inputs_round();
    void execute_wire_commitments_round();
    void execute_log_derivative_inverse_round();
    void execute_log_derivative_inverse_commitments_round();
    void execute_relation_check_rounds();
    void execute_pcs_rounds();

    HonkProof export_proof();
    HonkProof construct_proof();

    std::shared_ptr<Transcript> transcript = std::make_shared<Transcript>();

    std::vector<FF> public_inputs;

    bb::RelationParameters<FF> relation_parameters;

    std::shared_ptr<ProvingKey> proving_key;
    std::shared_ptr<VerificationKey> vk;

    // Container for spans of all polynomials required by the prover (i.e. all multivariates evaluated by Sumcheck).
    ProverPolynomials prover_polynomials;

    SumcheckOutput<Flavor> sumcheck_output;

    PCSCommitmentKey commitment_key;
};

} // namespace bb::avm2
