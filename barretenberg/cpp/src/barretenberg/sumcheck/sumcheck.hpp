#pragma once
#include "barretenberg/plonk_honk_shared/library/grand_product_delta.hpp"
#include "barretenberg/polynomials/polynomial_arithmetic.hpp"
#include "barretenberg/sumcheck/sumcheck_output.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include "barretenberg/ultra_honk/decider_proving_key.hpp"
#include "sumcheck_round.hpp"

namespace bb {

/*! \brief The implementation of the sumcheck Prover for statements of the form \f$\sum_{\vec \ell \in \{0,1\}^d}
pow_{\beta}(\vec \ell) \cdot F \left(P_1(\vec \ell),\ldots, P_N(\vec \ell) \right)  = 0 \f$ for multilinear polynomials
\f$P_1, \ldots, P_N \f$.

   \details
 \section SumcheckProverNotation Notation and Setup

 \subsection SumcheckProverObtainingPolynomials Obtaining Prover/Honk Polynomials
 The Sumcheck is applied to  multivariate polynomials
\f$P_1, \ldots, P_N\f$ that are specidied by \p Flavor. Namely, \ref prove "prove method" obtains \p full_polynomials by
reference from \p Flavor 's \ref ProverPolynomials "prover polynomials". In particular, their number \f$N\f$ is
specified by the \p Flavor.

 ### Sumcheck Relation
 Given multilinear polynomials \f$ P_1,\ldots, P_N \in \mathbb{F}[X_0,\ldots, X_{d-1}] \f$ and a relation \f$ F \f$
which is a polynomial in \f$ N \f$ variables, we use Sumcheck over the polynomial
 * \f{align}{
    \tilde{F}
    (X_0,\ldots, X_{d-1}) =
    pow_{\beta}(X_0,\ldots, X_{d-1}) \cdot F\left( P_1 (X_0,\ldots, X_{d-1}), \ldots, P_N (X_0,\ldots, X_{d-1}) \right)
    \f}
to establish that \f$ F(P_1(\vec \ell),\ldots, P_N(\vec \ell) ) = 0 \f$, i.e. that \f$ F \f$ is satisfied, at every
point of \f$\{0,1\}^d\f$.

 In the implementation, the relation polynomial \f$ F \f$ is determined by \p Flavor::Relations which is fed to \ref
bb::SumcheckProverRound "Sumcheck Round Prover".

 ## Input and Parameters
 The following constants are used:
 - \f$ d \f$ \ref multivariate_d "the number of variables" in the multilinear polynomials
 - \f$ n \f$ \ref multivariate_n "the size of the hypercube", i.e. \f$ 2^d\f$.
 - \f$ D = \f$  \ref bb::SumcheckProverRound< Flavor >::BATCHED_RELATION_PARTIAL_LENGTH "total degree of"
\f$\tilde{F}\f$ as a polynomial in \f$P_1,\ldots, P_N\f$ <b> incremented by </b> 1.


 ## Honk Polynomials and Partially Evaluated Polynomials

 Given \f$ N \f$ Honk \ref ProverPolynomials "Prover Polynomials" \f$ P_1, \ldots, P_N \f$, i.e. multilinear polynomials
in \f$ d \f$ variables.

### Round 0
At initialization, \ref ProverPolynomials "Prover Polynomials"
are submitted by reference into \p full_polynomials, which is a two-dimensional array with \f$N\f$ columns and \f$2^d\f$
rows, whose entries are defined as follows \f$\texttt{full_polynomials}_{i,j} = P_j(\vec i) \f$. Here, \f$ \vec i \in
\{0,1\}^d \f$ is identified with the binary representation of the integer \f$ 0 \leq i \leq 2^d-1 \f$.

When the first challenge \f$ u_0 \f$ is computed, the method \ref partially_evaluate "partially evaluate" takes as input
\p full_polynomials and populates  \ref partially_evaluated_polynomials "a new book-keeping table" denoted by
\f$\texttt{partially_evaluated_polynomials} \f$. Its \f$ n/2 = 2^{d-1} \f$ rows will represent the evaluations
\f$ P_i(u_0, X_1, ..., X_{d-1}) \f$, which are multilinear polynomials in \f$ d-1 \f$ variables.


More precisely, it is a table with \f$ 2^{d-1} \f$ rows and \f$ N \f$ columns, such that
    \f{align}{ \texttt{partially_evaluated_polynomials}_{i,j} = &\ P_j(0, i_1,\ldots, i_{d-1}) + u_0 \cdot
(P_j(1,i_1,\ldots, i_{d-1})) - P_j(0, i_1,\ldots, i_{d-1})) \\ = &\ \texttt{full_polynomials}_{2 i,j} + u_0 \cdot
(\texttt{full_polynomials}_{2i+1,j} - \texttt{full_polynomials}_{2 i,j}) \f}

### Updating Partial Evaluations in Subsequent Rounds
In Round \f$ i < d-1\f$, \ref partially_evaluate "partially evaluate" updates the first \f$ 2^{d-1 - i} \f$ rows of
\f$\texttt{partially_evaluated_polynomials}\f$ with the evaluations \f$ P_1(u_0,\ldots, u_i, \vec \ell),\ldots,
P_N(u_0,\ldots, u_i, \vec \ell)\f$ for \f$\vec \ell \in \{0,1\}^{d-1-i}\f$.
The details are specified in \ref partially_evaluate "the corresponding docs."

### Final Step
After computing the last challenge \f$ u_{d-1} \f$ in Round \f$ d-1 \f$ and updating \f$
\texttt{partially_evaluated_polynomials} \f$, the prover looks into the 'top' row of the table containing evaluations
\f$P_1(u_0,\ldots, u_{d-1}), \ldots, P_N(u_0,\ldots, u_{d-1})\f$ and concatenates these values with the last challenge
to the transcript.

## Round Univariates

\subsubsection SumcheckProverContributionsofPow Contributions of GateSeparatorPolynomial

 * Let \f$ \vec \beta = (\beta_0,\ldots, \beta_{d-1}) \in \mathbb{F}\f$ be a vector of challenges.
 *
 * In Round \f$i\f$, a univariate polynomial \f$ \tilde S^{i}(X_{i}) \f$ for the relation defined by \f$ \tilde{F}(X)\f$
is computed as follows. First, we introduce notation
 - \f$ c_i = pow_{\beta}(u_0,\ldots, u_{i-1}) \f$
 - \f$ T^{i}( X_i ) =  \sum_{ \ell = 0} ^{2^{d-i-1}-1} \beta_{i+1}^{\ell_{i+1}} \cdot \ldots \cdot
\beta_{d-1}^{\ell_{d-1}} \cdot S^i_{\ell}( X_i )  \f$
 - \f$ S^i_{\ell} (X_i) = F \left(P_1(u_0,\ldots, u_{i-1}, X_i, \vec \ell), \ldots,  P_1(u_0,\ldots, u_{i-1}, X_i, \vec
\ell) \right) \f$

 As explained in \ref bb::GateSeparatorPolynomial "GateSeparatorPolynomial",
 \f{align}{
    \tilde{S}^{i}(X_i) =  \sum_{ \ell = 0} ^{2^{d-i-1}-1}   pow^i_\beta ( X_i, \ell_{i+1}, \ldots, \ell_{d-1} ) \cdot
S^i_{\ell}( X_i ) = c_i\cdot ( (1−X_i) + X_i\cdot \beta_i ) \cdot \sum_{\ell = 0}^{2^{d-i-1}-1} \beta_{i+1}^{\ell_{i+1}}
\cdot \ldots \cdot \beta_{d-1}^{\ell_{d-1}} \cdot S^{i}_{\ell}( X_i ). \f}
 *
### Computing Round Univariates
The evaluations of the round univariate \f$ \tilde{S}^i \f$ over the domain \f$0,\ldots, D \f$ are obtained by the
method \ref bb::SumcheckProverRound< Flavor >::compute_univariate "compute_univariate". The
implementation consists of the following sub-methods:

 - \ref bb::SumcheckProverRound::extend_edges "Extend evaluations" of linear univariate
polynomials \f$ P_j(u_0,\ldots, u_{i-1}, X_i, \vec \ell) \f$ to the domain \f$0,\ldots, D\f$.
 - \ref bb::SumcheckProverRound::accumulate_relation_univariates "Accumulate per-relation contributions" of the extended
polynomials to \f$ T^i(X_i)\f$
 - \ref bb::SumcheckProverRound::extend_and_batch_univariates "Extend and batch the subrelation contibutions"
multiplying by the constants \f$c_i\f$ and the evaluations of \f$ ( (1−X_i) + X_i\cdot \beta_i ) \f$.
## Transcript Operations
After computing Round univariates and adding them to the transcript, the prover generates round challenge by hashing the
transcript. These operations are taken care of by \ref bb::BaseTranscript "Transcript Class" methods.
## Output
The Sumcheck output is specified by \ref bb::SumcheckOutput< Flavor >.
 */
template <typename Flavor> class SumcheckProver {
  public:
    using FF = typename Flavor::FF;
    // PartiallyEvaluatedMultivariates OR ProverPolynomials
    // both inherit from AllEntities
    using ProverPolynomials = typename Flavor::ProverPolynomials;
    using PartiallyEvaluatedMultivariates = typename Flavor::PartiallyEvaluatedMultivariates;
    using ClaimedEvaluations = typename Flavor::AllValues;
    using ZKData = ZKSumcheckData<Flavor>;
    using Transcript = typename Flavor::Transcript;
    using RelationSeparator = typename Flavor::RelationSeparator;
    using CommitmentKey = typename Flavor::CommitmentKey;

    /**
     * @brief The total algebraic degree of the Sumcheck relation \f$ F \f$ as a polynomial in Prover Polynomials
     * \f$P_1,\ldots, P_N\f$.
     */
    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = Flavor::MAX_PARTIAL_RELATION_LENGTH;

    // this constant specifies the number of coefficients of libra polynomials, and evaluations of round univariate
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = Flavor::BATCHED_RELATION_PARTIAL_LENGTH;

    using SumcheckRoundUnivariate = typename bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH>;

    // The size of the hypercube, i.e. \f$ 2^d\f$.
    const size_t multivariate_n;
    // The number of variables
    const size_t multivariate_d;

    std::shared_ptr<Transcript> transcript;
    SumcheckProverRound<Flavor> round;

    static constexpr bool IS_ECCVM = std::is_same_v<Flavor, ECCVMFlavor>;
    std::vector<typename Flavor::Commitment> round_univariate_commitments = {};
    std::vector<std::array<FF, 3>> round_evaluations = {};
    std::vector<Polynomial<FF>> round_univariates = {};
    std::vector<FF> eval_domain = {};

    /**
    *
    * @brief Container for partially evaluated Prover Polynomials at a current challenge. Upon computing challenge \f$
    u_i \f$, the first \f$2^{d-1-i}\f$ rows are updated using \ref bb::SumcheckProver< Flavor >::partially_evaluate
    "partially evaluate" method.
    *
    * NOTE: With ~40 columns, prob only want to allocate 256 EdgeGroup's at once to keep stack under 1MB?
    * TODO(#224)(Cody): might want to just do C-style multidimensional array? for guaranteed adjacency?
    */
    PartiallyEvaluatedMultivariates partially_evaluated_polynomials;
    // prover instantiates sumcheck with circuit size and a prover transcript
    SumcheckProver(size_t multivariate_n, const std::shared_ptr<Transcript>& transcript)
        : multivariate_n(multivariate_n)
        , multivariate_d(numeric::get_msb(multivariate_n))
        , transcript(transcript)
        , round(multivariate_n)
        , partially_evaluated_polynomials(multivariate_n){};

    /**
     * @brief Non-ZK version: Compute round univariate, place it in transcript, compute challenge, partially evaluate.
     * Repeat until final round, then get full evaluations of prover polynomials, and place them in transcript.
     * @details See Detailed description of \ref bb::SumcheckProver< Flavor > "Sumcheck Prover <Flavor>.
     * @param full_polynomials Container for ProverPolynomials
     * @param relation_parameters
     * @param alpha Batching challenge for subrelations.
     * @param gate_challenges
     * @return SumcheckOutput
     */
    SumcheckOutput<Flavor> prove(ProverPolynomials& full_polynomials,
                                 const bb::RelationParameters<FF>& relation_parameters,
                                 const RelationSeparator alpha,
                                 const std::vector<FF>& gate_challenges)
    {

        bb::GateSeparatorPolynomial<FF> gate_separators(gate_challenges, multivariate_d);

        std::vector<FF> multivariate_challenge;
        multivariate_challenge.reserve(multivariate_d);
        // In the first round, we compute the first univariate polynomial and populate the book-keeping table of
        // #partially_evaluated_polynomials, which has \f$ n/2 \f$ rows and \f$ N \f$ columns. When the Flavor has ZK,
        // compute_univariate also takes into account the zk_sumcheck_data.
        auto round_univariate = round.compute_univariate(full_polynomials, relation_parameters, gate_separators, alpha);
        vinfo("starting sumcheck rounds...");
        {

            PROFILE_THIS_NAME("rest of sumcheck round 1");

            // Place the evaluations of the round univariate into transcript.
            transcript->send_to_verifier("Sumcheck:univariate_0", round_univariate);
            FF round_challenge = transcript->template get_challenge<FF>("Sumcheck:u_0");
            multivariate_challenge.emplace_back(round_challenge);
            // Prepare sumcheck book-keeping table for the next round
            partially_evaluate(full_polynomials, multivariate_n, round_challenge);
            gate_separators.partially_evaluate(round_challenge);
            round.round_size = round.round_size >> 1; // TODO(#224)(Cody): Maybe partially_evaluate should do this and
                                                      // release memory?        // All but final round
                                                      // We operate on partially_evaluated_polynomials in place.
        }
        for (size_t round_idx = 1; round_idx < multivariate_d; round_idx++) {

            PROFILE_THIS_NAME("sumcheck loop");

            // Write the round univariate to the transcript
            round_univariate =
                round.compute_univariate(partially_evaluated_polynomials, relation_parameters, gate_separators, alpha);
            // Place evaluations of Sumcheck Round Univariate in the transcript
            transcript->send_to_verifier("Sumcheck:univariate_" + std::to_string(round_idx), round_univariate);
            FF round_challenge = transcript->template get_challenge<FF>("Sumcheck:u_" + std::to_string(round_idx));
            multivariate_challenge.emplace_back(round_challenge);
            // Prepare sumcheck book-keeping table for the next round
            partially_evaluate(partially_evaluated_polynomials, round.round_size, round_challenge);
            gate_separators.partially_evaluate(round_challenge);
            round.round_size = round.round_size >> 1;
        }
        vinfo("completed ", multivariate_d, " rounds of sumcheck");

        // Zero univariates are used to pad the proof to the fixed size CONST_PROOF_SIZE_LOG_N.
        auto zero_univariate = bb::Univariate<FF, Flavor::BATCHED_RELATION_PARTIAL_LENGTH>::zero();
        for (size_t idx = multivariate_d; idx < CONST_PROOF_SIZE_LOG_N; idx++) {
            transcript->send_to_verifier("Sumcheck:univariate_" + std::to_string(idx), zero_univariate);
            FF round_challenge = transcript->template get_challenge<FF>("Sumcheck:u_" + std::to_string(idx));
            multivariate_challenge.emplace_back(round_challenge);
        }
        // Claimed evaluations of Prover polynomials are extracted and added to the transcript. When Flavor has ZK, the
        // evaluations of all witnesses are masked.
        ClaimedEvaluations multivariate_evaluations;
        multivariate_evaluations = extract_claimed_evaluations(partially_evaluated_polynomials);
        transcript->send_to_verifier("Sumcheck:evaluations", multivariate_evaluations.get_all());
        // For ZK Flavors: the evaluations of Libra univariates are included in the Sumcheck Output

        return SumcheckOutput<Flavor>{ .challenge = multivariate_challenge,
                                       .claimed_evaluations = multivariate_evaluations };
        vinfo("finished sumcheck");
    };

    /**
     * @brief ZK-version of `prove` that runs Sumcheck with disabled rows and masking of Round Univariates.
     * The masking is ensured by adding random Libra univariates to the Sumcheck round univariates.
     *
     * @param full_polynomials
     * @param relation_parameters
     * @param alpha
     * @param gate_challenges
     * @param zk_sumcheck_data
     * @return SumcheckOutput<Flavor>
     */
    SumcheckOutput<Flavor> prove(ProverPolynomials& full_polynomials,
                                 const bb::RelationParameters<FF>& relation_parameters,
                                 const RelationSeparator alpha,
                                 const std::vector<FF>& gate_challenges,
                                 ZKData& zk_sumcheck_data)
        requires Flavor::HasZK
    {
        std::shared_ptr<CommitmentKey> ck = nullptr;

        if constexpr (IS_ECCVM) {
            ck = std::make_shared<CommitmentKey>(BATCHED_RELATION_PARTIAL_LENGTH);
        }

        bb::GateSeparatorPolynomial<FF> gate_separators(gate_challenges, multivariate_d);

        std::vector<FF> multivariate_challenge;
        multivariate_challenge.reserve(multivariate_d);
        size_t round_idx = 0;
        RowDisablingPolynomial<FF> row_disabling_polynomial;
        // In the first round, we compute the first univariate polynomial and populate the book-keeping table of
        // #partially_evaluated_polynomials, which has \f$ n/2 \f$ rows and \f$ N \f$ columns. When the Flavor has ZK,
        // compute_univariate also takes into account the zk_sumcheck_data.
        auto round_univariate = round.compute_univariate(round_idx,
                                                         full_polynomials,
                                                         relation_parameters,
                                                         gate_separators,
                                                         alpha,
                                                         zk_sumcheck_data,
                                                         row_disabling_polynomial);
        vinfo("starting sumcheck rounds...");
        {

            PROFILE_THIS_NAME("rest of sumcheck round 1");

            if constexpr (!IS_ECCVM) {
                // Place the evaluations of the round univariate into transcript.
                transcript->send_to_verifier("Sumcheck:univariate_0", round_univariate);
            } else {
                // Compute the vector {0, 1, \ldots, BATCHED_RELATION_PARTIAL_LENGTH-1} needed to transform the round
                // univariates from Lagrange to monomial basis
                for (size_t idx = 0; idx < BATCHED_RELATION_PARTIAL_LENGTH; idx++) {
                    eval_domain.push_back(FF(idx));
                }

                // Compute monomial coefficients of the round univariate, commit to it, populate an auxiliary structure
                // needed in the PCS round
                commit_to_round_univariate(
                    round_idx, round_univariate, eval_domain, transcript, ck, round_univariates, round_evaluations);
            }

            const FF round_challenge = transcript->template get_challenge<FF>("Sumcheck:u_0");

            multivariate_challenge.emplace_back(round_challenge);
            // Prepare sumcheck book-keeping table for the next round
            partially_evaluate(full_polynomials, multivariate_n, round_challenge);
            // Prepare ZK Sumcheck data for the next round
            zk_sumcheck_data.update_zk_sumcheck_data(round_challenge, round_idx);
            row_disabling_polynomial.update_evaluations(round_challenge, round_idx);
            gate_separators.partially_evaluate(round_challenge);
            round.round_size = round.round_size >> 1; // TODO(#224)(Cody): Maybe partially_evaluate should do this and
                                                      // release memory?        // All but final round
                                                      // We operate on partially_evaluated_polynomials in place.
        }
        for (size_t round_idx = 1; round_idx < multivariate_d; round_idx++) {

            PROFILE_THIS_NAME("sumcheck loop");

            // Write the round univariate to the transcript
            round_univariate = round.compute_univariate(round_idx,
                                                        partially_evaluated_polynomials,
                                                        relation_parameters,
                                                        gate_separators,
                                                        alpha,
                                                        zk_sumcheck_data,
                                                        row_disabling_polynomial);
            if constexpr (!IS_ECCVM) {
                // Place evaluations of Sumcheck Round Univariate in the transcript
                transcript->send_to_verifier("Sumcheck:univariate_" + std::to_string(round_idx), round_univariate);
            } else {

                // Compute monomial coefficients of the round univariate, commit to it, populate an auxiliary structure
                // needed in the PCS round
                commit_to_round_univariate(
                    round_idx, round_univariate, eval_domain, transcript, ck, round_univariates, round_evaluations);
            }
            const FF round_challenge =
                transcript->template get_challenge<FF>("Sumcheck:u_" + std::to_string(round_idx));
            multivariate_challenge.emplace_back(round_challenge);
            // Prepare sumcheck book-keeping table for the next round
            partially_evaluate(partially_evaluated_polynomials, round.round_size, round_challenge);
            // Prepare evaluation masking and libra structures for the next round (for ZK Flavors)
            zk_sumcheck_data.update_zk_sumcheck_data(round_challenge, round_idx);
            row_disabling_polynomial.update_evaluations(round_challenge, round_idx);

            gate_separators.partially_evaluate(round_challenge);
            round.round_size = round.round_size >> 1;
        }

        if constexpr (IS_ECCVM) {
            round_evaluations[multivariate_d - 1][2] =
                round_univariate.evaluate(multivariate_challenge[multivariate_d - 1]);
        }
        vinfo("completed ", multivariate_d, " rounds of sumcheck");

        // Zero univariates are used to pad the proof to the fixed size CONST_PROOF_SIZE_LOG_N.
        auto zero_univariate = bb::Univariate<FF, Flavor::BATCHED_RELATION_PARTIAL_LENGTH>::zero();
        for (size_t idx = multivariate_d; idx < CONST_PROOF_SIZE_LOG_N; idx++) {
            if constexpr (!IS_ECCVM) {
                transcript->send_to_verifier("Sumcheck:univariate_" + std::to_string(idx), zero_univariate);
            } else {
                transcript->send_to_verifier("Sumcheck:univariate_comm_" + std::to_string(idx),
                                             ck->commit(Polynomial<FF>(std::span(zero_univariate))));
                transcript->send_to_verifier("Sumcheck:univariate_" + std::to_string(idx) + "_eval_0", FF(0));
                transcript->send_to_verifier("Sumcheck:univariate_" + std::to_string(idx) + "_eval_1", FF(0));
            }
            FF round_challenge = transcript->template get_challenge<FF>("Sumcheck:u_" + std::to_string(idx));
            multivariate_challenge.emplace_back(round_challenge);
        }

        // Claimed evaluations of Prover polynomials are extracted and added to the transcript. When Flavor has ZK, the
        // evaluations of all witnesses are masked.
        ClaimedEvaluations multivariate_evaluations;
        multivariate_evaluations = extract_claimed_evaluations(partially_evaluated_polynomials);
        transcript->send_to_verifier("Sumcheck:evaluations", multivariate_evaluations.get_all());

        // The evaluations of Libra uninvariates at \f$ g_0(u_0), \ldots, g_{d-1} (u_{d-1}) \f$ are added to the
        // transcript.
        FF libra_evaluation{ 0 };
        for (const auto& libra_eval : zk_sumcheck_data.libra_evaluations) {
            libra_evaluation += libra_eval;
        }
        libra_evaluation += zk_sumcheck_data.constant_term;
        transcript->send_to_verifier("Libra:claimed_evaluation", libra_evaluation);

        // The sum of the Libra constant term and the evaluations of Libra univariates at corresponding sumcheck
        // challenges is included in the Sumcheck Output
        if constexpr (!IS_ECCVM) {
            return SumcheckOutput<Flavor>{ .challenge = multivariate_challenge,
                                           .claimed_evaluations = multivariate_evaluations,
                                           .claimed_libra_evaluation = libra_evaluation };
        } else {
            return SumcheckOutput<Flavor>{ .challenge = multivariate_challenge,
                                           .claimed_evaluations = multivariate_evaluations,
                                           .claimed_libra_evaluation = libra_evaluation,
                                           .round_univariates = round_univariates,
                                           .round_univariate_evaluations = round_evaluations };
        }
        vinfo("finished sumcheck");
    };

    /**
     *
     @brief Evaluate Honk polynomials at the round challenge and prepare class for next round.
     @details At initialization, \ref ProverPolynomials "Prover Polynomials"
     are submitted by reference into \p full_polynomials, which is a two-dimensional array defined as \f{align}{
    \texttt{full_polynomials}_{i,j} = P_j(\vec i). \f} Here, \f$ \vec i \in \{0,1\}^d \f$ is identified with the binary
    representation of the integer \f$ 0 \leq i \leq 2^d-1 \f$.

     * When the first challenge \f$ u_0 \f$ is computed, the method \ref partially_evaluate "partially evaluate" takes
    as input \p full_polynomials and populates  \ref partially_evaluated_polynomials "a new book-keeping table" denoted
    \f$\texttt{partially_evaluated_polynomials}\f$. Its \f$ n/2 = 2^{d-1} \f$ rows represent the evaluations  \f$
    P_i(u_0, X_1, ..., X_{d-1}) \f$, which are multilinear polynomials in \f$ d-1 \f$ variables.
     * More precisely, it is a table  \f$ 2^{d-1} \f$ rows and \f$ N \f$ columns, such that
    \f{align}{ \texttt{partially_evaluated_polynomials}_{i,j} = &\ P_j(0, i_1,\ldots, i_{d-1}) + u_0 \cdot (P_j(1,
    i_1,\ldots, i_{d-1})) - P_j(0, i_1,\ldots, i_{d-1})) \\ = &\ \texttt{full_polynomials}_{2 i,j} + u_0 \cdot
    (\texttt{full_polynomials}_{2i+1,j} - \texttt{full_polynomials}_{2 i,j}) \f}
     * We elude copying all of the polynomial-defining data by only populating \ref partially_evaluated_polynomials
    after the first round.

     * In Round \f$0<i\leq d-1\f$, this method takes the challenge \f$ u_{i} \f$ and rewrites the first \f$ 2^{d-i-1}
    \f$ rows in the \f$ \texttt{partially_evaluated_polynomials} \f$ table with the values
     * \f{align}{
        \texttt{partially_evaluated_polynomials}_{\ell,j} \gets &\
         P_j\left(u_0,\ldots, u_{i}, \vec \ell \right)    \\
       = &\ P_j\left(u_0,\ldots, u_{i-1}, 0,  \vec \ell \right) + u_{i} \cdot \left( P_j\left(u_0, \ldots, u_{i-1}, 1,
    \vec \ell ) - P_j(u_0,\ldots, u_{i-1}, 0,  \vec \ell \right)\right)  \\ =
    &\ \texttt{partially_evaluated_polynomials}_{2 \ell,j}  + u_{i} \cdot (\texttt{partially_evaluated_polynomials}_{2
    \ell+1,j} - \texttt{partially_evaluated_polynomials}_{2\ell,j}) \f} where \f$\vec \ell \in \{0,1\}^{d-1-i}\f$.
     * After the final update, i.e. when \f$ i = d-1 \f$, the upper row of the table contains the evaluations of Honk
     * polynomials at the challenge point \f$ (u_0,\ldots, u_{d-1}) \f$.
     * @param polynomials Honk polynomials at initialization; partially evaluated polynomials in subsequent rounds
     * @param round_size \f$2^{d-i}\f$
     * @param round_challenge \f$u_i\f$
     */
    void partially_evaluate(auto& polynomials, size_t round_size, FF round_challenge)
    {
        auto pep_view = partially_evaluated_polynomials.get_all();
        auto poly_view = polynomials.get_all();
        // after the first round, operate in place on partially_evaluated_polynomials
        parallel_for(poly_view.size(), [&](size_t j) {
            for (size_t i = 0; i < round_size; i += 2) {
                pep_view[j].at(i >> 1) = poly_view[j][i] + round_challenge * (poly_view[j][i + 1] - poly_view[j][i]);
            }
        });
    };
    /**
     * @brief Evaluate at the round challenge and prepare class for next round.
     * Specialization for array, see \ref bb::SumcheckProver<Flavor>::partially_evaluate "generic version".
     */
    template <typename PolynomialT, std::size_t N>
    void partially_evaluate(std::array<PolynomialT, N>& polynomials, size_t round_size, FF round_challenge)
    {
        auto pep_view = partially_evaluated_polynomials.get_all();
        // after the first round, operate in place on partially_evaluated_polynomials
        parallel_for(polynomials.size(), [&](size_t j) {
            for (size_t i = 0; i < round_size; i += 2) {
                pep_view[j].at(i >> 1) =
                    polynomials[j][i] + round_challenge * (polynomials[j][i + 1] - polynomials[j][i]);
            }
        });
    };

    /**
    * @brief This method takes the book-keeping table containing partially evaluated prover polynomials and creates a
    * vector containing the evaluations of all prover polynomials at the point \f$ (u_0, \ldots, u_{d-1} )\f$.
    * For ZK Flavors: this method takes the book-keeping table containing partially evaluated prover polynomials
and creates a vector containing the evaluations of all witness polynomials at the point \f$ (u_0, \ldots, u_{d-1} )\f$
masked by the terms \f$ \texttt{eval_masking_scalars}_j\cdot \sum u_i(1-u_i)\f$ and the evaluations of all non-witness
polynomials that are sent in clear.
    *
    * @param partially_evaluated_polynomials
    * @param multivariate_evaluations
    */
    ClaimedEvaluations extract_claimed_evaluations(PartiallyEvaluatedMultivariates& partially_evaluated_polynomials)
    {
        ClaimedEvaluations multivariate_evaluations;
        for (auto [eval, poly] :
             zip_view(multivariate_evaluations.get_all(), partially_evaluated_polynomials.get_all())) {
            eval = poly[0];
        };
        return multivariate_evaluations;
    };

    /**
     * @brief  Compute monomial coefficients of the round univariate, commit to it, populate an auxiliary structure
     * needed in the PCS round
     *
     * @param round_idx
     * @param round_univariate Sumcheck Round Univariate
     * @param eval_domain {0, 1, ... , BATCHED_RELATION_PARTIAL_LENGTH-1}
     * @param transcript
     * @param ck Commitment key of size BATCHED_RELATION_PARTIAL_LENGTH
     * @param round_univariates Auxiliary container to be fed to Shplemini
     * @param round_univariate_evaluations  Auxiliary container to be fed to Shplemini
     */
    void commit_to_round_univariate(const size_t round_idx,
                                    bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH>& round_univariate,
                                    const std::vector<FF>& eval_domain,
                                    const std::shared_ptr<Transcript>& transcript,
                                    const std::shared_ptr<CommitmentKey>& ck,
                                    std::vector<bb::Polynomial<FF>>& round_univariates,
                                    std::vector<std::array<FF, 3>>& round_univariate_evaluations)
    {

        const std::string idx = std::to_string(round_idx);

        // Transform to monomial form and commit to it
        Polynomial<FF> round_poly_monomial =
            Polynomial<FF>(eval_domain, std::span<FF>(round_univariate.evaluations), BATCHED_RELATION_PARTIAL_LENGTH);
        transcript->send_to_verifier("Sumcheck:univariate_comm_" + idx, ck->commit(round_poly_monomial));

        // Store round univariate in monomial, as it is required by Shplemini
        round_univariates.push_back(std::move(round_poly_monomial));

        // Send the evaluations of the round univariate at 0 and 1
        transcript->send_to_verifier("Sumcheck:univariate_" + idx + "_eval_0", round_univariate.value_at(0));
        transcript->send_to_verifier("Sumcheck:univariate_" + idx + "_eval_1", round_univariate.value_at(1));

        // Store the evaluations to be used by ShpleminiProver.
        round_univariate_evaluations.push_back({ round_univariate.value_at(0), round_univariate.value_at(1), FF(0) });
        if (round_idx > 0) {
            round_univariate_evaluations[round_idx - 1][2] =
                round_univariate.value_at(0) + round_univariate.value_at(1);
        };
    }
};
/*! \brief Implementation of the sumcheck Verifier for statements of the form \f$\sum_{\vec \ell \in \{0,1\}^d}
 pow_{\beta}(\vec \ell) \cdot F \left(P_1(\vec \ell),\ldots, P_N(\vec \ell) \right)  = 0 \f$ for multilinear
 polynomials \f$P_1, \ldots, P_N \f$.
 *
  \class SumcheckVerifier
  \details
 * Init:
 * - Claimed Sumcheck sum: \f$\quad \sigma_{ 0 } \gets 0 \f$
 *
 * For \f$ i = 0,\ldots, d-1\f$:
 * - Extract Round Univariate's \f$\tilde{F}\f$ evaluations at \f$0,\ldots, D \f$ from the transcript using \ref
 bb::BaseTranscript::receive_from_prover "receive_from_prover" method from \ref bb::BaseTranscript< TranscriptParams >
 "Base Transcript Class".
 * - \ref bb::SumcheckVerifierRound< Flavor >::check_sum "Check target sum": \f$\quad \sigma_{
 i } \stackrel{?}{=}  \tilde{S}^i(0) + \tilde{S}^i(1)  \f$
 * - Compute the challenge \f$u_i\f$ from the transcript using \ref bb::BaseTranscript::get_challenge "get_challenge"
 method.
 * - \ref bb::SumcheckVerifierRound< Flavor >::compute_next_target_sum "Compute next target sum" :\f$ \quad \sigma_{i+1}
 \gets \tilde{S}^i(u_i) \f$
 * ### Verifier's Data before Final Step
 * Entering the final round, the Verifier has already checked that \f$\quad \sigma_{ d-1 } = \tilde{S}^{d-2}(u_{d-2})
 \stackrel{?}{=}  \tilde{S}^{d-1}(0) + \tilde{S}^{d-1}(1)  \f$ and computed \f$\sigma_d = \tilde{S}^{d-1}(u_{d-1})\f$.
 * ### Final Verification Step
 * - Extract \ref ClaimedEvaluations of prover polynomials \f$P_1,\ldots, P_N\f$ at the challenge point \f$
 (u_0,\ldots,u_{d-1}) \f$ from the transcript and \ref bb::SumcheckVerifierRound< Flavor
 >::compute_full_relation_purported_value "compute evaluation:"
 \f{align}{\tilde{F}\left( P_1(u_0,\ldots, u_{d-1}), \ldots, P_N(u_0,\ldots, u_{d-1}) \right)\f}
 and store it at \f$ \texttt{full_honk_relation_purported_value} \f$.
 * - Compare \f$ \sigma_d \f$ against the evaluation of \f$ \tilde{F} \f$ at \f$P_1(u_0,\ldots, u_{d-1}), \ldots,
 P_N(u_0,\ldots, u_{d-1})\f$:
 * \f{align}{\quad  \sigma_{ d } \stackrel{?}{=} \tilde{F}\left(P_1(u_{0}, \ldots, u_{d-1}),\ldots, P_N(u_0,\ldots,
 u_{d-1})\right)\f}

  \snippet cpp/src/barretenberg/sumcheck/sumcheck.hpp Final Verification Step

 */
template <typename Flavor> class SumcheckVerifier {

  public:
    using Utils = bb::RelationUtils<Flavor>;
    using FF = typename Flavor::FF;
    /**
     * @brief Container type for the evaluations of Prover Polynomials \f$P_1,\ldots,P_N\f$ at the challenge point
     * \f$(u_0,\ldots, u_{d-1}) \f$.
     *
     */
    using ClaimedEvaluations = typename Flavor::AllValues;
    // For ZK Flavors: the verifier obtains a vector of evaluations of \f$ d \f$ univariate polynomials and uses them to
    // compute full_honk_relation_purported_value
    using ClaimedLibraEvaluations = typename std::vector<FF>;
    using Transcript = typename Flavor::Transcript;
    using RelationSeparator = typename Flavor::RelationSeparator;
    using Commitment = typename Flavor::Commitment;

    /**
     * @brief Maximum partial algebraic degree of the relation  \f$\tilde F = pow_{\beta} \cdot F \f$, i.e. \ref
     * MAX_PARTIAL_RELATION_LENGTH "MAX_PARTIAL_RELATION_LENGTH + 1".
     */
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = Flavor::BATCHED_RELATION_PARTIAL_LENGTH;
    /**
     * @brief The number of Prover Polynomials \f$ P_1, \ldots, P_N \f$ specified by the Flavor.
     *
     */
    static constexpr size_t NUM_POLYNOMIALS = Flavor::NUM_ALL_ENTITIES;
    /**
     * @brief Number of variables in Prover Polynomials.
     *
     */
    const size_t multivariate_d;

    std::shared_ptr<Transcript> transcript;
    SumcheckVerifierRound<Flavor> round;
    FF libra_evaluation{ 0 };
    FF libra_challenge;
    FF libra_total_sum;

    std::vector<Commitment> round_univariate_commitments = {};
    std::vector<std::array<FF, 3>> round_univariate_evaluations = {};

    // Verifier instantiates sumcheck with circuit size, optionally a different target sum than 0 can be specified.
    explicit SumcheckVerifier(size_t multivariate_d, std::shared_ptr<Transcript> transcript, FF target_sum = 0)
        : multivariate_d(multivariate_d)
        , transcript(transcript)
        , round(target_sum){};
    /**
     * @brief Extract round univariate, check sum, generate challenge, compute next target sum..., repeat until
     * final round, then use purported evaluations to generate purported full Honk relation value and check against
     * final target sum.
     *
     * @details If verification fails, returns std::nullopt, otherwise returns SumcheckOutput
     * @param relation_parameters
     * @param transcript
     */
    SumcheckOutput<Flavor> verify(const bb::RelationParameters<FF>& relation_parameters,
                                  RelationSeparator alpha,
                                  const std::vector<FF>& gate_challenges)
    {
        bool verified(true);

        bb::GateSeparatorPolynomial<FF> gate_separators(gate_challenges);
        // All but final round.
        // target_total_sum is initialized to zero then mutated in place.

        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1144): Add proper constraints for taking the log of
        // a field_t link multivariate_d.
        if (multivariate_d == 0) {
            throw_or_abort("Number of variables in multivariate is 0.");
        }

        bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH> round_univariate;

        if constexpr (Flavor::HasZK) {
            // If running zero-knowledge sumcheck the target total sum is corrected by the claimed sum of libra masking
            // multivariate over the hypercube
            libra_total_sum = transcript->template receive_from_prover<FF>("Libra:Sum");
            libra_challenge = transcript->template get_challenge<FF>("Libra:Challenge");
            round.target_total_sum += libra_total_sum * libra_challenge;
        }

        std::vector<FF> multivariate_challenge;
        multivariate_challenge.reserve(multivariate_d);
        for (size_t round_idx = 0; round_idx < CONST_PROOF_SIZE_LOG_N; round_idx++) {
            // Obtain the round univariate from the transcript
            std::string round_univariate_label = "Sumcheck:univariate_" + std::to_string(round_idx);
            round_univariate =
                transcript->template receive_from_prover<bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH>>(
                    round_univariate_label);
            FF round_challenge = transcript->template get_challenge<FF>("Sumcheck:u_" + std::to_string(round_idx));
            multivariate_challenge.emplace_back(round_challenge);

            if constexpr (IsRecursiveFlavor<Flavor>) {
                typename Flavor::CircuitBuilder* builder = round_challenge.get_context();
                // TODO(https://github.com/AztecProtocol/barretenberg/issues/1114): insecure dummy_round derivation!
                stdlib::bool_t dummy_round = stdlib::witness_t(builder, round_idx >= multivariate_d);
                bool checked = round.check_sum(round_univariate, dummy_round);
                // Only utilize the checked value if this is not a constant proof size padding round
                if (round_idx < multivariate_d) {
                    verified = verified && checked;
                }

                round.compute_next_target_sum(round_univariate, round_challenge, dummy_round);
                gate_separators.partially_evaluate(round_challenge, dummy_round);

            } else {
                if (round_idx < multivariate_d) {
                    bool checked = round.check_sum(round_univariate);
                    verified = verified && checked;
                    round.compute_next_target_sum(round_univariate, round_challenge);
                    gate_separators.partially_evaluate(round_challenge);
                }
            }
        }
        // Extract claimed evaluations of Libra univariates and compute their sum multiplied by the Libra challenge
        // Final round
        ClaimedEvaluations purported_evaluations;
        auto transcript_evaluations =
            transcript->template receive_from_prover<std::array<FF, NUM_POLYNOMIALS>>("Sumcheck:evaluations");
        for (auto [eval, transcript_eval] : zip_view(purported_evaluations.get_all(), transcript_evaluations)) {
            eval = transcript_eval;
        }

        // Evaluate the Honk relation at the point (u_0, ..., u_{d-1}) using claimed evaluations of prover polynomials.
        // In ZK Flavors, the evaluation is corrected by full_libra_purported_value
        FF full_honk_purported_value = round.compute_full_relation_purported_value(
            purported_evaluations, relation_parameters, gate_separators, alpha);

        // For ZK Flavors: the evaluation of the Row Disabling Polynomial at the sumcheck challenge
        if constexpr (Flavor::HasZK) {
            libra_evaluation = transcript->template receive_from_prover<FF>("Libra:claimed_evaluation");
            FF correcting_factor =
                RowDisablingPolynomial<FF>::evaluate_at_challenge(multivariate_challenge, multivariate_d);
            full_honk_purported_value =
                full_honk_purported_value * correcting_factor + libra_evaluation * libra_challenge;
        }

        //! [Final Verification Step]
        if constexpr (IsRecursiveFlavor<Flavor>) {
            verified = verified && (full_honk_purported_value.get_value() == round.target_total_sum.get_value());
        } else {
            verified = verified && (full_honk_purported_value == round.target_total_sum);
        }

        return SumcheckOutput<Flavor>{ .challenge = multivariate_challenge,
                                       .claimed_evaluations = purported_evaluations,
                                       .verified = verified,
                                       .claimed_libra_evaluation = libra_evaluation };
    };

