#pragma once

#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/commitment_schemes/gemini/gemini.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {
/**
 * @brief Constructs random polynomials, computes commitments and corresponding evaluations.
 *
 * @tparam Curve
 */
template <typename Curve> struct MockWitnessGenerator {
  public:
    using CommitmentKey = bb::CommitmentKey<Curve>;
    using Fr = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;
    using Polynomial = bb::Polynomial<Fr>;
    using PolynomialBatcher = bb::GeminiProver_<Curve>::PolynomialBatcher;
    using ClaimBatcher = bb::ShpleminiVerifier_<Curve>::ClaimBatcher;
    using ClaimBatch = bb::ShpleminiVerifier_<Curve>::ClaimBatch;

    std::shared_ptr<CommitmentKey> ck;
    std::vector<Polynomial> unshifted_polynomials = {};
    std::vector<Polynomial> to_be_shifted_polynomials;
    std::vector<Fr> const_size_mle_opening_point;
    std::vector<Commitment> unshifted_commitments = {};
    std::vector<Commitment> to_be_shifted_commitments;
    std::vector<Fr> unshifted_evals = {};
    std::vector<Fr> shifted_evals;
    PolynomialBatcher polynomial_batcher;
    ClaimBatcher claim_batcher;

    // Containers for mock Sumcheck data
    std::vector<bb::Polynomial<Fr>> round_univariates;
    std::vector<Commitment> sumcheck_commitments;
    std::vector<std::array<Fr, 3>> sumcheck_evaluations;

    MockWitnessGenerator(const size_t n,
                         const size_t num_polynomials,
                         const size_t num_shiftable,
                         const std::vector<Fr>& mle_opening_point,
                         std::shared_ptr<CommitmentKey>& commitment_key)
        : ck(commitment_key) // Initialize the commitment key
        , unshifted_polynomials(num_polynomials)
        , to_be_shifted_polynomials(num_shiftable)
        , polynomial_batcher(n)

    {
        construct_instance_and_witnesses(n, mle_opening_point);
    }

    void construct_instance_and_witnesses(size_t n, const std::vector<Fr>& mle_opening_point)
    {

        const size_t num_unshifted = unshifted_polynomials.size() - to_be_shifted_polynomials.size();

        // Constructs polynomials that are not shifted
        if (!unshifted_polynomials.empty()) {
            for (size_t idx = 0; idx < num_unshifted; idx++) {
                unshifted_polynomials[idx] = Polynomial::random(n);
                unshifted_commitments.push_back(ck->commit(unshifted_polynomials[idx]));
                unshifted_evals.push_back(unshifted_polynomials[idx].evaluate_mle(mle_opening_point));
            }
        }

        // Constructs polynomials that are being shifted
        for (auto& poly : to_be_shifted_polynomials) {
            poly = Polynomial::random(n, /*shiftable*/ 1);
            const Commitment comm = this->ck->commit(poly);
            to_be_shifted_commitments.push_back(comm);
            shifted_evals.push_back(poly.evaluate_mle(mle_opening_point, true));
        }

        size_t idx = num_unshifted;

        // Add unshifted evaluations of shiftable polynomials
        if (!unshifted_polynomials.empty()) {
            for (const auto& [poly, comm] : zip_view(to_be_shifted_polynomials, to_be_shifted_commitments)) {
                unshifted_polynomials[idx] = poly;
                unshifted_commitments.push_back(comm);
                unshifted_evals.push_back(poly.evaluate_mle(mle_opening_point));
                idx++;
            }
        }

        polynomial_batcher.set_unshifted(RefVector(unshifted_polynomials));
        polynomial_batcher.set_to_be_shifted_by_one(RefVector(to_be_shifted_polynomials));

        claim_batcher =
            ClaimBatcher{ .unshifted = ClaimBatch{ RefVector(unshifted_commitments), RefVector(unshifted_evals) },
                          .shifted = ClaimBatch{ RefVector(to_be_shifted_commitments), RefVector(shifted_evals) } };
    }

    // Generate zero polynomials to test edge cases in PCS
    MockWitnessGenerator(const size_t n, const size_t num_zero_polynomials)
        : unshifted_polynomials(num_zero_polynomials)
        , polynomial_batcher(n)
    {
        for (size_t idx = 0; idx < num_zero_polynomials; idx++) {
            unshifted_polynomials[idx] = Polynomial(n);
            unshifted_commitments.push_back(Commitment::infinity());
            unshifted_evals.push_back(Fr(0));
        }
    }

    template <typename Flavor>
    void compute_sumcheck_opening_data(const size_t n,
                                       const size_t log_n,
                                       const size_t sumcheck_univariate_length,
                                       std::vector<Fr>& challenge,
                                       std::shared_ptr<CommitmentKey>& ck)
    {
        // Generate valid sumcheck polynomials of given length
        auto mock_sumcheck_polynomials = ZKSumcheckData<Flavor>(log_n, sumcheck_univariate_length);

        for (size_t idx = 0; idx < log_n; idx++) {
            bb::Polynomial<Fr> round_univariate = mock_sumcheck_polynomials.libra_univariates[idx];

            round_univariate.at(0) += mock_sumcheck_polynomials.libra_running_sum;

            sumcheck_commitments.push_back(ck->commit(round_univariate));

            sumcheck_evaluations.push_back({ round_univariate.at(0),
                                             round_univariate.evaluate(Fr(1)),
                                             round_univariate.evaluate(challenge[idx]) });

            mock_sumcheck_polynomials.update_zk_sumcheck_data(challenge[idx], idx);
            round_univariates.push_back(round_univariate);
        }

        // Simulate the `const proof size` logic
        auto round_univariate = bb::Polynomial<Fr>(n);
        for (size_t idx = log_n; idx < CONST_PROOF_SIZE_LOG_N; idx++) {
            round_univariates.push_back(round_univariate);
            sumcheck_commitments.push_back(ck->commit(round_univariate));
            sumcheck_evaluations.push_back({ Fr(0), Fr(0), Fr(0) });
        }
    }
};

