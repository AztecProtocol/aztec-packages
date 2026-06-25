// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/commitment_schemes/claim_batcher.hpp"
#include "barretenberg/commitment_schemes/small_subgroup_ipa/small_subgroup_ipa.hpp"
#include "barretenberg/eccvm/eccvm_flavor.hpp"
#include "barretenberg/eccvm/eccvm_short_monomial_flavor.hpp"
#include "barretenberg/goblin/translation_evaluations.hpp"
#include "barretenberg/honk/library/grand_product_library.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/sumcheck/sumcheck_output.hpp"
#include "barretenberg/sumcheck/zk_sumcheck_data.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

// The prover always runs sumcheck with the short-monomial flavor (faster sumcheck).
class ECCVMProver {
  public:
    using Flavor = ECCVMShortMonomialFlavor;
    using FF = Flavor::FF;
    using BF = Flavor::BF;
    using Commitment = Flavor::Commitment;
    using CommitmentKey = Flavor::CommitmentKey;
    using VerificationKey = Flavor::VerificationKey;
    using ProvingKey = Flavor::ProvingKey;
    using Polynomial = Flavor::Polynomial;
    using Commitments = typename Flavor::template AllEntities<Commitment>;
    using CommitmentLabels = Flavor::CommitmentLabels;
    using Transcript = Flavor::Transcript;
    using TranslationEvaluations = bb::TranslationEvaluations_<FF>;
    using CircuitBuilder = Flavor::CircuitBuilder;
    using ZKData = ZKSumcheckData<Flavor>;
    using SmallSubgroupIPA = SmallSubgroupIPAProver<Flavor>;
    using OpeningClaim = ProverOpeningClaim<Flavor::Curve>;
    using VerifierOpeningClaim = bb::OpeningClaim<Flavor::Curve>;
    using Proof = HonkProof;

    explicit ECCVMProver(CircuitBuilder& builder, const std::shared_ptr<Transcript>& transcript);

    BB_PROFILE void execute_preamble_round();
    BB_PROFILE void execute_wire_commitments_round();
    BB_PROFILE void execute_log_derivative_commitments_round();
    BB_PROFILE void execute_grand_product_computation_round();
    BB_PROFILE void execute_relation_check_rounds();
    BB_PROFILE void execute_transcript_consistency_univariate_opening_round();

    Proof export_proof();
    Proof construct_proof();

    // The ECCVM PCS pipeline collects all univariate opening claims, reduces them with one Shplonk, then opens the
    // sumcheck multilinears and reduced univariate claim with TripleIPA.
    void append_libra_opening_claims();
    void append_translation_opening_claims();
    void append_sumcheck_round_opening_claims();
    void append_pow_masking_opening_claim();
    std::pair<OpeningClaim, VerifierOpeningClaim> reduce_univariate_opening_claims();
    void prove_triple_ipa(const OpeningClaim& prover_opening, const VerifierOpeningClaim& verifier_opening);
    std::shared_ptr<Transcript> transcript;
    Proof ipa_proof;

    // Univariate opening claims collected for the single Shplonk reduction.
    ProverOpeningClaimBatcher<Flavor::Curve> univariate_claims;

    TranslationEvaluations translation_evaluations;

    std::vector<FF> public_inputs;

    bb::RelationParameters<FF> relation_parameters;

    std::shared_ptr<ProvingKey> key;
    Commitments commitments;

    CommitmentLabels commitment_labels;
    ZKData zk_sumcheck_data;

    FF evaluation_challenge_x;
    FF batching_challenge_v;

    SumcheckOutput<Flavor> sumcheck_output;
};

// Retained for call sites that name the TripleIPA prover explicitly; the ECCVM prover always uses it.
using ECCVMTripleIpaProver = ECCVMProver;

} // namespace bb