    /**
     * @brief Sumcheck Verifier for ECCVM and ECCVMRecursive.
     * @details The verifier receives commitments to RoundUnivariates, along with their evaluations at 0 and 1. These
     * evaluations will be proved as a part of Shplemini. The only check that the Verifier performs in this version is
     * the comparison of the target sumcheck sum with the claimed evaluations of the first sumcheck round univariate at
     * 0 and 1.
     *
     * Note that the SumcheckOutput in this case contains a vector of commitments and a vector of arrays (of size 3) of
     * evaluations at 0, 1, and a round challenge.
     *
     * @param relation_parameters
     * @param alpha
     * @param gate_challenges
     * @return SumcheckOutput<Flavor>
     */
    SumcheckOutput<Flavor> verify(const bb::RelationParameters<FF>& relation_parameters,
                                  RelationSeparator alpha,
                                  const std::vector<FF>& gate_challenges)
        requires std::is_same_v<Flavor, ECCVMFlavor> || IsECCVMRecursiveFlavor<Flavor>
    {
        bool verified(false);

        bb::GateSeparatorPolynomial<FF> gate_separators(gate_challenges);

        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1144): Add proper constraints for taking the log of
        // a field_t link multivariate_d.
        if (multivariate_d == 0) {
            throw_or_abort("Number of variables in multivariate is 0.");
        }

