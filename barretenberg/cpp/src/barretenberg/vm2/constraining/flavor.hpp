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
#include "barretenberg/transcript/transcript.hpp"

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/constants.hpp"
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
    // indicates when evaluating sumcheck, edges must be extended to be MAX_TOTAL_RELATION_LENGTH
    static constexpr bool USE_SHORT_MONOMIALS = false;
    // This flavor would not be used with ZK Sumcheck
    static constexpr bool HasZK = false;
    // Padding in Sumcheck and Shplemini
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

    using SubrelationSeparators = std::array<FF, NUM_SUBRELATIONS - 1>;

    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = compute_max_partial_relation_length<Relations>();

    static_assert(MAX_PARTIAL_RELATION_LENGTH < 8, "MAX_PARTIAL_RELATION_LENGTH must be less than 8");

    // BATCHED_RELATION_PARTIAL_LENGTH = algebraic degree of sumcheck relation *after* multiplying by the `pow_zeta`
    // random polynomial e.g. For \sum(x) [A(x) * B(x) + C(x)] * PowZeta(X), relation length = 2 and random relation
    // length = 3
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = MAX_PARTIAL_RELATION_LENGTH + 1;
    static constexpr size_t NUM_RELATIONS = std::tuple_size_v<Relations>;

    static constexpr bool has_zero_row = true;

    static constexpr size_t NUM_FRS_COM = field_conversion::calc_num_bn254_frs<Commitment>();
    static constexpr size_t NUM_FRS_FR = field_conversion::calc_num_bn254_frs<FF>();

    // After any circuit changes, hover `COMPUTED_AVM_PROOF_LENGTH_IN_FIELDS` in your IDE
    // to see its value and then update `AVM_V2_PROOF_LENGTH_IN_FIELDS` in constants.nr.
    static constexpr size_t COMPUTED_AVM_PROOF_LENGTH_IN_FIELDS =
        (NUM_WITNESS_ENTITIES + 1) * NUM_FRS_COM + (NUM_ALL_ENTITIES + 1) * NUM_FRS_FR +
        MAX_AVM_TRACE_LOG_SIZE * (NUM_FRS_COM + NUM_FRS_FR * (BATCHED_RELATION_PARTIAL_LENGTH + 1));

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

    class VerificationKey
        : public NativeVerificationKey_<PrecomputedEntities<Commitment>, Transcript, VKSerializationMode::NO_METADATA> {
      public:
        static constexpr size_t NUM_PRECOMPUTED_COMMITMENTS = NUM_PRECOMPUTED_ENTITIES;

        VerificationKey() = default;

        VerificationKey(const std::shared_ptr<ProvingKey>& proving_key)
        {
            this->log_circuit_size = MAX_AVM_TRACE_LOG_SIZE;
            for (auto [polynomial, commitment] : zip_view(proving_key->get_precomputed(), this->get_all())) {
                commitment = proving_key->commitment_key.commit(polynomial);
            }
        }

        VerificationKey(std::array<Commitment, NUM_PRECOMPUTED_COMMITMENTS> const& precomputed_cmts)
        {
            this->log_circuit_size = MAX_AVM_TRACE_LOG_SIZE;
            for (auto [vk_cmt, cmt] : zip_view(this->get_all(), precomputed_cmts)) {
                vk_cmt = cmt;
            }
        }

        /**
         * @brief Unimplemented because AVM VK is hardcoded so hash does not need to be computed. Rather, we just add
         * the provided VK hash directly to the transcript.
         */
        fr hash_through_transcript([[maybe_unused]] const std::string& domain_separator,
                                   [[maybe_unused]] Transcript& transcript) const override
        {
            throw_or_abort("Not intended to be used because vk is hardcoded in circuit.");
        }
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
