// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Raju], commit: 05a381f8b31ae4648e480f1369e911b148216e8b}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/commitment_schemes/verification_key.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/container.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/ecc/scalar_multiplication/scalar_multiplication.hpp"
#include "barretenberg/polynomials/gate_separator.hpp"
#include "barretenberg/stdlib/hash/poseidon2/poseidon2.hpp"
#include "barretenberg/stdlib/honk_verifier/ipa_accumulator.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include <cstddef>
#include <numeric>
#include <string>
#include <utility>
#include <vector>

namespace bb {
/**
* @brief IPA (inner product argument) commitment scheme class.
*
*@details This implementation of IPA uses the optimized version that only multiplies half of the elements of each
*vector in each prover round. The implementation uses:
*
*1. An CRS (Common Reference String) \f$\vec{G}=(G_0,G_1...,G_{d-1})\f$ with \f$G_i ∈ E(\mathbb{F}_p)\f$ and
*\f$\mathbb{F}_r\f$ - the scalar field of the elliptic curve as well as \f$G\f$ which is an independent generator on
*the same curve. (Note: we occasionally might use the language of SRS instead of CRS; this is a mild abuse of language.)
*2. A polynomial \f$f(x)=\sum_{i=0}^{d-1}f_ix^i\f$ over field \f$\mathbb{F}_r\f$, where \f$d=2^k\f$
*
*The opening and verification procedures expect that there already exists a commitment to \f$f(x)\f$ which is the
*scalar product \f$[f(x)]=\langle\vec{f},\vec{G}\rangle\f$, where \f$\vec{f}=(f_0, f_1,..., f_{d-1})\f$​
*
* The opening procedure documentation can be found in the description of \link IPA::compute_opening_proof_internal
compute_opening_proof_internal \endlink. The verification procedure documentation is in \link IPA::verify_internal
verify_internal \endlink
*
* @tparam Curve
*
* @remark IPA is not a very intuitive algorithm, so here are a few things that might help internalize it:
*
*1. Originally we have two vectors \f$\vec{a}\f$ and \f$\vec{b}\f$, whose product we want to prove, but
*the prover can't just send vector \f$\vec{a}\f$ to the verifier, it can only provide a commitment
\f$\langle\vec{a},\vec{G}\rangle\f$
*2. The verifier computes the \f$C'=C+\langle\vec{a},\vec{b}\rangle\cdot U\f$ to "bind" together the
commitment and the evaluation (\f$C=\langle\vec{a},\vec{G}\rangle\f$ is the commitment and \f$U=u⋅G\f$ is the auxiliary
generator independent from \f$\vec{G}\f$)
*3. The prover wants to reduce the problem of verifying the inner product of
\f$\vec{a}\f$, \f$\vec{b}\f$ of length
*\f$n\f$ to a problem of verifying the IPA of 2 vectors \f$\vec{a}_{new}\f$, \f$\vec{b}_{new}\f$ of size
*\f$\frac{n}{2}\f$​
*4. If \f$\vec{a}_{new}=\vec{a}_{low}+\alpha\cdot \vec{a}_{high}\f$ and \f$\vec{b}_{new}=\vec{b}_{low}+\alpha^{-1}\cdot
\vec{b}_{high}\f$, then \f$\langle \vec{a}_{new},\vec{b}_{new}\rangle = \langle\vec{a}_{low},\vec{b}_{low}\rangle +
\alpha^{-1}\langle\vec{a}_{low},\vec{b}_{high}\rangle+\alpha \langle \vec{a}_{high},\vec{b}_{low}\rangle +
\langle\vec{a}_{high},\vec{b}_{high}\rangle=
\langle\vec{a},\vec{b}\rangle+\alpha^{-1}\langle\vec{a}_{low},\vec{b}_{high}\rangle+\alpha \langle
\vec{a}_{high},\vec{b}_{low}\rangle\f$, so if we provide commitments to the cross-terms
\f$\langle\vec{a}_{low},\vec{b}_{high}\rangle\f$ and \f$\langle \vec{a}_{high},\vec{b}_{low}\rangle\f$,  the verifier
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
template <typename Curve_, size_t log_poly_length = CONST_ECCVM_LOG_N> class IPA {
  public:
    using Curve = Curve_;
    using Fr = typename Curve::ScalarField;
    using GroupElement = typename Curve::Element;
    using Commitment = typename Curve::AffineElement;
    using CK = CommitmentKey<Curve>;
    using VK = VerifierCommitmentKey<Curve>;

    // records the `u_challenges_inv`, the Pederson commitment to the `h` -polynomial, a.k.a. the challenge
    // polynomial, given as ∏_{i ∈ [k]} (1 + u_{len-i}^{-1}.X^{2^{i-1}}), and the running truth value of the IPA
    // accumulation claim.
    using VerifierAccumulator = stdlib::recursion::honk::IpaAccumulator<Curve>;

    /**
     * @brief Deferred native IPA verification state — the native counterpart of `VerifierAccumulator`.
     * @details The cheap IPA group relation has been checked against the prover-claimed commitment to the challenge
     * polynomial (`G_0`); the expensive `G_0 == <challenge_poly(u), SRS>` check is deferred to `verify_accumulator`
     * (single SRS-MSM) or `batch_verify_accumulators` (one combined SRS-MSM for a batch). The recursive
     * `VerifierAccumulator` defers `G_0` up the recursion instead.
     */
    struct NativeAccumulator {
        std::vector<Fr> u_challenges_inv; // IPA round challenge inverses; define the challenge polynomial
        Commitment claimed_commitment;    // prover-claimed G_0 = <challenge_poly(u), SRS>, verified later
        bool relation_succeeded = false;  // cheap IPA group relation (excludes the deferred SRS-MSM)
    };

    // Compute the length of the vector of coefficients of a polynomial being opened.
    static constexpr size_t poly_length = 1UL << log_poly_length;
    static_assert(log_poly_length >= 1, "log_poly_length must be at least 1");

// These allow access to internal functions so that we can never use a mock transcript unless it's fuzzing or testing of
// IPA specifically
#ifdef IPA_TEST
    FRIEND_TEST(IPATest, ChallengesAreZero);
    FRIEND_TEST(IPATest, AIsZeroAfterOneRound);
#endif
#ifdef IPA_FUZZ_TEST
    friend class ProxyCaller;
#endif

    /**
     * @brief The power tensor `(1, r, r^2, ..., r^{poly_length-1})`, the IPA b-vector for a univariate opening.
     *
     * @details `r^i = prod_{j : bit j of i set} r^{2^j}`, i.e. the gate-separator beta-products of the repeated squares
     * of `r` — the same construction `ProverEqPolynomial::construct` uses for the eq tensor. Shared by the single-claim
     * prover (as its b-vector) and the TripleIPA (folded into the merged b-vector with the pow-claim's weight).
     */
    static bb::Polynomial<Fr> powers_tensor(const Fr& r)
    {
        std::vector<Fr> squares(log_poly_length);
        Fr square = r;
        for (size_t i = 0; i < log_poly_length; ++i) {
            squares[i] = square;
            square = square.sqr();
        }
        return GateSeparatorPolynomial<Fr>::compute_beta_products(squares, log_poly_length);
    }

