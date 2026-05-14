// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Federico], commit: 0e37cb8}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================
#pragma once

#include <array>
#include <span>

#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/common/tuple.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/flavor/relation_definitions.hpp"
#include "barretenberg/polynomials/barycentric.hpp"
#include "barretenberg/polynomials/univariate.hpp"

#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/polynomials/evaluation_domain.hpp"
#include "barretenberg/relations/relation_tuple_helpers.hpp"
#include "barretenberg/transcript/transcript.hpp"

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/vm2/common/constants.hpp"
#include "barretenberg/vm2/constraining/avm_fixed_vk.hpp"
#include "barretenberg/vm2/constraining/flavor_macros.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"

#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/flavor_variables.hpp"

namespace bb::avm2 {

// Metaprogramming to concatenate tuple types.
template <typename... input_t> using tuple_cat_t = decltype(flat_tuple::tuple_cat(std::declval<input_t>()...));

class AvmFlavor {
  public:
    using Curve = AvmFlavorSettings::Curve;
    using G1 = AvmFlavorSettings::G1;
    using PCS = AvmFlavorSettings::PCS;

    using FF = AvmFlavorSettings::FF;
    using Polynomial = AvmFlavorSettings::Polynomial;
    using PolynomialHandle = AvmFlavorSettings::PolynomialHandle;
    using GroupElement = AvmFlavorSettings::GroupElement;
    using Commitment = AvmFlavorSettings::Commitment;
    using CommitmentHandle = AvmFlavorSettings::CommitmentHandle;
    using CommitmentKey = AvmFlavorSettings::CommitmentKey;
    using VerifierCommitmentKey = AvmFlavorSettings::VerifierCommitmentKey;

    // To help BB check if a flavor is AVM, even without including this flavor.
    static constexpr bool IS_AVM = true;
    // indicates when evaluating sumcheck, edges must be extended to be MAX_PARTIAL_RELATION_LENGTH
    static constexpr bool USE_SHORT_MONOMIALS = false;
    // This flavor would not be used with ZK Sumcheck
    static constexpr bool HasZK = false;
    static constexpr size_t TRACE_OFFSET = 0;
    // Padding in Sumcheck and Shplemini
    static constexpr bool USE_PADDING = true;

    static constexpr size_t NUM_PRECOMPUTED_ENTITIES = AvmFlavorVariables::NUM_PRECOMPUTED_ENTITIES;
    static constexpr size_t NUM_WITNESS_ENTITIES = AvmFlavorVariables::NUM_WITNESS_ENTITIES;
    static constexpr size_t NUM_SHIFTED_ENTITIES = AvmFlavorVariables::NUM_SHIFTED_ENTITIES;
    static constexpr size_t NUM_WIRES = AvmFlavorVariables::NUM_WIRES;
    static constexpr size_t NUM_ALL_ENTITIES = AvmFlavorVariables::NUM_ALL_ENTITIES;

    // Need to be templated for recursive verifier
    template <typename FF_> using MainRelations_ = AvmFlavorVariables::MainRelations_<FF_>;

    using MainRelations = MainRelations_<FF>;

    // Need to be templated for recursive verifier
    template <typename FF_> using LookupRelations_ = AvmFlavorVariables::LookupRelations_<FF_>;

    using LookupRelations = LookupRelations_<FF>;

    // Need to be templated for recursive verifier
    template <typename FF_> using Relations_ = tuple_cat_t<MainRelations_<FF_>, LookupRelations_<FF_>>;
    using Relations = Relations_<FF>;

    static constexpr size_t NUM_SUBRELATIONS = compute_number_of_subrelations<Relations>();

    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = compute_max_partial_relation_length<Relations>();

    static_assert(MAX_PARTIAL_RELATION_LENGTH < 8, "MAX_PARTIAL_RELATION_LENGTH must be less than 8");

    // BATCHED_RELATION_PARTIAL_LENGTH = algebraic degree of sumcheck relation *after* multiplying by the `pow_zeta`
    // random polynomial e.g. For \sum(x) [A(x) * B(x) + C(x)] * PowZeta(X), relation length = 2 and random relation
    // length = 3
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = MAX_PARTIAL_RELATION_LENGTH + 1;
    static constexpr size_t NUM_RELATIONS = std::tuple_size_v<Relations>;

    static constexpr size_t NUM_FRS_COM = FrCodec::calc_num_fields<Commitment>();
    static constexpr size_t NUM_FRS_FR = FrCodec::calc_num_fields<FF>();