        // get the claimed sum of libra masking multivariate over the hypercube
        libra_total_sum = transcript->template receive_from_prover<FF>("Libra:Sum");
        // get the challenge for the ZK Sumcheck claim
        const FF libra_challenge = transcript->template get_challenge<FF>("Libra:Challenge");

        std::vector<FF> multivariate_challenge;
        multivariate_challenge.reserve(CONST_PROOF_SIZE_LOG_N);
        // if Flavor has ZK, the target total sum is corrected by Libra total sum multiplied by the Libra
        // challenge
        round.target_total_sum += libra_total_sum * libra_challenge;

        for (size_t round_idx = 0; round_idx < CONST_PROOF_SIZE_LOG_N; round_idx++) {
            // Obtain the round univariate from the transcript
            const std::string round_univariate_comm_label = "Sumcheck:univariate_comm_" + std::to_string(round_idx);
            const std::string univariate_eval_label_0 = "Sumcheck:univariate_" + std::to_string(round_idx) + "_eval_0";
            const std::string univariate_eval_label_1 = "Sumcheck:univariate_" + std::to_string(round_idx) + "_eval_1";

            // Receive the commitment to the round univariate
            round_univariate_commitments.push_back(
                transcript->template receive_from_prover<Commitment>(round_univariate_comm_label));
            // Receive evals at 0 and 1
            round_univariate_evaluations.push_back(
                { transcript->template receive_from_prover<FF>(univariate_eval_label_0),
                  transcript->template receive_from_prover<FF>(univariate_eval_label_1) });

            const FF round_challenge =
                transcript->template get_challenge<FF>("Sumcheck:u_" + std::to_string(round_idx));
            multivariate_challenge.emplace_back(round_challenge);

            if constexpr (IsRecursiveFlavor<Flavor>) {
                typename Flavor::CircuitBuilder* builder = round_challenge.get_context();
                // TODO(https://github.com/AztecProtocol/barretenberg/issues/1114): insecure dummy_round derivation!
                stdlib::bool_t dummy_round = stdlib::witness_t(builder, round_idx >= multivariate_d);
                // Only utilize the checked value if this is not a constant proof size padding round
                gate_separators.partially_evaluate(round_challenge, dummy_round);

            } else {
                if (round_idx < multivariate_d) {
                    gate_separators.partially_evaluate(round_challenge);
                }
            }
        }

