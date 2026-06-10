// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================
#pragma once

#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/common/ref_array.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/partially_evaluated_multivariates.hpp"
#include "barretenberg/multilinear_batching/multilinear_batching_claims.hpp"
#include "barretenberg/polynomials/eq_polynomial.hpp"
#include "barretenberg/relations/multilinear_batching/multilinear_batching_relation.hpp"
#include "barretenberg/relations/relation_tuple_helpers.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/transcript/transcript.hpp"

#include <array>

namespace bb {

template <typename FF, typename Polynomial, size_t NumClaims> struct MultilinearBatchingProverPolynomials;

/**
 * @brief Native flavor for multilinear batching sumcheck with NumClaims polynomials.
 */
template <size_t NumClaims> class MultilinearBatchingFlavor_ {
  public:
    using Curve = curve::BN254;
    using FF = Curve::ScalarField;
    using GroupElement = Curve::Element;
    using Commitment = Curve::AffineElement;
    using PCS = KZG<Curve>;
    using Polynomial = bb::Polynomial<FF>;
    using CommitmentKey = bb::CommitmentKey<Curve>;
    using VerifierCommitmentKey = bb::VerifierCommitmentKey<Curve>;
    using Transcript = NativeTranscript;
    using Codec = FrCodec;

    // The number of claims batched using this flavor
    static constexpr size_t NUM_CLAIMS = NumClaims;
    // An upper bound on the size of the MultilinearBatching-circuits. `CONST_FOLDING_LOG_N` bounds the log circuit
    // sizes in the Chonk context.
    static constexpr size_t VIRTUAL_LOG_N = CONST_FOLDING_LOG_N;
    static constexpr bool USE_SHORT_MONOMIALS = false;
    static constexpr bool HasZK = false;
    static constexpr size_t TRACE_OFFSET = 0;
    // To achieve fixed proof size and that the recursive verifier circuit is constant, we are using padding in Sumcheck
    // and Shplemini
    static constexpr bool USE_PADDING = true;

    // Entities = Unshifted polys + Shifted polys + Eq polys
    static constexpr size_t NUM_ALL_ENTITIES = 3 * NUM_CLAIMS;

    template <typename FF_> using Relations_ = std::tuple<bb::MultilinearBatchingRelation<FF_, NUM_CLAIMS>>;
    using Relations = Relations_<FF>;

    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = compute_max_partial_relation_length<Relations>();
    // There is no gating polynomial in the relation (the only relation is linearly dependent), so the batched relation
    // partial length is equal to max partial relation length
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = MAX_PARTIAL_RELATION_LENGTH;
    static constexpr size_t NUM_RELATIONS = std::tuple_size_v<Relations>;
    static constexpr size_t NUM_SUBRELATIONS = compute_number_of_subrelations<Relations>();
    using SubrelationSeparator = FF;

    /**
     * @brief Define a bespoke AllEntities holding all the values: [unshifted values, shifted values, eq values]
     */
    template <typename DataType> class AllEntities {
      public:
        std::array<DataType, NUM_ALL_ENTITIES> values;

        DataType& non_shifted(size_t idx) { return values[idx]; }
        const DataType& non_shifted(size_t idx) const { return values[idx]; }
        DataType& shifted(size_t idx) { return values[NUM_CLAIMS + idx]; }
        const DataType& shifted(size_t idx) const { return values[NUM_CLAIMS + idx]; }
        DataType& eq(size_t idx) { return values[(2 * NUM_CLAIMS) + idx]; }
        const DataType& eq(size_t idx) const { return values[(2 * NUM_CLAIMS) + idx]; }

        auto get_all() { return RefArray<DataType, NUM_ALL_ENTITIES>(values); }
        auto get_all() const
        {
            std::array<const DataType*, NUM_ALL_ENTITIES> refs;
            for (size_t idx = 0; idx < NUM_ALL_ENTITIES; ++idx) {
                refs[idx] = &values[idx];
            }
            return RefArray<const DataType, NUM_ALL_ENTITIES>(refs);
        }
        auto get_witness() { return get_all(); }
        auto get_witness() const { return get_all(); }

        static const std::vector<std::string>& get_labels()
        {
            static const std::vector<std::string> labels = [] {
                std::vector<std::string> result;
                result.reserve(NUM_ALL_ENTITIES);
                for (size_t idx = 0; idx < NUM_CLAIMS; ++idx) {
                    result.emplace_back("non_shifted_" + std::to_string(idx));
                }
                for (size_t idx = 0; idx < NUM_CLAIMS; ++idx) {
                    result.emplace_back("shifted_" + std::to_string(idx));
                }
                for (size_t idx = 0; idx < NUM_CLAIMS; ++idx) {
                    result.emplace_back("eq_" + std::to_string(idx));
                }
                return result;
            }();
            return labels;
        }

        static constexpr std::size_t size() { return NUM_ALL_ENTITIES; }
    };

    class AllValues : public AllEntities<FF> {
      public:
        using Base = AllEntities<FF>;
        using Base::Base;
    };

    class ProverPolynomials : public AllEntities<Polynomial> {
      public:
        std::array<std::vector<FF>, NUM_CLAIMS> claim_challenges;

        [[nodiscard]] size_t get_polynomial_size() const
        {
            size_t result = 0;
            for (const auto& polynomial : this->get_all()) {
                result = std::max(result, polynomial.virtual_size());
            }
            return result;
        }

        void increase_polynomials_virtual_size(const size_t size_in)
        {
            for (auto& polynomial : this->get_all()) {
                if (!polynomial.is_empty()) {
                    polynomial.increase_virtual_size(size_in);
                }
            }
        }
    };

    using ProverClaim = MultilinearBatchingProverClaim;

    /**
     * @brief The proving key for multilinear batching sumcheck.
     *
     * @details In HyperNova folding, we reduce NumClaims polynomial evaluation claims to one via sumcheck.
     *
     * Each claim asserts: "polynomial P evaluated at point r equals v", i.e., P(r) = v.
     *
     * The multilinear batching sumcheck proves all claims simultaneously by checking:
     *   sum_x [ sum_i \gamma^i P_i(x) * eq(x, r_i) ] = \sum_i \gamma^i v_i
     *
     * where eq(x, r) is the equality polynomial that is 1 when x = r and 0 elsewhere on the hypercube, and \gamma is
     * the slot batching challenge applied as a public per-slot relation coefficient.
     *
     * After sumcheck, all claims are reduced to evaluations of the original polynomials at a new random point u. These
     * are then combined into a single accumulator claim using a fresh challenge \rho (drawn once the claimed
     * evaluations are bound to the transcript), so that the single opening of the combined commitment binds each
     * P_i(u) individually.
     */
    class ProvingKey {
      public:
        ProverPolynomials polynomials;
        std::array<Polynomial, NUM_CLAIMS> preshifted_polynomials;
        std::array<Commitment, NUM_CLAIMS> non_shifted_commitments;
        std::array<Commitment, NUM_CLAIMS> shifted_commitments;
        std::array<FF, NUM_CLAIMS> non_shifted_evaluations;
        std::array<FF, NUM_CLAIMS> shifted_evaluations;
        size_t circuit_size = 0;

        ProvingKey() = default;
        explicit ProvingKey(std::vector<ProverClaim>&& claims);
    };

    class PartiallyEvaluatedMultivariates
        : public PartiallyEvaluatedMultivariatesBase<AllEntities<Polynomial>, ProverPolynomials, Polynomial> {
      public:
        using Base = PartiallyEvaluatedMultivariatesBase<AllEntities<Polynomial>, ProverPolynomials, Polynomial>;
        std::array<std::vector<FF>, NUM_CLAIMS> claim_challenges;

        PartiallyEvaluatedMultivariates(const ProverPolynomials& full_polynomials, size_t circuit_size)
            : Base(full_polynomials, circuit_size)
            , claim_challenges(full_polynomials.claim_challenges)
        {}
    };

    template <size_t LENGTH> using ProverUnivariates = AllEntities<bb::Univariate<FF, LENGTH>>;
    using ExtendedEdges = ProverUnivariates<MAX_PARTIAL_RELATION_LENGTH>;

    /**
     * @brief Given the eq polynomial at (u_1, .., u_N, 0, .., 0) compute its value at (u_1, .., u_N, 1, 0, .., 0) for
     * use in the virtual rounds.
     *
     * @details Witness polynomials of length N < VIRTUAL_LOG_N are extended by zero via multiplication by
     *      \prod_{i = N + 1}^{VIRTUAL_LOG_N} (1 - X_i).
     * In this way, we run sumcheck on a fixed number of VIRTUAL_LOG_N rounds. For eq polynomials, this extension is not
     * correct. Eq polynomials eq(X, Y) are defined as
     *      \prod_{i = 1}^{VIRTUAL_LOG_N} ((1 - X_i) (1 - Y_i) + X_i Y_i)
     * so their extensions at a new edge require their true value at 0 and 1
     */
    template <typename PartiallyEvaluatedPolynomials>
    static void extend_eq_polynomials_for_virtual_round(PartiallyEvaluatedPolynomials& partially_evaluated_polynomials,
                                                        const std::vector<FF>& multivariate_challenge,
                                                        const size_t round_idx)
    {
        std::vector<FF> index_1_challenge(VIRTUAL_LOG_N);
        for (size_t i = 0; i < round_idx; i++) {
            index_1_challenge[i] = multivariate_challenge[i];
        }
        index_1_challenge[round_idx] = FF(1);

        for (size_t slot = 0; slot < NUM_CLAIMS; ++slot) {
            auto force_virtual_extension_shape = [](Polynomial& polynomial) {
                if (polynomial.size() <= 1) {
                    return;
                }
                auto new_polynomial = Polynomial(2, polynomial.virtual_size());
                new_polynomial.at(0) = polynomial.at(0);
                new_polynomial.at(1) = FF(0);
                polynomial = new_polynomial;
            };
            force_virtual_extension_shape(partially_evaluated_polynomials.non_shifted(slot));
            force_virtual_extension_shape(partially_evaluated_polynomials.shifted(slot));

            auto& eq_polynomial = partially_evaluated_polynomials.eq(slot);
            auto new_eq_polynomial = Polynomial(2, eq_polynomial.virtual_size());
            new_eq_polynomial.at(0) = eq_polynomial.at(0);
            new_eq_polynomial.at(1) = VerifierEqPolynomial<FF>::eval(
                partially_evaluated_polynomials.claim_challenges[slot], index_1_challenge);
            eq_polynomial = new_eq_polynomial;
        }
    }
};

using MultilinearBatchingFlavor = MultilinearBatchingFlavor_<CHONK_MAX_CLAIMS_PER_KERNEL>;

template <size_t NumClaims> class MultilinearBatchingRecursiveFlavor_ {
  public:
    using NativeFlavor = MultilinearBatchingFlavor_<NumClaims>;
    using Builder = MegaCircuitBuilder;
    using Curve = stdlib::bn254<Builder>;
    using PCS = KZG<Curve>;
    using FF = typename Curve::ScalarField;
    using Commitment = typename Curve::Element;
    using Transcript = StdlibTranscript<Builder>;
    using Codec = stdlib::StdlibCodec<FF>;

    static constexpr size_t NUM_CLAIMS = NativeFlavor::NUM_CLAIMS;
    static constexpr size_t VIRTUAL_LOG_N = NativeFlavor::VIRTUAL_LOG_N;
    static constexpr bool HasZK = NativeFlavor::HasZK;
    static constexpr bool USE_PADDING = NativeFlavor::USE_PADDING;
    static constexpr size_t NUM_ALL_ENTITIES = NativeFlavor::NUM_ALL_ENTITIES;

    using Relations = typename NativeFlavor::template Relations_<FF>;
    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = NativeFlavor::MAX_PARTIAL_RELATION_LENGTH;
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = NativeFlavor::BATCHED_RELATION_PARTIAL_LENGTH;
    static constexpr size_t NUM_RELATIONS = std::tuple_size_v<Relations>;
    static constexpr size_t NUM_SUBRELATIONS = NativeFlavor::NUM_SUBRELATIONS;
    using SubrelationSeparator = FF;

    class AllValues : public NativeFlavor::template AllEntities<FF> {
      public:
        using Base = typename NativeFlavor::template AllEntities<FF>;
        using Base::Base;
    };
};

using MultilinearBatchingRecursiveFlavor = MultilinearBatchingRecursiveFlavor_<CHONK_MAX_CLAIMS_PER_KERNEL>;

} // namespace bb
