#pragma once

#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/flavor/relation_definitions.hpp"
#include "barretenberg/polynomials/barycentric.hpp"
#include "barretenberg/polynomials/univariate.hpp"

#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/flavor_macros.hpp"
#include "barretenberg/polynomials/evaluation_domain.hpp"
#include "barretenberg/transcript/transcript.hpp"

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/constraining/entities.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"

#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/flavor_variables.hpp"

// Metaprogramming to concatenate tuple types.
template <typename... input_t> using tuple_cat_t = decltype(std::tuple_cat(std::declval<input_t>()...));

namespace bb::avm2 {

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

    // indicates when evaluating sumcheck, edges must be extended to be MAX_TOTAL_RELATION_LENGTH
    static constexpr bool USE_SHORT_MONOMIALS = false;

    // This flavor would not be used with ZK Sumcheck
    static constexpr bool HasZK = false;

    // To achieve fixed proof size and that the recursive verifier circuit is constant, we are using padding in Sumcheck
    // and Shplemini
    static constexpr bool USE_PADDING = true;

    static constexpr size_t NUM_PRECOMPUTED_ENTITIES = AvmFlavorVariables::NUM_PRECOMPUTED_ENTITIES;
    static constexpr size_t NUM_WITNESS_ENTITIES = AvmFlavorVariables::NUM_WITNESS_ENTITIES;
    static constexpr size_t NUM_SHIFTED_ENTITIES = AvmFlavorVariables::NUM_SHIFTED_ENTITIES;
    static constexpr size_t NUM_WIRES = AvmFlavorVariables::NUM_WIRES;
    static constexpr size_t NUM_ALL_ENTITIES = AvmFlavorVariables::NUM_ALL_ENTITIES;

    // In the sumcheck univariate computation, we divide the trace in chunks and each chunk is
    // evenly processed by all the threads. This constant defines the maximum number of rows
    // that a given thread will process per chunk. This constant is assumed to be a power of 2
    // greater or equal to 2.
    // The current constant 32 is the result of time measurements using 16 threads and against
    // bulk test v2. It was performed at a stage where the trace was not large.
    // We note that all the experiments with constants below 256 did not exhibit any significant differences.
    // TODO: Fine-tune the following constant when avm is close to completion.
    static constexpr size_t MAX_CHUNK_THREAD_PORTION_SIZE = 32;

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

    using RelationSeparator = std::array<FF, NUM_SUBRELATIONS>;

    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = compute_max_partial_relation_length<Relations>();

    static_assert(MAX_PARTIAL_RELATION_LENGTH < 8, "MAX_PARTIAL_RELATION_LENGTH must be less than 8");

    // BATCHED_RELATION_PARTIAL_LENGTH = algebraic degree of sumcheck relation *after* multiplying by the `pow_zeta`
    // random polynomial e.g. For \sum(x) [A(x) * B(x) + C(x)] * PowZeta(X), relation length = 2 and random relation
    // length = 3
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = MAX_PARTIAL_RELATION_LENGTH + 1;
    static constexpr size_t NUM_RELATIONS = std::tuple_size_v<Relations>;

    using SumcheckTupleOfTuplesOfUnivariates = decltype(create_sumcheck_tuple_of_tuples_of_univariates<Relations>());
    using TupleOfArraysOfValues = decltype(create_tuple_of_arrays_of_values<Relations>());

    static constexpr bool has_zero_row = true;

    static constexpr size_t NUM_FRS_COM = field_conversion::calc_num_bn254_frs<Commitment>();
    static constexpr size_t NUM_FRS_FR = field_conversion::calc_num_bn254_frs<FF>();

    // After any circuit changes, hover `COMPUTED_AVM_PROOF_LENGTH_IN_FIELDS` in your IDE
    // to see its value and then update `AVM_V2_PROOF_LENGTH_IN_FIELDS` in constants.nr.
    static constexpr size_t COMPUTED_AVM_PROOF_LENGTH_IN_FIELDS =
        (NUM_WITNESS_ENTITIES + 1) * NUM_FRS_COM + (NUM_ALL_ENTITIES + 1) * NUM_FRS_FR +
        CONST_PROOF_SIZE_LOG_N * (NUM_FRS_COM + NUM_FRS_FR * (BATCHED_RELATION_PARTIAL_LENGTH + 1));

