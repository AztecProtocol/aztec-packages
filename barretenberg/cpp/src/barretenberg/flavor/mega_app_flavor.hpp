// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/generated/mega_app_flavor_generated.hpp"
#include "barretenberg/flavor/partially_evaluated_multivariates.hpp"
#include "barretenberg/flavor/prover_polynomials.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/relations/relation_tuple_helpers.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

/**
 * @brief Mega flavor specialized for Chonk app circuits.
 *
 * @details Drops the four calldata bus-lookup relations (kernel + first/second/third app), keeping
 * only the `return_data` bus. See `scripts/flavor-codegen/src/flavors/mega_app.ts` for the relation
 * set and the rationale behind the drops.
 */
class MegaAppFlavor : public MegaAppFlavor_Generated {
  public:
    using Generated = MegaAppFlavor_Generated;

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

    static constexpr size_t VIRTUAL_LOG_N = CONST_FOLDING_LOG_N;
    static constexpr bool USE_SHORT_MONOMIALS = true;
    static constexpr bool HasZK = false;
    static constexpr bool USE_PADDING = true;
    static constexpr size_t NUM_WIRES = CircuitBuilder::NUM_WIRES;

    using Relations = Relations_<FF>;

    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = compute_max_partial_relation_length<Relations>();
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = MAX_PARTIAL_RELATION_LENGTH + 1;
    static constexpr size_t NUM_RELATIONS = std::tuple_size_v<Relations>;
    static constexpr size_t NUM_SUBRELATIONS = compute_number_of_subrelations<Relations>();
    using SubrelationSeparator = FF;

    static_assert(NUM_BUS_COLUMNS == 1, "MegaAppFlavor should declare exactly the return_data bus");

    static constexpr size_t TRACE_OFFSET = 0;

    static constexpr size_t FINAL_PCS_MSM_SIZE(size_t log_n = VIRTUAL_LOG_N)
    {
        return NUM_UNSHIFTED_ENTITIES + log_n + 2;
    }

    using AllValues = AllEntities<FF>;
    using ProverPolynomials = ProverPolynomialsBase<AllEntities<Polynomial>, AllValues, Polynomial>;
    using PrecomputedData = PrecomputedData_<Polynomial, NUM_PRECOMPUTED_ENTITIES>;
    using VerificationKey = NativeVerificationKey_<PrecomputedEntities<Commitment>, Codec, HashFunction, CommitmentKey>;
    using VKAndHash = VKAndHash_<FF, VerificationKey>;
    using PartiallyEvaluatedMultivariates =
        PartiallyEvaluatedMultivariatesBase<AllEntities<Polynomial>, ProverPolynomials, Polynomial>;
    template <size_t LENGTH> using ProverUnivariates = AllEntities<bb::Univariate<FF, LENGTH>>;
    using ExtendedEdges = ProverUnivariates<MAX_PARTIAL_RELATION_LENGTH>;
    using WitnessCommitments = WitnessEntities<Commitment>;

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