    /**
     * @brief Compute an inner product argument proof for opening a single polynomial at a single evaluation point.
     *
     * @tparam Transcript Transcript type. Useful for testing
     * @param ck The commitment key containing srs
     * @param opening_pair (challenge, evaluation)
     * @param polynomial The witness polynomial whose opening proof needs to be computed
     * @param transcript Prover transcript
     * https://github.com/AztecProtocol/aztec-packages/pull/3434
     *
     *@details For a vector \f$\vec{v}=(v_0,v_1,...,v_{2n-1})\f$ of length \f$2n\f$ we'll denote
     *\f$\vec{v}_{low}=(v_0,v_1,...,v_{n-1})\f$ and \f$\vec{v}_{high}=(v_{n},v_{n+1},...v_{2n-1})\f$. The procedure runs
     *as follows:
     *
     *1. We assume that the hash buffer has been populated by the opening claim. (This is done in a different method.)
     *2. Receive the generator challenge \f$u\f$ from the verifier. If it is zero, abort
     *3. Compute the auxiliary generator \f$U=u\cdot G\f$, where \f$G\f$ is a generator of \f$E(\mathbb{F}_p)\f$​
     *4. Set \f$\vec{G}_{k}=\vec{G}\f$, \f$\vec{a}_{k}=\vec{p}\f$ where \f$vec{p}\f$ represent the polynomial's
     *coefficients
 .   *5. Compute the vector \f$\vec{b}_{k}=(1,\beta,\beta^2,...,\beta^{d-1})\f$ where \f$p(\beta)$\f is the
     evaluation we wish to prove.
     *6. Perform \f$k\f$ rounds (for \f$i \in \{k,...,1\}\f$) of:
     *   1. Compute
     \f$L_{i-1}=\langle\vec{a}_{i\_low},\vec{G}_{i\_high}\rangle+\langle\vec{a}_{i\_low},\vec{b}_{i\_high}\rangle\cdot
     U\f$​
     *   2. Compute
     *\f$R_{i-1}=\langle\vec{a}_{i\_high},\vec{G}_{i\_low}\rangle+\langle\vec{a}_{i\_high},\vec{b}_{i\_low}\rangle\cdot
     U\f$
     *   3. Send \f$L_{i-1}\f$ and \f$R_{i-1}\f$ to the verifier
     *   4. Receive round challenge \f$u_{i-1}\f$ from the verifier​, if it is zero, abort
     *   5. Compute \f$\vec{G}_{i-1}=\vec{G}_{i\_low}+u_{i-1}^{-1}\cdot \vec{G}_{i\_high}\f$
     *   6. Compute \f$\vec{a}_{i-1}=\vec{a}_{i\_low}+u_{i-1}\cdot \vec{a}_{i\_high}\f$
     *   7. Compute \f$\vec{b}_{i-1}=\vec{b}_{i\_low}+u_{i-1}^{-1}\cdot \vec{b}_{i\_high}\f$​
     *
     *7. Send the final \f$\vec{a}_{0} = (a_0)\f$ to the verifier
     */
    template <typename Transcript>
    static void compute_opening_proof_internal(const CK& ck,
                                               const ProverOpeningClaim<Curve>& opening_claim,
                                               const std::shared_ptr<Transcript>& transcript)
    {
        bb::Polynomial<Fr> b_vec = powers_tensor(opening_claim.opening_pair.challenge);
        compute_inner_product_proof_internal(ck, opening_claim.polynomial, std::move(b_vec), transcript);
    }

    template <typename Transcript>
    static void compute_inner_product_proof_internal(const CK& ck,
                                                     const bb::Polynomial<Fr>& witness,
                                                     bb::Polynomial<Fr> b_vec,
                                                     const std::shared_ptr<Transcript>& transcript)
    {
        BB_BENCH_NAME("IPA::compute_opening_proof");

        // Step 1.
        // Done in `add_claim_to_hash_buffer`.
        // Step 2.
        // Receive challenge for the auxiliary generator.
        const Fr generator_challenge = transcript->template get_challenge<Fr>("IPA:generator_challenge");
        if (generator_challenge.is_zero()) {
            throw_or_abort("The generator challenge can't be zero");
        }

        // Step 3.
        // Compute auxiliary generator U, which is used to bind together the inner product claim and the commitment.
        // This yields the binding property because we assume it is computationally difficult to find a linear relation
        // between the CRS and `Commitment::one()`.
        const auto aux_generator = Commitment::one() * generator_challenge;

        // Checks poly_degree is greater than zero and a power of two.
        // In the future, we might want to consider if non-powers of two are needed.
        BB_ASSERT((poly_length > 0) && (!(poly_length & (poly_length - 1))),
                  "The polynomial degree plus 1 should be positive and a power of two");
        // Step 4.
        // Set initial vector a to the witness coefficients and load vector G.
        // Ensure the witness copy is fully formed.
        auto a_vec = witness.full();
        std::span<Commitment> srs_elements = ck.get_monomial_points();
        if (poly_length > srs_elements.size()) {
            throw_or_abort("potential bug: Not enough SRS points for IPA!");
        }

        // Copy the SRS into a local data structure as we need to mutate this vector for every round.
        std::vector<Commitment> G_vec_local(poly_length);
        parallel_for_heuristic(
            poly_length,
            [&](size_t idx) {
                BB_BENCH_TRACY_NAME("IPA::copy_srs");
                G_vec_local[idx] = srs_elements[idx];
            },
            thread_heuristics::FF_COPY_COST);

        // Step 5.
        // The caller supplies vector b: powers of the challenge for classical IPA, or another tensor for TripleIPA.
        // Allocate space for L_i and R_i elements.
        GroupElement L_i;
        GroupElement R_i;
        std::size_t round_size = poly_length;
        // Step 6.
        // Perform IPA reduction rounds.
        for (size_t round_idx = 0; round_idx < log_poly_length; ++round_idx) {
            round_size /= 2;

            // Run scalar products in parallel.
            // Cross inner products are the U-coefficients of the L/R commitments. The caller supplies b_vec, so this
            // same IPA core works for both classical evaluation vectors and TripleIPA tensors.
            auto inner_prods = parallel_for_heuristic(
                round_size,
                std::pair{ Fr::zero(), Fr::zero() },
                [&](size_t idx, std::pair<Fr, Fr>& inner_prod_left_right) {
                    BB_BENCH_TRACY_NAME("IPA::inner_product");
                    // Compute inner_prod_L := < a_vec_lo, b_vec_hi >
                    inner_prod_left_right.first += a_vec[idx] * b_vec[round_size + idx];
                    // Compute inner_prod_R := < a_vec_hi, b_vec_lo >
                    inner_prod_left_right.second += a_vec[round_size + idx] * b_vec[idx];
                },
                thread_heuristics::FF_ADDITION_COST * 2 + thread_heuristics::FF_MULTIPLICATION_COST * 2);
            // Sum inner product contributions computed in parallel and unpack the std::pair.
            auto [inner_prod_L, inner_prod_R] = sum_pairs(inner_prods);

            // Step 6.a (using letters, because doxygen automatically converts the sublist counters to letters :( )
            // L_i = < a_vec_lo, G_vec_hi > + inner_prod_L * aux_generator
            L_i = scalar_multiplication::pippenger_unsafe<Curve>({ 0, { &a_vec.at(0), round_size } },
                                                                 { &G_vec_local[round_size], round_size });
            L_i += aux_generator * inner_prod_L;

            // Step 6.b
            // R_i = < a_vec_hi, G_vec_lo > + inner_prod_R * aux_generator
            R_i = scalar_multiplication::pippenger_unsafe<Curve>({ 0, { &a_vec.at(round_size), round_size } },
                                                                 { &G_vec_local[0], round_size });
            R_i += aux_generator * inner_prod_R;

            // Step 6.c
            // Send L_i and R_i to the verifier.
            const std::string index = std::to_string(log_poly_length - round_idx - 1);
            transcript->send_to_verifier("IPA:L_" + index, Commitment(L_i));
            transcript->send_to_verifier("IPA:R_" + index, Commitment(R_i));

            // Step 6.d
            // Receive the challenge from the verifier.
            const Fr round_challenge = transcript->template get_challenge<Fr>("IPA:round_challenge_" + index);
            if (round_challenge.is_zero()) {
                throw_or_abort("IPA round challenge is zero");
            }
            const Fr round_challenge_inv = round_challenge.invert();

            // Step 6.e
            // G_vec_new = G_vec_lo + G_vec_hi * round_challenge_inv
            auto G_hi_by_inverse_challenge = GroupElement::batch_mul_with_endomorphism(
                std::span{ G_vec_local.begin() + static_cast<std::ptrdiff_t>(round_size),
                           G_vec_local.begin() + static_cast<std::ptrdiff_t>(round_size * 2) },
                round_challenge_inv);
            GroupElement::batch_affine_add(
                std::span{ G_vec_local.begin(), G_vec_local.begin() + static_cast<std::ptrdiff_t>(round_size) },
                G_hi_by_inverse_challenge,
                G_vec_local);
            // Steps 6.e and 6.f
            // Update the vectors a_vec, b_vec.
            // a_vec_new = a_vec_lo + a_vec_hi * round_challenge
            // b_vec_new = b_vec_lo + b_vec_hi * round_challenge_inv
            parallel_for_heuristic(
                round_size,
                [&](size_t idx) {
                    BB_BENCH_TRACY_NAME("IPA::fold_vecs");
                    a_vec.at(idx) += round_challenge * a_vec[round_size + idx];
                    b_vec.at(idx) += round_challenge_inv * b_vec[round_size + idx];
                },
                thread_heuristics::FF_ADDITION_COST * 2 + thread_heuristics::FF_MULTIPLICATION_COST * 2);
        }

        // Step 7.
        // Send G_0 to the verifier.
        transcript->send_to_verifier("IPA:G_0", G_vec_local[0]);
        // Step 8.
        // Send a_0 to the verifier.
        transcript->send_to_verifier("IPA:a_0", a_vec[0]);
    }
    /**
     * @brief Add the opening claim to the hash buffer.
     *
     * @details We add the commitment, challenge, and claimed evaluation to the hash buffer.
     * @tparam Transcript
     * @param ck
     * @param opening_claim
     * @param transcript
     * @note This requires us to explicitly compute the commitment.
     * @note We enact this separation to allow for more ergonomic failure tests.
     */
    template <typename Transcript>
    static void add_claim_to_hash_buffer(const CK& ck,
                                         const ProverOpeningClaim<Curve>& opening_claim,
                                         const std::shared_ptr<Transcript>& transcript)
    {
        const bb::Polynomial<Fr>& polynomial = opening_claim.polynomial;

        // Step 1.
        // Add the commitment, challenge, and evaluation to the hash buffer.
        // NOTE:
        //      a. This is a bit inefficient, as the prover otherwise doesn't need this commitment.
        //      However, the effect to performance of this MSM (in practice of size 2^16) is tiny.
        //      b. Note that we add these three pieces of information to the hash buffer, as opposed to
        //      calling the `send_to_verifier` method, as the verifier knows them.

        const auto commitment = ck.commit(polynomial);
        transcript->add_to_hash_buffer("IPA:commitment", commitment);
        transcript->add_to_hash_buffer("IPA:challenge", opening_claim.opening_pair.challenge);
        transcript->add_to_hash_buffer("IPA:evaluation", opening_claim.opening_pair.evaluation);
    }