    static_assert(AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED >= COMPUTED_AVM_PROOF_LENGTH_IN_FIELDS,
                  "\n The constant AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED is now too short\n"
                  "as is smaller than the real AVM v2 proof. Increase the padded constant \n"
                  "in constants.nr accordingly.");

    // TODO(#13390): Revive the following code once we freeze the number of colums in AVM.
    // static_assert(AVM_V2_PROOF_LENGTH_IN_FIELDS == COMPUTED_AVM_PROOF_LENGTH_IN_FIELDS,
    //               "\nUnexpected AVM V2 proof length. This might be due to some changes in the\n"
    //               "AVM circuit layout. In this case, modify AVM_V2_PROOF_LENGTH_IN_FIELDS \n"
    //               "in constants.nr accordingly.");

    // VK is composed of
    // - circuit size encoded as a fr field element
    // - num of inputs encoded as a fr field element
    // - NUM_PRECOMPUTED_ENTITIES commitments
    // TODO(#13390): Revive the following code once we freeze the number of colums in AVM.
    // static_assert(AVM_V2_VERIFICATION_KEY_LENGTH_IN_FIELDS == 2 * NUM_FRS_FR + NUM_PRECOMPUTED_ENTITIES *
    // NUM_FRS_COM,
    //               "\nUnexpected AVM V2 VK length. This might be due to some changes in the\n"
    //               "AVM circuit. In this case, modify AVM_V2_VERIFICATION_KEY_LENGTH_IN_FIELDS \n"
    //               "in constants.nr accordingly.");

    template <typename DataType_> class PrecomputedEntities {
      public:
        using DataType = DataType_;
        DEFINE_FLAVOR_MEMBERS(DataType_, AVM2_PRECOMPUTED_ENTITIES)
    };