        FF first_sumcheck_round_evaluations_sum =
            round_univariate_evaluations[0][0] + round_univariate_evaluations[0][1];

        // Populate claimed evaluations at the challenge
        ClaimedEvaluations purported_evaluations;
        auto transcript_evaluations =
            transcript->template receive_from_prover<std::array<FF, NUM_POLYNOMIALS>>("Sumcheck:evaluations");
        for (auto [eval, transcript_eval] : zip_view(purported_evaluations.get_all(), transcript_evaluations)) {
            eval = transcript_eval;
        }
        // For ZK Flavors: the evaluation of the Row Disabling Polynomial at the sumcheck challenge
        // Evaluate the Honk relation at the point (u_0, ..., u_{d-1}) using claimed evaluations of prover polynomials.
        // In ZK Flavors, the evaluation is corrected by full_libra_purported_value
        FF full_honk_purported_value = round.compute_full_relation_purported_value(
            purported_evaluations, relation_parameters, gate_separators, alpha);

        // Extract claimed evaluations of Libra univariates and compute their sum multiplied by the Libra challenge
        const FF libra_evaluation = transcript->template receive_from_prover<FF>("Libra:claimed_evaluation");

        // We have to branch here for two reasons:
        // 1) need to make the vk constant
        // 2) ECCVMRecursive uses big_field where we need to self_reduce().
        if constexpr (IsRecursiveFlavor<Flavor>) {
            typename Flavor::CircuitBuilder* builder = libra_challenge.get_context();

            // Compute the evaluations of the polynomial (1 - \sum L_i) where the sum is for i corresponding to the rows
            // where all sumcheck relations are disabled
            const FF correcting_factor =
                RowDisablingPolynomial<FF>::evaluate_at_challenge(multivariate_challenge, multivariate_d, builder);

            // Verifier computes full ZK Honk value, taking into account the contribution from the disabled row and the
            // Libra polynomials
            full_honk_purported_value =
                full_honk_purported_value * correcting_factor + libra_evaluation * libra_challenge;

            // TODO(https://github.com/AztecProtocol/barretenberg/issues/1197)
            full_honk_purported_value.self_reduce();

            // Populate claimed evaluations of Sumcheck Round Unviariates at the round challenges. These will be
            // checked as a part of Shplemini and pad claimed evaluations to the CONST_PROOF_SIZE_LOG_N
            for (size_t round_idx = 1; round_idx < CONST_PROOF_SIZE_LOG_N; round_idx++) {
                // TODO(https://github.com/AztecProtocol/barretenberg/issues/1114): insecure dummy_round derivation!
                stdlib::bool_t dummy_round = stdlib::witness_t(builder, round_idx >= multivariate_d);
                round_univariate_evaluations[round_idx - 1][2] = FF::conditional_assign(
                    dummy_round,
                    full_honk_purported_value,
                    round_univariate_evaluations[round_idx][0] + round_univariate_evaluations[round_idx][1]);
            };

            first_sumcheck_round_evaluations_sum.self_reduce();
            round.target_total_sum.self_reduce();

            // Ensure that the sum of the evaluations of the first Sumcheck Round Univariate is equal to the claimed
            // target total sum
            first_sumcheck_round_evaluations_sum.assert_equal(round.target_total_sum);
            verified = (first_sumcheck_round_evaluations_sum.get_value() == round.target_total_sum.get_value());
        } else {
            // Compute the evaluations of the polynomial (1 - \sum L_i) where the sum is for i corresponding to the rows
            // where all sumcheck relations are disabled
            const FF correcting_factor =
                RowDisablingPolynomial<FF>::evaluate_at_challenge(multivariate_challenge, multivariate_d);

            // Verifier computes full ZK Honk value, taking into account the contribution from the disabled row and the
            // Libra polynomials
            full_honk_purported_value =
                full_honk_purported_value * correcting_factor + libra_evaluation * libra_challenge;

            // Populate claimed evaluations of Sumcheck Round Unviariates at the round challenges. These will be checked
            // as a part of Shplemini
            for (size_t round_idx = 1; round_idx < multivariate_d; round_idx++) {
                round_univariate_evaluations[round_idx - 1][2] =
                    round_univariate_evaluations[round_idx][0] + round_univariate_evaluations[round_idx][1];
            };

            // Pad claimed evaluations to the CONST_PROOF_SIZE_LOG_N
            for (size_t round_idx = multivariate_d; round_idx < CONST_PROOF_SIZE_LOG_N; round_idx++) {
                round_univariate_evaluations[round_idx - 1][2] = full_honk_purported_value;
            };

            // Ensure that the sum of the evaluations of the first Sumcheck Round Univariate is equal to the claimed
            // target total sum
            verified = (first_sumcheck_round_evaluations_sum == round.target_total_sum);
        }

        //! [Final Verification Step]
        // For ZK Flavors: the evaluations of Libra univariates are included in the Sumcheck Output
        return SumcheckOutput<Flavor>{ .challenge = multivariate_challenge,
                                       .claimed_evaluations = purported_evaluations,
                                       .verified = verified,
                                       .claimed_libra_evaluation = libra_evaluation,
                                       .round_univariate_commitments = round_univariate_commitments,
                                       .round_univariate_evaluations = round_univariate_evaluations };
    };
};

} // namespace bb