    /**
     * @brief Per-proof data extracted from an IPA transcript.
     * @details Contains all values derived from transcript processing (steps 2–7, 9 of the IPA verification
     * protocol) that are needed for either single-proof or batch IPA verification.
     * Does not include the MSM (step 8).
     */
    struct TranscriptData {
        GroupElement C_zero;                  ///< \f$C_0 = C' + \sum_{j=0}^{k-1}(u_j^{-1}L_j + u_jR_j)\f$
        Fr b_zero;                            ///< \f$b_0 = g(\beta) = \prod_{i=0}^{k-1}(1+u_{i}^{-1}x^{2^{i}})\f$
        Polynomial<Fr> s_vec;                 ///< \f$\vec{s}=(1,u_{0}^{-1},u_{1}^{-1},u_{0}^{-1}u_{1}^{-1},...,
                                              ///<  \prod_{i=0}^{k-1}u_{i}^{-1})\f$
        Fr gen_challenge;                     ///< Generator challenge \f$u\f$ where \f$U = u \cdot G\f$
        Commitment G_zero_from_prover;        ///< \f$G_0\f$ received from prover (not recomputed)
        Fr a_zero;                            ///< \f$a_0\f$ received from prover
        std::vector<Fr> round_challenges_inv; ///< Round challenge inverses used by recursive aggregation.
    };

    /**
     * @brief Process a single IPA proof's transcript, extracting all per-proof verification data.
     *
     * @param opening_claim Contains the commitment \f$C\f$ and opening pair \f$(\beta, f(\beta))\f$
     * @param transcript Transcript with elements from the prover and generated challenges
     *
     * @return TranscriptData containing \f$C_0, b_0, \vec{s}, u, G_0, a_0\f$
     *
     * @details Performs steps 2–7 and 9 of the IPA verification protocol (see reduce_verify_internal_native):
     *
     *2. Receive the generator challenge \f$u\f$, abort if it's zero, otherwise compute \f$U=u\cdot G\f$
     *3. Compute \f$C'=C+f(\beta)\cdot U\f$. (Recall that \f$f(\beta)\f$ is the claimed evaluation.)
     *4. Receive \f$L_j, R_j\f$ and compute challenges \f$u_j\f$ for \f$j \in {k-1,..,0}\f$, abort on \f$u_j=0\f$
     *5. Compute \f$C_0 = C' + \sum_{j=0}^{k-1}(u_j^{-1}L_j + u_jR_j)\f$
     *6. Compute \f$b_0=g(\beta)=\prod_{i=0}^{k-1}(1+u_{i}^{-1}x^{2^{i}})\f$
     *7. Compute vector \f$\vec{s}=(1,u_{0}^{-1},u_{1}^{-1},u_{0}^{-1}u_{1}^{-1},...,\prod_{i=0}^{k-1}u_{i}^{-1})\f$
     *
     * Additionally receives \f$G_0\f$ and \f$a_0\f$ from the prover transcript (step 9).
     * Does NOT compute \f$G_s=\langle \vec{s},\vec{G}\rangle\f$ (step 8, the MSM)
     * or perform the final verification check (steps 10–11).
     *
     * @pre add_claim_to_hash_buffer must have been called on the transcript (step 1).
     */
    template <typename Transcript, typename BZeroFromRounds>
    static TranscriptData read_inner_product_transcript_data(const Commitment& commitment,
                                                             const Fr& evaluation,
                                                             BZeroFromRounds&& b_zero_from_round_challenges,
                                                             const std::shared_ptr<Transcript>& transcript)
        requires(!Curve::is_stdlib_type)
    {
        // Step 2.
        // Receive generator challenge u and compute auxiliary generator.
        const Fr generator_challenge = transcript->template get_challenge<Fr>("IPA:generator_challenge");
        if (generator_challenge.is_zero()) {
            throw_or_abort("The generator challenge can't be zero");
        }
        const Commitment aux_generator = Commitment::one() * generator_challenge;

        // Step 3.
        // C' is the joint commitment C + vU to the committed vector and the claimed inner product value v.
        const GroupElement C_prime = commitment + (aux_generator * evaluation);

        const auto pippenger_size = 2 * log_poly_length;
        std::vector<Fr> round_challenges(log_poly_length);
        std::vector<Commitment> msm_elements(pippenger_size);
        std::vector<Fr> msm_scalars(pippenger_size);

        // Step 4.
        // Receive all L_j, R_j and compute round challenges u_j.
        for (size_t round_idx = 0; round_idx < log_poly_length; ++round_idx) {
            const std::string index = std::to_string(log_poly_length - round_idx - 1);
            const auto element_L = transcript->template receive_from_prover<Commitment>("IPA:L_" + index);
            const auto element_R = transcript->template receive_from_prover<Commitment>("IPA:R_" + index);
            round_challenges[round_idx] = transcript->template get_challenge<Fr>("IPA:round_challenge_" + index);
            if (round_challenges[round_idx].is_zero()) {
                throw_or_abort("Round challenges can't be zero");
            }
            msm_elements[2 * round_idx] = element_L;
            msm_elements[2 * round_idx + 1] = element_R;
        }

        std::vector<Fr> round_challenges_inv = round_challenges;
        Fr::batch_invert(round_challenges_inv);

        // Populate msm_scalars.
        for (size_t round_idx = 0; round_idx < log_poly_length; ++round_idx) {
            msm_scalars[2 * round_idx] = round_challenges_inv[round_idx];
            msm_scalars[2 * round_idx + 1] = round_challenges[round_idx];
        }

        // Step 5.
        // Compute C_zero = C' + ∑_{j ∈ [k]} u_j^{-1}L_j + ∑_{j ∈ [k]} u_jR_j
        GroupElement LR_sums = scalar_multiplication::pippenger<Curve>(
            { 0, { &msm_scalars[0], /*size*/ pippenger_size } }, { &msm_elements[0], /*size*/ pippenger_size });
        GroupElement C_zero = C_prime + LR_sums;

        // Step 6.
        // Compute b_zero succinctly.
        const Fr b_zero = b_zero_from_round_challenges(std::span<const Fr>(round_challenges_inv));
        // Step 7.
        // Construct vector s.
        bb::Polynomial<Fr> s_vec(construct_poly_from_u_challenges_inv(
            std::span<const Fr>(round_challenges_inv).subspan(0, log_poly_length)));

        // Receive G_0 and a_0 from prover (advances transcript; G_0 not recomputed here).
        Commitment G_zero_from_prover = transcript->template receive_from_prover<Commitment>("IPA:G_0");
        Fr a_zero = transcript->template receive_from_prover<Fr>("IPA:a_0");

        return { C_zero,
                 b_zero,
                 std::move(s_vec),
                 generator_challenge,
                 G_zero_from_prover,
                 a_zero,
                 std::move(round_challenges_inv) };
    }

