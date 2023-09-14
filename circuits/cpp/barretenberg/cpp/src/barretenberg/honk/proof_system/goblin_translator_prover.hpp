#pragma once
#include "barretenberg/honk/flavor/goblin_translator.hpp"
#include "barretenberg/honk/pcs/gemini/gemini.hpp"
#include "barretenberg/honk/pcs/shplonk/shplonk.hpp"
#include "barretenberg/honk/proof_system/work_queue.hpp"
#include "barretenberg/honk/sumcheck/relations/relation_parameters.hpp"
#include "barretenberg/honk/sumcheck/sumcheck_output.hpp"
#include "barretenberg/honk/transcript/transcript.hpp"
#include "barretenberg/plonk/proof_system/types/proof.hpp"

namespace proof_system::honk {

// We won't compile this class with honk::flavor::Standard, but we will like want to compile it (at least for testing)
// with a flavor that uses the curve Grumpkin, or a flavor that does/does not have zk, etc.
template <typename Flavor> class GoblinTranslatorProver_ {

    using FF = typename Flavor::FF;
    using PCSParams = typename Flavor::PCSParams;
    using PCS = typename Flavor::PCS;
    using PCSCommitmentKey = typename Flavor::PCSParams::CommitmentKey;
    using ProvingKey = typename Flavor::ProvingKey;
    using Polynomial = typename Flavor::Polynomial;
    using ProverPolynomials = typename Flavor::ProverPolynomials;
    using CommitmentLabels = typename Flavor::CommitmentLabels;
    static size_t constexpr MINI_CIRCUIT_SIZE = Flavor::MINI_CIRCUIT_SIZE;
    static size_t constexpr FULL_CIRCUIT_SIZE = Flavor::FULL_CIRCUIT_SIZE;

  public:
    explicit GoblinTranslatorProver_(std::shared_ptr<ProvingKey> input_key,
                                     std::shared_ptr<PCSCommitmentKey> commitment_key);

    void execute_preamble_round();
    void execute_wire_and_sorted_constraints_commitments_round();
    void execute_grand_product_computation_round();
    void execute_relation_check_rounds();
    void execute_univariatization_round();
    void execute_pcs_evaluation_round();
    void execute_shplonk_batched_quotient_round();
    void execute_shplonk_partial_evaluation_round();
    void execute_final_pcs_round();

    plonk::proof& export_proof();
    plonk::proof& construct_proof();

    ProverTranscript<FF> transcript;

    std::vector<FF> public_inputs;
    size_t pub_inputs_offset; // offset of the PI relative to 0th index in the wire polynomials

    sumcheck::RelationParameters<FF> relation_parameters;

    std::shared_ptr<ProvingKey> key;

    // Container for spans of all polynomials required by the prover (i.e. all multivariates evaluated by Sumcheck).
    ProverPolynomials prover_polynomials;

    CommitmentLabels commitment_labels;

    // Container for d + 1 Fold polynomials produced by Gemini
    std::vector<Polynomial> fold_polynomials;

    Polynomial batched_quotient_Q; // batched quotient poly computed by Shplonk
    FF nu_challenge;               // needed in both Shplonk rounds

    Polynomial quotient_W;

    work_queue<PCSParams> queue;

    sumcheck::SumcheckOutput<Flavor> sumcheck_output;
    pcs::gemini::ProverOutput<PCSParams> gemini_output;
    pcs::shplonk::ProverOutput<PCSParams> shplonk_output;
    std::shared_ptr<PCSCommitmentKey> pcs_commitment_key;

    using Gemini = pcs::gemini::GeminiProver_<PCSParams>;
    using Shplonk = pcs::shplonk::ShplonkProver_<PCSParams>;

  private:
    plonk::proof proof;
};

extern template class GoblinTranslatorProver_<honk::flavor::GoblinTranslatorBasic>;
using GoblinTranslatorProver = GoblinTranslatorProver_<honk::flavor::GoblinTranslatorBasic>;

} // namespace proof_system::honk
