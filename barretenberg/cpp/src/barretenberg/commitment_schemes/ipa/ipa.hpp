// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/commitment_schemes/utils/batch_mul_native.hpp"
#include "barretenberg/commitment_schemes/verification_key.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/container.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/ecc/scalar_multiplication/scalar_multiplication.hpp"
#include "barretenberg/stdlib/hash/poseidon2/poseidon2.hpp"
#include "barretenberg/stdlib/honk_verifier/ipa_accumulator.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"
#include "barretenberg/stdlib/transcript/transcript.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include <cstddef>
#include <numeric>
#include <string>
#include <utility>
#include <vector>

namespace bb {
// clang-format off
// Note that an update of this constant requires updating the inputs to noir protocol circuit (rollup-base-private, rollup-base-public,
// rollup-block-merge, rollup-block-root, rollup-merge, rollup-root), as well as updating IPA_PROOF_LENGTH in other places.
static constexpr size_t IPA_PROOF_LENGTH =  /* comms IPA_L and IPA_R */ 4 * CONST_ECCVM_LOG_N  +
                                            /* comm G_0 */    2 +
                                            /* eval a_0 */    2;

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
   using VerifierAccumulator = stdlib::recursion::honk::IpaAccumulator<Curve>;

   // Compute the length of the vector of coefficients of a polynomial being opened.
   static constexpr size_t poly_length = 1UL<<log_poly_length;

// These allow access to internal functions so that we can never use a mock transcript unless it's fuzzing or testing of IPA specifically
#ifdef IPA_TEST
   FRIEND_TEST(IPATest, ChallengesAreZero);
   FRIEND_TEST(IPATest, AIsZeroAfterOneRound);
#endif
#ifdef IPA_FUZZ_TEST
   friend class ProxyCaller;
#endif
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
    *1. Send the degree of \f$f(x)\f$ plus one, equal to \f$d\f$ to the verifier
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
        using Fr           = typename Curve::ScalarField;
        using Commitment   = typename Curve::AffineElement;
        using GroupElement = typename Curve::Element;

        // --- Step 0: absorb commitment, challenge (x), evaluation (y)
        const bb::Polynomial<Fr>& polynomial = opening_claim.polynomial;
        const auto commitment = ck.commit(polynomial);
        transcript->add_to_hash_buffer("IPA:commitment", commitment);
        transcript->add_to_hash_buffer("IPA:challenge", opening_claim.opening_pair.challenge);
        transcript->add_to_hash_buffer("IPA:evaluation", opening_claim.opening_pair.evaluation);

        // --- Step 1: auxiliary generator
        const Fr generator_challenge = transcript->template get_challenge<Fr>("IPA:generator_challenge");
        if (generator_challenge.is_zero()) {
            throw_or_abort("The generator challenge can't be zero");
        }
        const GroupElement U = Commitment::one() * generator_challenge;

        // --- Step 2: sizes / sanity
        auto a_vec = polynomial.full(); // monomial coeffs
        const size_t poly_length = a_vec.size();
        ASSERT((poly_length > 0) && ((poly_length & (poly_length - 1)) == 0) &&
            "The polynomial degree plus 1 should be positive and a power of two");
        ASSERT((size_t(1) << log_poly_length) == poly_length);

        // --- Step 3: immutable SRS view
        std::span<const Commitment> SRS = ck.srs->get_monomial_points();
        if (poly_length > SRS.size()) {
            throw_or_abort("potential bug: Not enough SRS points for IPA!");
        }

        // --- Step 4: b_vec[i] = x^i
        OpeningPair<Curve> opening_pair = opening_claim.opening_pair;
        std::vector<Fr> b_vec(poly_length);
        {
            // simple sequential fill (can be parallelized if desired)
            Fr p = Fr::one();
            for (size_t i = 0; i < poly_length; ++i) {
                b_vec[i] = p;
                p *= opening_pair.challenge;
            }
        }

        // === New representation of folded bases (no point mul/add) ===
        // Keep the current left/right halves of the *folded* basis as lists of spans into SRS with per-span scale.
        std::vector<std::span<const Commitment>> basis_left_pts;
        std::vector<std::span<const Commitment>> basis_right_pts;
        std::vector<Fr>                          basis_left_scales;
        std::vector<Fr>                          basis_right_scales;

        size_t seg_len = poly_length / 2; // current segment length inside a half
        basis_left_pts.emplace_back(SRS.first(seg_len));
        basis_right_pts.emplace_back(SRS.subspan(seg_len, seg_len));
        basis_left_scales.emplace_back(Fr::one());
        basis_right_scales.emplace_back(Fr::one());

        // Helper: expand a scalar block by repeating it once per segment.
        auto expand_scalars = [&](const Fr* scalars_base, size_t base_len, size_t num_segments) -> std::vector<Fr> {
            std::vector<Fr> out;
            out.resize(base_len * num_segments);
            for (size_t k = 0; k < num_segments; ++k) {
                std::memcpy(out.data() + k * base_len, scalars_base, base_len * sizeof(Fr));
            }
            return out;
        };

