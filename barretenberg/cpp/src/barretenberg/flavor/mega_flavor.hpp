// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/generated/mega_flavor_generated.hpp"
#include "barretenberg/flavor/partially_evaluated_multivariates.hpp"
#include "barretenberg/flavor/prover_polynomials.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/relations/relation_tuple_helpers.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

// MegaFlavor inherits the generated layout: EntityId, NUM_*_ENTITIES, AllEntities / Precomputed /
// WitnessEntities, Relations_<FF>, REPEATED_COMMITMENTS, capability bools, and challenge-usage
// bools all come through public inheritance. The hand-written class adds curve / commitment /
// transcript types, sumcheck-shape constants, the VK / ProverPolynomials wrappers, and the
// CommitmentLabels singleton.
class MegaFlavor : public MegaFlavor_Generated {
  public:
    using Generated = MegaFlavor_Generated;

    using CircuitBuilder = MegaCircuitBuilder;
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

    // An upper bound on the size of the Mega-circuits. `CONST_FOLDING_LOG_N` bounds the log circuit sizes in the Chonk
    // context.
    static constexpr size_t VIRTUAL_LOG_N = CONST_FOLDING_LOG_N;
    // indicates when evaluating sumcheck, edges can be left as degree-1 monomials
    static constexpr bool USE_SHORT_MONOMIALS = true;
    // Indicates that this flavor runs with non-ZK Sumcheck.
    static constexpr bool HasZK = false;
    // To achieve fixed proof size and that the recursive verifier circuit is constant, we are using padding in Sumcheck
    // and Shplemini
    static constexpr bool USE_PADDING = true;
    static constexpr size_t NUM_WIRES = CircuitBuilder::NUM_WIRES;

    using Relations = Relations_<FF>;

    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = compute_max_partial_relation_length<Relations>();
    // BATCHED_RELATION_PARTIAL_LENGTH = algebraic degree of sumcheck relation *after* multiplying by the `pow_zeta`
    // random polynomial e.g. For \sum(x) [A(x) * B(x) + C(x)] * PowZeta(X), relation length = 2 and random relation
    // length = 3
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = MAX_PARTIAL_RELATION_LENGTH + 1;
    static constexpr size_t NUM_RELATIONS = std::tuple_size_v<Relations>;

    static constexpr size_t num_frs_comm = FrCodec::calc_num_fields<Commitment>();
    static constexpr size_t num_frs_fr = FrCodec::calc_num_fields<FF>();

    // A challenge whose powers are used to batch subrelation contributions during Sumcheck
    static constexpr size_t NUM_SUBRELATIONS = compute_number_of_subrelations<Relations>();
    using SubrelationSeparator = FF;

    static_assert(NUM_MASKING_ENTITIES == 0,
                  "MegaFlavor layout must not include masking columns (ZK masking is owned by the translator).");
    static_assert(NUM_BUS_COLUMNS == bb::NUM_BUS_COLUMNS, "Generated Mega databus count must match builder databus");

    // Rows reserved at the top of the trace for row-disabling / ZK masking.
    static constexpr size_t TRACE_OFFSET = 0;

    // Size of the final PCS MSM after KZG adds quotient commitment:
    // 1 (Shplonk Q) + NUM_UNSHIFTED + (log_n - 1) Gemini folds + 1 (G1 identity) + 1 (KZG W)
    // (shifted commitments are removed as duplicates)
    static constexpr size_t FINAL_PCS_MSM_SIZE(size_t log_n = VIRTUAL_LOG_N)
    {
        return NUM_UNSHIFTED_ENTITIES + log_n + 2;
    }

    /**
     * @brief A field element for each entity of the flavor. These entities represent the prover polynomials evaluated
     * at one point.
     */
    using AllValues = AllEntities<FF>;

    /**
     * @brief A container for the prover polynomials handles.
     */
    using ProverPolynomials = ProverPolynomialsBase<AllEntities<Polynomial>, AllValues, Polynomial>;

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
    using PartiallyEvaluatedMultivariates =
        PartiallyEvaluatedMultivariatesBase<AllEntities<Polynomial>, ProverPolynomials, Polynomial>;

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