template <typename Curve> struct MultiWitnessGenerator {
  public:
    using CommitmentKey = bb::CommitmentKey<Curve>;
    using Fr = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;
    using Polynomial = bb::Polynomial<Fr>;
    using ClaimBatcher = bb::ShpleminiVerifier_<Curve>::ClaimBatcher;
    using ClaimBatch = bb::ShpleminiVerifier_<Curve>::ClaimBatch;
    using PolynomialBatcher = bb::GeminiProver_<Curve>::PolynomialBatcher;

    std::shared_ptr<CommitmentKey> ck;
    std::vector<Polynomial> unshifted_polynomials;
    std::vector<Polynomial> to_be_shifted_polynomials;
    std::vector<Fr> const_size_mle_opening_point;
    std::vector<Commitment> unshifted_commitments;
    std::vector<Commitment> to_be_shifted_commitments;
    std::vector<Fr> unshifted_evals;
    std::vector<Fr> shifted_evals;
    ClaimBatcher claim_batcher;
    PolynomialBatcher polynomial_batcher;

    Polynomial random_poly;

    std::vector<Fr> unshifted_combined_evals;
    std::vector<Fr> shifted_combined_evals;

    std::vector<Fr> extra_challenges;

    MultiWitnessGenerator(const size_t num_polys_in_group,
                          const size_t n,
                          const size_t num_polynomials,
                          const size_t num_shiftable,
                          std::vector<Fr>& mle_opening_point,
                          std::vector<Fr>& extra_challenges)
        : ck(create_commitment_key<CommitmentKey>(num_polys_in_group * n))
        , unshifted_polynomials(num_polynomials / num_polys_in_group)
        , to_be_shifted_polynomials(num_shiftable / num_polys_in_group)
        , polynomial_batcher(n * num_polys_in_group)
        , random_poly(n * num_polys_in_group) // Initialize the commitment key

    {
        auto lagrange_coeffs = populate_lagrange_coeffs(extra_challenges);

        construct_multi_instance_and_witnesses(
            num_polynomials, num_shiftable, num_polys_in_group, n, mle_opening_point);
        // info(shifted_evals[0]);
        // info(unshifted_polynomials[0].evaluate_mle());
    }

    void construct_multi_instance_and_witnesses(const size_t num_polys,
                                                const size_t num_shiftable,
                                                const size_t num_polys_in_group,
                                                const size_t n, /* max size of the polynomial in the group*/
                                                std::vector<Fr>& mle_opening_point)
    {

        const size_t num_unshifted = (num_polys - num_shiftable) / num_polys_in_group;

        // Constructs polynomials that are not shifted
        for (size_t idx = 0; idx < num_unshifted; idx++) {
            for (size_t idx = 0; idx < num_polys_in_group * n; idx++) {
                random_poly.at(idx) = Fr::random_element();
            }
            unshifted_polynomials.push_back(random_poly);
            const auto comm = ck->commit(random_poly);
            unshifted_commitments.push_back(comm);
            // We are proving the evaluations of chunks!
            evaluate_chunks(random_poly, mle_opening_point, num_polys_in_group, n);
        }

        // Constructs polynomials that are being shifted
        size_t start_idx = num_unshifted;

        for (size_t idx = start_idx; idx < num_shiftable / num_polys_in_group; idx++) {
            // Generate a big random polynomial to be treated as a concatenation of its chunks of size n, we assume that
            // both shifted and unshifted evaluation of a shiftable polynomial a being proved.
            unshifted_polynomials.push_back(Polynomial::random(n * num_polys_in_group, /*shiftable*/ 1));
            to_be_shifted_polynomials.push_back(unshifted_polynomials[idx]);

            const Commitment comm = this->ck->commit(unshifted_polynomials[idx]);
            unshifted_commitments.push_back(comm);
            to_be_shifted_commitments.push_back(comm);
            // We are proving the evaluations of chunks! Evaluate each chunk and its shift
            evaluate_chunks(unshifted_polynomials[idx], mle_opening_point, num_polys_in_group, n, true);
        }

        polynomial_batcher.set_unshifted(RefVector(unshifted_polynomials));
        polynomial_batcher.set_to_be_shifted_by_one(RefVector(to_be_shifted_polynomials));

        claim_batcher =
            ClaimBatcher{ .unshifted = ClaimBatch{ RefVector(unshifted_commitments), RefVector(unshifted_evals) },
                          .shifted = ClaimBatch{ RefVector(to_be_shifted_commitments), RefVector(shifted_evals) } };
    }

    void evaluate_chunks(PolynomialSpan<Fr> poly,
                         const std::vector<Fr>& mle_opening_point,
                         const size_t num_polys_in_group,
                         const size_t n,
                         const bool shifted = false)
    {

        for (size_t idx = 0; idx < num_polys_in_group; idx++) {
            info("maybe here?");
            size_t start_idx = idx * n;
            std::span<Fr> chunk = poly.subspan(start_idx, n).span;
            // Create a redundant poly, because evaluate_mle is static in Polynomial class
            Polynomial chunk_poly = Polynomial(chunk);
            unshifted_evals.push_back(chunk_poly.evaluate_mle(mle_opening_point));
            if (shifted) {
                shifted_evals.push_back(chunk_poly.evaluate_mle(mle_opening_point, shifted));
            }
        }
    }

    void verifier_combine_from_chunks(const size_t num_polys_in_group, auto& lagrange_coeffs)
    {
        size_t num_unshifted_evals = unshifted_evals.size();

        for (size_t group_idx = 0; group_idx < num_unshifted_evals; group_idx++) {
            Fr combined_eval = Fr{ 0 };
            for (size_t chunk_idx = 0; chunk_idx < num_polys_in_group; chunk_idx++) {
                combined_eval += unshifted_evals[chunk_idx * group_idx] * lagrange_coeffs[chunk_idx];
            }

            unshifted_combined_evals.push_back(combined_eval);
        }

        size_t num_shifted_evals = shifted_evals.size();

        for (size_t group_idx = 0; group_idx < num_shifted_evals; group_idx++) {
            Fr combined_eval = Fr{ 0 };
            for (size_t chunk_idx = 0; chunk_idx < num_polys_in_group; chunk_idx++) {
                combined_eval += unshifted_evals[chunk_idx * group_idx] * lagrange_coeffs[chunk_idx];
            }

            unshifted_combined_evals.push_back(combined_eval);
        }
    }

    static std::vector<Fr> populate_lagrange_coeffs(std::vector<Fr>& extra_challenges)
    {
        std::vector<Fr> lagrange_coeffs(1);

        lagrange_coeffs.push_back(Fr(1));

        // Repeatedly "double" the vector by multiplying half by (1 - x_j) and half by x_j
        for (size_t j = 0; j < extra_challenges.size(); ++j) {
            Fr current_challenge = extra_challenges[j];
            size_t old_size = lagrange_coeffs.size();
            std::vector<Fr> lagrange_coeffs_next(old_size * 2);

            for (size_t i = 0; i < old_size; ++i) {
                lagrange_coeffs_next[i] = lagrange_coeffs[i] * (Fr(1) - current_challenge);
                lagrange_coeffs_next[i + old_size] = lagrange_coeffs[i] * current_challenge;
            }
            lagrange_coeffs = std::move(lagrange_coeffs_next);
        }

        return lagrange_coeffs;
    }
};
} // namespace bb