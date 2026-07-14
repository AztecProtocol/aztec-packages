// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/commitment_schemes/claim_batcher.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/polynomials/polynomial.hpp"

#include <cstddef>
#include <span>
#include <vector>

namespace bb {

/**
 * @brief The compact TripleIPA opening claim: the statement that crosses verifier boundaries.
 * @details Three rho-batched openings under the eq/shift/pow tensors at the claim's challenges:
 *   <F,  eq(u)>  = unshifted_evaluation,  with [F]  = unshifted_commitment,
 *   <F', sh(u)>  = shifted_evaluation,    with [F'] = shifted_commitment,
 *   <P,  pow(x)> = univariate.opening_pair.evaluation, with [P] = univariate.commitment,
 * where u = multilinear_challenge and x = univariate.opening_pair.challenge. The tensor descriptors are
 * reconstructed from the challenges, so the statement is fully determined by these fields.
 */
template <typename Curve> struct TripleIpaClaim {
    using Fr = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;

    Commitment unshifted_commitment;
    Fr unshifted_evaluation = Fr::zero();
    Commitment shifted_commitment;
    Fr shifted_evaluation = Fr::zero();
    OpeningClaim<Curve> univariate;
    std::vector<Fr> multilinear_challenge;
};

/**
 * @brief Pre-batch verifier-side claim data: per-polynomial commitments/evaluations before Stage-1 rho-batching.
 * @details Built identically by the ECCVM prover and verifier via `create`, then collapsed to the compact
 * `TripleIpaClaim` by `batch`. The to-be-shifted block stores the source commitments directly (the same
 * commitments the flavor's `get_to_be_shifted()` returns — a subset of the unshifted set by value), opened under a
 * second rho-power; no new committed data is introduced.
 */
template <typename Curve> struct TripleIpaClaimData {
    using Fr = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;

    struct UnshiftedClaim {
        std::vector<Commitment> commitments;
        std::vector<Fr> evaluations;
        std::vector<Fr> rho_powers;
        std::vector<Fr> multilinear_challenge;
    };

    struct ShiftedBatch {
        std::vector<Commitment> commitments;          // source commitments (the flavor's get_to_be_shifted set)
        std::vector<Fr> source_unshifted_evaluations; // sources' unshifted evals at u; used for the <F',eq> cross-sum
        std::vector<Fr> shifted_evaluations;          // the shifted evals at u (the diagonal shift claim)
        std::vector<Fr> rho_powers;
    };

    UnshiftedClaim unshifted;
    ShiftedBatch shifted;
    OpeningClaim<Curve> univariate;

    /// Consecutive powers rho^offset, ..., rho^{offset + count - 1}.
    static std::vector<Fr> rho_powers(const Fr& rho, size_t count, size_t offset = 0)
    {
        std::vector<Fr> powers;
        powers.reserve(count);
        Fr power = Fr::one();
        for (size_t idx = 0; idx < offset; ++idx) {
            power *= rho;
        }
        for (size_t idx = 0; idx < count; ++idx) {
            powers.emplace_back(power);
            power *= rho;
        }
        return powers;
    }

    /**
     * @brief Build the claim data shared by the ECCVM prover and verifier.
     * @details Each range maps to a flavor getter: `unshifted_*` to `get_unshifted()`, `shifted_source_*` to
     * `get_to_be_shifted()` (commitments and their unshifted evals at u), and `shifted_evaluations` to
     * `get_shifted()`. The shifted rho-powers continue after the unshifted block. Ranges are taken by template so
     * `RefArray` views can be passed without an intermediate copy at the call site.
     */
    template <typename CommitmentRange,
              typename EvaluationRange,
              typename ShiftedCommitmentRange,
              typename ShiftedSourceEvaluationRange,
              typename ShiftedEvaluationRange>
    static TripleIpaClaimData create(const CommitmentRange& unshifted_commitments,
                                     const EvaluationRange& unshifted_evaluations,
                                     const ShiftedCommitmentRange& shifted_source_commitments,
                                     const ShiftedSourceEvaluationRange& shifted_source_evaluations,
                                     const ShiftedEvaluationRange& shifted_evaluations,
                                     std::span<const Fr> multilinear_challenge,
                                     const Fr& rho,
                                     const OpeningClaim<Curve>& univariate)
    {
        const size_t num_unshifted = unshifted_commitments.size();
        BB_ASSERT_EQ(num_unshifted, unshifted_evaluations.size());
        const size_t num_shifted = shifted_evaluations.size();
        BB_ASSERT_EQ(num_shifted, shifted_source_commitments.size());
        BB_ASSERT_EQ(num_shifted, shifted_source_evaluations.size());

        TripleIpaClaimData data;
        data.unshifted.multilinear_challenge.assign(multilinear_challenge.begin(), multilinear_challenge.end());
        data.unshifted.commitments.reserve(num_unshifted);
        data.unshifted.evaluations.reserve(num_unshifted);
        for (size_t idx = 0; idx < num_unshifted; ++idx) {
            data.unshifted.commitments.emplace_back(unshifted_commitments[idx]);
            data.unshifted.evaluations.emplace_back(unshifted_evaluations[idx]);
        }
        data.unshifted.rho_powers = rho_powers(rho, num_unshifted);

        data.shifted.commitments.reserve(num_shifted);
        data.shifted.source_unshifted_evaluations.reserve(num_shifted);
        data.shifted.shifted_evaluations.reserve(num_shifted);
        for (size_t idx = 0; idx < num_shifted; ++idx) {
            data.shifted.commitments.emplace_back(shifted_source_commitments[idx]);
            data.shifted.source_unshifted_evaluations.emplace_back(shifted_source_evaluations[idx]);
            data.shifted.shifted_evaluations.emplace_back(shifted_evaluations[idx]);
        }
        data.shifted.rho_powers = rho_powers(rho, num_shifted, num_unshifted);

        data.univariate = univariate;
        return data;
    }

    /// Stage-1 rho-batching: collapse the per-polynomial data into the compact three-claim statement.
    TripleIpaClaim<Curve> batch() const
    {
        TripleIpaClaim<Curve> claim;
        claim.unshifted_commitment = batch_commitments<Curve>(std::span<const Commitment>(unshifted.commitments),
                                                              std::span<const Fr>(unshifted.rho_powers));
        claim.unshifted_evaluation = batch_evaluations<Curve>(std::span<const Fr>(unshifted.evaluations),
                                                              std::span<const Fr>(unshifted.rho_powers));

        claim.shifted_commitment = batch_commitments<Curve>(std::span<const Commitment>(shifted.commitments),
                                                            std::span<const Fr>(shifted.rho_powers));
        claim.shifted_evaluation = batch_evaluations<Curve>(std::span<const Fr>(shifted.shifted_evaluations),
                                                            std::span<const Fr>(shifted.rho_powers));

        claim.univariate = univariate;
        claim.multilinear_challenge = unshifted.multilinear_challenge;
        return claim;
    }
};

/// Prover-side TripleIPA input: claim data plus the witness polynomials needed to build the proof.
template <typename Curve> struct TripleIpaInput {
    using Fr = typename Curve::ScalarField;
    using Polynomial = bb::Polynomial<Fr>;

    TripleIpaClaimData<Curve> claim_data;
    std::vector<Polynomial> unshifted_polynomials;
    std::vector<Polynomial> shifted_polynomials; // source polys for the shift claim (the get_to_be_shifted set)
    Polynomial univariate_polynomial;
};

} // namespace bb
