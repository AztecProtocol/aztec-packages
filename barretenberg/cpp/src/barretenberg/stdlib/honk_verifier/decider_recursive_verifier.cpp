#include "barretenberg/stdlib/honk_verifier/decider_recursive_verifier.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb::stdlib::recursion::honk {

/**
 * @brief Create a circuit used to prove that a Protogalaxy folding verification was executed.
 *
 */
template <typename Flavor>
std::array<typename Flavor::GroupElement, 2> DeciderRecursiveVerifier_<Flavor>::verify_proof(const HonkProof& proof)
{
    using Sumcheck = ::bb::SumcheckVerifier<Flavor>;
    using PCS = typename Flavor::PCS;
    using Curve = typename Flavor::Curve;
    using Shplemini = ::bb::ShpleminiVerifier_<Curve>;
    using VerifierCommitments = typename Flavor::VerifierCommitments;
    using Transcript = typename Flavor::Transcript;

    StdlibProof<Builder> stdlib_proof = bb::convert_native_proof_to_stdlib(builder, proof);
    transcript = std::make_shared<Transcript>(stdlib_proof);

    VerifierCommitments commitments{ accumulator->verification_key, accumulator->witness_commitments };

    auto sumcheck = Sumcheck(
        static_cast<size_t>(accumulator->verification_key->log_circuit_size), transcript, accumulator->target_sum);

    auto [multivariate_challenge, claimed_evaluations, sumcheck_verified] =
        sumcheck.verify(accumulator->relation_parameters, accumulator->alphas, accumulator->gate_challenges);

    // Execute Shplemini rounds.
    const auto opening_claim = Shplemini::compute_batch_opening_claim(accumulator->verification_key->circuit_size,
                                                                      commitments.get_unshifted(),
                                                                      commitments.get_to_be_shifted(),
                                                                      claimed_evaluations.get_unshifted(),
                                                                      claimed_evaluations.get_shifted(),
                                                                      multivariate_challenge,
                                                                      Commitment::one(builder),
                                                                      transcript,
                                                                      Flavor::REPEATED_COMMITMENTS);
    auto pairing_points = PCS::reduce_verify_batch_opening_claim(opening_claim, transcript);

    return pairing_points;
}

template class DeciderRecursiveVerifier_<bb::MegaRecursiveFlavor_<MegaCircuitBuilder>>;
template class DeciderRecursiveVerifier_<bb::MegaRecursiveFlavor_<UltraCircuitBuilder>>;
template class DeciderRecursiveVerifier_<bb::UltraRecursiveFlavor_<CircuitSimulatorBN254>>;
template class DeciderRecursiveVerifier_<bb::MegaRecursiveFlavor_<CircuitSimulatorBN254>>;
} // namespace bb::stdlib::recursion::honk
