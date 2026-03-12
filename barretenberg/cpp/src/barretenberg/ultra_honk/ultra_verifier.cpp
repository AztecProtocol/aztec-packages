// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "./ultra_verifier.hpp"
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/commitment_schemes/pairing_points.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/flavor/mega_avm_recursive_flavor.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/flavor/mega_recursive_flavor.hpp"
#include "barretenberg/flavor/mega_zk_flavor.hpp"
#include "barretenberg/flavor/mega_zk_recursive_flavor.hpp"
#include "barretenberg/flavor/ultra_zk_recursive_flavor.hpp"
#include "barretenberg/honk/proof_length.hpp"
#include "barretenberg/stdlib/primitives/padding_indicator_array/padding_indicator_array.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/ultra_honk/oink_verifier.hpp"

namespace bb {

/**
 * @brief Assemble PCS commitments from the verifier instance.
 * @details For BS=1: wraps individual commitments from VerifierCommitments.
 *          For BS>1: concatenates interleaved precomputed + witness commitments.
 */
template <typename Flavor, typename Instance> static auto build_pcs_commitments(Instance& instance)
{
    using Commitment = typename Flavor::Commitment;
    constexpr size_t BATCH_SIZE = Flavor::INTERLEAVING_BATCH_SIZE;

    struct Result {
        std::vector<Commitment> unshifted;
        std::vector<Commitment> to_be_shifted;
    };

    Result result;

    if constexpr (BATCH_SIZE > 1) {
        auto vk = instance.get_vk();
        auto& interleaved = instance.interleaved_commitments;
        auto refs = concatenate(vk->get_all(), interleaved.get_all());
        result.unshifted.reserve(refs.size());
        for (auto& c : refs) {
            result.unshifted.push_back(c);
        }
        for (auto& c : interleaved.get_shiftable()) {
            result.to_be_shifted.push_back(c);
        }
    } else {
        typename Flavor::VerifierCommitments commitments{ instance.get_vk(), instance.witness_commitments };
        if constexpr (Flavor::HasZK) {
            commitments.gemini_masking_poly = instance.gemini_masking_commitment;
        }
        for (auto& c : commitments.get_unshifted()) {
            result.unshifted.push_back(c);
        }
        for (auto& c : commitments.get_to_be_shifted()) {
            result.to_be_shifted.push_back(c);
        }
    }

    return result;
}

/**
 * @brief Compute PCS evaluations from sumcheck claimed evaluations.
 * @details For BS=1: evaluations are used directly (identity).
 *          For BS>1: groups individual evaluations and combines via Lagrange basis.
 */
template <typename Flavor>
static auto build_pcs_evaluations(typename Flavor::AllValues& claimed_evaluations,
                                  std::span<const typename Flavor::FF> interleaving_challenges)
{
    using FF = typename Flavor::FF;
    constexpr size_t BATCH_SIZE = Flavor::INTERLEAVING_BATCH_SIZE;

    struct Result {
        std::vector<FF> unshifted;
        std::vector<FF> shifted;
    };

    Result result;

    if constexpr (BATCH_SIZE > 1) {
        auto lagrange_basis = Flavor::compute_lagrange_basis(interleaving_challenges);

        auto compute_group_evals = [&](const auto& eval_groups) {
            std::vector<FF> group_evals(eval_groups.size());
            for (size_t i = 0; i < eval_groups.size(); i++) {
                FF eval(0);
                for (size_t j = 0; j < BATCH_SIZE; j++) {
                    if (j < eval_groups[i].size() && eval_groups[i][j] != nullptr) {
                        eval += *eval_groups[i][j] * lagrange_basis[j];
                    }
                }
                group_evals[i] = eval;
            }
            return group_evals;
        };

        result.unshifted = compute_group_evals(Flavor::get_unshifted_groups(claimed_evaluations));
        result.shifted = compute_group_evals(Flavor::get_shifted_groups(claimed_evaluations));
    } else {
        for (auto& e : claimed_evaluations.get_unshifted()) {
            result.unshifted.push_back(e);
        }
        for (auto& e : claimed_evaluations.get_shifted()) {
            result.shifted.push_back(e);
        }
    }

    return result;
}

template <typename Flavor, class IO> size_t UltraVerifier_<Flavor, IO>::compute_log_n() const
{
    if constexpr (Flavor::USE_PADDING) {
        return static_cast<size_t>(Flavor::VIRTUAL_LOG_N);
    } else {
        return static_cast<size_t>(verifier_instance->get_vk()->log_circuit_size);
    }
}

template <typename Flavor, class IO>
std::vector<typename Flavor::FF> UltraVerifier_<Flavor, IO>::compute_padding_indicator_array(size_t log_n) const
{
    std::vector<FF> padding_indicator_array(log_n, FF{ 1 });
    if constexpr (Flavor::HasZK && Flavor::USE_PADDING) {
        auto vk_ptr = verifier_instance->get_vk();
        if constexpr (IsRecursive) {
            padding_indicator_array =
                stdlib::compute_padding_indicator_array<Curve, Flavor::VIRTUAL_LOG_N>(vk_ptr->log_circuit_size);
        } else {
            const size_t log_circuit_size = static_cast<size_t>(vk_ptr->log_circuit_size);
            for (size_t idx = 0; idx < log_n; idx++) {
                padding_indicator_array[idx] = (idx < log_circuit_size) ? FF{ 1 } : FF{ 0 };
            }
        }
    }

    return padding_indicator_array;
}

template <typename Flavor, class IO>
std::pair<typename UltraVerifier_<Flavor, IO>::Proof, typename UltraVerifier_<Flavor, IO>::Proof> UltraVerifier_<
    Flavor,
    IO>::split_rollup_proof(const Proof& combined_proof) const
    requires(IO::HasIPA)
{
    BB_ASSERT_GTE(combined_proof.size(),
                  IPA_PROOF_LENGTH,
                  "Combined rollup proof is too small to contain IPA proof. Expected at least " +
                      std::to_string(IPA_PROOF_LENGTH) + " elements, got " + std::to_string(combined_proof.size()));

    const auto honk_proof_length = static_cast<std::ptrdiff_t>(combined_proof.size() - IPA_PROOF_LENGTH);

    Proof honk_proof(combined_proof.begin(), combined_proof.begin() + honk_proof_length);
    Proof ipa_proof(combined_proof.begin() + honk_proof_length, combined_proof.end());

    return std::make_pair(honk_proof, ipa_proof);
}

template <typename Flavor, class IO>
bool UltraVerifier_<Flavor, IO>::verify_ipa(const Proof& ipa_proof, const IPAClaim& ipa_claim)
    requires(!IsRecursiveFlavor<Flavor> && IO::HasIPA)
{
    VerifierCommitmentKey<curve::Grumpkin> ipa_verification_key(1 << CONST_ECCVM_LOG_N);
    ipa_transcript->load_proof(ipa_proof);
    bool ipa_verified = IPA<curve::Grumpkin>::reduce_verify(ipa_verification_key, ipa_claim, ipa_transcript);
    vinfo("UltraVerifier: IPA check: ", ipa_verified ? "true" : "false");

    if (!ipa_verified) {
        info("UltraVerifier: verification failed at IPA check");
    }

    return ipa_verified;
}

/**
 * @brief Reduce ultra proof to verification claims (works for both native and recursive)
 * @details Contains all shared verification logic: Oink, Sumcheck, Shplemini.
 *          For interleaved flavors (BATCH_SIZE > 1), uses interleaved claim batching.
 */
template <typename Flavor, class IO>
typename UltraVerifier_<Flavor, IO>::ReductionResult UltraVerifier_<Flavor, IO>::reduce_to_pairing_check(
    const typename UltraVerifier_<Flavor, IO>::Proof& proof)
{
    using Shplemini = ShpleminiVerifier_<Curve, Flavor::HasZK>;
    using ClaimBatcher = ClaimBatcher_<Curve>;
    using ClaimBatch = ClaimBatcher::Batch;

    constexpr size_t BATCH_SIZE = Flavor::INTERLEAVING_BATCH_SIZE;

    transcript->load_proof(proof);

    const size_t log_n = compute_log_n();

    const size_t min_proof_size = ProofLength::Honk<Flavor>::LENGTH_WITHOUT_PUB_INPUTS(log_n);
    BB_ASSERT_GTE(proof.size(),
                  min_proof_size,
                  "Proof size too small. Got " + std::to_string(proof.size()) + " field elements, but need at least " +
                      std::to_string(min_proof_size) + " (excluding public inputs) for log_n=" + std::to_string(log_n));

    const size_t num_public_inputs = ProofLength::Honk<Flavor>::derive_num_public_inputs(proof.size(), log_n);

    OinkVerifier<Flavor> oink_verifier{ verifier_instance, transcript, num_public_inputs };
    oink_verifier.verify();

    auto sumcheck_padding_indicator_array = compute_padding_indicator_array(log_n);
    verifier_instance->gate_challenges =
        transcript->template get_dyadic_powers_of_challenge<FF>("Sumcheck:gate_challenge", log_n);

    // Construct the sumcheck verifier
    SumcheckVerifier<Flavor> sumcheck(transcript, verifier_instance->alpha, log_n);
    std::array<Commitment, NUM_LIBRA_COMMITMENTS> libra_commitments = {};

    if constexpr (Flavor::HasZK) {
        libra_commitments[0] = transcript->template receive_from_prover<Commitment>("Libra:concatenation_commitment");
    }

    SumcheckOutput<Flavor> sumcheck_output = sumcheck.verify(
        verifier_instance->relation_parameters, verifier_instance->gate_challenges, sumcheck_padding_indicator_array);

    constexpr size_t LOG_K = Flavor::INTERLEAVING_LOG_K;

    // Build full challenge vector: interleaving challenges (if any) + sumcheck challenges
    std::vector<FF> full_challenge;
    full_challenge.reserve(LOG_K + sumcheck_output.challenge.size());
    for (size_t i = 0; i < LOG_K; i++) {
        full_challenge.push_back(
            transcript->template get_challenge<FF>("Shplemini:interleaving_challenge_" + std::to_string(i)));
    }
    full_challenge.insert(full_challenge.end(), sumcheck_output.challenge.begin(), sumcheck_output.challenge.end());

    // Receive remaining Libra commitments (after interleaving challenges, before Shplemini)
    if constexpr (Flavor::HasZK) {
        libra_commitments[1] = transcript->template receive_from_prover<Commitment>("Libra:grand_sum_commitment");
        libra_commitments[2] = transcript->template receive_from_prover<Commitment>("Libra:quotient_commitment");
    }

    // PCS padding indicator: [1]*LOG_K prefix + sumcheck padding
    std::vector<FF> pcs_padding_indicator_array;
    pcs_padding_indicator_array.reserve(full_challenge.size());
    for (size_t i = 0; i < LOG_K; i++) {
        pcs_padding_indicator_array.push_back(FF{ 1 });
    }
    pcs_padding_indicator_array.insert(pcs_padding_indicator_array.end(),
                                       sumcheck_padding_indicator_array.begin(),
                                       sumcheck_padding_indicator_array.end());

    const Commitment one_commitment = [&]() {
        if constexpr (IsRecursive) {
            return Commitment::one(builder);
        } else {
            return Commitment::one();
        }
    }();

    // Helper to run Shplemini and build the reduction result
    auto run_shplemini = [&](ClaimBatcher& claim_batcher) -> ReductionResult {
        auto shplemini_output = Shplemini::compute_batch_opening_claim(pcs_padding_indicator_array,
                                                                       claim_batcher,
                                                                       full_challenge,
                                                                       one_commitment,
                                                                       transcript,
                                                                       Flavor::REPEATED_COMMITMENTS,
                                                                       libra_commitments,
                                                                       sumcheck_output.claimed_libra_evaluation);

        ReductionResult result;
        result.pairing_points = PCS::reduce_verify_batch_opening_claim(
            std::move(shplemini_output.batch_opening_claim), transcript, Flavor::FINAL_PCS_MSM_SIZE(log_n));

        bool consistency_checked = true;
        if constexpr (Flavor::HasZK) {
            consistency_checked = shplemini_output.consistency_checked;
            vinfo("UltraVerifier: consistency_checked=", consistency_checked ? "true" : "false");
        }
        vinfo("UltraVerifier: sumcheck_verified=", sumcheck_output.verified ? "true" : "false");
        result.reduction_succeeded = sumcheck_output.verified && consistency_checked;

        return result;
    };

    // Build PCS commitment and evaluation data (BS-specific assembly hidden in helpers)
    auto pcs_comms = build_pcs_commitments<Flavor>(*verifier_instance);
    auto pcs_evals = build_pcs_evaluations<Flavor>(sumcheck_output.claimed_evaluations,
                                                   std::span<const FF>(full_challenge).first(LOG_K));

    ClaimBatcher claim_batcher{
        .unshifted = ClaimBatch{ RefVector<Commitment>(pcs_comms.unshifted), RefVector<FF>(pcs_evals.unshifted) },
        .shifted = ClaimBatch{ RefVector<Commitment>(pcs_comms.to_be_shifted), RefVector<FF>(pcs_evals.shifted) },
        .shift_exponent = BATCH_SIZE
    };

    return run_shplemini(claim_batcher);
}

template <typename Flavor, class IO>
typename UltraVerifier_<Flavor, IO>::Output UltraVerifier_<Flavor, IO>::verify_proof(
    const typename UltraVerifier_<Flavor, IO>::Proof& proof)
{
    BB_BENCH_NAME("UltraVerifier::verify_proof");
    // Step 1: Split proof if needed
    Proof honk_proof;
    Proof ipa_proof;
    if constexpr (IO::HasIPA) {
        std::tie(honk_proof, ipa_proof) = split_rollup_proof(proof);
    } else {
        honk_proof = proof;
    }

    // Step 2: Reduce to pairing check
    auto [pcs_pairing_points, reduction_succeeded] = reduce_to_pairing_check(honk_proof);
    vinfo("UltraVerifier: reduced to pairing check: ", reduction_succeeded ? "true" : "false");

    if constexpr (!IsRecursive) {
        if (!reduction_succeeded) {
            info("UltraVerifier: verification failed at reduction step");
            return Output{};
        }
    }

    // Step 3: Process the reduction result and public inputs
    IO inputs;
    inputs.reconstruct_from_public(verifier_instance->public_inputs);

    // Aggregate pairing points
    PairingPoints pi_pairing_points = inputs.pairing_inputs;
    pi_pairing_points.aggregate(pcs_pairing_points);

    // Construct output (common to both native and recursive)
    Output output(inputs);

    if constexpr (IsRecursive) {
        // Recursive: populate output for deferred verification
        output.points_accumulator = std::move(pi_pairing_points);
        if constexpr (IO::HasIPA) {
            output.ipa_proof = ipa_proof;
        }
    } else {
        // Perform pairing check
        bool pairing_verified = pi_pairing_points.check();
        vinfo("UltraVerifier: pairing check: ", pairing_verified ? "true" : "false");

        if (!pairing_verified) {
            info("UltraVerifier: verification failed at pairing check");
            return Output{};
        }

        // Perform IPA verification if IO requires it
        if constexpr (IO::HasIPA) {
            if (!verify_ipa(ipa_proof, inputs.ipa_claim)) {
                return Output{};
            }
        }

        output.result = true;
    }

    return output;
}

// ===== NATIVE FLAVOR INSTANTIATIONS =====

template class UltraVerifier_<UltraFlavor, DefaultIO>;
template class UltraVerifier_<UltraZKFlavor, DefaultIO>;
template class UltraVerifier_<UltraKeccakFlavor, DefaultIO>;
template class UltraVerifier_<UltraKeccakZKFlavor, DefaultIO>;
template class UltraVerifier_<UltraFlavor, RollupIO>; // Rollup uses UltraFlavor + RollupIO
template class UltraVerifier_<MegaFlavor, DefaultIO>;
template class UltraVerifier_<MegaZKFlavor, DefaultIO>;
template class UltraVerifier_<MegaZKFlavor, HidingKernelIO>; // Chonk
template class UltraVerifier_<MultiMegaFlavor, DefaultIO>;
template class UltraVerifier_<MultiMegaZKFlavor, DefaultIO>;
template class UltraVerifier_<MultiMegaZKFlavor, HidingKernelIO>;

#ifdef STARKNET_GARAGA_FLAVORS
template class UltraVerifier_<UltraStarknetFlavor, DefaultIO>;
template class UltraVerifier_<UltraStarknetZKFlavor, DefaultIO>;
#endif

// ===== RECURSIVE FLAVOR INSTANTIATIONS =====

// UltraRecursiveFlavor with DefaultIO
template class UltraVerifier_<UltraRecursiveFlavor_<UltraCircuitBuilder>,
                              stdlib::recursion::honk::DefaultIO<UltraCircuitBuilder>>;
template class UltraVerifier_<UltraRecursiveFlavor_<MegaCircuitBuilder>,
                              stdlib::recursion::honk::DefaultIO<MegaCircuitBuilder>>;

// UltraZKRecursiveFlavor with DefaultIO
template class UltraVerifier_<UltraZKRecursiveFlavor_<UltraCircuitBuilder>,
                              stdlib::recursion::honk::DefaultIO<UltraCircuitBuilder>>;
template class UltraVerifier_<UltraZKRecursiveFlavor_<MegaCircuitBuilder>,
                              stdlib::recursion::honk::DefaultIO<MegaCircuitBuilder>>;

// UltraRecursiveFlavor with RollupIO (replaces UltraRollupRecursiveFlavor)
template class UltraVerifier_<UltraRecursiveFlavor_<UltraCircuitBuilder>, stdlib::recursion::honk::RollupIO>;

// MegaRecursiveFlavor with DefaultIO
template class UltraVerifier_<MegaRecursiveFlavor_<UltraCircuitBuilder>,
                              stdlib::recursion::honk::DefaultIO<UltraCircuitBuilder>>;
template class UltraVerifier_<MegaRecursiveFlavor_<MegaCircuitBuilder>,
                              stdlib::recursion::honk::DefaultIO<MegaCircuitBuilder>>;

// MegaZKRecursiveFlavor with DefaultIO
template class UltraVerifier_<MegaZKRecursiveFlavor_<UltraCircuitBuilder>,
                              stdlib::recursion::honk::DefaultIO<UltraCircuitBuilder>>;
template class UltraVerifier_<MegaZKRecursiveFlavor_<MegaCircuitBuilder>,
                              stdlib::recursion::honk::DefaultIO<MegaCircuitBuilder>>;

// MegaZKRecursiveFlavor with HidingKernelIO (Chonk)
template class UltraVerifier_<MegaZKRecursiveFlavor_<UltraCircuitBuilder>,
                              stdlib::recursion::honk::HidingKernelIO<UltraCircuitBuilder>>;

// MegaRecursiveFlavor with GoblinAvmIO
template class UltraVerifier_<MegaAvmRecursiveFlavor_<UltraCircuitBuilder>,
                              stdlib::recursion::honk::GoblinAvmIO<UltraCircuitBuilder>>;

// MultiMega recursive flavors
template class UltraVerifier_<MultiMegaRecursiveFlavor_<UltraCircuitBuilder>,
                              stdlib::recursion::honk::DefaultIO<UltraCircuitBuilder>>;
template class UltraVerifier_<MultiMegaRecursiveFlavor_<MegaCircuitBuilder>,
                              stdlib::recursion::honk::DefaultIO<MegaCircuitBuilder>>;
template class UltraVerifier_<MultiMegaZKRecursiveFlavor_<UltraCircuitBuilder>,
                              stdlib::recursion::honk::DefaultIO<UltraCircuitBuilder>>;
template class UltraVerifier_<MultiMegaZKRecursiveFlavor_<UltraCircuitBuilder>,
                              stdlib::recursion::honk::HidingKernelIO<UltraCircuitBuilder>>;
template class UltraVerifier_<MultiMegaZKRecursiveFlavor_<MegaCircuitBuilder>,
                              stdlib::recursion::honk::DefaultIO<MegaCircuitBuilder>>;

} // namespace bb