    template <typename Transcript>
    static TranscriptData read_transcript_data(const OpeningClaim<Curve>& opening_claim,
                                               const std::shared_ptr<Transcript>& transcript)
        requires(!Curve::is_stdlib_type)
    {
        return read_inner_product_transcript_data(
            opening_claim.commitment,
            opening_claim.opening_pair.evaluation,
            [&](std::span<const Fr> round_challenges_inv) {
                return evaluate_challenge_poly(
                    std::vector<Fr>(round_challenges_inv.begin(), round_challenges_inv.end()),
                    opening_claim.opening_pair.challenge);
            },
            transcript);
    }

    /**
     * @brief Natively verify the correctness of a Proof
     *
     * @tparam Transcript Allows to specify a transcript class. Useful for testing
     * @param vk Verification_key containing srs
     * @param opening_claim Contains the commitment C and opening pair \f$(\beta, f(\beta))\f$
     * @param transcript Transcript with elements from the prover and generated challenges
     *
     * @return true/false depending on if the proof verifies
     *
     * @details The procedure runs as follows:
     *
     *1. Receive commitment, challenge, and claimed evaluation from the prover
     *2. Receive the generator challenge \f$u\f$, abort if it's zero, otherwise compute \f$U=u\cdot G\f$
     *3. Compute  \f$C'=C+f(\beta)\cdot U\f$. (Recall that \f$f(\beta)\f$ is the claimed evaluation.)
     *4. Receive \f$L_j, R_j\f$ and compute challenges \f$u_j\f$ for \f$j \in {k-1,..,0}\f$, abort immediately on
     receiving a \f$u_j=0\f$
     *5. Compute \f$C_0 = C' + \sum_{j=0}^{k-1}(u_j^{-1}L_j + u_jR_j)\f$
     *6. Compute \f$b_0=g(\beta)=\prod_{i=0}^{k-1}(1+u_{i}^{-1}x^{2^{i}})\f$
     *7. Compute vector \f$\vec{s}=(1,u_{0}^{-1},u_{1}^{-1},u_{0}^{-1}u_{1}^{-1},...,\prod_{i=0}^{k-1}u_{i}^{-1})\f$
     *8. Compute \f$G_s=\langle \vec{s},\vec{G}\rangle\f$
     *9. Receive \f$\vec{a}_{0}\f$ of length 1
     *10. Compute \f$C_{right}=a_{0}G_{s}+a_{0}b_{0}U\f$
     *11. Check that \f$C_{right} = C_0\f$. If they match, return true. Otherwise return false.
     */
    static bool reduce_verify_internal_native(const VK& vk, const OpeningClaim<Curve>& opening_claim, auto& transcript)
        requires(!Curve::is_stdlib_type)
    {
        BB_BENCH_NAME("IPA::reduce_verify");

        // Steps 2–7, 9: Process transcript and extract per-proof data (step 1 done by add_claim_to_hash_buffer)
        auto data = read_transcript_data(opening_claim, transcript);

        // Step 8.
        // Compute G_s = <s, G> via SRS MSM and verify against prover's G_0
        std::span<const Commitment> srs_elements = vk.get_monomial_points();
        if (poly_length > srs_elements.size()) {
            throw_or_abort("potential bug: Not enough SRS points for IPA!");
        }
        Commitment G_zero;
        {
            BB_BENCH_NAME("IPA::srs_msm");
            G_zero =
                scalar_multiplication::pippenger_unsafe<Curve>(data.s_vec, { &srs_elements[0], /*size*/ poly_length });
        }
        if (G_zero != data.G_zero_from_prover) {
            info("IPA verification failed: G_0 mismatch");
            return false;
        }

        // Step 10.
        // Compute C_right = a_0 * G_s + a_0 * b_0 * U
        Commitment aux_generator = Commitment::one() * data.gen_challenge;
        GroupElement right_hand_side = G_zero * data.a_zero + aux_generator * data.a_zero * data.b_zero;

        // Step 11.
        // Check if C_right == C_0
        return (data.C_zero.normalize() == right_hand_side.normalize());
    }

    /**
     * @brief Add the opening claim to the hash buffer.
     *
     * @details We add the commitment, challenge, and claimed evaluation to the hash buffer.
     * @tparam Transcript
     * @param opening_claim
     * @param transcript
     * @note This requires us to explicitly compute the commitment.
     * @note We enact this separation to allow for more ergonomic failure tests.
     */
    template <typename Transcript>
    static void add_claim_to_hash_buffer(const OpeningClaim<Curve>& opening_claim,
                                         const std::shared_ptr<Transcript>& transcript)
    {

        // Step 1.
        // Add the commitment, challenge, and evaluation to the hash buffer.

        transcript->add_to_hash_buffer("IPA:commitment", opening_claim.commitment);
        transcript->add_to_hash_buffer("IPA:challenge", opening_claim.opening_pair.challenge);
        transcript->add_to_hash_buffer("IPA:evaluation", opening_claim.opening_pair.evaluation);
    }
    /**
     * @brief  Recursively verify the correctness of an IPA proof, without computing G_0. This is therefore a "partial
     * verification", where the verifier takes the Prover's G_0 "at face value".
     *
     * @details Unlike native verification, there is no parallelisation (for the MSM computation) in this function as
     * our circuit construction does not currently support parallelisation. batch_mul is used instead of pippenger as
     * pippenger is not implemented to be used in stdlib context for now and under the hood we perform bigfield to
     * cycle_scalar conversions for the batch_mul. That is because cycle_scalar has very reduced functionality at the
     * moment and doesn't support basic arithmetic operations between two cycle_scalar operands (just for one
     * cycle_group and one cycle_scalar to enable batch_mul).
     * @param vk
     * @param opening_claim
     * @param transcript
     * @return VerifierAccumulator, i.e., the u_inv challenges, the claimed Pederson commitment to the
     * challenge polynomial derived from the u_inv challenges, and a boolean recording whether the last accumulation
     * step failed or passed.
     */
    template <typename BZeroFromRounds>
    static VerifierAccumulator reduce_verify_inner_product_recursive(const Commitment& commitment,
                                                                     const Fr& evaluation,
                                                                     BZeroFromRounds&& b_zero_from_round_challenges,
                                                                     auto& transcript)
        requires Curve::is_stdlib_type
    {
        // Step 2.
        // Receive generator challenge u and compute auxiliary generator.
        const Fr generator_challenge = transcript->template get_challenge<Fr>("IPA:generator_challenge");
        typename Curve::Builder* builder = generator_challenge.get_context();

        auto pippenger_size = 2 * log_poly_length + 2;
        std::vector<Fr> round_challenges(log_poly_length);
        std::vector<Fr> round_challenges_inv(log_poly_length);

        // Step 3.
        // Receive all L_i and R_i and prepare for MSM.
        // L_{k-1}, R_{k-1}, ..., L_0, R_0, -G_0, -Commitment::one().
        std::vector<Commitment> msm_elements(pippenger_size);
        // u_{k-1}^{-1}, u_{k-1}, ..., u_0^{-1}, u_0, a_0, (a_0 b_0 - v) * generator_challenge.
        std::vector<Fr> msm_scalars(pippenger_size);

        for (size_t round_idx = 0; round_idx < log_poly_length; ++round_idx) {
            const std::string index = std::to_string(log_poly_length - round_idx - 1);
            auto element_L = transcript->template receive_from_prover<Commitment>("IPA:L_" + index);
            auto element_R = transcript->template receive_from_prover<Commitment>("IPA:R_" + index);
            round_challenges[round_idx] = transcript->template get_challenge<Fr>("IPA:round_challenge_" + index);
            round_challenges_inv[round_idx] = round_challenges[round_idx].invert();

            msm_elements[2 * round_idx] = element_L;
            msm_elements[2 * round_idx + 1] = element_R;
            msm_scalars[2 * round_idx] = round_challenges_inv[round_idx];
            msm_scalars[2 * round_idx + 1] = round_challenges[round_idx];
        }

        // Step 4.
        // Compute b_zero succinctly.
        Fr b_zero = b_zero_from_round_challenges(std::span<const Fr>(round_challenges_inv));
        // Step 5.
        // Receive G_zero from the prover.
        Commitment G_zero = transcript->template receive_from_prover<Commitment>("IPA:G_0");
        // Step 6.
        // Receive a_zero from the prover.
        auto a_zero = transcript->template receive_from_prover<Fr>("IPA:a_0");

        // OriginTag false positive: G_zero and a_zero are fully determined once all round challenges are fixed; the
        // prover must send the correct values or the final relation check fails.
        if constexpr (Curve::is_stdlib_type) {
            const auto last_round_tag = round_challenges.back().get_origin_tag();
            G_zero.set_origin_tag(last_round_tag);
            a_zero.set_origin_tag(last_round_tag);
        }

        // Step 7.
        // R = ∑(u_j^{-1}L_j + u_jR_j) - a_0 G_0 - (a_0 b_0 - v)U. Correctness is R == -C.
        msm_elements[2 * log_poly_length] = -G_zero;
        msm_elements[(2 * log_poly_length) + 1] = -Commitment::one(builder);
        msm_scalars[2 * log_poly_length] = a_zero;
        msm_scalars[(2 * log_poly_length) + 1] = generator_challenge * a_zero.madd(b_zero, { -evaluation });
        GroupElement ipa_relation = GroupElement::batch_mul(msm_elements, msm_scalars);
        auto neg_commitment = -commitment;
        ipa_relation.assert_equal(neg_commitment);

        return { round_challenges_inv, G_zero, ipa_relation.get_value() == -commitment.get_value() };
    }

