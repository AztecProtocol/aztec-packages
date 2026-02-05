// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/ultra_honk/multi_mega_prover.hpp"
#include "barretenberg/commitment_schemes/gemini/gemini.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/ultra_honk/multi_mega_oink_prover.hpp"

namespace bb {

MultiMegaProver::MultiMegaProver(const std::shared_ptr<ProverInstance>& prover_instance,
                                 const std::shared_ptr<HonkVK>& honk_vk,
                                 const CommitmentKey& commitment_key)
    : prover_instance(std::move(prover_instance))
    , honk_vk(honk_vk)
    , transcript(std::make_shared<Transcript>())
    , commitment_key(commitment_key)
{}

MultiMegaProver::MultiMegaProver(const std::shared_ptr<ProverInstance>& prover_instance,
                                 const std::shared_ptr<HonkVK>& honk_vk,
                                 const std::shared_ptr<Transcript>& transcript)
    : prover_instance(std::move(prover_instance))
    , honk_vk(honk_vk)
    , transcript(transcript)
    , commitment_key(prover_instance->commitment_key)
{}

MultiMegaProver::MultiMegaProver(Builder& circuit,
                                 const std::shared_ptr<HonkVK>& honk_vk,
                                 const std::shared_ptr<Transcript>& transcript)
    : prover_instance(std::make_shared<ProverInstance>(circuit))
    , honk_vk(honk_vk)
    , transcript(transcript)
    , commitment_key(prover_instance->commitment_key)
{}

MultiMegaProver::MultiMegaProver(Builder&& circuit, const std::shared_ptr<HonkVK>& honk_vk)
    : prover_instance(std::make_shared<ProverInstance>(circuit))
    , honk_vk(honk_vk)
    , transcript(std::make_shared<Transcript>())
    , commitment_key(prover_instance->commitment_key)
{}

MultiMegaProver::Proof MultiMegaProver::export_proof()
{
    auto proof = transcript->export_proof();

    // Append IPA proof if present
    if (!prover_instance->ipa_proof.empty()) {
        proof.insert(proof.end(), prover_instance->ipa_proof.begin(), prover_instance->ipa_proof.end());
    }

    return proof;
}

void MultiMegaProver::generate_gate_challenges()
{
    const size_t virtual_log_n =
        Flavor::USE_PADDING ? Flavor::VIRTUAL_LOG_N : static_cast<size_t>(prover_instance->log_dyadic_size());

    prover_instance->gate_challenges =
        transcript->template get_dyadic_powers_of_challenge<FF>("Sumcheck:gate_challenge", virtual_log_n);
}

MultiMegaProver::Proof MultiMegaProver::construct_proof()
{
    // Use MultiMegaOinkProver for interleaved commitments
    MultiMegaOinkProver oink_prover(prover_instance, honk_vk, transcript);
    oink_prover.prove();

    // Store interleaved commitments for later use (e.g., by verifier via transcript)
    interleaved_commitments = oink_prover.interleaved_commitments;

    vinfo("created oink proof with interleaved commitments");

    generate_gate_challenges();

    // Run sumcheck
    execute_sumcheck_iop();
    vinfo("finished relation check rounds");

    // Execute Shplemini PCS
    execute_pcs();
    vinfo("finished PCS rounds");

    return export_proof();
}

void MultiMegaProver::execute_sumcheck_iop()
{
    const size_t virtual_log_n = Flavor::USE_PADDING ? Flavor::VIRTUAL_LOG_N : prover_instance->log_dyadic_size();

    using Sumcheck = SumcheckProver<Flavor>;
    size_t polynomial_size = prover_instance->dyadic_size();
    Sumcheck sumcheck(polynomial_size,
                      prover_instance->polynomials,
                      transcript,
                      prover_instance->alpha,
                      prover_instance->gate_challenges,
                      prover_instance->relation_parameters,
                      virtual_log_n);
    {
        BB_BENCH_NAME("sumcheck.prove");
        sumcheck_output = sumcheck.prove();
    }
}

void MultiMegaProver::execute_pcs()
{
    using OpeningClaim = ProverOpeningClaim<Curve>;
    using PolynomialBatcher = GeminiProver_<Curve>::PolynomialBatcher;

    auto& ck = prover_instance->commitment_key;
    if (!ck.initialized()) {
        // For interleaved commitments, we need 4x the polynomial size for the SRS
        ck = CommitmentKey(prover_instance->dyadic_size() * Flavor::INTERLEAVING_BATCH_SIZE);
    }

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/XXXX): Implement proper interleaved polynomial batching
    // For now, use standard batching - the verifier will need to match this
    PolynomialBatcher polynomial_batcher(prover_instance->dyadic_size());
    polynomial_batcher.set_unshifted(prover_instance->polynomials.get_unshifted());
    polynomial_batcher.set_to_be_shifted_by_one(prover_instance->polynomials.get_to_be_shifted());

    // For interleaved polynomials, the shift is by INTERLEAVING_BATCH_SIZE (4) instead of 1
    constexpr size_t SHIFT_EXPONENT = Flavor::INTERLEAVING_BATCH_SIZE;

    OpeningClaim prover_opening_claim;
    prover_opening_claim = ShpleminiProver_<Curve>::prove(prover_instance->dyadic_size(),
                                                          polynomial_batcher,
                                                          sumcheck_output.challenge,
                                                          ck,
                                                          transcript,
                                                          {} /* libra_polynomials */,
                                                          {} /* sumcheck_round_univariates */,
                                                          {} /* sumcheck_round_evaluations */,
                                                          SHIFT_EXPONENT);

    vinfo("executed multivariate-to-univariate reduction");
    PCS::compute_opening_proof(ck, prover_opening_claim, transcript);
    vinfo("computed opening proof");
}

} // namespace bb
