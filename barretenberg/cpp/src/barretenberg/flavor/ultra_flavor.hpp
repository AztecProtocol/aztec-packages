// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/flavor_concepts.hpp"
#include "barretenberg/flavor/generated/ultra_flavor_generated.hpp"
#include "barretenberg/flavor/generated/ultra_zk_flavor_generated.hpp"
#include "barretenberg/flavor/partially_evaluated_multivariates.hpp"
#include "barretenberg/flavor/prover_polynomials.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/relations/relation_tuple_helpers.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include <type_traits>

namespace bb {

// UltraFlavor inherits the non-ZK generated layout. Relations_, REPEATED_COMMITMENTS, capability
// bools, and challenge-usage bools all carry through. The hand-written class adds curve /
// commitment types, sumcheck-shape constants, and a HasZK-parameterized `AllEntities_` that
// switches between the non-ZK and ZK generated AllEntities — UltraFlavorWithZK reuses this same
// surface with HasZK = true to pick up the masking column.
class UltraFlavor : public UltraFlavor_Generated {
  public:
    using CircuitBuilder = UltraCircuitBuilder;
    using Curve = curve::BN254;
    using FF = Curve::ScalarField;
    using GroupElement = Curve::Element;
    using Commitment = Curve::AffineElement;
    using PCS = KZG<Curve>;
    using Polynomial = bb::Polynomial<FF>;
    using CommitmentKey = bb::CommitmentKey<Curve>;
    using Codec = FrCodec;
    using HashFunction = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;
    using Transcript = BaseTranscript<Codec, HashFunction>;

    static constexpr size_t VIRTUAL_LOG_N = CONST_PROOF_SIZE_LOG_N;
    // indicates when evaluating sumcheck, edges can be left as degree-1 monomials
    static constexpr bool USE_SHORT_MONOMIALS = true;
    // opt in to the row-parallel (SIMD) sumcheck path; see SupportsSimdSumcheck in flavor_concepts.hpp
    static constexpr bool USE_SIMD_SUMCHECK = true;

    // Indicates that this flavor runs with non-ZK Sumcheck.
    static constexpr bool HasZK = false;
    // To achieve fixed proof size and that the recursive verifier circuit is constant, we are using padding in Sumcheck
    // and Shplemini
    static constexpr bool USE_PADDING = true;
    static constexpr size_t NUM_WIRES = CircuitBuilder::NUM_WIRES;

    // WARNING: ordering of `Relations_<FF>` (inherited from UltraFlavor_Generated; defined in
    // scripts/flavor-codegen/src/flavors/ultra.ts) is reflected in the smart-contract verifier —
    // any reordering at the TS source must be matched in Solidity, or relation accumulation will
    // drift. The Ultra and UltraZK generated classes share the same relation set (UltraZK only
    // adds a masking column, no extra relations), so the non-ZK Generated is canonical for both.
    using Generated = UltraFlavor_Generated;

    using Relations = Relations_<FF>;

    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = compute_max_partial_relation_length<Relations>();
    static_assert(MAX_PARTIAL_RELATION_LENGTH == 7);
    static constexpr size_t NUM_SUBRELATIONS = compute_number_of_subrelations<Relations>();
    // A challenge whose powers are used to batch subrelation contributions during Sumcheck
    using SubrelationSeparator = FF;

    // BATCHED_RELATION_PARTIAL_LENGTH = algebraic degree of sumcheck relation *after* multiplying by the `pow_zeta`
    // random polynomial e.g. For \sum(x) [A(x) * B(x) + C(x)] * PowZeta(X), relation length = 2 and random relation
    // length = 3
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = MAX_PARTIAL_RELATION_LENGTH + 1;
    static constexpr size_t NUM_RELATIONS = std::tuple_size_v<Relations>;

    // HasZK_-parameterized AllEntities — switches between the non-ZK and ZK generated
    // AllEntities so UltraFlavorWithZK can reuse this surface (UltraZK only adds a masking column,
    // not any new entity *shapes*). The base-class `AllEntities<DataType>` from
    // UltraFlavor_Generated is the non-ZK case and remains directly accessible.
    template <typename DataType, bool HasZK_ = HasZK>
    using AllEntities_ = std::conditional_t<HasZK_,
                                            UltraZKFlavor_Generated::AllEntities<DataType>,
                                            UltraFlavor_Generated::AllEntities<DataType>>;

