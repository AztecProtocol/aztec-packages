// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/claim_batcher.hpp"
#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/commitment_schemes/triple_ipa/triple_ipa_claim.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/polynomials/eq_polynomial.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/polynomials/shifted_eq_polynomial.hpp"
#include "barretenberg/transcript/transcript.hpp"

#include <array>
#include <cstddef>
#include <span>
#include <string>
#include <utility>
#include <vector>

namespace bb {

template <typename Curve_, size_t log_poly_length> class TripleIPA {
  public:
    using Curve = Curve_;
    using Fr = typename Curve::ScalarField;
    using GroupElement = typename Curve::Element;
    using Commitment = typename Curve::AffineElement;
    using Polynomial = bb::Polynomial<Fr>;
    using CK = CommitmentKey<Curve>;
    using VK = VerifierCommitmentKey<Curve>;
    using IPAProtocol = IPA<Curve, log_poly_length>;

    // The native deferred accumulator and its discharge (verify_accumulator / batch_verify_accumulators) are generic
    // IPA functionality and live in the base IPA; the TripleIPA verifier only *produces* the accumulator (via the
    // TripleIPA b_0 fold) and delegates the SRS-MSM discharge. Recursive verification likewise reuses the IPA's
    // in-circuit VerifierAccumulator (IpaAccumulator), deferred up the recursion.
    using NativeAccumulator = typename IPAProtocol::NativeAccumulator;
    using VerifierAccumulator =
        std::conditional_t<Curve::is_stdlib_type, typename IPAProtocol::VerifierAccumulator, NativeAccumulator>;

    static constexpr size_t poly_length = 1UL << log_poly_length;
    static_assert(log_poly_length >= 1, "log_poly_length must be at least 1");

    // The opening combines three tensor families into one IPA claim: eq (F), shifted-eq (F'), pow (P).
    static constexpr size_t NUM_TENSORS = 3;
    // One cross-sum per distinct unordered pair of tensors — the off-diagonal terms of <A, b>: (F,sh), (F,P), (sh,P).
    static constexpr size_t NUM_CROSS_SUMS = NUM_TENSORS * (NUM_TENSORS - 1) / 2;

  private:
    struct IpaOpeningVector {
        std::vector<Fr> multilinear_challenge;
        Fr univariate_challenge = Fr::zero();
        Fr eq_weight = Fr::zero();
        Fr shifted_eq_weight = Fr::zero();
        Fr powers_weight = Fr::zero();

        // Expand the symbolic combined tensor into the explicit IPA b-vector
        // b = eq_weight*eq + shifted_eq_weight*b_sh + powers_weight*pow.
        Polynomial construct_combined_tensor(const Polynomial& eq) const
        {
            Polynomial result(poly_length);
            result.add_scaled(eq, eq_weight);
            ShiftedEqPolynomial<Curve, log_poly_length>::add_scaled(result, eq, shifted_eq_weight);
            result.add_scaled(IPAProtocol::powers_tensor(univariate_challenge), powers_weight);
            return result;
        }

        // Contract the combined tensor b = eq_weight*eq + shifted_eq_weight*b_sh + powers_weight*pow against the IPA
        // s-vector, reusing each tensor family's own folded evaluation.
        Fr evaluate_folded(std::span<const Fr> ipa_round_challenges_inv) const
        {
            const std::span<const Fr> point(multilinear_challenge);
            using ShiftedEq = ShiftedEqPolynomial<Curve, log_poly_length>;
            return eq_weight * ShiftedEq::evaluate_eq_folded(point, ipa_round_challenges_inv) +
                   shifted_eq_weight * ShiftedEq::evaluate_folded(point, ipa_round_challenges_inv) +
                   powers_weight * evaluate_pow_folded(univariate_challenge, ipa_round_challenges_inv);
        }

      private:
        static Fr evaluate_pow_folded(const Fr& challenge, std::span<const Fr> ipa_round_challenges_inv)
        {
            return IPAProtocol::evaluate_challenge_poly(
                std::vector<Fr>(ipa_round_challenges_inv.begin(), ipa_round_challenges_inv.end()), challenge);
        }
    };

  public:
    // The claim data structs live in `triple_ipa_claim.hpp` (constructed identically by the ECCVM prover and
    // verifier via `TripleIpaClaimData::create`). Aliased here so external references keep the `TripleIPA::...`
    // spelling.
    using TripleIpaClaimData = bb::TripleIpaClaimData<Curve>;
    using TripleIpaClaim = bb::TripleIpaClaim<Curve>;
    using TripleIpaInput = bb::TripleIpaInput<Curve>;

  private:
    struct IpaVerifierClaim {
        Commitment commitment;
        IpaOpeningVector opening_vector;
        Fr evaluation = Fr::zero();
    };

    // The combined claim's evaluation v = <A, b> = sum_k zeta_k^2 * diagonal_k + sum_{j<k} zeta_j zeta_k * cross_{jk},
    // i.e. the inner product of the zeta-combined witness and tensor reassembled from the per-tensor diagonal
    // evaluations and the cross-sums.
    static Fr combined_inner_product(const std::array<Fr, NUM_TENSORS>& diagonal_evaluations,
                                     const std::array<Fr, NUM_TENSORS>& zeta,
                                     const std::array<Fr, NUM_CROSS_SUMS>& cross_sums)
    {
        const std::array<Fr, NUM_TENSORS + NUM_CROSS_SUMS> weights{ zeta[0].sqr(),     zeta[1].sqr(),
                                                                    zeta[2].sqr(),     zeta[0] * zeta[1],
                                                                    zeta[0] * zeta[2], zeta[1] * zeta[2] };
        const std::array<Fr, NUM_TENSORS + NUM_CROSS_SUMS> values{ diagonal_evaluations[0], diagonal_evaluations[1],
                                                                   diagonal_evaluations[2], cross_sums[0],
                                                                   cross_sums[1],           cross_sums[2] };
        if constexpr (Curve::is_stdlib_type) {
            return Fr::mult_madd(
                std::vector<Fr>(weights.begin(), weights.end()), std::vector<Fr>(values.begin(), values.end()), {});
        }
        Fr result = Fr::zero();
        for (size_t idx = 0; idx < weights.size(); ++idx) {
            result += weights[idx] * values[idx];
        }
        return result;
    }

    /**
     * @brief Compute the three cross-sums from already-built batched witnesses F and F'.
     *
     *  Takes the unshifted (F) and shifted-source (F') batched witnesses as inputs so the prover can
     * reuse witnesses that were already built for the combined opening. <eq, F'> is read from the precomputed source
     * evaluations instead of an extra MLE pass.
     */
    static std::array<Fr, NUM_CROSS_SUMS> compute_cross_sums(const TripleIpaInput& input,
                                                             const Polynomial& unshifted_witness,
                                                             const Polynomial& shifted_witness,
                                                             const Polynomial& eq_tensor)
    {
        const auto& multilinear_challenge = input.claim_data.unshifted.multilinear_challenge;
        const auto& univariate_challenge = input.claim_data.univariate.opening_pair.challenge;

        const Fr unshifted_against_shift = // ⟨F, b_sh⟩
            ShiftedEqPolynomial<Curve, log_poly_length>::evaluate_from_eq(eq_tensor, unshifted_witness);
        const Fr unshifted_against_pow = unshifted_witness.evaluate(univariate_challenge); // ⟨F, b_pow⟩ = F(x)

        const auto& shifted = input.claim_data.shifted;
        Fr shifted_against_eq =
            Fr::zero(); // ⟨F', b_eq⟩ = F'(u) = Σ_j ρ^j · v_{s_j}, reusing the sources' unshifted evals
        for (size_t idx = 0; idx < shifted.source_unshifted_evaluations.size(); ++idx) {
            shifted_against_eq += shifted.rho_powers[idx] * shifted.source_unshifted_evaluations[idx];
        }

        const Fr shifted_against_pow = shifted_witness.evaluate(univariate_challenge); // ⟨F', b_pow⟩ = F'(x)
        const Fr univariate_against_eq =                                               // ⟨P, b_eq⟩ = P(u)
            input.univariate_polynomial.evaluate_mle(std::span<const Fr>(multilinear_challenge));
        const Fr univariate_against_shift = // ⟨P, b_sh⟩
            ShiftedEqPolynomial<Curve, log_poly_length>::evaluate_from_eq(eq_tensor, input.univariate_polynomial);

        return { unshifted_against_shift + shifted_against_eq,     // c_{F,sh}  = ⟨F, b_sh⟩  + ⟨F', b_eq⟩
                 unshifted_against_pow + univariate_against_eq,    // c_{F,P}   = ⟨F, b_pow⟩ + ⟨P,  b_eq⟩
                 shifted_against_pow + univariate_against_shift }; // c_{sh,P} = ⟨F', b_pow⟩ + ⟨P, b_sh⟩
    }

    static IpaVerifierClaim combine_into_ipa_claim(const TripleIpaClaim& claim,
                                                   const std::array<Fr, NUM_TENSORS>& zeta,
                                                   const std::array<Fr, NUM_CROSS_SUMS>& cross_sums)
    {
        const std::array<Commitment, NUM_TENSORS> commitments{ claim.unshifted_commitment,
                                                               claim.shifted_commitment,
                                                               claim.univariate.commitment };
        const std::array<Fr, NUM_TENSORS> diagonal_evaluations{ claim.unshifted_evaluation,
                                                                claim.shifted_evaluation,
                                                                claim.univariate.opening_pair.evaluation };
        return { batch_commitments<Curve>(std::span<const Commitment>(commitments), std::span<const Fr>(zeta)),
                 { .multilinear_challenge = claim.multilinear_challenge,
                   .univariate_challenge = claim.univariate.opening_pair.challenge,
                   .eq_weight = zeta[0],
                   .shifted_eq_weight = zeta[1],
                   .powers_weight = zeta[2] },
                 combined_inner_product(diagonal_evaluations, zeta, cross_sums) };
    }

    template <typename Transcript>
    static IpaVerifierClaim compute_ipa_verifier_claim(const TripleIpaClaim& claim,
                                                       const std::shared_ptr<Transcript>& transcript)
    {
        add_claim_to_hash_buffer(claim, transcript);

        const std::array<Fr, NUM_CROSS_SUMS> cross_sums{
            transcript->template receive_from_prover<Fr>("TripleIPA:cross_F_shift"),
            transcript->template receive_from_prover<Fr>("TripleIPA:cross_F_P"),
            transcript->template receive_from_prover<Fr>("TripleIPA:cross_shift_P")
        };
        const auto zeta = transcript->template get_challenges<Fr>(
            std::array<std::string, NUM_TENSORS>{ "TripleIPA:zeta_F", "TripleIPA:zeta_shift", "TripleIPA:zeta_P" });
        const IpaVerifierClaim combined_claim = combine_into_ipa_claim(claim, zeta, cross_sums);
        add_claim_to_hash_buffer(combined_claim, transcript);
        return combined_claim;
    }

  public:
    template <typename Transcript>
    static void compute_opening_proof(const CK& ck,
                                      const TripleIpaInput& input,
                                      const std::shared_ptr<Transcript>& transcript)
    {
        // Stage-1 rho-batching of the commitments and evaluations is shared with the verifier via
        // `TripleIpaClaimData::batch`, so the values absorbed below (`TripleIPA:F`/`TripleIPA:F_shift`/`TripleIPA:P`)
        // are byte-identical to the verifier's by construction. The prover additionally batches the witness
        // polynomials.
        const TripleIpaClaim claim = input.claim_data.batch();

        // Build the batched unshifted/shifted witnesses F, F' once. They are reused by both the cross-sum
        // inner products and the final combined witness, so neither stage re-expands over every original source
        // polynomial.
        Polynomial unshifted_witness(poly_length);
        add_scaled_batch(
            unshifted_witness, input.unshifted_polynomials, std::span<const Fr>(input.claim_data.unshifted.rho_powers));

        std::vector<PolynomialSpan<const Fr>> shifted_sources;
        shifted_sources.reserve(input.shifted_polynomials.size());
        for (const auto& polynomial : input.shifted_polynomials) {
            shifted_sources.push_back(static_cast<PolynomialSpan<const Fr>>(polynomial));
        }
        Polynomial shifted_witness(poly_length);
        add_scaled_batch(shifted_witness,
                         std::span<const PolynomialSpan<const Fr>>(shifted_sources),
                         std::span<const Fr>(input.claim_data.shifted.rho_powers));

        add_claim_to_hash_buffer(claim, transcript);

        // eq(u) is built once and reused by both the cross-sum inner products and the combined b-vector below.
        const Polynomial eq_tensor =
            ProverEqPolynomial<Fr>::construct(std::span<const Fr>(claim.multilinear_challenge), log_poly_length);

        const auto cross_sums = compute_cross_sums(input, unshifted_witness, shifted_witness, eq_tensor);
        transcript->send_to_verifier("TripleIPA:cross_F_shift", cross_sums[0]);
        transcript->send_to_verifier("TripleIPA:cross_F_P", cross_sums[1]);
        transcript->send_to_verifier("TripleIPA:cross_shift_P", cross_sums[2]);

        const auto zeta = transcript->template get_challenges<Fr>(
            std::array<std::string, NUM_TENSORS>{ "TripleIPA:zeta_F", "TripleIPA:zeta_shift", "TripleIPA:zeta_P" });
        const std::array<PolynomialSpan<const Fr>, NUM_TENSORS> combined_witness_sources{
            static_cast<PolynomialSpan<const Fr>>(unshifted_witness),
            static_cast<PolynomialSpan<const Fr>>(shifted_witness),
            static_cast<PolynomialSpan<const Fr>>(input.univariate_polynomial)
        };
        Polynomial combined_witness(poly_length);
        add_scaled_batch(combined_witness,
                         std::span<const PolynomialSpan<const Fr>>(combined_witness_sources),
                         std::span<const Fr>(zeta));

        const IpaVerifierClaim combined_claim = combine_into_ipa_claim(claim, zeta, cross_sums);
        add_claim_to_hash_buffer(combined_claim, transcript);
        auto b_poly = combined_claim.opening_vector.construct_combined_tensor(eq_tensor);
        IPAProtocol::compute_inner_product_proof_internal(ck, combined_witness, std::move(b_poly), transcript);
    }

    // Verification consumes the compact `TripleIpaClaim`; the prover-only `TripleIpaInput` (with witness
    // polynomials) is for `compute_opening_proof`. Native verification has two entry points: `reduce_to_accumulator`
    // produces a deferrable accumulator (no SRS-MSM) discharged later by `verify_accumulator` /
    // `batch_verify_accumulators`, and `reduce_verify` bundles both for the single-proof case. Recursive verification
    // has one entry point — `reduce_verify` returns an in-circuit accumulator deferred up the recursion.
    template <typename Transcript>
    static bool reduce_verify(const VK& vk, const TripleIpaClaim& claim, const std::shared_ptr<Transcript>& transcript)
        requires(!Curve::is_stdlib_type)
    {
        return verify_accumulator(vk, reduce_to_accumulator(claim, transcript));
    }

    static VerifierAccumulator reduce_verify(const TripleIpaClaim& claim, const auto& transcript)
        requires(Curve::is_stdlib_type)
    {
        const auto combined_claim = compute_ipa_verifier_claim(claim, transcript);
        return IPAProtocol::reduce_verify_inner_product_recursive(
            combined_claim.commitment,
            combined_claim.evaluation,
            [&](std::span<const Fr> round_challenges_inv) {
                return combined_claim.opening_vector.evaluate_folded(round_challenges_inv);
            },
            transcript);
    }

    // Native reduction to a deferrable accumulator (no SRS-MSM). Discharge later via verify_accumulator (single)
    // or batch_verify_accumulators (one combined MSM across many proofs).
    static NativeAccumulator reduce_to_accumulator(const TripleIpaClaim& claim, const auto& transcript)
        requires(!Curve::is_stdlib_type)
    {
        return reduce_to_accumulator_internal(compute_ipa_verifier_claim(claim, transcript), transcript);
    }

    // The accumulator discharge (single / batched SRS-MSM) is generic IPA functionality; these thin wrappers keep the
    // TripleIPA verifier's native lifecycle (reduce_to_accumulator -> discharge) reachable under one type.
    static bool verify_accumulator(const VK& vk, const NativeAccumulator& accumulator)
        requires(!Curve::is_stdlib_type)
    {
        return IPAProtocol::verify_accumulator(vk, accumulator);
    }

    static bool batch_verify_accumulators(const VK& vk, std::span<const NativeAccumulator> accumulators)
        requires(!Curve::is_stdlib_type)
    {
        return IPAProtocol::batch_verify_accumulators(vk, accumulators);
    }

  private:
    template <typename Transcript>
    static void add_claim_to_hash_buffer(const TripleIpaClaim& claim, const std::shared_ptr<Transcript>& transcript)
    {
        transcript->add_to_hash_buffer("TripleIPA:F:commitment", claim.unshifted_commitment);
        transcript->add_to_hash_buffer("TripleIPA:F:evaluation", claim.unshifted_evaluation);
        transcript->add_to_hash_buffer("TripleIPA:F_shift:commitment", claim.shifted_commitment);
        transcript->add_to_hash_buffer("TripleIPA:F_shift:evaluation", claim.shifted_evaluation);
        transcript->add_to_hash_buffer("TripleIPA:P:commitment", claim.univariate.commitment);
        transcript->add_to_hash_buffer("TripleIPA:P:evaluation", claim.univariate.opening_pair.evaluation);
        transcript->add_to_hash_buffer("TripleIPA:P:x", claim.univariate.opening_pair.challenge);

        // u is the shared multilinear point for both the F (eq) and F' (shift) claims; absorb it once.
        for (size_t coordinate_idx = 0; coordinate_idx < log_poly_length; ++coordinate_idx) {
            transcript->add_to_hash_buffer("TripleIPA:u_" + std::to_string(coordinate_idx),
                                           claim.multilinear_challenge[coordinate_idx]);
        }
    }

    template <typename Transcript>
    static void add_claim_to_hash_buffer(const IpaVerifierClaim& opening_claim,
                                         const std::shared_ptr<Transcript>& transcript)
    {
        transcript->add_to_hash_buffer("TripleIPA:combined:commitment", opening_claim.commitment);
        transcript->add_to_hash_buffer("TripleIPA:combined:evaluation", opening_claim.evaluation);
    }

    /**
     * @brief Native reduction to a deferrable accumulator: checks the cheap IPA group relation against the
     * prover-claimed `G_0` and returns the data needed to discharge the expensive `G_0 == <challenge_poly(u), SRS>`
     * MSM later (single or batched). Does NOT touch the SRS.
     */
    static NativeAccumulator reduce_to_accumulator_internal(const IpaVerifierClaim& opening_claim,
                                                            const auto& transcript)
        requires(!Curve::is_stdlib_type)
    {
        BB_BENCH_NAME("TripleIPA::reduce_to_accumulator");
        auto data = IPAProtocol::read_inner_product_transcript_data(
            opening_claim.commitment,
            opening_claim.evaluation,
            [&](std::span<const Fr> round_challenges_inv) {
                return opening_claim.opening_vector.evaluate_folded(round_challenges_inv);
            },
            transcript);

        // IPA group relation using the prover-claimed G_0 (cheap; the SRS-MSM that certifies G_0 is deferred).
        const Commitment aux_generator = Commitment::one() * data.gen_challenge;
        const GroupElement right_hand_side =
            data.G_zero_from_prover * data.a_zero + aux_generator * data.a_zero * data.b_zero;
        const bool relation_succeeded = data.C_zero.normalize() == right_hand_side.normalize();

        return { std::move(data.round_challenges_inv), data.G_zero_from_prover, relation_succeeded };
    }
};

} // namespace bb
