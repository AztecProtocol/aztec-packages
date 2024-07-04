#include "./avm_recursive_verifier.hpp"
#include "barretenberg/commitment_schemes/zeromorph/zeromorph.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include "barretenberg/vm/recursion/avm_recursive_verifier.hpp"

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
    using Sumcheck = ::bb::SumcheckVerifier<Flavor>;
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

    const auto circuit_size = transcript->template receive_from_prover</*BaseField*/ BF>("circuit_size");
    info("got circuit size from prover");

    // TODO(md): emply the same updates on a new branch when doing the normal avm verifier!!!
    for (auto [comm, label] : zip_view(commitments.get_wires(), commitment_labels.get_wires())) {
        comm = transcript->template receive_from_prover<Commitment>(label);

        // Note(md): inherited from eccvm recursion
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1017): This is a hack to ensure zero commitments
        // are still on curve as the transcript doesn't currently support a point at infinity representation for
        // cycle_group
        if (!comm.get_value().on_curve()) {
            comm.set_point_at_infinity(true);
        }
    }
    info("got commitments from prover");

    auto [beta, gamma] = transcript->template get_challenges<FF>("beta", "gamma");

    relation_parameters.gamma = gamma;
    relation_parameters.beta = beta;

    info("got challeneges from prover");

    // TODO(md): Get commitments to the lookup inverses - WONT PASS WITHOUT THESE PULLED
    // TODO: maybe include these as a field in the flavor to make life easier? same as the trick above?
    commitments.perm_main_alu = transcript->template receive_from_prover<Commitment>(commitment_labels.perm_main_alu);
    commitments.perm_main_bin = transcript->template receive_from_prover<Commitment>(commitment_labels.perm_main_bin);
    commitments.perm_main_conv = transcript->template receive_from_prover<Commitment>(commitment_labels.perm_main_conv);
    commitments.perm_main_pos2_perm =
        transcript->template receive_from_prover<Commitment>(commitment_labels.perm_main_pos2_perm);
    commitments.perm_main_pedersen =
        transcript->template receive_from_prover<Commitment>(commitment_labels.perm_main_pedersen);
    commitments.perm_main_mem_a =
        transcript->template receive_from_prover<Commitment>(commitment_labels.perm_main_mem_a);
    commitments.perm_main_mem_b =
        transcript->template receive_from_prover<Commitment>(commitment_labels.perm_main_mem_b);
    commitments.perm_main_mem_c =
        transcript->template receive_from_prover<Commitment>(commitment_labels.perm_main_mem_c);
    commitments.perm_main_mem_d =
        transcript->template receive_from_prover<Commitment>(commitment_labels.perm_main_mem_d);
    commitments.perm_main_mem_ind_addr_a =
        transcript->template receive_from_prover<Commitment>(commitment_labels.perm_main_mem_ind_addr_a);
    commitments.perm_main_mem_ind_addr_b =
        transcript->template receive_from_prover<Commitment>(commitment_labels.perm_main_mem_ind_addr_b);
    commitments.perm_main_mem_ind_addr_c =
        transcript->template receive_from_prover<Commitment>(commitment_labels.perm_main_mem_ind_addr_c);
    commitments.perm_main_mem_ind_addr_d =
        transcript->template receive_from_prover<Commitment>(commitment_labels.perm_main_mem_ind_addr_d);
    commitments.lookup_byte_lengths =
        transcript->template receive_from_prover<Commitment>(commitment_labels.lookup_byte_lengths);
    commitments.lookup_byte_operations =
        transcript->template receive_from_prover<Commitment>(commitment_labels.lookup_byte_operations);
    commitments.lookup_opcode_gas =
        transcript->template receive_from_prover<Commitment>(commitment_labels.lookup_opcode_gas);
    commitments.range_check_l2_gas_hi =
        transcript->template receive_from_prover<Commitment>(commitment_labels.range_check_l2_gas_hi);
    commitments.range_check_l2_gas_lo =
        transcript->template receive_from_prover<Commitment>(commitment_labels.range_check_l2_gas_lo);
    commitments.range_check_da_gas_hi =
        transcript->template receive_from_prover<Commitment>(commitment_labels.range_check_da_gas_hi);
    commitments.range_check_da_gas_lo =
        transcript->template receive_from_prover<Commitment>(commitment_labels.range_check_da_gas_lo);
    commitments.kernel_output_lookup =
        transcript->template receive_from_prover<Commitment>(commitment_labels.kernel_output_lookup);
    commitments.lookup_into_kernel =
        transcript->template receive_from_prover<Commitment>(commitment_labels.lookup_into_kernel);
    commitments.incl_main_tag_err =
        transcript->template receive_from_prover<Commitment>(commitment_labels.incl_main_tag_err);
    commitments.incl_mem_tag_err =
        transcript->template receive_from_prover<Commitment>(commitment_labels.incl_mem_tag_err);
    commitments.lookup_mem_rng_chk_lo =
        transcript->template receive_from_prover<Commitment>(commitment_labels.lookup_mem_rng_chk_lo);
    commitments.lookup_mem_rng_chk_mid =
        transcript->template receive_from_prover<Commitment>(commitment_labels.lookup_mem_rng_chk_mid);
    commitments.lookup_mem_rng_chk_hi =
        transcript->template receive_from_prover<Commitment>(commitment_labels.lookup_mem_rng_chk_hi);
    commitments.lookup_pow_2_0 = transcript->template receive_from_prover<Commitment>(commitment_labels.lookup_pow_2_0);
    commitments.lookup_pow_2_1 = transcript->template receive_from_prover<Commitment>(commitment_labels.lookup_pow_2_1);
    commitments.lookup_u8_0 = transcript->template receive_from_prover<Commitment>(commitment_labels.lookup_u8_0);
    commitments.lookup_u8_1 = transcript->template receive_from_prover<Commitment>(commitment_labels.lookup_u8_1);
    commitments.lookup_u16_0 = transcript->template receive_from_prover<Commitment>(commitment_labels.lookup_u16_0);
    commitments.lookup_u16_1 = transcript->template receive_from_prover<Commitment>(commitment_labels.lookup_u16_1);
    commitments.lookup_u16_2 = transcript->template receive_from_prover<Commitment>(commitment_labels.lookup_u16_2);
    commitments.lookup_u16_3 = transcript->template receive_from_prover<Commitment>(commitment_labels.lookup_u16_3);
    commitments.lookup_u16_4 = transcript->template receive_from_prover<Commitment>(commitment_labels.lookup_u16_4);
    commitments.lookup_u16_5 = transcript->template receive_from_prover<Commitment>(commitment_labels.lookup_u16_5);
    commitments.lookup_u16_6 = transcript->template receive_from_prover<Commitment>(commitment_labels.lookup_u16_6);
    commitments.lookup_u16_7 = transcript->template receive_from_prover<Commitment>(commitment_labels.lookup_u16_7);
    commitments.lookup_u16_8 = transcript->template receive_from_prover<Commitment>(commitment_labels.lookup_u16_8);
    commitments.lookup_u16_9 = transcript->template receive_from_prover<Commitment>(commitment_labels.lookup_u16_9);
    commitments.lookup_u16_10 = transcript->template receive_from_prover<Commitment>(commitment_labels.lookup_u16_10);
    commitments.lookup_u16_11 = transcript->template receive_from_prover<Commitment>(commitment_labels.lookup_u16_11);
    commitments.lookup_u16_12 = transcript->template receive_from_prover<Commitment>(commitment_labels.lookup_u16_12);
    commitments.lookup_u16_13 = transcript->template receive_from_prover<Commitment>(commitment_labels.lookup_u16_13);
    commitments.lookup_u16_14 = transcript->template receive_from_prover<Commitment>(commitment_labels.lookup_u16_14);
    commitments.lookup_div_u16_0 =
        transcript->template receive_from_prover<Commitment>(commitment_labels.lookup_div_u16_0);
    commitments.lookup_div_u16_1 =
        transcript->template receive_from_prover<Commitment>(commitment_labels.lookup_div_u16_1);
    commitments.lookup_div_u16_2 =
        transcript->template receive_from_prover<Commitment>(commitment_labels.lookup_div_u16_2);
    commitments.lookup_div_u16_3 =
        transcript->template receive_from_prover<Commitment>(commitment_labels.lookup_div_u16_3);
    commitments.lookup_div_u16_4 =
        transcript->template receive_from_prover<Commitment>(commitment_labels.lookup_div_u16_4);
    commitments.lookup_div_u16_5 =
        transcript->template receive_from_prover<Commitment>(commitment_labels.lookup_div_u16_5);
    commitments.lookup_div_u16_6 =
        transcript->template receive_from_prover<Commitment>(commitment_labels.lookup_div_u16_6);
    commitments.lookup_div_u16_7 =
        transcript->template receive_from_prover<Commitment>(commitment_labels.lookup_div_u16_7);

    info("got inverse commitments");

    // TODO(md): do we not need to hash the counts columns until the sumcheck rounds?

    // unconstrained
    const size_t log_circuit_size = numeric::get_msb(static_cast<uint32_t>(circuit_size.get_value()));
    auto sumcheck = Sumcheck(log_circuit_size, transcript);

    FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");

    info("got sumcheck alpha");

    // TODO(md): do we want this to be an unrolled for loop?
    auto gate_challenges = std::vector<FF>(log_circuit_size);
    for (size_t idx = 0; idx < gate_challenges.size(); idx++) {
        gate_challenges[idx] = transcript->template get_challenge<FF>("Sumcheck:gate_challenge_" + std::to_string(idx));
    }

    auto [multivatiate_challenge, claimed_evaluations, sumcheck_verified] =
        sumcheck.verify(relation_parameters, alpha, gate_challenges);

    info("verified sumcheck: ", sumcheck_verified.value());

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