        // Helper: MSM over concatenated spans, multiplying per-span scale into scalars.
        auto msm_concat = [&](const std::vector<std::span<const Commitment>>& pt_spans,
                            const std::vector<Fr>&                          span_scales,
                            std::span<const Fr>                             expanded_scalars) -> GroupElement {
            const size_t len_total = expanded_scalars.size();
            std::vector<Commitment> pts; pts.reserve(len_total);
            std::vector<Fr>         scs; scs.reserve(len_total);

            size_t consumed = 0;
            for (size_t k = 0; k < pt_spans.size(); ++k) {
                auto sp = pt_spans[k];
                const size_t m = sp.size();
                const Fr s = span_scales[k];
                pts.insert(pts.end(), sp.begin(), sp.end());
                for (size_t j = 0; j < m; ++j) {
                    scs.emplace_back(s * expanded_scalars[consumed + j]);
                }
                consumed += m;
            }
            ASSERT(consumed == len_total);
            info(pts.size());
            return bb::scalar_multiplication::pippenger_unsafe<Curve>(
                {/*start=*/0, std::span<const Fr>(scs)},
                std::span<const Commitment>(pts));
        };

        // Helper: update basis segment descriptors for next round using u^{-1}.
        auto fold_basis_segments = [&](const Fr& u_inv) {
            std::vector<std::span<const Commitment>> next_left, next_right;
            std::vector<Fr>                          next_left_sc, next_right_sc;
            const size_t half = seg_len / 2;

            // G'_L = G_LL + u^{-1} G_RL
            for (size_t k = 0; k < basis_left_pts.size(); ++k) {
                next_left.emplace_back(basis_left_pts[k].first(half));
                next_left_sc.emplace_back(basis_left_scales[k]);
            }
            for (size_t k = 0; k < basis_right_pts.size(); ++k) {
                next_left.emplace_back(basis_right_pts[k].first(half));
                next_left_sc.emplace_back(u_inv * basis_right_scales[k]);
            }

            // G'_R = G_LR + u^{-1} G_RR
            for (size_t k = 0; k < basis_left_pts.size(); ++k) {
                next_right.emplace_back(basis_left_pts[k].subspan(half, half));
                next_right_sc.emplace_back(basis_left_scales[k]);
            }
            for (size_t k = 0; k < basis_right_pts.size(); ++k) {
                next_right.emplace_back(basis_right_pts[k].subspan(half, half));
                next_right_sc.emplace_back(u_inv * basis_right_scales[k]);
            }

            basis_left_pts     = std::move(next_left);
            basis_right_pts    = std::move(next_right);
            basis_left_scales  = std::move(next_left_sc);
            basis_right_scales = std::move(next_right_sc);
            seg_len = half;
        };

        // --- Round loop
        GroupElement L_i, R_i;
        size_t round_size = poly_length;

        for (size_t i = 0; i < log_poly_length-1; ++i) {
            round_size /= 2;

            // (a) inner products c_L = <a_L, b_R>, c_R = <a_R, b_L>
            Fr inner_prod_L = Fr::zero();
            Fr inner_prod_R = Fr::zero();
            for (size_t j = 0; j < round_size; ++j) {
                inner_prod_L += a_vec.at(j) * b_vec[round_size + j];
                inner_prod_R += a_vec.at(round_size + j) * b_vec[j];
            }

            // (b) commitments L_i, R_i via concatenated MSMs (no SRS mutation)
            // For each MSM, repeat the scalar block once per segment so total matches concatenated points (constant N/2).
            const size_t segs_R = basis_right_pts.size();
            const size_t segs_L = basis_left_pts.size();
            auto aL_expanded = expand_scalars(&a_vec[0],            round_size, segs_R);
            auto aR_expanded = expand_scalars(&a_vec[round_size],   round_size, segs_L);

            GroupElement L_base = msm_concat(basis_right_pts, basis_right_scales,
                                            std::span<const Fr>(aL_expanded));
            GroupElement R_base = msm_concat(basis_left_pts,  basis_left_scales,
                                            std::span<const Fr>(aR_expanded));

            L_i = L_base + (U * inner_prod_L);
            R_i = R_base + (U * inner_prod_R);

            // (c) transcript send
            const std::string index = std::to_string(log_poly_length - i - 1);
            transcript->send_to_verifier("IPA:L_" + index, Commitment(L_i));
            transcript->send_to_verifier("IPA:R_" + index, Commitment(R_i));

            // (d) challenge u
            const Fr round_challenge = transcript->template get_challenge<Fr>("IPA:round_challenge_" + index);
            if (round_challenge.is_zero()) {
                throw_or_abort("IPA round challenge is zero");
            }
            const Fr u_inv = round_challenge.invert();

            // (e) fold a and b (use a_vec.at(j) as requested)
            for (size_t j = 0; j < round_size; ++j) {
                a_vec.at(j) += round_challenge * a_vec[round_size + j];
                b_vec[j]    += u_inv * b_vec[round_size + j];
            }

            // (f) update the basis descriptors for next round
            fold_basis_segments(u_inv);
        }


       // ---- Final round (i = logN-1), seg_len == 1 here ----
        round_size /= 2;                  // now round_size == 1
        // 1) c_L, c_R for the last time
        Fr cL = a_vec.at(0) * b_vec[1];
        Fr cR = a_vec.at(1) * b_vec[0];

        // 2) L_{last}, R_{last} with concat-MSM (still over N/2 points each)
        auto aL_exp = expand_scalars(&a_vec[0],          /*base_len=*/1, basis_right_pts.size());
        auto aR_exp = expand_scalars(&a_vec[1],          /*base_len=*/1, basis_left_pts.size());