  private:
    template <typename DataType> class WireEntities {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType, AVM2_WIRE_ENTITIES)
    };

    template <typename DataType> class DerivedWitnessEntities {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType, AVM2_DERIVED_WITNESS_ENTITIES)
    };

    template <typename DataType> class ShiftedEntities {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType, AVM2_SHIFTED_ENTITIES)
    };

    template <typename DataType, typename PrecomputedAndWitnessEntitiesSuperset>
    static auto get_to_be_shifted(PrecomputedAndWitnessEntitiesSuperset& entities)
    {
        return RefArray<DataType, NUM_SHIFTED_ENTITIES>{ AVM2_TO_BE_SHIFTED_E(entities.) };
    }

  public:
    template <typename DataType>
    class WitnessEntities : public WireEntities<DataType>, public DerivedWitnessEntities<DataType> {
      public:
        DEFINE_COMPOUND_GET_ALL(WireEntities<DataType>, DerivedWitnessEntities<DataType>)

        auto get_wires() { return WireEntities<DataType>::get_all(); }
        static const auto& get_wires_labels() { return WireEntities<DataType>::get_labels(); }
        auto get_derived() { return DerivedWitnessEntities<DataType>::get_all(); }
        static const auto& get_derived_labels() { return DerivedWitnessEntities<DataType>::get_labels(); }
    };

    template <typename DataType_>
    class AllEntities : public PrecomputedEntities<DataType_>,
                        public WitnessEntities<DataType_>,
                        public ShiftedEntities<DataType_> {
      public:
        using DataType = DataType_;
        DEFINE_COMPOUND_GET_ALL(PrecomputedEntities<DataType>, WitnessEntities<DataType>, ShiftedEntities<DataType>)

        auto get_unshifted()
        {
            return concatenate(PrecomputedEntities<DataType>::get_all(), WitnessEntities<DataType>::get_all());
        }

        static const auto& get_unshifted_labels()
        {
            static const auto labels =
                concatenate(PrecomputedEntities<DataType>::get_labels(), WitnessEntities<DataType>::get_labels());
            return labels;
        }

        auto get_to_be_shifted() { return AvmFlavor::get_to_be_shifted<DataType>(*this); }
        auto get_shifted() { return ShiftedEntities<DataType>::get_all(); }
        auto get_precomputed() { return PrecomputedEntities<DataType>::get_all(); }

        // We need both const and non-const versions.
        DataType& get(ColumnAndShifts c) { return get_entity_by_column(*this, c); }
        const DataType& get(ColumnAndShifts c) const { return get_entity_by_column(*this, c); }
    };

    class ProvingKey : public PrecomputedEntities<Polynomial>, public WitnessEntities<Polynomial> {
      public:
        using FF = typename Polynomial::FF;
        DEFINE_COMPOUND_GET_ALL(PrecomputedEntities<Polynomial>, WitnessEntities<Polynomial>);

        ProvingKey() = default;
        ProvingKey(const size_t circuit_size, const size_t num_public_inputs);

        size_t circuit_size;
        size_t log_circuit_size;
        size_t num_public_inputs;
        bb::EvaluationDomain<FF> evaluation_domain;
        CommitmentKey commitment_key;

        // Offset off the public inputs from the start of the execution trace
        size_t pub_inputs_offset = 0;

        // The number of public inputs has to be the same for all instances because they are
        // folded element by element.
        std::vector<FF> public_inputs;

        auto get_witness_polynomials() { return WitnessEntities<Polynomial>::get_all(); }
        auto get_precomputed_polynomials() { return PrecomputedEntities<Polynomial>::get_all(); }
        auto get_selectors() { return PrecomputedEntities<Polynomial>::get_all(); }
        auto get_to_be_shifted() { return AvmFlavor::get_to_be_shifted<Polynomial>(*this); }
    };

    class VerificationKey : public NativeVerificationKey_<PrecomputedEntities<Commitment>> {
      public:
        static constexpr size_t NUM_PRECOMPUTED_COMMITMENTS = NUM_PRECOMPUTED_ENTITIES;

        VerificationKey() = default;

        VerificationKey(const std::shared_ptr<ProvingKey>& proving_key)
            : NativeVerificationKey_(proving_key->circuit_size, static_cast<size_t>(proving_key->num_public_inputs))
        {
            for (auto [polynomial, commitment] :
                 zip_view(proving_key->get_precomputed_polynomials(), this->get_all())) {
                commitment = proving_key->commitment_key.commit(polynomial);
            }
        }

        VerificationKey(const size_t circuit_size,
                        const size_t num_public_inputs,
                        std::array<Commitment, NUM_PRECOMPUTED_COMMITMENTS> const& precomputed_cmts)
            : NativeVerificationKey_(circuit_size, num_public_inputs)
        {
            for (auto [vk_cmt, cmt] : zip_view(this->get_all(), precomputed_cmts)) {
                vk_cmt = cmt;
            }
        }

        std::vector<FF> to_field_elements() const;
    };

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

        // Only const-access is allowed here. That's all that the logderivative library requires.
        // https://github.com/AztecProtocol/aztec-packages/blob/e50d8e0/barretenberg/cpp/src/barretenberg/honk/proof_system/logderivative_library.hpp#L44.
        PolynomialEntitiesAtFixedRow<ProverPolynomials> get_row(size_t row_idx) const { return { row_idx, *this }; }
    };

    class PartiallyEvaluatedMultivariates : public AllEntities<Polynomial> {
      public:
        PartiallyEvaluatedMultivariates() = default;
        PartiallyEvaluatedMultivariates(const size_t circuit_size);
        PartiallyEvaluatedMultivariates(const ProverPolynomials& full_polynomials, size_t circuit_size);
    };

    /**
     * @brief A container for univariates used during Protogalaxy folding and sumcheck.
     * @details During folding and sumcheck, the prover evaluates the relations on these univariates.
     */
    template <size_t LENGTH> using ProverUnivariates = AllEntities<bb::Univariate<FF, LENGTH>>;

    /**
     * @brief A container for univariates used during Protogalaxy folding and sumcheck with some of the computation
     * optimistically ignored
     * @details During folding and sumcheck, the prover evaluates the relations on these univariates.
     */
    template <size_t LENGTH, size_t SKIP_COUNT>
    using ProverUnivariatesWithOptimisticSkipping = AllEntities<bb::Univariate<FF, LENGTH, 0, SKIP_COUNT>>;

    /**
     * @brief A container for univariates produced during the hot loop in sumcheck.
     */
    using ExtendedEdges = ProverUnivariates<MAX_PARTIAL_RELATION_LENGTH>;

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

    class Transcript : public NativeTranscript {
      public:
        uint32_t circuit_size;

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
};

} // namespace bb::avm2