    static VerifierAccumulator reduce_verify_internal_recursive(const OpeningClaim<Curve>& opening_claim,
                                                                auto& transcript)
        requires Curve::is_stdlib_type
    {
        return reduce_verify_inner_product_recursive(
            opening_claim.commitment,
            opening_claim.opening_pair.evaluation,
            [&](std::span<const Fr> round_challenges_inv) {
                return evaluate_challenge_poly(
                    std::vector<Fr>(round_challenges_inv.begin(), round_challenges_inv.end()),
                    opening_claim.opening_pair.challenge);
            },
            transcript);
    }

    /**
     * @brief Compute an inner product argument proof for opening a single polynomial at a single evaluation point.
     *
     * @param ck The commitment key containing srs
     * @param opening_pair (challenge, evaluation)
     * @param polynomial The witness polynomial whose opening proof needs to be computed
     * @param transcript Prover transcript
     *
     * @remark Detailed documentation can be found in \link IPA::compute_opening_proof_internal
     * compute_opening_proof_internal \endlink.
     */
    template <typename Transcript = NativeTranscript>
    static void compute_opening_proof(const CK& ck,
                                      const ProverOpeningClaim<Curve>& opening_claim,
                                      const std::shared_ptr<Transcript>& transcript)
    {
        add_claim_to_hash_buffer(ck, opening_claim, transcript);
        compute_opening_proof_internal(ck, opening_claim, transcript);
    }

    /**
     * @brief Natively verify the correctness of an IPA Proof
     *
     * @param vk Verification_key containing srs
     * @param opening_claim Contains the commitment C and opening pair \f$(\beta, f(\beta))\f$
     * @param transcript Transcript with elements from the prover and generated challenges
     *
     * @return true/false depending on if the proof verifies
     *
     *@remark The verification procedure documentation is in \link IPA::verify_internal verify_internal \endlink
     */
    template <typename Transcript = NativeTranscript>
    static bool reduce_verify(const VK& vk,
                              const OpeningClaim<Curve>& opening_claim,
                              const std::shared_ptr<Transcript>& transcript)
        requires(!Curve::is_stdlib_type)
    {
        add_claim_to_hash_buffer(opening_claim, transcript);
        return reduce_verify_internal_native(vk, opening_claim, transcript);
    }

    /**
     * @brief Batch verify multiple IPA proofs with a single batched SRS MSM.
     *
     * @details For N proofs, IPA verification's dominant cost is the SRS MSM (pippenger over poly_length points).
     * By combining N proofs via random linear combinations, we replace per-proof MSMs with a single batched SRS MSM.
     *
     * Two families of equations are enforced over the SRS: the main IPA relation
     *   \f$\sum \alpha^i C_{0,i} = \langle \sum \alpha^i a_{0,i} \vec{s}_i, \vec{G} \rangle
     *     + (\sum \alpha^i a_{0,i} b_{0,i} u_i) \cdot G\f$
     * and the \f$G_0\f$ binding \f$\sum \beta^i G_{0,i} = \langle \sum \beta^i \vec{s}_i, \vec{G} \rangle\f$,
     * which carries the single-proof condition \f$G_0 = \langle \vec{s}, \vec{G} \rangle\f$ across the batch.
     * Both right-hand sides are SRS MSMs, so they are random-linear-combined with a fresh challenge
     * \f$\gamma\f$ into a single IPA commitment (one SRS MSM):
     *   \f$\langle \gamma \sum \beta^i \vec{s}_i - \sum \alpha^i a_{0,i} \vec{s}_i, \vec{G} \rangle + C_{batch}
     *     = \gamma \sum \beta^i G_{0,i} + (\sum \alpha^i a_{0,i} b_{0,i} u_i) \cdot G\f$
     *
     * where \f$G\f$ = Commitment::one() and \f$U_i = u_i \cdot G\f$.
     *
     * @param vk Verification key containing SRS
     * @param opening_claims The opening claims for each proof
     * @param transcripts The transcripts containing each proof's data
     * @return true if all proofs verify
     */
    template <typename Transcript = NativeTranscript>
    static bool batch_reduce_verify(const VK& vk,
                                    const std::vector<OpeningClaim<Curve>>& opening_claims,
                                    const std::vector<std::shared_ptr<Transcript>>& transcripts)
        requires(!Curve::is_stdlib_type)
    {
        const size_t num_claims = opening_claims.size();
        if (num_claims != transcripts.size()) {
            info("IPA batch verification failed: claims/transcripts size mismatch");
            return false;
        }
        if (num_claims == 0) {
            info("IPA batch verification failed: no claims provided");
            return false;
        }

        // Phase 1: Per-proof transcript processing (sequential, each proof is cheap)
        std::vector<GroupElement> C_zeros(num_claims);
        std::vector<Fr> a_zeros(num_claims);
        std::vector<Fr> b_zeros(num_claims);
        std::vector<Fr> gen_challenges(num_claims);
        std::vector<Commitment> G_zeros_from_prover(num_claims);
        std::vector<Polynomial<Fr>> s_vecs(num_claims);

        for (size_t i = 0; i < num_claims; i++) {
            add_claim_to_hash_buffer(opening_claims[i], transcripts[i]);
            auto data = read_transcript_data(opening_claims[i], transcripts[i]);
            C_zeros[i] = std::move(data.C_zero);
            b_zeros[i] = data.b_zero;
            s_vecs[i] = std::move(data.s_vec);
            gen_challenges[i] = data.gen_challenge;
            G_zeros_from_prover[i] = data.G_zero_from_prover;
            a_zeros[i] = data.a_zero;
        }

        // Phase 2: Batched computation using random challenges alpha, beta and gamma.
        // alpha batches the IPA relations across claims, beta batches the G_0 binding checks, and gamma folds
        // the G_0 binding into the main relation so the whole batch costs a single IPA commitment (one SRS MSM).
        Fr alpha = Fr::random_element();
        std::vector<Fr> alpha_pows(num_claims);
        alpha_pows[0] = Fr::one();
        for (size_t i = 1; i < num_claims; i++) {
            alpha_pows[i] = alpha_pows[i - 1] * alpha;
        }
        Fr beta = Fr::random_element();
        std::vector<Fr> beta_pows(num_claims);
        beta_pows[0] = Fr::one();
        for (size_t i = 1; i < num_claims; i++) {
            beta_pows[i] = beta_pows[i - 1] * beta;
        }
        Fr gamma = Fr::random_element();

        std::span<const Commitment> srs_elements = vk.get_monomial_points();
        if (poly_length > srs_elements.size()) {
            throw_or_abort("potential bug: Not enough SRS points for IPA!");
        }

        // The batch verifier enforces two families of equations over the SRS:
        //   (1) main IPA relation:  C_batch        == <\sum_i alpha^i a_i s_i, SRS> + bU_scalar * G
        //   (2) G_0 binding:        \sum_i beta^i G_0_i == <\sum_i beta^i s_i, SRS>
        // The single-proof verifier checks G_0 == <s_vec, SRS>; (2) enforces the same condition across the
        // batch. Both right-hand sides are SRS MSMs, so we random-linear-combine them with gamma to collapse
        // both into one IPA commitment:
        //   <gamma * (\sum_i beta^i s_i) - (\sum_i alpha^i a_i s_i), SRS> + C_batch
        //       == gamma * (\sum_i beta^i G_0_i) + bU_scalar * G
        // A prover that violates either family passes the folded check only for a gamma-measure-zero set.
        Polynomial<Fr> combined_msm_scalars(poly_length);
        for (size_t i = 0; i < num_claims; i++) {
            combined_msm_scalars.add_scaled(s_vecs[i], gamma * beta_pows[i] - alpha_pows[i] * a_zeros[i]);
        }
        Commitment batched_commitment = scalar_multiplication::pippenger_unsafe<Curve>(
            combined_msm_scalars, { &srs_elements[0], /*size*/ poly_length });

        // beta-weighted sum of the prover-supplied G_0 values (gamma is applied in the final check).
        GroupElement prover_g_zero_batch = G_zeros_from_prover[0] * beta_pows[0];
        for (size_t i = 1; i < num_claims; i++) {
            prover_g_zero_batch += G_zeros_from_prover[i] * beta_pows[i];
        }

        // Batched claim commitment: C_batch = \sum \alpha^i * C_zero_i
        GroupElement C_batch = C_zeros[0];
        for (size_t i = 1; i < num_claims; i++) {
            C_batch = C_batch + C_zeros[i] * alpha_pows[i];
        }

        // Combined scalar for U terms: bU_scalar = \sum \alpha^i * a_zero_i * b_zero_i * gen_challenge_i
        Fr bU_scalar = Fr::zero();
        for (size_t i = 0; i < num_claims; i++) {
            bU_scalar += alpha_pows[i] * a_zeros[i] * b_zeros[i] * gen_challenges[i];
        }

        // Single folded check: the IPA relation and the G_0 binding both hold iff this holds (up to the
        // negligible gamma-collision probability).
        GroupElement left_hand_side = batched_commitment + C_batch;
        GroupElement right_hand_side = prover_g_zero_batch * gamma + Commitment::one() * bU_scalar;
        return (left_hand_side.normalize() == right_hand_side.normalize());
    }