        GroupElement L_base = msm_concat(basis_right_pts, basis_right_scales, std::span<const Fr>(aL_exp));
        GroupElement R_base = msm_concat(basis_left_pts,  basis_left_scales,  std::span<const Fr>(aR_exp));

        GroupElement L_last = L_base + U * cL;
        GroupElement R_last = R_base + U * cR;

        const std::string index_last = "0";
        transcript->send_to_verifier("IPA:L_" + index_last, Commitment(L_last));
        transcript->send_to_verifier("IPA:R_" + index_last, Commitment(R_last));

        // 3) final challenge u, fold a,b (j=0 only)
        const Fr u_last    = transcript->template get_challenge<Fr>("IPA:round_challenge_" + index_last);
        ASSERT(!u_last.is_zero());
        const Fr u_last_inv = u_last.invert();

        a_vec.at(0) += u_last * a_vec[1];
        b_vec[0]    += u_last_inv * b_vec[1];

        // 4) G_0 in *one* MSM over N terms:
        //    points = [left_pts[k][0], right_pts[k][0]], scalars = [left_scales[k], u^{-1}*right_scales[k]]
        {
            const size_t L = basis_left_pts.size();
            const size_t R = basis_right_pts.size();
            std::vector<Commitment> pts; pts.reserve(L + R);
            std::vector<Fr>         scs; scs.reserve(L + R);

            for (size_t k = 0; k < L; ++k) {
                pts.emplace_back(basis_left_pts[k][0]);
                scs.emplace_back(basis_left_scales[k]);
            }
            for (size_t k = 0; k < R; ++k) {
                pts.emplace_back(basis_right_pts[k][0]);
                scs.emplace_back(u_last_inv * basis_right_scales[k]);
            }

            GroupElement G0 = bb::scalar_multiplication::pippenger_unsafe<Curve>(
                {/*start=*/0, std::span<const Fr>(scs)},
                std::span<const Commitment>(pts));

            transcript->send_to_verifier("IPA:G_0", Commitment(G0));
            transcript->send_to_verifier("IPA:a_0", a_vec[0]);
            return;
}
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
     *1. Receive \f$d\f$ (polynomial degree plus one) from the prover
     *2. Receive the generator challenge \f$u\f$, abort if it's zero, otherwise compute \f$U=u\cdot G\f$
     *3. Compute  \f$C'=C+f(\beta)\cdot U\f$
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
    static bool reduce_verify_internal_native(const VK& vk,
                                                      const OpeningClaim<Curve>& opening_claim,
                                                      auto& transcript)
        requires(!Curve::is_stdlib_type)
    {
        // Step 1.
        // Add the commitment, challenge, and evaluation to the hash buffer.
        transcript->add_to_hash_buffer("IPA:commitment", opening_claim.commitment);
        transcript->add_to_hash_buffer("IPA:challenge", opening_claim.opening_pair.challenge);
        transcript->add_to_hash_buffer("IPA:evaluation", opening_claim.opening_pair.evaluation);

        // Step 2.
        // Receive generator challenge u and compute auxiliary generator
        const Fr generator_challenge = transcript->template get_challenge<Fr>("IPA:generator_challenge");

        if (generator_challenge.is_zero()) {
            throw_or_abort("The generator challenge can't be zero");
        }

        Commitment aux_generator = Commitment::one() * generator_challenge;

        // Step 3.
        // Compute C' = C + f(\beta) ⋅ U
        GroupElement C_prime = opening_claim.commitment + (aux_generator * opening_claim.opening_pair.evaluation);

        auto pippenger_size = 2 * log_poly_length;
        std::vector<Fr> round_challenges(log_poly_length);
        // the group elements that will participate in our MSM.
        std::vector<Commitment> msm_elements(pippenger_size);
        // the scalars that will participate in our MSM.
        std::vector<Fr> msm_scalars(pippenger_size);

        // Step 4.
        // Receive all L_i and R_i and populate msm_elements.
        for (size_t i = 0; i < log_poly_length; i++) {
            std::string index = std::to_string(log_poly_length - i - 1);
            auto element_L = transcript->template receive_from_prover<Commitment>("IPA:L_" + index);
            auto element_R = transcript->template receive_from_prover<Commitment>("IPA:R_" + index);
            round_challenges[i] = transcript->template get_challenge<Fr>("IPA:round_challenge_" + index);
            if (round_challenges[i].is_zero()) {
                throw_or_abort("Round challenges can't be zero");
            }
            msm_elements[2 * i] = element_L;
            msm_elements[2 * i + 1] = element_R;
        }

        std::vector<Fr> round_challenges_inv = round_challenges;
        Fr::batch_invert(round_challenges_inv);

        // populate msm_scalars.
        for (size_t i = 0; i < log_poly_length; i++) {
            msm_scalars[2 * i] = round_challenges_inv[i];
            msm_scalars[2 * i + 1] = round_challenges[i];
        }

        // Step 5.
        // Compute C₀ = C' + ∑_{j ∈ [k]} u_j^{-1}L_j + ∑_{j ∈ [k]} u_jR_j
        GroupElement LR_sums = scalar_multiplication::pippenger_unsafe<Curve>({0, {&msm_scalars[0], /*size*/ pippenger_size}},{&msm_elements[0], /*size*/ pippenger_size});
        GroupElement C_zero = C_prime + LR_sums;

        //  Step 6.
        // Compute b_zero where b_zero can be computed using the polynomial:
        //  g(X) = ∏_{i ∈ [k]} (1 + u_{i-1}^{-1}.X^{2^{i-1}}).
        //  b_zero = g(evaluation) = ∏_{i ∈ [k]} (1 + u_{i-1}^{-1}. (evaluation)^{2^{i-1}})
        Fr b_zero = Fr::one();
        for (size_t i = 0; i < log_poly_length; i++) {
            b_zero *= Fr::one() + (round_challenges_inv[log_poly_length - 1 - i] *
                                   opening_claim.opening_pair.challenge.pow(1 << i));
        }

        // Step 7.
        // Construct vector s
        Polynomial<Fr> s_poly(construct_poly_from_u_challenges_inv(std::span(round_challenges_inv).subspan(0, log_poly_length)));

        std::span<const Commitment> srs_elements = vk.get_monomial_points();
        if (poly_length > srs_elements.size()) {
            throw_or_abort("potential bug: Not enough SRS points for IPA!");
        }

        // Step 8.
        // Compute G₀
        Commitment G_zero = scalar_multiplication::pippenger_unsafe<Curve>(s_poly,{&srs_elements[0], /*size*/ poly_length});
        Commitment G_zero_sent = transcript->template receive_from_prover<Commitment>("IPA:G_0");
        BB_ASSERT_EQ(G_zero, G_zero_sent, "G_0 should be equal to G_0 sent in transcript. IPA verification fails.");

        // Step 9.
        // Receive a₀ from the prover
        auto a_zero = transcript->template receive_from_prover<Fr>("IPA:a_0");

        // Step 10.
        // Compute C_right
        GroupElement right_hand_side = G_zero * a_zero + aux_generator * a_zero * b_zero;
        // Step 11.
        // Check if C_right == C₀
        return (C_zero.normalize() == right_hand_side.normalize());
    }
    /**
     * @brief  Recursively verify the correctness of an IPA proof, without computing G_zero. Unlike native verification, there is no
     * parallelisation in this function as our circuit construction does not currently support parallelisation.
     *
     * @details  batch_mul is used instead of pippenger as pippenger is not implemented to be used in stdlib context for
     * now and under the hood we perform bigfield to cycle_scalar conversions for the batch_mul. That is because
     * cycle_scalar has very reduced functionality at the moment and doesn't support basic arithmetic operations between
     * two cycle_scalar operands (just for one cycle_group and one cycle_scalar to enable batch_mul).
     * @param vk
     * @param opening_claim
     * @param transcript
     * @return VerifierAccumulator
     */
    static VerifierAccumulator reduce_verify_internal_recursive(const OpeningClaim<Curve>& opening_claim,
                                                      auto& transcript)
        requires Curve::is_stdlib_type
    {
        // Step 1.
        // Add the commitment, challenge, and evaluation to the hash buffer.
        transcript->add_to_hash_buffer("IPA:commitment", opening_claim.commitment);
        transcript->add_to_hash_buffer("IPA:challenge", opening_claim.opening_pair.challenge);
        transcript->add_to_hash_buffer("IPA:evaluation", opening_claim.opening_pair.evaluation);

        // Step 2.
        // Receive generator challenge u and compute auxiliary generator
        const Fr generator_challenge = transcript->template get_challenge<Fr>("IPA:generator_challenge");
        typename Curve::Builder* builder = generator_challenge.get_context();

        auto pippenger_size = 2 * log_poly_length;
        std::vector<Fr> round_challenges(log_poly_length);
        std::vector<Fr> round_challenges_inv(log_poly_length);
        std::vector<Commitment> msm_elements(pippenger_size);
        std::vector<Fr> msm_scalars(pippenger_size);


        // Step 3.
        // Receive all L_i and R_i and prepare for MSM
        for (size_t i = 0; i < log_poly_length; i++) {

            std::string index = std::to_string(log_poly_length - i - 1);
            auto element_L = transcript->template receive_from_prover<Commitment>("IPA:L_" + index);
            auto element_R = transcript->template receive_from_prover<Commitment>("IPA:R_" + index);
            round_challenges[i] = transcript->template get_challenge<Fr>("IPA:round_challenge_" + index);
            round_challenges_inv[i] = round_challenges[i].invert();

            msm_elements[2 * i] = element_L;
            msm_elements[2 * i + 1] = element_R;
            msm_scalars[2 * i] = round_challenges_inv[i];
            msm_scalars[2 * i + 1] =  round_challenges[i];
        }

        //  Step 4.
        // Compute b_zero where b_zero can be computed using the polynomial:
        //  g(X) = ∏_{i ∈ [k]} (1 + u_{i-1}^{-1}.X^{2^{i-1}}).
        //  b_zero = g(evaluation) = ∏_{i ∈ [k]} (1 + u_{i-1}^{-1}. (evaluation)^{2^{i-1}})

        Fr b_zero = Fr(1);
        Fr challenge = opening_claim.opening_pair.challenge;
        for (size_t i = 0; i < log_poly_length; i++) {

            Fr monomial = round_challenges_inv[log_poly_length - 1 - i] * challenge;
            b_zero *= Fr(1) + monomial;
            if (i != log_poly_length - 1) // this if statement is fine because the number of iterations is constant
            {
                challenge = challenge.sqr();
            }
        }

        // Step 5.
        // Receive G₀ from the prover
        Commitment G_zero = transcript->template receive_from_prover<Commitment>("IPA:G_0");

        // Step 6.
        // Receive a₀ from the prover
        const auto a_zero = transcript->template receive_from_prover<Fr>("IPA:a_0");

        // Step 7.
        // Compute R = C' + ∑_{j ∈ [k]} u_j^{-1}L_j + ∑_{j ∈ [k]} u_jR_j - G₀ * a₀ - (f(\beta) + a₀ * b₀) ⋅ U
        // This is a combination of several IPA relations into a large batch mul
        // which should be equal to -C
        msm_elements.emplace_back(-G_zero);
        msm_elements.emplace_back(-Commitment::one(builder));
        msm_scalars.emplace_back(a_zero);
        msm_scalars.emplace_back(generator_challenge * a_zero.madd(b_zero, {-opening_claim.opening_pair.evaluation}));
        GroupElement ipa_relation = GroupElement::batch_mul(msm_elements, msm_scalars);
        auto neg_commitment = -opening_claim.commitment;
        ipa_relation.assert_equal(neg_commitment);


        return { round_challenges_inv, G_zero};
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
    static void compute_opening_proof(const CK& ck,
                                      const ProverOpeningClaim<Curve>& opening_claim,
                                      const std::shared_ptr<NativeTranscript>& transcript)
    {
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
    static bool reduce_verify(const VK& vk,
                                             const OpeningClaim<Curve>& opening_claim,
                                             const auto& transcript)
        requires(!Curve::is_stdlib_type)
    {
        return reduce_verify_internal_native(vk, opening_claim, transcript);
    }

    /**
     * @brief Recursively verify the correctness of a proof
     *
     * @param vk Verification_key containing srs
     * @param opening_claim Contains the commitment C and opening pair \f$(\beta, f(\beta))\f$
     * @param transcript Transcript with elements from the prover and generated challenges
     *
     * @return VerifierAccumulator
     *
     *@remark The verification procedure documentation is in \link IPA::verify_internal verify_internal \endlink
     */
    static VerifierAccumulator reduce_verify(const OpeningClaim<Curve>& opening_claim,
                                             const auto& transcript)
        requires(Curve::is_stdlib_type)
    {
        return reduce_verify_internal_recursive(opening_claim, transcript);
    }

    /**
     * @brief  Fully recursively verify the correctness of an IPA proof, including computing G_zero. Unlike native verification, there is no
     * parallelisation in this function as our circuit construction does not currently support parallelisation.
     *
     * @details  batch_mul is used instead of pippenger as pippenger is not implemented to be used in stdlib context for
     * now and under the hood we perform bigfield to cycle_scalar conversions for the batch_mul. That is because
     * cycle_scalar has very reduced functionality at the moment and doesn't support basic arithmetic operations between
     * two cycle_scalar operands (just for one cycle_group and one cycle_scalar to enable batch_mul).
     * @param vk
     * @param opening_claim
     * @param transcript
     * @return VerifierAccumulator
     */
    static bool full_verify_recursive(const VK& vk,
                                                    const OpeningClaim<Curve>& opening_claim,
                                                      auto& transcript)
        requires Curve::is_stdlib_type
    {
        // Step 1.
        // Add the commitment, challenge, and evaluation to the hash buffer.
        transcript->add_to_hash_buffer("IPA:commitment", opening_claim.commitment);
        transcript->add_to_hash_buffer("IPA:challenge", opening_claim.opening_pair.challenge);
        transcript->add_to_hash_buffer("IPA:evaluation", opening_claim.opening_pair.evaluation);

        // Step 2.
        // Receive generator challenge u and compute auxiliary generator
        const Fr generator_challenge = transcript->template get_challenge<Fr>("IPA:generator_challenge");
        typename Curve::Builder* builder = generator_challenge.get_context();

        static constexpr size_t pippenger_size = 2 * log_poly_length;
        std::vector<Fr> round_challenges(log_poly_length);
        std::vector<Fr> round_challenges_inv(log_poly_length);
        std::vector<Commitment> msm_elements(pippenger_size);
        std::vector<Fr> msm_scalars(pippenger_size);


        // Step 3.
        // Receive all L_i and R_i and prepare for MSM
        for (size_t i = 0; i < log_poly_length; i++) {

            std::string index = std::to_string(log_poly_length - i - 1);
            auto element_L = transcript->template receive_from_prover<Commitment>("IPA:L_" + index);
            auto element_R = transcript->template receive_from_prover<Commitment>("IPA:R_" + index);
            round_challenges[i] = transcript->template get_challenge<Fr>("IPA:round_challenge_" + index);
            round_challenges_inv[i] = round_challenges[i].invert();

            msm_elements[2 * i] = element_L;
            msm_elements[2 * i + 1] = element_R;
            msm_scalars[2 * i] = round_challenges_inv[i];
            msm_scalars[2 * i + 1] = round_challenges[i];
        }

        //  Step 4.
        // Compute b_zero where b_zero can be computed using the polynomial:
        //  g(X) = ∏_{i ∈ [k]} (1 + u_{i-1}^{-1}.X^{2^{i-1}}).
        //  b_zero = g(evaluation) = ∏_{i ∈ [k]} (1 + u_{i-1}^{-1}. (evaluation)^{2^{i-1}})

        Fr b_zero = Fr(1);
        Fr challenge = opening_claim.opening_pair.challenge;
        for (size_t i = 0; i < log_poly_length; i++) {

            Fr monomial = round_challenges_inv[log_poly_length - 1 - i] * challenge;
            b_zero *= Fr(1) + monomial;
            if (i != log_poly_length - 1) // this if statement is fine because the number of iterations is constant
            {
                challenge = challenge.sqr();
            }
        }

        // Step 5.
        // Construct vector s
        // We implement a linear-time algorithm to optimally compute this vector
        // Note: currently requires an extra vector of size `poly_length / 2` to cache temporaries
        //       this might able to be optimized if we care enough, but the size of this poly shouldn't be large relative to the builder polynomial sizes
        std::vector<Fr> s_vec_temporaries(poly_length / 2);
        std::vector<Fr> s_vec(poly_length);

        Fr* previous_round_s = &s_vec_temporaries[0];
        Fr* current_round_s = &s_vec[0];
        // if number of rounds is even we need to swap these so that s_vec always contains the result
        if constexpr ((log_poly_length & 1) == 0)
        {
            std::swap(previous_round_s, current_round_s);
        }
        previous_round_s[0] = Fr(1);
        for (size_t i = 0; i < log_poly_length; ++i)
        {
            const size_t round_size = 1 << (i + 1);
            const Fr round_challenge = round_challenges_inv[i];
            for (size_t j = 0; j < round_size / 2; ++j)
            {
                current_round_s[j * 2] = previous_round_s[j];
                current_round_s[j * 2 + 1] = previous_round_s[j] * round_challenge;
            }
            std::swap(current_round_s, previous_round_s);
        }
        // Receive G₀ from the prover
        Commitment transcript_G_zero = transcript->template receive_from_prover<Commitment>("IPA:G_0");
        // Compute G₀
        // Unlike the native verification function, the verifier commitment key only containts the SRS so we can apply
        // batch_mul directly on it.
        const std::vector<Commitment> srs_elements = vk.get_monomial_points();
        Commitment G_zero = Commitment::batch_mul(srs_elements, s_vec);
        transcript_G_zero.assert_equal(G_zero);
        BB_ASSERT_EQ(G_zero.get_value(), transcript_G_zero.get_value(), "G_zero doesn't match received G_zero.");

        // Step 6.
        // Receive a₀ from the prover
        const auto a_zero = transcript->template receive_from_prover<Fr>("IPA:a_0");

        // Step 7.
        // Compute R = C' + ∑_{j ∈ [k]} u_j^{-1}L_j + ∑_{j ∈ [k]} u_jR_j - G₀ * a₀ - (f(\beta) + a₀ * b₀) ⋅ U
        // This is a combination of several IPA relations into a large batch mul
        // which should be equal to -C
        msm_elements.emplace_back(-G_zero);
        msm_elements.emplace_back(-Commitment::one(builder));
        msm_scalars.emplace_back(a_zero);
        msm_scalars.emplace_back(generator_challenge * a_zero.madd(b_zero, {-opening_claim.opening_pair.evaluation}));
        GroupElement ipa_relation = GroupElement::batch_mul(msm_elements, msm_scalars);
        auto neg_commitment = -opening_claim.commitment;
        ipa_relation.assert_equal(neg_commitment);

        return (ipa_relation.get_value() == -opening_claim.commitment.get_value());
    }

    /**
     * @brief A method that produces an IPA opening claim from Shplemini accumulator containing vectors of commitments
     * and scalars and a Shplonk evaluation challenge.
     *
     * @details Compute the commitment \f$ C \f$ that will be used to prove that Shplonk batching is performed correctly
     * and check the evaluation claims of the batched univariate polynomials. The check is done by verifying that the
     * polynomial corresponding to \f$ C \f$ evaluates to \f$ 0 \f$ at the Shplonk challenge point \f$ z \f$.
     *
     */
    static OpeningClaim<Curve> reduce_batch_opening_claim(
        const BatchOpeningClaim<Curve>&  batch_opening_claim)
    {
        // Extract batch_mul arguments from the accumulator
        const auto& commitments = batch_opening_claim.commitments;
        const auto& scalars = batch_opening_claim.scalars;
        const Fr& shplonk_eval_challenge = batch_opening_claim.evaluation_point;
        // Compute \f$ C = \sum \text{commitments}_i \cdot \text{scalars}_i \f$
        GroupElement shplonk_output_commitment;
        if constexpr (Curve::is_stdlib_type) {
            shplonk_output_commitment =
                GroupElement::batch_mul(commitments, scalars);
        } else {
            shplonk_output_commitment = batch_mul_native(commitments, scalars);
        }
        // Output an opening claim to be verified by the IPA opening protocol
        return { { shplonk_eval_challenge, Fr(0) }, shplonk_output_commitment };
    }

    /**
     * @brief Natively verify the IPA opening claim obtained from a Shplemini accumulator
     *
     * @param batch_opening_claim
     * @param vk
     * @param transcript
     * @return bool
     */
    static bool reduce_verify_batch_opening_claim(const BatchOpeningClaim<Curve>& batch_opening_claim,
                                                                 const VK& vk,
                                                                 auto& transcript)
        requires(!Curve::is_stdlib_type)
    {
        const auto opening_claim = reduce_batch_opening_claim(batch_opening_claim);
        return reduce_verify_internal_native(vk, opening_claim, transcript);
    }

    /**
     * @brief Recursively verify the IPA opening claim obtained from a Shplemini accumulator
     *
     * @param batch_opening_claim
     * @param vk
     * @param transcript
     * @return VerifierAccumulator
     */
    static VerifierAccumulator reduce_verify_batch_opening_claim(const BatchOpeningClaim<Curve>& batch_opening_claim,
                                                                 [[maybe_unused]] const std::shared_ptr<VK>& vk,
                                                                 auto& transcript)
        requires(Curve::is_stdlib_type)
    {
        const auto opening_claim = reduce_batch_opening_claim(batch_opening_claim);
        return reduce_verify_internal_recursive(opening_claim, transcript);
    }

    /**
     * @brief Evaluates the polynomial created from the challenge scalars u_challenges_inv at a challenge r.
     * @details This polynomial is defined as challenge_poly(X) = ∏_{i ∈ [k]} (1 + u_{len-i}^{-1}.X^{2^{i-1}}),
     * so the evaluation is just ∏_{i ∈ [k]} (1 + u_{len-i}^{-1}.r^{2^{i-1}}).
     * @param u_challenges_inv
     * @param r
     * @return Fr
     */
    static Fr evaluate_challenge_poly(const std::vector<Fr>& u_challenges_inv, Fr r) {

        Fr challenge_poly_eval = 1;
        Fr r_pow = r;

        for (size_t i = 0; i < log_poly_length; i++) {

            Fr monomial = u_challenges_inv[log_poly_length - 1 - i] * r_pow;

            challenge_poly_eval *= (Fr(1) + monomial);
            r_pow = r_pow.sqr();
        }
        return challenge_poly_eval;
    }

    /**
     * @brief Combines the challenge_poly evaluations using the challenge alpha.
     *
     * @param u_challenges_inv_1
     * @param u_challenges_inv_2
     * @param r
     * @param alpha
     * @return Fr
     */
    static Fr evaluate_and_accumulate_challenge_polys(std::vector<Fr> u_challenges_inv_1, std::vector<Fr> u_challenges_inv_2, Fr r, Fr alpha) {
        auto result = evaluate_challenge_poly(u_challenges_inv_1, r) + alpha * evaluate_challenge_poly(u_challenges_inv_2, r);
        return result;
    }

    /**
     * @brief Constructs challenge_poly(X) = ∏_{i ∈ [k]} (1 + u_{len-i}^{-1}.X^{2^{i-1}}).
     *
     * @param u_challenges_inv
     * @return Polynomial<bb::fq>
     */
    static Polynomial<bb::fq> construct_poly_from_u_challenges_inv(const std::span<const bb::fq>& u_challenges_inv) {

        // Construct vector s in linear time.
        std::vector<bb::fq> s_vec(poly_length, bb::fq::one());

        std::vector<bb::fq> s_vec_temporaries(poly_length / 2);

        bb::fq* previous_round_s = &s_vec_temporaries[0];
        bb::fq* current_round_s = &s_vec[0];
        // if number of rounds is even we need to swap these so that s_vec always contains the result
        if ((log_poly_length & 1) == 0)
        {
            std::swap(previous_round_s, current_round_s);
        }
        previous_round_s[0] = bb::fq(1);
        for (size_t i = 0; i < log_poly_length; ++i)
        {
            const size_t round_size = 1 << (i + 1);
            const fq round_challenge = u_challenges_inv[i];
            parallel_for_heuristic(
                round_size / 2,
                [&](size_t j) {
                    current_round_s[j * 2] = previous_round_s[j];
                    current_round_s[j * 2 + 1] = previous_round_s[j] * round_challenge;
                }, thread_heuristics::FF_MULTIPLICATION_COST * 2);
            std::swap(current_round_s, previous_round_s);
        }
        return {s_vec, poly_length};
    }

    /**
     * @brief Combines two challenge_polys using the challenge alpha.
     *
     * @param u_challenges_inv_1
     * @param u_challenges_inv_2
     * @param alpha
     * @return Polynomial<bb::fq>
     */
    static Polynomial<bb::fq> create_challenge_poly(const std::vector<bb::fq>& u_challenges_inv_1,  const std::vector<bb::fq>& u_challenges_inv_2, bb::fq alpha) {
        // Always extend each to 1<<log_poly_length length
        Polynomial<bb::fq> challenge_poly(1<<log_poly_length);
        Polynomial challenge_poly_1 = construct_poly_from_u_challenges_inv(u_challenges_inv_1);
        Polynomial challenge_poly_2 = construct_poly_from_u_challenges_inv(u_challenges_inv_2);
        challenge_poly += challenge_poly_1;
        challenge_poly.add_scaled(challenge_poly_2, alpha);
        return challenge_poly;
    }

    /**
     * @brief Takes two IPA claims and accumulates them into 1 IPA claim. Also computes IPA proof for the claim.
     * @details We create an IPA accumulator by running the IPA recursive verifier on each claim. Then, we generate challenges, and use these challenges to compute the new accumulator. We also create the accumulated polynomial, and generate the IPA proof for the accumulated claim.
     * More details are described here: https://hackmd.io/IXoLIPhVT_ej8yhZ_Ehvuw?both.
     *
     * @param verifier_ck
     * @param transcript_1
     * @param claim_1
     * @param transcript_2
     * @param claim_2
     * @return std::pair<OpeningClaim<Curve>, HonkProof>
     */
    static std::pair<OpeningClaim<Curve>, HonkProof> accumulate(const CommitmentKey<curve::Grumpkin>& ck, auto& transcript_1, OpeningClaim<Curve> claim_1, auto& transcript_2, OpeningClaim<Curve> claim_2)
    requires Curve::is_stdlib_type
    {
        using NativeCurve = curve::Grumpkin;
        using Builder = typename Curve::Builder;
        // Step 1: Run the verifier for each IPA instance
        VerifierAccumulator pair_1 = reduce_verify(claim_1, transcript_1);
        VerifierAccumulator pair_2 = reduce_verify(claim_2, transcript_2);

        // Step 2: Generate the challenges by hashing the pairs
        using StdlibTranscript = BaseTranscript<stdlib::recursion::honk::StdlibTranscriptParams<Builder>>;
        StdlibTranscript transcript;
        transcript.send_to_verifier("u_challenges_inv_1", pair_1.u_challenges_inv);
        transcript.send_to_verifier("U_1", pair_1.comm);
        transcript.send_to_verifier("u_challenges_inv_2", pair_2.u_challenges_inv);
        transcript.send_to_verifier("U_2", pair_2.comm);
        auto [alpha, r] = transcript.template get_challenges<Fr>("IPA:alpha", "IPA:r");

        // Step 3: Compute the new accumulator
        OpeningClaim<Curve> output_claim;
        output_claim.commitment = pair_1.comm + pair_2.comm * alpha;
        output_claim.opening_pair.challenge = r;
        // Evaluate the challenge_poly polys at r and linearly combine them with alpha challenge
        output_claim.opening_pair.evaluation = evaluate_and_accumulate_challenge_polys(pair_1.u_challenges_inv, pair_2.u_challenges_inv, r, alpha);

        // Step 4: Compute the new polynomial
        std::vector<bb::fq> native_u_challenges_inv_1;
        std::vector<bb::fq> native_u_challenges_inv_2;
        for (Fr u_inv_i : pair_1.u_challenges_inv) {
            native_u_challenges_inv_1.push_back(bb::fq(u_inv_i.get_value()));
        }
        for (Fr u_inv_i : pair_2.u_challenges_inv) {
            native_u_challenges_inv_2.push_back(bb::fq(u_inv_i.get_value()));
        }

        // Compute proof for the claim
        auto prover_transcript = std::make_shared<NativeTranscript>();
        const OpeningPair<NativeCurve> opening_pair{ bb::fq(output_claim.opening_pair.challenge.get_value()),
                                                     bb::fq(output_claim.opening_pair.evaluation.get_value()) };
        Polynomial<fq> challenge_poly = create_challenge_poly(native_u_challenges_inv_1, native_u_challenges_inv_2, fq(alpha.get_value()));

        BB_ASSERT_EQ(challenge_poly.evaluate(opening_pair.challenge), opening_pair.evaluation, "Opening claim does not hold for challenge polynomial.");

        IPA<NativeCurve, log_poly_length>::compute_opening_proof(ck, { challenge_poly, opening_pair }, prover_transcript);
        BB_ASSERT_EQ(challenge_poly.evaluate(fq(output_claim.opening_pair.challenge.get_value())), fq(output_claim.opening_pair.evaluation.get_value()), "Opening claim does not hold for challenge polynomial.");

        output_claim.opening_pair.evaluation.self_reduce();
        return {output_claim, prover_transcript->export_proof()};
    }

    static std::pair<OpeningClaim<Curve>, HonkProof> create_fake_ipa_claim_and_proof(UltraCircuitBuilder& builder)
    requires Curve::is_stdlib_type {
        using NativeCurve = curve::Grumpkin;
        using Builder = typename Curve::Builder;
        using Curve = stdlib::grumpkin<Builder>;
        auto ipa_transcript = std::make_shared<NativeTranscript>();
        CommitmentKey<NativeCurve> ipa_commitment_key(poly_length);
        size_t n = poly_length;
        auto poly = Polynomial<fq>(n);
        for (size_t i = 0; i < n; i++) {
            poly.at(i) = fq::random_element();
        }
        fq x = fq::random_element();
        fq eval = poly.evaluate(x);
        auto commitment = ipa_commitment_key.commit(poly);
        const OpeningPair<NativeCurve> opening_pair = { x, eval };
        IPA<NativeCurve>::compute_opening_proof(ipa_commitment_key, { poly, opening_pair }, ipa_transcript);

        auto stdlib_comm = Curve::Group::from_witness(&builder, commitment);
        auto stdlib_x = Curve::ScalarField::from_witness(&builder, x);
        auto stdlib_eval = Curve::ScalarField::from_witness(&builder, eval);
        OpeningClaim<Curve> stdlib_opening_claim{ { stdlib_x, stdlib_eval }, stdlib_comm };

        return {stdlib_opening_claim, ipa_transcript->export_proof()};
    }
};

} // namespace bb
