// === AUDIT STATUS ===
// internal:    { status: in progress, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/commitment_schemes/small_subgroup_ipa/small_subgroup_ipa_utils.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/generated/mega_zk_flavor_generated.hpp"
#include "barretenberg/flavor/partially_evaluated_multivariates.hpp"
#include "barretenberg/flavor/prover_polynomials.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/relations/relation_tuple_helpers.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

/**
 * @brief Hiding-kernel-only Mega variant: runs with ZK Sumcheck and a reduced relation set.
 *
 * @details MegaZKFlavor is exclusively used in production to prove the Chonk hiding kernel
 * (see `Chonk::accumulate_hiding_kernel`). Because the hiding kernel exercises a strict subset
 * of Mega's gates, several relations are statically vacuous on every honest hiding-kernel trace
 * and are dropped at the protocol level. See `scripts/flavor-codegen/src/flavors/mega_zk.ts`
 * for the relation list and the justifications for each removal.
 *
 * Sumcheck runs with Libra masking + row disabling for ZK, so the partial relation length is
 * one larger than Mega's. Unlike UltraFlavorWithZK, MegaZK does *not* include a Gemini masking
 * polynomial — in the batched Chonk flow the Translator provides masking at the joint circuit
 * size (2^17 = `HIDING_KERNEL_LOG_N` rows).
 */
// MegaZKFlavor inherits the generated layout (EntityId, NUM_*_ENTITIES, AllEntities, Relations,
// REPEATED_COMMITMENTS, capability + challenge-usage bools). The hand-written class adds the
// curve / transcript types, sumcheck-shape constants, and the VK / ProverPolynomials wrappers.
class MegaZKFlavor : public MegaZKFlavor_Generated {
  public:
    using Generated = MegaZKFlavor_Generated;

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
    using Transcript = NativeTranscript;

    // MegaZK is only used in production to prove the Hiding Kernel.
    static constexpr size_t VIRTUAL_LOG_N = HIDING_KERNEL_LOG_N;
    static constexpr bool USE_SHORT_MONOMIALS = true;
    // Runs with ZK Sumcheck.
    static constexpr bool HasZK = true;
    static constexpr bool USE_PADDING = true;
    static constexpr size_t NUM_WIRES = CircuitBuilder::NUM_WIRES;

    // MegaZK does not include a Gemini masking polynomial in its entities; the Translator provides
    // one at the correct joint circuit size in the batched Chonk flow.
    static constexpr bool HasGeminiMasking = false;

    using Relations = Relations_<FF>;

    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = compute_max_partial_relation_length<Relations>();
    // BATCHED_RELATION_PARTIAL_LENGTH = algebraic degree of sumcheck relation *after* multiplying by the `pow_zeta`
    // random polynomial e.g. For \sum(x) [A(x) * B(x) + C(x)] * PowZeta(X), relation length = 2 and random relation
    // length = 3. ZK adds one for row-disabling.
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = MAX_PARTIAL_RELATION_LENGTH + 2;
    static_assert(BATCHED_RELATION_PARTIAL_LENGTH == Curve::LIBRA_UNIVARIATES_LENGTH,
                  "LIBRA_UNIVARIATES_LENGTH must be equal to MegaZKFlavor::BATCHED_RELATION_PARTIAL_LENGTH");
    static constexpr size_t NUM_RELATIONS = std::tuple_size_v<Relations>;

    static constexpr size_t num_frs_comm = FrCodec::calc_num_fields<Commitment>();
    static constexpr size_t num_frs_fr = FrCodec::calc_num_fields<FF>();

    // A challenge whose powers are used to batch subrelation contributions during Sumcheck
    static constexpr size_t NUM_SUBRELATIONS = compute_number_of_subrelations<Relations>();
    using SubrelationSeparator = FF;

    static_assert(NUM_MASKING_ENTITIES == 0,
                  "MegaZKFlavor layout must not include masking columns; Translator provides Gemini masking in the "
                  "batched Chonk flow.");
    // MegaZK includes only the kernel_calldata bus. The hiding kernel reads against the prior
    // circuit's return_data, which is copy-constrained to kernel_calldata; the other Mega buses
    // (first..fifth_app_calldata, return_data) don't apply here.
    static_assert(NUM_BUS_COLUMNS == 1, "MegaZK flavor should declare exactly the kernel_calldata bus");

    // ZK masking lives at rows [NUM_ZERO_ROWS, TRACE_OFFSET); Sumcheck disables rows [0, TRACE_OFFSET).
    static constexpr size_t TRACE_OFFSET = NUM_DISABLED_ROWS_IN_SUMCHECK;

    // Size of the final PCS MSM for ZK = non-ZK Mega-style size + NUM_LIBRA_COMMITMENTS (3):
    // 1 (Shplonk Q) + NUM_UNSHIFTED + (log_n - 1) Gemini folds + 1 (G1 identity) + 1 (KZG W) + 3 (Libra)
    // Shifted commitments are removed as duplicates via REPEATED_COMMITMENTS.
    static constexpr size_t FINAL_PCS_MSM_SIZE(size_t log_n = VIRTUAL_LOG_N)
    {
        return NUM_UNSHIFTED_ENTITIES + log_n + 2 + NUM_SMALL_IPA_COMMITMENTS;
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