    /**
     * @brief Recursively _partially_ verify the correctness of an IPA proof.
     *
     * @param vk Verification_key containing srs
     * @param opening_claim Contains the commitment C and opening pair \f$(\beta, f(\beta))\f$
     * @param transcript Transcript with elements from the prover and generated challenges
     *
     * @return VerifierAccumulator
     *
     *@remark The verification procedure documentation is in \link IPA::verify_internal verify_internal \endlink
     */
    static VerifierAccumulator reduce_verify(const OpeningClaim<Curve>& opening_claim, const auto& transcript)
        requires(Curve::is_stdlib_type)
    {
        // The output of `reduce_verify_internal_recursive` consists of a `VerifierAccumulator` and a boolean, recording
        // the truth value of the last verifier-compatibility check. This simply forgets the boolean and returns the
        // `VerifierAccumulator`.
        add_claim_to_hash_buffer(opening_claim, transcript);
        return reduce_verify_internal_recursive(opening_claim, transcript);
    }

    /**
     * @brief  Fully recursively verify the correctness of an IPA proof, _including_ computing G_0.
     *
     * @details  Unlike native verification, there is no parallelisation in this function as our circuit construction
     * does not currently support parallelisation. batch_mul is used instead of pippenger as pippenger is not
     * implemented to be used in stdlib context for now and under the hood we perform bigfield to cycle_scalar
     * conversions for the batch_mul. That is because cycle_scalar has very reduced functionality at the moment and
     * doesn't support basic arithmetic operations between two cycle_scalar operands (just for one cycle_group and one
     * cycle_scalar to enable batch_mul).
     * @param vk
     * @param opening_claim
     * @param transcript
     * @return VerifierAccumulator
     *
     * @note This methods calls `reduce_verify_internal_recursive` and additionally, computes G_zero, and adds the
     * _constraint_ that this matches with what the Prover sends.
     */
    static bool full_verify_recursive(const VK& vk, const OpeningClaim<Curve>& opening_claim, auto& transcript)
        requires Curve::is_stdlib_type
    {
        // Check SRS size up front before any circuit construction
        if (vk.get_monomial_points().size() < poly_length) {
            throw_or_abort("IPA recursive verification: not enough SRS points (need " + std::to_string(poly_length) +
                           ", have " + std::to_string(vk.get_monomial_points().size()) + ")");
        }

        add_claim_to_hash_buffer(opening_claim, transcript);
        VerifierAccumulator verifier_accumulator = reduce_verify_internal_recursive(opening_claim, transcript);
        auto round_challenges_inv = verifier_accumulator.u_challenges_inv;
        auto claimed_G_zero = verifier_accumulator.comm;

        // Construct vector s, whose rth entry is ∏ (u_i)^{-1 * r_i}, where (r_i) is the binary expansion of r. This
        // is required to _compute_ G_zero (rather than just passively receive G_zero from the Prover).
        //
        // We implement a linear-time algorithm to optimally compute this vector
        // Note: currently requires an extra vector of size
        // `poly_length / 2` to cache temporaries
        //       this might able to be optimized if we care enough, but the size of this poly shouldn't be large
        //       relative to the builder polynomial sizes
        std::vector<Fr> s_vec_temporaries(poly_length / 2);
        std::vector<Fr> s_vec(poly_length);

        Fr* previous_round_s = &s_vec_temporaries[0];
        Fr* current_round_s = &s_vec[0];
        // if number of rounds is even we need to swap these so that s_vec always contains the result
        if constexpr ((log_poly_length & 1) == 0) {
            std::swap(previous_round_s, current_round_s);
        }
        previous_round_s[0] = Fr(1);
        for (size_t i = 0; i < log_poly_length; ++i) {
            const size_t round_size = 1 << (i + 1);
            const Fr round_challenge = round_challenges_inv[i];
            for (size_t j = 0; j < round_size / 2; ++j) {
                current_round_s[j * 2] = previous_round_s[j];
                current_round_s[j * 2 + 1] = previous_round_s[j] * round_challenge;
            }
            std::swap(current_round_s, previous_round_s);
        }

        // Compute G_zero
        // In the native verifier, this uses pippenger. Here we use fixed_batch_mul since all SRS points are
        // circuit constants, which uses plookup tables instead of ROM tables and is significantly cheaper.
        // We use 8-bit tables (table_bits=8, 32 rounds) to minimise gate count. However, with N=32768 SRS points
        // and 8-bit tables, the total table rows = 32768 × 256 = 2^23 exactly. The 5 mandatory overhead rows
        // (NUM_DISABLED_ROWS_IN_SUMCHECK=4, NUM_ZERO_ROWS=1) push the total to 2^23+5, forcing dyadic_size = 2^24.
        // To stay within 2^23 we handle the first SRS point separately using operator*.
        std::vector<Commitment> srs_elements = vk.get_monomial_points();
        srs_elements.resize(poly_length);
        std::vector<Commitment> remaining_srs(srs_elements.begin() + 1, srs_elements.end());
        std::vector<Fr> remaining_s(s_vec.begin() + 1, s_vec.end());
        Commitment first_term = srs_elements[0] * s_vec[0];
        Commitment remaining_term = Commitment::fixed_batch_mul(remaining_srs, remaining_s, {}, /*table_bits=*/8);
        Commitment computed_G_zero = first_term + remaining_term;
        // check the computed G_zero and the claimed G_zero are the same.
        // The circuit constraint enforces correctness; mismatched witnesses will produce an unsatisfiable circuit.
        claimed_G_zero.assert_equal(computed_G_zero, "G_zero doesn't match received G_zero.");

        bool running_truth_value = verifier_accumulator.running_truth_value;
        return running_truth_value;
    }