    // Pin the ZK / non-ZK generated counts to each other. UltraZK shares the precomputed /
    // witness / shifted shape with the non-ZK side and only adds the masking column.
    static_assert(UltraFlavor_Generated::NUM_MASKING_ENTITIES == 0,
                  "UltraFlavor (non-ZK) layout must not include masking columns");
    static_assert(UltraZKFlavor_Generated::NUM_PRECOMPUTED_ENTITIES == NUM_PRECOMPUTED_ENTITIES);
    static_assert(UltraZKFlavor_Generated::NUM_WITNESS_ENTITIES == NUM_WITNESS_ENTITIES);
    static_assert(UltraZKFlavor_Generated::NUM_SHIFTED_ENTITIES == NUM_SHIFTED_ENTITIES);
    static_assert(UltraZKFlavor_Generated::NUM_MASKING_ENTITIES == 1,
                  "UltraZK layout must include exactly one masking column (gemini_masking_poly)");

    static constexpr size_t TRACE_OFFSET = NUM_DISABLED_ROWS_IN_SUMCHECK;

    // Size of the final PCS MSM after KZG adds quotient commitment:
    // 1 (Shplonk Q) + NUM_UNSHIFTED + (log_n - 1) Gemini folds + 1 (G1 identity) + 1 (KZG W)
    // (shifted commitments are removed as duplicates)
    static constexpr size_t FINAL_PCS_MSM_SIZE(size_t log_n = VIRTUAL_LOG_N)
    {
        return NUM_UNSHIFTED_ENTITIES + log_n + 2;
    }

    /**
     * @brief A field element for each entity of the flavor. These entities represent the prover polynomials
     * evaluated at one point.
     */
    template <bool HasZK_ = HasZK> class AllValues_ : public AllEntities_<FF, HasZK_> {
      public:
        using Base = AllEntities_<FF, HasZK_>;
        using Base::Base;
    };

    using AllValues = AllValues_<HasZK>;

    static_assert(gemini_masking_layout_consistent<UltraFlavor>(),
                  "UltraFlavor gemini masking flag must match its entity layout");

    /**
     * @brief A container for polynomials handles.
     */
    template <bool HasZK_ = HasZK>
    using ProverPolynomials_ = ProverPolynomialsBase<AllEntities_<Polynomial, HasZK_>, AllValues_<HasZK_>, Polynomial>;

    using ProverPolynomials = ProverPolynomials_<HasZK>;

    using PrecomputedData = PrecomputedData_<Polynomial, NUM_PRECOMPUTED_ENTITIES>;

    /**
     * @brief The verification key stores commitments to the precomputed (non-witness) polynomials used by the
     * verifier.
     */
    using VerificationKey = NativeVerificationKey_<PrecomputedEntities<Commitment>, Codec, HashFunction, CommitmentKey>;

    using VKAndHash = VKAndHash_<FF, VerificationKey>;

    /**
     * @brief A container for storing the partially evaluated multivariates produced by sumcheck.
     */
    template <bool HasZK_ = HasZK>
    using PartiallyEvaluatedMultivariates_ =
        PartiallyEvaluatedMultivariatesBase<AllEntities_<Polynomial, HasZK_>, ProverPolynomials_<HasZK_>, Polynomial>;

    using PartiallyEvaluatedMultivariates = PartiallyEvaluatedMultivariates_<HasZK>;

    /**
     * @brief A container for univariates used in sumcheck.
     * @details During folding and sumcheck, the prover evaluates the relations on these univariates.
     */
    template <size_t LENGTH> using ProverUnivariates = AllEntities<bb::Univariate<FF, LENGTH>>;

    /**
     * @brief A container for univariates produced during the hot loop in sumcheck.
     */
    using ExtendedEdges = ProverUnivariates<MAX_PARTIAL_RELATION_LENGTH>;

    /**
     * @brief A container for the witness commitments.
     */
    using WitnessCommitments = WitnessEntities<Commitment>;

    // Per-entity transcript labels (uppercase). The data is generator-emitted via
    // `AllEntities<std::string>::get_labels()`; `commitment_labels()` returns a process-wide
    // singleton populated from that list. Callers index by name (`commitment_labels().q_m()`)
    // when building Fiat-Shamir transcript domain separators.
    using CommitmentLabels = AllEntities<std::string>;
    static const CommitmentLabels& commitment_labels()
    {
        static const CommitmentLabels instance = []() {
            CommitmentLabels result;
            const auto& src = AllEntities<std::string>::get_labels();
            std::copy(src.begin(), src.end(), result.data.begin());
            return result;
        }();
        return instance;
    }
};

} // namespace bb