    // The formula must match the serialization in Transcript::serialize_full_transcript(). The static_assert below
    // catches drift between AVM_V2_PROOF_LENGTH_IN_FIELDS (the protocol-shared mirror in constants.nr) and the
    // computed length. When it fires, follow the diagnostic and run scripts/bump_avm_proof_length.sh.
    static constexpr size_t COMPUTED_AVM_PROOF_LENGTH_IN_FIELDS =
        NUM_WITNESS_ENTITIES * NUM_FRS_COM +                                    // witness commitments
        NUM_ALL_ENTITIES * NUM_FRS_FR +                                         // sumcheck evaluations
        MAX_AVM_TRACE_LOG_SIZE * NUM_FRS_FR * BATCHED_RELATION_PARTIAL_LENGTH + // sumcheck univariates
        (MAX_AVM_TRACE_LOG_SIZE - 1) * NUM_FRS_COM +                            // gemini fold comms
        MAX_AVM_TRACE_LOG_SIZE * NUM_FRS_FR +                                   // gemini fold evals
        2 * NUM_FRS_COM;                                                        // shplonk + kzg

    static_assert(AVM_V2_PROOF_LENGTH_IN_FIELDS == COMPUTED_AVM_PROOF_LENGTH_IN_FIELDS,
                  "AVM_V2_PROOF_LENGTH_IN_FIELDS (constants.nr) != COMPUTED_AVM_PROOF_LENGTH_IN_FIELDS. "
                  "Update AVM_V2_PROOF_LENGTH_IN_FIELDS in constants.nr to the computed value and "
                  "run barretenberg/cpp/scripts/bump_avm_proof_length.sh.");

  public:
    template <typename DataType_> class AllEntities {
      public:
        using DataType = DataType_;
        std::array<DataType, NUM_ALL_ENTITIES> entities;

        std::span<DataType> get_all() { return entities; }
        std::span<const DataType> get_all() const { return entities; }
        std::span<const std::string> get_labels() const { return COLUMN_NAMES; }

        DEFINE_AVM_GETTER(precomputed, PRECOMPUTED_START_IDX, NUM_PRECOMPUTED_ENTITIES);
        DEFINE_AVM_GETTER(wires, WIRE_START_IDX, NUM_WIRE_ENTITIES);
        DEFINE_AVM_GETTER(derived, DERIVED_START_IDX, NUM_DERIVED_ENTITIES);
        DEFINE_AVM_GETTER(shifted, SHIFTED_START_IDX, NUM_SHIFTED_ENTITIES);
        DEFINE_AVM_GETTER(witness, WITNESS_START_IDX, NUM_WITNESS_ENTITIES);
        DEFINE_AVM_GETTER(unshifted, UNSHIFTED_START_IDX, NUM_UNSHIFTED_ENTITIES);
        DEFINE_AVM_GETTER(to_be_shifted, WIRES_TO_BE_SHIFTED_START_IDX, NUM_WIRES_TO_BE_SHIFTED);

        // We need both const and non-const versions.
        DataType& get(ColumnAndShifts c) { return entities[static_cast<size_t>(c)]; }
        const DataType& get(ColumnAndShifts c) const { return entities[static_cast<size_t>(c)]; }
    };

    // Even though we only need the witness entities, we hold all entities because it's
    // easier and will not make much of a difference.
    template <typename DataType> class WitnessEntities : public AllEntities<DataType> {
      private:
        // Obscure get_all since we redefine it.
        using AllEntities<DataType>::get_all;
        using AllEntities<DataType>::get_labels;

      public:
        std::span<DataType> get_all() { return AllEntities<DataType>::get_witness(); }
        std::span<const DataType> get_all() const { return AllEntities<DataType>::get_witness(); }
        std::span<const std::string> get_labels() const { return AllEntities<DataType>::get_witness_labels(); }
    };

    // Even though we only need the precomputed entities, we hold all entities because it's
    // easier and will not make much of a difference.
    template <typename DataType> class PrecomputedEntities : public AllEntities<DataType> {
      private:
        // Obscure get_all since we redefine it.
        using AllEntities<DataType>::get_all;
        using AllEntities<DataType>::get_labels;

      public:
        std::span<DataType> get_all() { return AllEntities<DataType>::get_precomputed(); }
        std::span<const DataType> get_all() const { return AllEntities<DataType>::get_precomputed(); }
        std::span<const std::string> get_labels() const { return AllEntities<DataType>::get_precomputed_labels(); }
    };

    class Transcript : public NativeTranscript {
      public:
        size_t log_circuit_size = MAX_AVM_TRACE_LOG_SIZE;

        std::array<Commitment, NUM_WITNESS_ENTITIES> commitments;

        std::vector<bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH>> sumcheck_univariates;
        std::array<FF, NUM_ALL_ENTITIES> sumcheck_evaluations;
        std::vector<Commitment> gemini_fold_comms;
        std::vector<FF> gemini_fold_evals;
        Commitment shplonk_q_comm;
        Commitment kzg_w_comm;

        Transcript() = default;

        void deserialize_full_transcript();
        void serialize_full_transcript();
    };

    class ProvingKey : public AllEntities<Polynomial> {
      private:
        // Obscure get_all since it would be incorrect.
        using AllEntities<Polynomial>::get_all;
        using AllEntities<Polynomial>::get_labels;