    /**
     * @brief Evaluates the polynomial created from the challenge scalars u_challenges_inv at a challenge r.
     * @details This polynomial is defined as challenge_poly(X) = ∏_{i ∈ [k]} (1 + u_{len-i}^{-1}.X^{2^{i-1}}),
     * so the evaluation is just ∏_{i ∈ [k]} (1 + u_{len-i}^{-1}.r^{2^{i-1}}).
     * @param u_challenges_inv
     * @param r
     * @return Fr
     */
    static Fr evaluate_challenge_poly(const std::vector<Fr>& u_challenges_inv, Fr r)
    {
        // Runs the obvious algorithm to compute the product ∏_{i ∈ [k]} (1 + u_{len-i}^{-1}.r^{2^{i-1}}) by
        // remembering the current 2-primary power of r.
        Fr challenge_poly_eval = 1;
        Fr r_pow = r;
        // the loop runs to `log_poly_length - 1` because we don't want to superfluously compute r_pow.sqr() in the last
        // round.
        for (size_t i = 0; i < log_poly_length - 1; i++) {
            Fr monomial = u_challenges_inv[log_poly_length - 1 - i] * r_pow;
            challenge_poly_eval *= (Fr(1) + monomial);
            r_pow = r_pow.sqr();
        }
        // same as the body of the loop, without `r_pow = r_pow.sqr()`
        Fr monomial = u_challenges_inv[0] * r_pow;
        challenge_poly_eval *= (Fr(1) + monomial);
        return challenge_poly_eval;
    }

    /**
     * @brief Combines the challenge_poly evaluations using the challenge alpha.
     *
     * @details This will be used to batch IPA claims.
     *
     * @param u_challenges_inv_1
     * @param u_challenges_inv_2
     * @param r
     * @param alpha
     * @return Fr
     */
    static Fr evaluate_and_accumulate_challenge_polys(std::vector<Fr> u_challenges_inv_1,
                                                      std::vector<Fr> u_challenges_inv_2,
                                                      Fr r,
                                                      Fr alpha)
    {
        auto result =
            evaluate_challenge_poly(u_challenges_inv_1, r) + alpha * evaluate_challenge_poly(u_challenges_inv_2, r);
        return result;
    }

    /**
     * @brief Constructs challenge_poly(X) = ∏_{i ∈ [k]} (1 + u_{len-i}^{-1}.X^{2^{i-1}}), with coefficients in
     * \f$\mathbb{F}_q\f$. The coefficients of this are alternatively known as `s_vec`.
     *
     * @param u_challenges_inv
     * @return Polynomial<bb::fq>
     */
    static Polynomial<bb::fq> construct_poly_from_u_challenges_inv(const std::span<const bb::fq>& u_challenges_inv)
    {
        // Each round consumes exactly one inverse challenge; a short span would read out of bounds below.
        BB_ASSERT_EQ(u_challenges_inv.size(), log_poly_length);

        // Construct vector s in linear time.
        std::vector<bb::fq> s_vec(poly_length, bb::fq::one());
        std::vector<bb::fq> s_vec_temporaries(poly_length / 2);

        bb::fq* previous_round_s = &s_vec_temporaries[0];
        bb::fq* current_round_s = &s_vec[0];
        // if number of rounds is even we need to swap these so that s_vec always contains the result
        if ((log_poly_length & 1) == 0) {
            std::swap(previous_round_s, current_round_s);
        }
        previous_round_s[0] = bb::fq(1);
        for (size_t i = 0; i < log_poly_length; ++i) {
            const size_t round_size = 1 << (i + 1);
            const bb::fq round_challenge = u_challenges_inv[i];
            parallel_for_heuristic(
                round_size / 2,
                [&](size_t j) {
                    current_round_s[j * 2] = previous_round_s[j];
                    current_round_s[j * 2 + 1] = previous_round_s[j] * round_challenge;
                },
                thread_heuristics::FF_MULTIPLICATION_COST * 2);
            std::swap(current_round_s, previous_round_s);
        }
        return { s_vec, poly_length };
    }

    /**
     * @brief Combines two challenge_polys using the challenge alpha.
     *
     * @details via the formula `challenge_poly_1 + alpha * challenge_poly_2`.
     *
     * @param u_challenges_inv_1
     * @param u_challenges_inv_2
     * @param alpha
     * @return Polynomial<bb::fq>
     */
    static Polynomial<bb::fq> create_challenge_poly(const std::vector<bb::fq>& u_challenges_inv_1,
                                                    const std::vector<bb::fq>& u_challenges_inv_2,
                                                    bb::fq alpha)
    {
        // Always extend each to 1<<log_poly_length length
        Polynomial<bb::fq> challenge_poly(1 << log_poly_length);
        Polynomial challenge_poly_1 = construct_poly_from_u_challenges_inv(u_challenges_inv_1);
        Polynomial challenge_poly_2 = construct_poly_from_u_challenges_inv(u_challenges_inv_2);
        challenge_poly += challenge_poly_1;
        challenge_poly.add_scaled(challenge_poly_2, alpha);
        return challenge_poly;
    }

    /**
     * @brief Takes two IPA claims and accumulates them into a single IPA claim. Also computes IPA proof for the claim.
     *
     * @details We create an IPA accumulator by running the partial IPA recursive verifier on each claim. Then, we
     * generate challenges, and use these challenges to compute the new accumulator. We also create the accumulated
     * polynomial, and generate the IPA proof for the accumulated claim.
     *
     * @param ck
     * @param transcript_1
     * @param claim_1
     * @param transcript_2
     * @param claim_2
     * @return std::pair<OpeningClaim<Curve>, HonkProof>
     */
    static std::pair<OpeningClaim<Curve>, HonkProof> accumulate(const CommitmentKey<curve::Grumpkin>& ck,
                                                                auto& transcript_1,
                                                                OpeningClaim<Curve> claim_1,
                                                                auto& transcript_2,
                                                                OpeningClaim<Curve> claim_2)
        requires Curve::is_stdlib_type
    {
        // Step 1: Run the partial verifier for each IPA instance. The two reductions are sequenced explicitly (not
        // via argument evaluation order) so the circuit gate ordering is deterministic.
        VerifierAccumulator verifier_accumulator_1 = reduce_verify(claim_1, transcript_1);
        VerifierAccumulator verifier_accumulator_2 = reduce_verify(claim_2, transcript_2);
        return accumulate(ck, std::move(verifier_accumulator_1), std::move(verifier_accumulator_2));
    }

    /**
     * @brief Prove a native IPA opening of `challenge_poly` at the (challenge, evaluation) carried by `output_claim`,
     * returning `output_claim` paired with the generated proof. Shared tail of `accumulate` and
     * `prove_accumulator_claim`.
     */
    static std::pair<OpeningClaim<Curve>, HonkProof> prove_challenge_poly_opening(
        const CommitmentKey<curve::Grumpkin>& ck,
        OpeningClaim<Curve> output_claim,
        const Polynomial<bb::fq>& challenge_poly)
        requires Curve::is_stdlib_type
    {
        using NativeCurve = curve::Grumpkin;
        auto prover_transcript = std::make_shared<NativeTranscript>();
        const OpeningPair<NativeCurve> opening_pair{ bb::fq(output_claim.opening_pair.challenge.get_value()),
                                                     bb::fq(output_claim.opening_pair.evaluation.get_value()) };
        BB_ASSERT_EQ(challenge_poly.evaluate(opening_pair.challenge),
                     opening_pair.evaluation,
                     "Opening claim does not hold for challenge polynomial.");
        IPA<NativeCurve, log_poly_length>::compute_opening_proof(
            ck, { challenge_poly, opening_pair }, prover_transcript);

        output_claim.opening_pair.evaluation.self_reduce();
        return { output_claim, prover_transcript->export_proof() };
    }

