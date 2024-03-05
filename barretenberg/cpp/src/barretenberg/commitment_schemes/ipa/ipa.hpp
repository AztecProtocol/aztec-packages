#pragma once
#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/commitment_schemes/verification_key.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/ecc/scalar_multiplication/scalar_multiplication.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include <cstddef>
#include <numeric>
#include <string>
#include <vector>

namespace bb {

/**
 * @brief IPA (inner product argument) commitment scheme class.
 *
 *@details This implementation of IPA uses the optimized version that only multiplies half of the elements of each
 *vector in each prover round. The implementation uses:
 *
 *1. An SRS (Structured Reference String) \f$\vec{G}=(G_0,G_1...,G_{d-1})\f$ with \f$G_i ∈ E(\mathbb{F}_p)\f$ and
 *\f$\mathbb{F}_r\f$ - the scalar field of the elliptic curve as well as \f$G\f$ which is an independent generator on
 *the same curve.
 *2. A polynomial \f$f(x)=\sum_{i=0}^{d-1}f_ix^i\f$ over field \f$F_r\f$, where the polynomial degree \f$d-1\f$ is such
 *that \f$d=2^k\f$
 *
 *The opening and verification procedures expect that there already exists a commitment to \f$f(x)\f$ which is the
 *scalar product \f$[f(x)]=\langle\vec{f},\vec{G}\rangle\f$, where \f$\vec{f}=(f_0, f_1,..., f_{d-1})\f$​
 *
 * The opening procedure documentation can be found in the description of \link IPA::compute_opening_proof
 compute_opening_proof \endlink. The verification procedure documentation is in \link IPA::verify verify \endlink
 *
 * @tparam Curve
 *
 * @remark IPA is not a very intuitive algorithm, so here are a few things that might help internalize it:
 *
 *1. Originally we have two vectors \f$\vec{a}\f$ and \f$\vec{b}\f$, which the product of which we want to prove, but
 *the prover can't just send vector \f$\vec{a}\f$ to the verifier, it can only provide a commitment
 \f$langle\vec{a},\vec{G}\rangle\f$ *2. The verifier computes the \f$C'=C+f(\beta)\cdot U\f$ to "bind" together the
 commitment and the evaluation *3. The prover wants to reduce the problem of verifying the inner product of
 \f$\vec{a}\f$, \f$\vec{b}\f$ of length
 *\f$n\f$ to a problem of verifying the IPA of 2 vectors \f$\vec{a}_{new}\f$, \f$\vec{b}_{new}\f$ of size
 *\f$\frac{n}{2}\f$​
 *4. If \f$\vec{a}_{new}=\vec{a}_{low}+\alpha\cdot \vec{a}_{high}\f$ and \f$\vec{b}_{new}=\vec{b}_{low}+\alpha^{-1}\cdot
 \vec{b}_{high}\f$, then \f$\langle \vec{a}_{new},\vec{b}_{new}\rangle = \langle\vec{a}_{low},\vec{b}_{low}\rangle +
 \alpha^{-1}\langle\vec{a}_{low},\vec{b}_{high}\rangle+\alpha \langle \vec{a}_{high},\vec{b}_{low}\rangle +
 \langle\vec{a}_{high},\vec{b}_{high}\rangle=
 \langle\vec{a},\vec{b}\rangle+\alpha^{-1}\langle\vec{a}_{low},\vec{b}_{high}\rangle+\alpha \langle
 \vec{a}_{high},\vec{b}_{low}\rangle\f$, so if we provide commitments to
 \f$\langle\vec{a}_{low},\vec{b}_{high}\rangle\f$ and \f$\langle \vec{a}_{high},\vec{b}_{low}\rangle\f$  the verifier
 can reduce initial commitment to the result \f$\langle \vec{a},\vec{b}\rangle U\f$ to the new commitment \f$\langle
 \vec{a}_{new},\vec{b}_{new}\rangle U\f$
 *5. Analogously, if \f$\vec{G}_{new}=\vec{G}_{low}+\alpha^{-1}\vec{G}_{high}\f$, then we can reduce the initial
 *commitment to \f$\vec{a}\f$ by providing  \f$\langle\vec{a}_{low},\vec{G}_{high}\rangle\f$ and \f$\langle
 \vec{a}_{high},\vec{G}_{low}\rangle\f$. \f$\langle \vec{a}_{new},\vec{G}_{new}\rangle =
 \langle\vec{a},\vec{G}\rangle+\alpha^{-1}\langle\vec{a}_{low},\vec{G}_{high}\rangle+\alpha \langle
 \vec{a}_{high},\vec{G}_{low}\rangle\f$
 *6. We can batch the two reductions together \f$\langle \vec{a}_{new},\vec{b}_{new}\rangle U + \langle
 \vec{a}_{new},\vec{G}_{new}\rangle= \langle\vec{a},\vec{b}\rangle U+ \langle\vec{a},\vec{G}\rangle+
 \alpha^{-1}(\langle\vec{a}_{low},\vec{b}_{high}\rangle U +\langle\vec{a}_{low},\vec{G}_{high}\rangle) +\alpha (\langle
 \vec{a}_{high},\vec{b}_{low}\rangle U+\langle \vec{a}_{high},\vec{G}_{low}\rangle)\f$​
 *7. After \f$k\f$ steps of reductions we are left with \f$\langle \vec{a}_{0},\vec{b}_{0}\rangle U + \langle
 \vec{a}_{0},\vec{G}_{s}\rangle= a_0 b_0 U+a_0G_s\f$. The prover provides \f$a_0\f$. The independence of \f$U\f$ and
 \f$\vec{G}\f$ from which we construct \f$G_s\f$ ensures that \f$a_0\f$ is constructed from \f$\vec{a}_k=\vec{p}\f$
 *correctly, while the correctness of \f$a_0 b_0 U\f$ ensures that the polynomial opening is indeed \f$f(\beta)\f$
 *
 * The old version of documentation is available at <a href="https://hackmd.io/q-A8y6aITWyWJrvsGGMWNA?view">Old IPA
 documentation </a>
 */
template <typename Curve> class IPA {
    using Fr = typename Curve::ScalarField;
    using GroupElement = typename Curve::Element;
    using Commitment = typename Curve::AffineElement;
    using CK = CommitmentKey<Curve>;
    using VK = VerifierCommitmentKey<Curve>;
    using Polynomial = bb::Polynomial<Fr>;

  public:
    /**
     * @brief Compute an inner product argument proof for opening a single polynomial at a single evaluation point
     *
     * @param ck The commitment key containing srs and pippenger_runtime_state for computing MSM
     * @param opening_pair (challenge, evaluation)
     * @param polynomial The witness polynomial whose opening proof needs to be computed
     * @param transcript Prover transcript
     * https://github.com/AztecProtocol/aztec-packages/pull/3434
     *
     *@details For a vector \f$\vec{v}=(v_0,v_1,...,v_{2n-1})\f$ of length \f$2n\f$ we'll denote
     *\f$\vec{v}_{low}=(v_0,v_1,...,v_{n-1})\f$ and \f$\vec{v}_{high}=(v_{n},v_{n+1},...v_{2n-1})\f$. The procedure runs
     *as follows:
     *
     *1. Send the degree of \f$f(x)\f$ plus one, equal to \f$d\f$ to the verifier
     *2. Receive the generator challenge \f$u\f$ from the verifier
     *3. Compute the auxiliary generator \f$U=u\cdot G\f$, where \f$G\f$ is a generator of \f$E(\mathbb{F}_p)\f$​
     *4. Set \f$\vec{G}_{k}=\vec{G}\f$, \f$\vec{a}_{k}=\vec{p}\f$
     *5. Compute the vector \f$\vec{b}_{k}=(1,\beta,\beta^2,...,\beta^{d-1})\f$
     *6. Perform \f$k\f$ rounds (for \f$i \in \{k,...,1\}\f$) of:
     *   1. Compute
     *\f$L_{i-1}=\langle\vec{a}_{i\_low},\vec{G}_{i\_high}\rangle+\langle\vec{a}_{i\_low},\vec{b}_{i\_high}\rangle\cdot
     *U\f$​
     *   2. Compute
     *\f$R_{i-1}=\langle\vec{a}_{i\_high},\vec{G}_{i\_low}\rangle+\langle\vec{a}_{i\_high},\vec{b}_{i\_low}\rangle\cdot
     *U\f$
     *   3. Send \f$L_{i-1}\f$ and \f$R_{i-1}\f$ to the verifier
     *   4. Receive round challenge \f$u_{i-1}\f$ from the verifier​
     *   5. Compute \f$\vec{a}_{i-1}=\vec{a}_{i\_low}+u_{i-1}\cdot \vec{a}_{i\_high}\f$
     *   6. Compute \f$\vec{b}_{i-1}=\vec{b}_{i\_low}+u_{i-1}^{-1}\cdot \vec{b}_{i\_high}\f$​
     *   7. Compute \f$\vec{G}_{i-1}=\vec{G}_{i\_low}+u_{i-1}^{-1}\cdot \vec{G}_{i\_high}\f$
     *
     *7. Send the final \f$\vec{a}_{0} = (a_0)\f$ to the verifier
     */
    static void compute_opening_proof(const std::shared_ptr<CK>& ck,
                                      const OpeningPair<Curve>& opening_pair,
                                      const Polynomial& polynomial,
                                      const std::shared_ptr<NativeTranscript>& transcript)
    {
        ASSERT(opening_pair.challenge != 0 && "The challenge point should not be zero");
        auto poly_degree_plus_1 = static_cast<size_t>(polynomial.size());
        transcript->send_to_verifier("IPA:poly_degree_plus_1", static_cast<uint32_t>(poly_degree_plus_1));
        const Fr generator_challenge = transcript->template get_challenge<Fr>("IPA:generator_challenge");
        auto aux_generator = Commitment::one() * generator_challenge;
        // Checks poly_degree is greater than zero and a power of two
        // In the future, we might want to consider if non-powers of two are needed
        ASSERT((poly_degree_plus_1 > 0) && (!(poly_degree_plus_1 & (poly_degree_plus_1 - 1))) &&
               "The polynomial degree plus 1 should be positive and a power of two");

        auto a_vec = polynomial;
        auto* srs_elements = ck->srs->get_monomial_points();
        std::vector<Commitment> G_vec_local(poly_degree_plus_1);

        // The SRS stored in the commitment key is the result after applying the pippenger point table so the
        // values at odd indices contain the point {srs[i-1].x * beta, srs[i-1].y}, where beta is the endomorphism
        // G_vec_local should use only the original SRS thus we extract only the even indices.
        run_loop_in_parallel_if_effective(
            poly_degree_plus_1,
            [&G_vec_local, srs_elements](size_t start, size_t end) {
                for (size_t i = start * 2; i < end * 2; i += 2) {
                    G_vec_local[i >> 1] = srs_elements[i];
                }
            },
            /*finite_field_additions_per_iteration=*/0,
            /*finite_field_multiplications_per_iteration=*/0,
            /*finite_field_inversions_per_iteration=*/0,
            /*group_element_additions_per_iteration=*/0,
            /*group_element_doublings_per_iteration=*/0,
            /*scalar_multiplications_per_iteration=*/0,
            /*sequential_copy_ops_per_iteration=*/1);

        std::vector<Fr> b_vec(poly_degree_plus_1);
        run_loop_in_parallel_if_effective(
            poly_degree_plus_1,
            [&b_vec, &opening_pair](size_t start, size_t end) {
                Fr b_power = opening_pair.challenge.pow(start);
                for (size_t i = start; i < end; i++) {
                    b_vec[i] = b_power;
                    b_power *= opening_pair.challenge;
                }
            },
            /*finite_field_additions_per_iteration=*/0,
            /*finite_field_multiplications_per_iteration=*/1);

        // Iterate for log(poly_degree) rounds to compute the round commitments.
        auto log_poly_degree = static_cast<size_t>(numeric::get_msb(poly_degree_plus_1));
        std::vector<GroupElement> L_elements(log_poly_degree);
        std::vector<GroupElement> R_elements(log_poly_degree);
        std::size_t round_size = poly_degree_plus_1;

        // Allocate vectors for parallel storage of partial products
        const size_t num_cpus = get_num_cpus();
        std::vector<Fr> partial_inner_prod_L(num_cpus);
        std::vector<Fr> partial_inner_prod_R(num_cpus);
        // Perform IPA rounds
        for (size_t i = 0; i < log_poly_degree; i++) {
            round_size >>= 1;
            // Set partial products to zero
            memset(&partial_inner_prod_L[0], 0, sizeof(Fr) * num_cpus);
            memset(&partial_inner_prod_R[0], 0, sizeof(Fr) * num_cpus);
            // Compute inner_prod_L := < a_vec_lo, b_vec_hi > and inner_prod_R := < a_vec_hi, b_vec_lo >
            Fr inner_prod_L = Fr::zero();
            Fr inner_prod_R = Fr::zero();
            // Run scalar product in parallel
            run_loop_in_parallel_if_effective_with_index(
                round_size,
                [&a_vec, &b_vec, round_size, &partial_inner_prod_L, &partial_inner_prod_R](
                    size_t start, size_t end, size_t workload_index) {
                    Fr current_inner_prod_L = Fr::zero();
                    Fr current_inner_prod_R = Fr::zero();
                    for (size_t j = start; j < end; j++) {
                        current_inner_prod_L += a_vec[j] * b_vec[round_size + j];
                        current_inner_prod_R += a_vec[round_size + j] * b_vec[j];
                    }
                    partial_inner_prod_L[workload_index] = current_inner_prod_L;
                    partial_inner_prod_R[workload_index] = current_inner_prod_R;
                },
                /*finite_field_additions_per_iteration=*/2,
                /*finite_field_multiplications_per_iteration=*/2);
            for (size_t j = 0; j < num_cpus; j++) {
                inner_prod_L += partial_inner_prod_L[j];
                inner_prod_R += partial_inner_prod_R[j];
            }

            // L_i = < a_vec_lo, G_vec_hi > + inner_prod_L * aux_generator
            L_elements[i] = bb::scalar_multiplication::pippenger_without_endomorphism_basis_points<Curve>(
                &a_vec[0], &G_vec_local[round_size], round_size, ck->pippenger_runtime_state);
            L_elements[i] += aux_generator * inner_prod_L;

            // R_i = < a_vec_hi, G_vec_lo > + inner_prod_R * aux_generator
            R_elements[i] = bb::scalar_multiplication::pippenger_without_endomorphism_basis_points<Curve>(
                &a_vec[round_size], &G_vec_local[0], round_size, ck->pippenger_runtime_state);
            R_elements[i] += aux_generator * inner_prod_R;

            std::string index = std::to_string(i);
            transcript->send_to_verifier("IPA:L_" + index, Commitment(L_elements[i]));
            transcript->send_to_verifier("IPA:R_" + index, Commitment(R_elements[i]));

            // Generate the round challenge.
            const Fr round_challenge = transcript->get_challenge<Fr>("IPA:round_challenge_" + index);
            const Fr round_challenge_inv = round_challenge.invert();

            auto G_hi = GroupElement::batch_mul_with_endomorphism(
                std::span{ G_vec_local.begin() + static_cast<long>(round_size),
                           G_vec_local.begin() + static_cast<long>(round_size * 2) },
                round_challenge_inv);

            // Update the vectors a_vec, b_vec and G_vec.
            // a_vec_next = a_vec_lo + a_vec_hi * round_challenge
            // b_vec_next = b_vec_lo + b_vec_hi * round_challenge_inv
            // G_vec_next = G_vec_lo + G_vec_hi * round_challenge_inv
            run_loop_in_parallel_if_effective(
                round_size,
                [&a_vec, &b_vec, round_challenge, round_challenge_inv, round_size](size_t start, size_t end) {
                    for (size_t j = start; j < end; j++) {
                        a_vec[j] += round_challenge * a_vec[round_size + j];
                        b_vec[j] += round_challenge_inv * b_vec[round_size + j];
                    }
                },
                /*finite_field_additions_per_iteration=*/4,
                /*finite_field_multiplications_per_iteration=*/8,
                /*finite_field_inversions_per_iteration=*/1);
            GroupElement::batch_affine_add(
                std::span{ G_vec_local.begin(), G_vec_local.begin() + static_cast<long>(round_size) },
                G_hi,
                G_vec_local);
        }

        transcript->send_to_verifier("IPA:a_0", a_vec[0]);
    }

    /**
     * @brief Verify the correctness of a Proof
     *
     * @param vk Verification_key containing srs and pippenger_runtime_state to be used for MSM
     * @param proof The proof containg L_vec, R_vec and a_zero
     * @param pub_input Data required to verify the proof
     *
     * @return true/false depending on if the proof verifies
     *
     * @details The procedure runs as follows:
     *
     *1. Receive \f$d\f$ (polynomial degree plus one) from the prover
     *2. Receive the generator challenge \f$u\f$ and computes \f$U=u\cdot G\f$
     *3. Compute  \f$C'=C+f(\beta)\cdot U\f$
     *4. Receive \f$L_j, R_j\f$ and compute challenges \f$u_j\f$ for \f$j \in {k-1,..,0}\f$
     *5. Compute \f$C_0 = C' + \sum_{j=0}^{k-1}(u_j^{-1}L_j + u_jR_j)\f$
     *6. Compute \f$b_0=g(\beta)=\prod_{i=0}^{k-1}(1+u_{i}^{-1}x^{2^{i}})\f$
     *7. Compute vector \f$\vec{s}=(1,u_{0}^{-1},u_{1}^{-1},u_{0}^{-1}u_{1}^{-1},...,\prod_{i=0}^{k-1}u_{i}^{-1})\f$
     *8. Compute \f$G_s=\langle \vec{s},\vec{G}\rangle\f$
     *9. Receive \f$\vec{a}_{k-1}\f$ of length 1
     *10. Compute \f$C_{right}=a_{0}G_{s}+a_{0}b_{0}U\f$
     *11. Check that \f$C_{right} = C_0\f$. If they match, return true. Otherwise return false.
     *
     *
     */
    static bool verify(const std::shared_ptr<VK>& vk,
                       const OpeningClaim<Curve>& opening_claim,
                       const std::shared_ptr<NativeTranscript>& transcript)
    {
        auto poly_degree_plus_1 =
            static_cast<uint32_t>(transcript->template receive_from_prover<typename Curve::BaseField>(
                "IPA:poly_degree_plus_1")); // note this is base field because this is a uint32_t, which should map to a
                                            // bb::fr, not a grumpkin::fr, which is a BaseField element for Grumpkin
        const Fr generator_challenge = transcript->template get_challenge<Fr>("IPA:generator_challenge");
        auto aux_generator = Commitment::one() * generator_challenge;

        auto log_poly_degree_plus_1 = static_cast<size_t>(numeric::get_msb(poly_degree_plus_1));

        // Compute C_prime
        GroupElement C_prime = opening_claim.commitment + (aux_generator * opening_claim.opening_pair.evaluation);

        // Compute C_zero = C_prime + ∑_{j ∈ [k]} u_j^{-1}L_j + ∑_{j ∈ [k]} u_jR_j
        auto pippenger_size = 2 * log_poly_degree_plus_1;
        std::vector<Fr> round_challenges(log_poly_degree_plus_1);
        std::vector<Fr> round_challenges_inv(log_poly_degree_plus_1);
        std::vector<Commitment> msm_elements(pippenger_size);
        std::vector<Fr> msm_scalars(pippenger_size);
        for (size_t i = 0; i < log_poly_degree_plus_1; i++) {
            std::string index = std::to_string(i);
            auto element_L = transcript->template receive_from_prover<Commitment>("IPA:L_" + index);
            auto element_R = transcript->template receive_from_prover<Commitment>("IPA:R_" + index);
            round_challenges[i] = transcript->template get_challenge<Fr>("IPA:round_challenge_" + index);
            round_challenges_inv[i] = round_challenges[i].invert();

            msm_elements[2 * i] = element_L;
            msm_elements[2 * i + 1] = element_R;
            msm_scalars[2 * i] = round_challenges_inv[i];
            msm_scalars[2 * i + 1] = round_challenges[i];
        }

        GroupElement LR_sums = bb::scalar_multiplication::pippenger_without_endomorphism_basis_points<Curve>(
            &msm_scalars[0], &msm_elements[0], pippenger_size, vk->pippenger_runtime_state);
        GroupElement C_zero = C_prime + LR_sums;

        //  Compute b_zero where b_zero can be computed using the polynomial:

        //  g(X) = ∏_{i ∈ [k]} (1 + u_{k-i}^{-1}.X^{2^{i-1}}).

        //  b_zero = g(evaluation) = ∏_{i ∈ [k]} (1 + u_{k-i}^{-1}. (evaluation)^{2^{i-1}})

        Fr b_zero = Fr::one();
        for (size_t i = 0; i < log_poly_degree_plus_1; i++) {
            auto exponent = static_cast<uint64_t>(Fr(2).pow(i));
            b_zero *= Fr::one() + (round_challenges_inv[log_poly_degree_plus_1 - 1 - i] *
                                   opening_claim.opening_pair.challenge.pow(exponent));
        }

        // Compute G_zero
        // First construct s_vec
        std::vector<Fr> s_vec(poly_degree_plus_1);
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/857): This code is not efficient as its O(nlogn).
        // This can be optimized to be linear by computing a tree of products. Its very readable, so we're
        // leaving it unoptimized for now.
        run_loop_in_parallel_if_effective(
            poly_degree_plus_1,
            [&s_vec, &round_challenges_inv, log_poly_degree_plus_1](size_t start, size_t end) {
                for (size_t i = start; i < end; i++) {
                    Fr s_vec_scalar = Fr::one();
                    for (size_t j = (log_poly_degree_plus_1 - 1); j != size_t(-1); j--) {
                        auto bit = (i >> j) & 1;
                        bool b = static_cast<bool>(bit);
                        if (b) {
                            s_vec_scalar *= round_challenges_inv[log_poly_degree_plus_1 - 1 - j];
                        }
                    }
                    s_vec[i] = s_vec_scalar;
                }
            },
            /*finite_field_additions_per_iteration=*/0,
            /*finite_field_multiplications_per_iteration=*/log_poly_degree_plus_1);

        auto* srs_elements = vk->srs->get_monomial_points();

        // Copy the G_vector to local memory.
        std::vector<Commitment> G_vec_local(poly_degree_plus_1);

        // The SRS stored in the commitment key is the result after applying the pippenger point table so the
        // values at odd indices contain the point {srs[i-1].x * beta, srs[i-1].y}, where beta is the endomorphism
        // G_vec_local should use only the original SRS thus we extract only the even indices.
        run_loop_in_parallel_if_effective(
            poly_degree_plus_1,
            [&G_vec_local, srs_elements](size_t start, size_t end) {
                for (size_t i = start * 2; i < end * 2; i += 2) {
                    G_vec_local[i >> 1] = srs_elements[i];
                }
            },
            /*finite_field_additions_per_iteration=*/0,
            /*finite_field_multiplications_per_iteration=*/0,
            /*finite_field_inversions_per_iteration=*/0,
            /*group_element_additions_per_iteration=*/0,
            /*group_element_doublings_per_iteration=*/0,
            /*scalar_multiplications_per_iteration=*/0,
            /*sequential_copy_ops_per_iteration=*/1);

        auto G_zero = bb::scalar_multiplication::pippenger_without_endomorphism_basis_points<Curve>(
            &s_vec[0], &G_vec_local[0], poly_degree_plus_1, vk->pippenger_runtime_state);

        auto a_zero = transcript->template receive_from_prover<Fr>("IPA:a_0");

        GroupElement right_hand_side = G_zero * a_zero + aux_generator * a_zero * b_zero;

        return (C_zero.normalize() == right_hand_side.normalize());
    }
};

} // namespace bb