      public:
        using FF = typename Polynomial::FF;

        static constexpr size_t circuit_size = MAX_AVM_TRACE_SIZE; // Fixed size
        static constexpr size_t log_circuit_size = MAX_AVM_TRACE_LOG_SIZE;

        ProvingKey();

        std::span<Polynomial> get_all() { return AllEntities<Polynomial>::get_unshifted(); }
        std::span<const Polynomial> get_all() const { return AllEntities<Polynomial>::get_unshifted(); }
        std::span<const std::string> get_labels() const { return AllEntities<Polynomial>::get_unshifted_labels(); }

        CommitmentKey commitment_key;

        // The number of public inputs has to be the same for all instances because they are
        // folded element by element.
        std::vector<FF> public_inputs;
    };

    /**
     * @brief Verification key of the AVM. It is fixed and reconstructed from precomputed values.
     *
     */
    using VerificationKey =
        FixedVKAndHash_<PrecomputedEntities<Commitment>, FF, typename constraining::AvmHardCodedVKAndHash>;

    // Used by sumcheck.
    using AllValues = AllEntities<FF>;

    template <typename Polynomials> class PolynomialEntitiesAtFixedRow {
      public:
        PolynomialEntitiesAtFixedRow(const size_t row_idx, const Polynomials& pp)
            : row_idx(row_idx)
            , pp(pp)
        {}

        // Only const-access is allowed here. That's all that the logderivative library requires.
        const auto& get(ColumnAndShifts c) const { return pp.get(c)[row_idx]; }

      private:
        const size_t row_idx;
        const Polynomials& pp;
    };

    /**
     * @brief A container for the prover polynomials handles.
     */
    class ProverPolynomials : public AllEntities<Polynomial> {
      public:
        // Define all operations as default, except copy construction/assignment
        ProverPolynomials() = default;
        ProverPolynomials& operator=(const ProverPolynomials&) = delete;
        ProverPolynomials(const ProverPolynomials& o) = delete;
        ProverPolynomials(ProverPolynomials&& o) noexcept = default;
        ProverPolynomials& operator=(ProverPolynomials&& o) noexcept = default;
        ~ProverPolynomials() = default;

        ProverPolynomials(ProvingKey& proving_key);
        // For partially evaluated multivariates.
        // TODO(fcarreiro): Reconsider its place.
        ProverPolynomials(const ProverPolynomials& full_polynomials, size_t circuit_size);

        // Only const-access is allowed here. That's all that the logderivative library requires.
        // https://github.com/AztecProtocol/aztec-packages/blob/e50d8e0/barretenberg/cpp/src/barretenberg/honk/proof_system/logderivative_library.hpp#L44.
        PolynomialEntitiesAtFixedRow<ProverPolynomials> get_row(size_t row_idx) const { return { row_idx, *this }; }
    };

    using PartiallyEvaluatedMultivariates = ProverPolynomials;

    /**
     * @brief A container for univariates used during sumcheck.
     * @details During sumcheck, the prover evaluates the relations on these univariates.
     */
    class LazilyExtendedProverUnivariates
        : private AllEntities<std::unique_ptr<bb::Univariate<FF, MAX_PARTIAL_RELATION_LENGTH>>> {
      public:
        LazilyExtendedProverUnivariates(const ProverPolynomials& multivariates)
            : multivariates(multivariates)
        {}

        void set_current_edge(size_t edge_idx);
        const bb::Univariate<FF, MAX_PARTIAL_RELATION_LENGTH>& get(ColumnAndShifts c) const;

      private:
        size_t current_edge = 0;
        mutable bool dirty = false;
        const ProverPolynomials& multivariates;
    };

    /**
     * @brief A container for univariates produced during the hot loop in sumcheck.
     */
    using ExtendedEdges = LazilyExtendedProverUnivariates;
    // TODO(fcarreiro): This is only required because of the Flavor::USE_SHORT_MONOMIALS conditional in
    // SumcheckProverRound. The conditional should be improved to not require this.
    template <size_t LENGTH> using ProverUnivariates = int;

    /**
     * @brief A container for the witness commitments.
     *
     */
    using WitnessCommitments = WitnessEntities<Commitment>;

    // Templated for use in recursive verifier
    template <typename Commitment_, typename VerificationKey>
    class VerifierCommitments_ : public AllEntities<Commitment_> {
      private:
        using Base = AllEntities<Commitment_>;

      public:
        VerifierCommitments_(const std::shared_ptr<VerificationKey>& verification_key)
        {
            for (auto [commitment, vk_commitment] : zip_view(this->get_precomputed(), verification_key->get_all())) {
                commitment = vk_commitment;
            }
        }
    };

    // Native version of the verifier commitments
    using VerifierCommitments = VerifierCommitments_<Commitment, VerificationKey>;
};

} // namespace bb::avm2