    /**
     * @brief Fold two already-reduced IPA accumulators into a single accumulated claim, and prove that claim.
     *
     * @details Same algebra as the (claim, proof)-based `accumulate`, but the inputs are accumulators that some other
     * entity already produced via `reduce_verify` (e.g. the in-circuit ECCVM TripleIPA verifier). The folding
     * challenges `alpha`, `r` are squeezed only after absorbing both accumulators' `u_challenges_inv` and claimed
     * commitments `U` (the rehash that binds the prover-supplied commitments). Returns the accumulated challenge-poly
     * opening claim together with a freshly generated IPA proof for it.
     */
    static std::pair<OpeningClaim<Curve>, HonkProof> accumulate(const CommitmentKey<curve::Grumpkin>& ck,
                                                                VerifierAccumulator verifier_accumulator_1,
                                                                VerifierAccumulator verifier_accumulator_2)
        requires Curve::is_stdlib_type
    {
        static_assert(IsAnyOf<typename Curve::Builder, UltraCircuitBuilder>);

        // Step 2: Generate the challenges by hashing the pairs.
        // Rehash: bind both accumulators before squeezing the folding challenges.
        UltraStdlibTranscript transcript;
        transcript.add_to_hash_buffer("u_challenges_inv_1", verifier_accumulator_1.u_challenges_inv);
        transcript.add_to_hash_buffer("U_1", verifier_accumulator_1.comm);
        transcript.add_to_hash_buffer("u_challenges_inv_2", verifier_accumulator_2.u_challenges_inv);
        transcript.add_to_hash_buffer("U_2", verifier_accumulator_2.comm);
        auto [alpha, r] = transcript.template get_challenges<Fr>(std::array<std::string, 2>{ "IPA:alpha", "IPA:r" });

        // Step 3: Compute the new accumulator.
        OpeningClaim<Curve> output_claim;
        output_claim.commitment = verifier_accumulator_1.comm + verifier_accumulator_2.comm * alpha;
        output_claim.opening_pair.challenge = r;
        output_claim.opening_pair.evaluation = evaluate_and_accumulate_challenge_polys(
            verifier_accumulator_1.u_challenges_inv, verifier_accumulator_2.u_challenges_inv, r, alpha);

        // Step 4: Compute the new challenge polynomial natively.
        std::vector<bb::fq> native_u_challenges_inv_1;
        std::vector<bb::fq> native_u_challenges_inv_2;
        for (Fr u_inv_i : verifier_accumulator_1.u_challenges_inv) {
            native_u_challenges_inv_1.push_back(bb::fq(u_inv_i.get_value()));
        }
        for (Fr u_inv_i : verifier_accumulator_2.u_challenges_inv) {
            native_u_challenges_inv_2.push_back(bb::fq(u_inv_i.get_value()));
        }
        Polynomial<bb::fq> challenge_poly =
            create_challenge_poly(native_u_challenges_inv_1, native_u_challenges_inv_2, bb::fq(alpha.get_value()));

        return prove_challenge_poly_opening(ck, std::move(output_claim), challenge_poly);
    }

    /**
     * @brief Turn a single IPA accumulator into a provable opening claim (no fold).
     *
     * @details Used when exactly one accumulator remains to be discharged: open the accumulator's challenge polynomial
     * `h` (whose commitment is the claimed `G_0 = <h, SRS>`) at a Fiat-Shamir point `r` derived from the accumulator,
     * producing a standard IPA (claim, proof) for the next layer / on-chain verification.
     */
    static std::pair<OpeningClaim<Curve>, HonkProof> prove_accumulator_claim(const CommitmentKey<curve::Grumpkin>& ck,
                                                                             VerifierAccumulator verifier_accumulator)
        requires Curve::is_stdlib_type
    {
        static_assert(IsAnyOf<typename Curve::Builder, UltraCircuitBuilder>);

        UltraStdlibTranscript transcript;
        transcript.add_to_hash_buffer("u_challenges_inv", verifier_accumulator.u_challenges_inv);
        transcript.add_to_hash_buffer("U", verifier_accumulator.comm);
        auto r = transcript.template get_challenge<Fr>("IPA:r");

        OpeningClaim<Curve> output_claim;
        output_claim.commitment = verifier_accumulator.comm;
        output_claim.opening_pair.challenge = r;
        output_claim.opening_pair.evaluation = evaluate_challenge_poly(verifier_accumulator.u_challenges_inv, r);

        std::vector<bb::fq> native_u_challenges_inv;
        for (Fr u_inv_i : verifier_accumulator.u_challenges_inv) {
            native_u_challenges_inv.push_back(bb::fq(u_inv_i.get_value()));
        }
        Polynomial<bb::fq> challenge_poly =
            construct_poly_from_u_challenges_inv(std::span<const bb::fq>(native_u_challenges_inv));

        return prove_challenge_poly_opening(ck, std::move(output_claim), challenge_poly);
    }

    /**
     * @brief Discharge a single native accumulator: certifies `G_0 == <challenge_poly(u), SRS>` (one SRS-MSM).
     */
    static bool verify_accumulator(const VK& vk, const NativeAccumulator& accumulator)
        requires(!Curve::is_stdlib_type)
    {
        // Single-accumulator discharge is the B=1 case of the batched check (rho^0 = 1 makes the rehash and
        // rho-scaling a no-op on the result), so route through the batched implementation to avoid a second copy
        // of the deferred-G_0 SRS-MSM.
        return batch_verify_accumulators(vk, std::span<const NativeAccumulator>(&accumulator, 1));
    }

    /**
     * @brief Discharge a batch of native accumulators with a single combined SRS-MSM.
     * @details Draws a batching challenge `rho` after absorbing every accumulator's challenges and claimed `G_0`
     * (the Halo2-style rehash that binds the prover-supplied commitments), then checks
     * `<sum rho^i challenge_poly_i, SRS> == sum rho^i G_0_i` in one MSM.
     */
    static bool batch_verify_accumulators(const VK& vk, std::span<const NativeAccumulator> accumulators)
        requires(!Curve::is_stdlib_type)
    {
        BB_BENCH_NAME("IPA::batch_verify_accumulators");
        if (accumulators.empty()) {
            return true;
        }
        std::span<const Commitment> srs_elements = vk.get_monomial_points();
        if (poly_length > srs_elements.size()) {
            throw_or_abort("potential bug: Not enough SRS points for IPA::batch_verify_accumulators!");
        }

        // Rehash: bind every (u_challenges_inv, claimed G_0) before squeezing the batching challenge.
        NativeTranscript transcript;
        for (size_t idx = 0; idx < accumulators.size(); ++idx) {
            transcript.add_to_hash_buffer("IPA:batch_u_" + std::to_string(idx), accumulators[idx].u_challenges_inv);
            transcript.add_to_hash_buffer("IPA:batch_U_" + std::to_string(idx), accumulators[idx].claimed_commitment);
        }
        const Fr rho = transcript.template get_challenge<Fr>("IPA:batch_rho");

        Polynomial<Fr> combined_challenge_poly(poly_length);
        GroupElement combined_commitment = GroupElement::infinity();
        Fr rho_power = Fr::one();
        bool all_relations_succeeded = true;
        for (const auto& accumulator : accumulators) {
            Polynomial<Fr> challenge_poly(
                construct_poly_from_u_challenges_inv(std::span<const Fr>(accumulator.u_challenges_inv)));
            combined_challenge_poly.add_scaled(challenge_poly, rho_power);
            combined_commitment += GroupElement(accumulator.claimed_commitment) * rho_power;
            all_relations_succeeded = all_relations_succeeded && accumulator.relation_succeeded;
            rho_power *= rho;
        }

        GroupElement combined_G_zero;
        {
            BB_BENCH_NAME("IPA::srs_msm");
            combined_G_zero = scalar_multiplication::pippenger_unsafe<Curve>(combined_challenge_poly,
                                                                             { &srs_elements[0], poly_length });
        }
        if (combined_G_zero.normalize() != combined_commitment.normalize()) {
            info("IPA batch verification failed: combined G_0 mismatch");
            return false;
        }
        return all_relations_succeeded;
    }

    static std::pair<OpeningClaim<Curve>, HonkProof> create_random_valid_ipa_claim_and_proof(
        UltraCircuitBuilder& builder)
        requires Curve::is_stdlib_type
    {
        using NativeCurve = curve::Grumpkin;
        using Builder = typename Curve::Builder;
        using Curve = stdlib::grumpkin<Builder>;
        auto ipa_transcript = std::make_shared<NativeTranscript>();
        CommitmentKey<NativeCurve> ipa_commitment_key(poly_length);
        size_t n = poly_length;
        auto poly = Polynomial<bb::fq>(n);
        for (size_t i = 0; i < n; i++) {
            poly.at(i) = bb::fq::random_element();
        }
        bb::fq x = bb::fq::random_element();
        bb::fq eval = poly.evaluate(x);
        auto commitment = ipa_commitment_key.commit(poly);
        const OpeningPair<NativeCurve> opening_pair = { x, eval };
        IPA<NativeCurve>::compute_opening_proof(ipa_commitment_key, { poly, opening_pair }, ipa_transcript);

        auto stdlib_comm = Curve::Group::from_witness(&builder, commitment);
        auto stdlib_x = Curve::ScalarField::from_witness(&builder, x);
        auto stdlib_eval = Curve::ScalarField::from_witness(&builder, eval);
        OpeningClaim<Curve> stdlib_opening_claim{ { stdlib_x, stdlib_eval }, stdlib_comm };

        return { stdlib_opening_claim, ipa_transcript->export_proof() };
    }
};

} // namespace bb
