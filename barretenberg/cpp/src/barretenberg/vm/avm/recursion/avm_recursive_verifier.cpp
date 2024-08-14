#include "barretenberg/vm/avm/recursion/avm_recursive_verifier.hpp"
#include "barretenberg/commitment_schemes/zeromorph/zeromorph.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

template <typename Flavor>
AvmRecursiveVerifier_<Flavor>::AvmRecursiveVerifier_(
    Builder* builder, const std::shared_ptr<NativeVerificationKey>& native_verification_key)
    : key(std::make_shared<VerificationKey>(builder, native_verification_key))
    , builder(builder)
{}

template <typename Flavor>
AvmRecursiveVerifier_<Flavor>::AvmRecursiveVerifier_(Builder* builder, const std::shared_ptr<VerificationKey>& vkey)
    : key(vkey)
    , builder(builder)
{}

template <typename Flavor> void AvmRecursiveVerifier_<Flavor>::verify_proof(const HonkProof& proof)
{
    // TODO(md): enable zeromorph
    // using Curve = typename Flavor::Curve;
    // using Zeromorph = ZeroMorphVerifier_<Curve>;
    // using PCS = typename Flavor::PCS;

    // TODO(md): Questionable assignments
    // using Curve = typename Flavor::Curve;

    using VerifierCommitments = typename Flavor::VerifierCommitments;
    using CommitmentLabels = typename Flavor::CommitmentLabels;
    using RelationParams = ::bb::RelationParameters<typename Flavor::FF>;
    using Transcript = typename Flavor::Transcript;

    StdlibProof<Builder> stdlib_proof = bb::convert_proof_to_witness(builder, proof);
    info("converted proof to witness");
    transcript = std::make_shared<Transcript>(stdlib_proof);

    info("made transcript");

    RelationParams relation_parameters;
    VerifierCommitments commitments{ key };
    CommitmentLabels commitment_labels;

    const auto circuit_size = transcript->template receive_from_prover<FF>("circuit_size");
    // TODO: assert the same as the key circuit size?
    //  if (circuit_size != key->circuit_size) {
    //     return false;
    //  }
    info("got circuit size from prover: ", circuit_size);

    // Get commitments to VM wires
    for (auto [comm, label] : zip_view(commitments.get_wires(), commitment_labels.get_wires())) {
        comm = transcript->template receive_from_prover<Commitment>(label);
    }

    //     // Note(md): inherited from eccvm recursion
    //     // TODO(https://github.com/AztecProtocol/barretenberg/issues/1017): This is a hack to ensure zero commitments
    //     // are still on curve as the transcript doesn't currently support a point at infinity representation for
    //     // cycle_group
    //     if (!comm.get_value().on_curve()) {
    //         comm.set_point_at_infinity(true);
    //     }
    // }

    auto [beta, gamma] = transcript->template get_challenges<FF>("beta", "gamma");
    relation_parameters.beta = beta;
    relation_parameters.gamma = gamma;
    info("recursive beta / gamma ", beta, " | ", gamma);

    // Get commitments to inverses
    for (auto [label, commitment] : zip_view(commitment_labels.get_derived(), commitments.get_derived())) {
        commitment = transcript->template receive_from_prover<Commitment>(label);
    }

    info("got commitments from prover");

    // TODO(md): do we not need to hash the counts columns until the sumcheck rounds?

    // unconstrained
    const size_t log_circuit_size = numeric::get_msb(static_cast<uint32_t>(circuit_size.get_value()));
    auto sumcheck = SumcheckVerifier<Flavor>(log_circuit_size, transcript);

    FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");
    info("rec: sumcheck alpha: ", alpha);

    info("got sumcheck alpha");

    // TODO(md): do we want this to be an unrolled for loop?
    auto gate_challenges = std::vector<FF>(log_circuit_size);
    for (size_t idx = 0; idx < log_circuit_size; idx++) {
        gate_challenges[idx] = transcript->template get_challenge<FF>("Sumcheck:gate_challenge_" + std::to_string(idx));
        info(gate_challenges[idx]);
    }

    auto [multivariate_challenge, claimed_evaluations, sumcheck_verified] =
        sumcheck.verify(relation_parameters, alpha, gate_challenges);

    info("verified sumcheck: ", (sumcheck_verified.has_value() && sumcheck_verified.value()));

    // TODO(md): when calling `get_commitments` do the values get constrained in their origin? check that the zip_view
    // does in fact use the verifier type to get it?
    // TODO: will probably need to disable zeromorph for the meantime as we are not able to verify it natively at the
    // moment

    // info()
    // auto multivariate_to_univariate_opening_claim = Zeromorph::verify(commitments.get_unshifted(),
    //                                                                   commitments.get_to_be_shifted(),
    //                                                                   claimed_evaluations.get_unshifted(),
    //                                                                   claimed_evaluations.get_shifted(),
    //                                                                   multivatiate_challenge,
    //                                                                   key->pcs_verification_key->get_g1_identity(),
    //                                                                   transcript);

    // auto pairing_points = PCS::reduce_verify(multivariate_to_univariate_opening_claim, transcript);

    // info("pairing points size ", pairing_points.size());

    // TODO(md): call assert true on the builder type to lay down the positive boolean constraint?
}

template class AvmRecursiveVerifier_<AvmRecursiveFlavor_<UltraCircuitBuilder>>;
} // namespace bb