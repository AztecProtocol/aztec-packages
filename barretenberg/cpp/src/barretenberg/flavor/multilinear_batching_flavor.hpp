// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================
#pragma once

#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/common/ref_array.hpp"
#include "barretenberg/common/zip_view.hpp"
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

template <typename FF, typename Polynomial, size_t MaxNumClaims> struct MultilinearBatchingProverPolynomials;

/**
 * @brief Native flavor for one fixed-width multilinear batching sumcheck.
 * @details One such batching is run per kernel, combining the accumulator carried in from the previous kernel with the
 * sumcheck claims of the proofs the kernel recursively verifies. The width therefore defaults to
 * CHONK_MAX_CLAIMS_PER_KERNEL rather than the total number of circuits in the IVC.
 */
template <size_t MaxNumClaims = CHONK_MAX_CLAIMS_PER_KERNEL> class MultilinearBatchingFlavor_ {
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

    static constexpr size_t MAX_NUM_CLAIMS = MaxNumClaims;
    static constexpr size_t VIRTUAL_LOG_N = CONST_FOLDING_LOG_N;
    static constexpr bool USE_SHORT_MONOMIALS = false;
    static constexpr bool HasZK = false;
    static constexpr size_t TRACE_OFFSET = 0;
    static constexpr bool IS_MULTILINEAR_BATCHING = true;
    static constexpr bool USE_PADDING = true;

    static constexpr size_t NUM_CLAIM_COMMITMENTS = 2;
    static constexpr size_t NUM_CLAIM_EVALUATIONS = 2;
    static constexpr size_t NUM_CLAIM_CHALLENGES = VIRTUAL_LOG_N;

    static constexpr size_t NUM_ALL_ENTITIES = 3 * MAX_NUM_CLAIMS;
    static constexpr size_t NUM_SHIFTED_ENTITIES = MAX_NUM_CLAIMS;

    template <typename FF_> using Relations_ = std::tuple<bb::MultilinearBatchingRelation<FF_, MAX_NUM_CLAIMS>>;
    using Relations = Relations_<FF>;

    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = compute_max_partial_relation_length<Relations>();
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = MAX_PARTIAL_RELATION_LENGTH + 1;
    static constexpr size_t NUM_RELATIONS = std::tuple_size_v<Relations>;
    static constexpr size_t NUM_SUBRELATIONS = compute_number_of_subrelations<Relations>();
    using SubrelationSeparator = FF;

    template <typename DataType> class AllEntities {
      public:
        std::array<DataType, NUM_ALL_ENTITIES> values;

        DataType& non_shifted(size_t idx) { return values[idx]; }
        const DataType& non_shifted(size_t idx) const { return values[idx]; }
        DataType& shifted(size_t idx) { return values[MAX_NUM_CLAIMS + idx]; }
        const DataType& shifted(size_t idx) const { return values[MAX_NUM_CLAIMS + idx]; }
        DataType& eq(size_t idx) { return values[2 * MAX_NUM_CLAIMS + idx]; }
        const DataType& eq(size_t idx) const { return values[2 * MAX_NUM_CLAIMS + idx]; }

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
                for (size_t idx = 0; idx < MAX_NUM_CLAIMS; ++idx) {
                    result.emplace_back("non_shifted_" + std::to_string(idx));
                }
                for (size_t idx = 0; idx < MAX_NUM_CLAIMS; ++idx) {
                    result.emplace_back("shifted_" + std::to_string(idx));
                }
                for (size_t idx = 0; idx < MAX_NUM_CLAIMS; ++idx) {
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
        std::array<std::vector<FF>, MAX_NUM_CLAIMS> claim_challenges;
        std::array<bool, MAX_NUM_CLAIMS> active_slots{};

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

    class ProvingKey {
      public:
        ProverPolynomials polynomials;
        std::array<Polynomial, MAX_NUM_CLAIMS> preshifted_polynomials;
        std::array<Commitment, MAX_NUM_CLAIMS> non_shifted_commitments;
        std::array<Commitment, MAX_NUM_CLAIMS> shifted_commitments;
        std::array<FF, MAX_NUM_CLAIMS> non_shifted_evaluations;
        std::array<FF, MAX_NUM_CLAIMS> shifted_evaluations;
        std::array<bool, MAX_NUM_CLAIMS> active_slots{};
        size_t num_claims = 0;
        size_t circuit_size = 0;

        ProvingKey() = default;
        explicit ProvingKey(std::vector<ProverClaim>&& claims);

        void apply_slot_batching_challenge(const FF& challenge);
    };

    class PartiallyEvaluatedMultivariates : public AllEntities<Polynomial> {
      public:
        std::array<std::vector<FF>, MAX_NUM_CLAIMS> claim_challenges;
        std::array<bool, MAX_NUM_CLAIMS> active_slots{};

        PartiallyEvaluatedMultivariates(const ProverPolynomials& full_polynomials, size_t circuit_size)
        {
            claim_challenges = full_polynomials.claim_challenges;
            active_slots = full_polynomials.active_slots;
            for (auto [poly, full_poly] : zip_view(this->get_all(), full_polynomials.get_all())) {
                size_t desired_size = (full_poly.end_index() / 2) + (full_poly.end_index() % 2);
                poly = Polynomial(desired_size, circuit_size / 2, 0, Polynomial::DontZeroMemory::FLAG);
            }
        }
    };

    template <size_t LENGTH> using ProverUnivariates = AllEntities<bb::Univariate<FF, LENGTH>>;
    using ExtendedEdges = ProverUnivariates<MAX_PARTIAL_RELATION_LENGTH>;

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

        for (size_t slot = 0; slot < MAX_NUM_CLAIMS; ++slot) {
            if (!partially_evaluated_polynomials.active_slots[slot]) {
                continue;
            }
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
            index_1_challenge[round_idx] = FF(1);
            new_eq_polynomial.at(1) = VerifierEqPolynomial<FF>::eval(
                partially_evaluated_polynomials.claim_challenges[slot], index_1_challenge);
            eq_polynomial = new_eq_polynomial;
        }
    }
};

using MultilinearBatchingFlavor = MultilinearBatchingFlavor_<CHONK_MAX_CLAIMS_PER_KERNEL>;

template <size_t MaxNumClaims = CHONK_MAX_CLAIMS_PER_KERNEL> class MultilinearBatchingRecursiveFlavor_ {
  public:
    using NativeFlavor = MultilinearBatchingFlavor_<MaxNumClaims>;
    using Builder = MegaCircuitBuilder;
    using Curve = stdlib::bn254<Builder>;
    using PCS = KZG<Curve>;
    using FF = typename Curve::ScalarField;
    using Commitment = typename Curve::Element;
    using Transcript = StdlibTranscript<Builder>;
    using Codec = stdlib::StdlibCodec<FF>;

    static constexpr size_t MAX_NUM_CLAIMS = NativeFlavor::MAX_NUM_CLAIMS;
    static constexpr size_t VIRTUAL_LOG_N = NativeFlavor::VIRTUAL_LOG_N;
    static constexpr bool HasZK = NativeFlavor::HasZK;
    static constexpr bool IS_MULTILINEAR_BATCHING = NativeFlavor::IS_MULTILINEAR_BATCHING;
    static constexpr bool USE_PADDING = NativeFlavor::USE_PADDING;
    static constexpr size_t NUM_ALL_ENTITIES = NativeFlavor::NUM_ALL_ENTITIES;
    static constexpr size_t NUM_CLAIM_COMMITMENTS = NativeFlavor::NUM_CLAIM_COMMITMENTS;
    static constexpr size_t NUM_CLAIM_EVALUATIONS = NativeFlavor::NUM_CLAIM_EVALUATIONS;
    static constexpr size_t NUM_CLAIM_CHALLENGES = NativeFlavor::NUM_CLAIM_CHALLENGES;

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
