
#pragma once

#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/flavor/relation_definitions.hpp"
#include "barretenberg/polynomials/barycentric.hpp"
#include "barretenberg/polynomials/univariate.hpp"

#include "barretenberg/relations/generic_permutation/generic_permutation_relation.hpp"

#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/flavor_macros.hpp"
#include "barretenberg/polynomials/evaluation_domain.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/relations/generated/copy/copy.hpp"
#include "barretenberg/relations/generated/copy/copy_main.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

class CopyFlavor {
  public:
    using Curve = curve::BN254;
    using G1 = Curve::Group;
    using PCS = KZG<Curve>;

    using FF = G1::subgroup_field;
    using Polynomial = bb::Polynomial<FF>;
    using PolynomialHandle = std::span<FF>;
    using GroupElement = G1::element;
    using Commitment = G1::affine_element;
    using CommitmentHandle = G1::affine_element;
    using CommitmentKey = bb::CommitmentKey<Curve>;
    using VerifierCommitmentKey = bb::VerifierCommitmentKey<Curve>;
    using RelationSeparator = FF;

    static constexpr size_t NUM_PRECOMPUTED_ENTITIES = 2;
    static constexpr size_t NUM_WITNESS_ENTITIES = 17;
    static constexpr size_t NUM_WIRES = NUM_WITNESS_ENTITIES + NUM_PRECOMPUTED_ENTITIES;
    // We have two copies of the witness entities, so we subtract the number of fixed ones (they have no shift), one for
    // the unshifted and one for the shifted
    static constexpr size_t NUM_ALL_ENTITIES = 21;

    using Relations = std::tuple<Copy_vm::copy<FF>, copy_main_relation<FF>>;

    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = compute_max_partial_relation_length<Relations>();

    // BATCHED_RELATION_PARTIAL_LENGTH = algebraic degree of sumcheck relation *after* multiplying by the `pow_zeta`
    // random polynomial e.g. For \sum(x) [A(x) * B(x) + C(x)] * PowZeta(X), relation length = 2 and random relation
    // length = 3
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = MAX_PARTIAL_RELATION_LENGTH + 1;
    static constexpr size_t NUM_RELATIONS = std::tuple_size_v<Relations>;

    template <size_t NUM_INSTANCES>
    using ProtogalaxyTupleOfTuplesOfUnivariates =
        decltype(create_protogalaxy_tuple_of_tuples_of_univariates<Relations, NUM_INSTANCES>());
    using SumcheckTupleOfTuplesOfUnivariates = decltype(create_sumcheck_tuple_of_tuples_of_univariates<Relations>());
    using TupleOfArraysOfValues = decltype(create_tuple_of_arrays_of_values<Relations>());

    static constexpr bool has_zero_row = true;

  private:
    template <typename DataType_> class PrecomputedEntities : public PrecomputedEntitiesBase {
      public:
        using DataType = DataType_;

        DEFINE_FLAVOR_MEMBERS(DataType, copy_lagrange_first, copy_lagrange_last)

        RefVector<DataType> get_selectors() { return { copy_lagrange_first, copy_lagrange_last }; };
        RefVector<DataType> get_sigma_polynomials() { return {}; };
        RefVector<DataType> get_id_polynomials() { return {}; };
        RefVector<DataType> get_table_polynomials() { return {}; };
    };

    template <typename DataType> class WitnessEntities {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType,
                              copy_a,
                              copy_b,
                              copy_c,
                              copy_d,
                              copy_sigma_a,
                              copy_sigma_b,
                              copy_sigma_c,
                              copy_sigma_d,
                              copy_sigma_x,
                              copy_sigma_y,
                              copy_sigma_z,
                              copy_x,
                              copy_y,
                              copy_z,
                              copy_main,
                              id_0,
                              id_1)

        RefVector<DataType> get_wires()
        {
            return { copy_a,       copy_b,       copy_c,       copy_d,       copy_sigma_a, copy_sigma_b,
                     copy_sigma_c, copy_sigma_d, copy_sigma_x, copy_sigma_y, copy_sigma_z, copy_x,
                     copy_y,       copy_z,       copy_main,    id_0,         id_1 };
        };
    };

    template <typename DataType> class AllEntities {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType,
                              copy_lagrange_first,
                              copy_lagrange_last,
                              copy_a,
                              copy_b,
                              copy_c,
                              copy_d,
                              copy_sigma_a,
                              copy_sigma_b,
                              copy_sigma_c,
                              copy_sigma_d,
                              copy_sigma_x,
                              copy_sigma_y,
                              copy_sigma_z,
                              copy_x,
                              copy_y,
                              copy_z,
                              copy_main,
                              id_0,
                              id_1,
                              copy_d_shift,
                              copy_main_shift)

        RefVector<DataType> get_wires()
        {
            return { copy_lagrange_first,
                     copy_lagrange_last,
                     copy_a,
                     copy_b,
                     copy_c,
                     copy_d,
                     copy_sigma_a,
                     copy_sigma_b,
                     copy_sigma_c,
                     copy_sigma_d,
                     copy_sigma_x,
                     copy_sigma_y,
                     copy_sigma_z,
                     copy_x,
                     copy_y,
                     copy_z,
                     copy_main,
                     id_0,
                     id_1,
                     copy_d_shift,
                     copy_main_shift };
        };
        RefVector<DataType> get_unshifted()
        {
            return { copy_lagrange_first,
                     copy_lagrange_last,
                     copy_a,
                     copy_b,
                     copy_c,
                     copy_d,
                     copy_sigma_a,
                     copy_sigma_b,
                     copy_sigma_c,
                     copy_sigma_d,
                     copy_sigma_x,
                     copy_sigma_y,
                     copy_sigma_z,
                     copy_x,
                     copy_y,
                     copy_z,
                     copy_main,
                     id_0,
                     id_1 };
        };
        RefVector<DataType> get_to_be_shifted() { return { copy_d, copy_main }; };
        RefVector<DataType> get_shifted() { return { copy_d_shift, copy_main_shift }; };
    };

  public:
    class ProvingKey
        : public ProvingKeyAvm_<PrecomputedEntities<Polynomial>, WitnessEntities<Polynomial>, CommitmentKey> {
      public:
        // Expose constructors on the base class
        using Base = ProvingKeyAvm_<PrecomputedEntities<Polynomial>, WitnessEntities<Polynomial>, CommitmentKey>;
        using Base::Base;

        RefVector<DataType> get_to_be_shifted() { return { copy_d, copy_main }; };
    };

    using VerificationKey = VerificationKey_<PrecomputedEntities<Commitment>, VerifierCommitmentKey>;

    class AllValues : public AllEntities<FF> {
      public:
        using Base = AllEntities<FF>;
        using Base::Base;
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

        ProverPolynomials(ProvingKey& proving_key)
        {
            for (auto [prover_poly, key_poly] : zip_view(this->get_unshifted(), proving_key.get_all())) {
                ASSERT(flavor_get_label(*this, prover_poly) == flavor_get_label(proving_key, key_poly));
                prover_poly = key_poly.share();
            }
            for (auto [prover_poly, key_poly] : zip_view(this->get_shifted(), proving_key.get_to_be_shifted())) {
                ASSERT(flavor_get_label(*this, prover_poly) == (flavor_get_label(proving_key, key_poly) + "_shift"));
                prover_poly = key_poly.shifted();
            }
        }

        [[nodiscard]] size_t get_polynomial_size() const { return copy_a.size(); }
        /**
         * @brief Returns the evaluations of all prover polynomials at one point on the boolean hypercube, which
         * represents one row in the execution trace.
         */
        [[nodiscard]] AllValues get_row(size_t row_idx) const
        {
            AllValues result;
            for (auto [result_field, polynomial] : zip_view(result.get_all(), this->get_all())) {
                result_field = polynomial[row_idx];
            }
            return result;
        }
    };

    class PartiallyEvaluatedMultivariates : public AllEntities<Polynomial> {
      public:
        PartiallyEvaluatedMultivariates() = default;
        PartiallyEvaluatedMultivariates(const size_t circuit_size)
        {
            // Storage is only needed after the first partial evaluation, hence polynomials of size (n / 2)
            for (auto& poly : get_all()) {
                poly = Polynomial(circuit_size / 2);
            }
        }
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
    using OptimisedProverUnivariates = AllEntities<bb::Univariate<FF, LENGTH, 0, SKIP_COUNT>>;

    /**
     * @brief A container for univariates produced during the hot loop in sumcheck.
     */
    using ExtendedEdges = ProverUnivariates<MAX_PARTIAL_RELATION_LENGTH>;

    /**
     * @brief A container for the witness commitments.
     *
     */
    using WitnessCommitments = WitnessEntities<Commitment>;

    class CommitmentLabels : public AllEntities<std::string> {
      private:
        using Base = AllEntities<std::string>;

      public:
        CommitmentLabels()
            : AllEntities<std::string>()
        {
            Base::copy_lagrange_first = "COPY_LAGRANGE_FIRST";
            Base::copy_lagrange_last = "COPY_LAGRANGE_LAST";
            Base::copy_a = "COPY_A";
            Base::copy_b = "COPY_B";
            Base::copy_c = "COPY_C";
            Base::copy_d = "COPY_D";
            Base::copy_sigma_a = "COPY_SIGMA_A";
            Base::copy_sigma_b = "COPY_SIGMA_B";
            Base::copy_sigma_c = "COPY_SIGMA_C";
            Base::copy_sigma_d = "COPY_SIGMA_D";
            Base::copy_sigma_x = "COPY_SIGMA_X";
            Base::copy_sigma_y = "COPY_SIGMA_Y";
            Base::copy_sigma_z = "COPY_SIGMA_Z";
            Base::copy_x = "COPY_X";
            Base::copy_y = "COPY_Y";
            Base::copy_z = "COPY_Z";
            Base::copy_main = "COPY_MAIN";
            Base::id_0 = "ID_0";
            Base::id_1 = "ID_1";
        };
    };

    class VerifierCommitments : public AllEntities<Commitment> {
      private:
        using Base = AllEntities<Commitment>;

      public:
        VerifierCommitments(const std::shared_ptr<VerificationKey>& verification_key)
        {
            copy_lagrange_first = verification_key->copy_lagrange_first;
            copy_lagrange_last = verification_key->copy_lagrange_last;
        }
    };

    class Transcript : public NativeTranscript {
      public:
        uint32_t circuit_size;

        Commitment copy_a;
        Commitment copy_b;
        Commitment copy_c;
        Commitment copy_d;
        Commitment copy_sigma_a;
        Commitment copy_sigma_b;
        Commitment copy_sigma_c;
        Commitment copy_sigma_d;
        Commitment copy_sigma_x;
        Commitment copy_sigma_y;
        Commitment copy_sigma_z;
        Commitment copy_x;
        Commitment copy_y;
        Commitment copy_z;
        Commitment copy_main;
        Commitment id_0;
        Commitment id_1;

        std::vector<bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH>> sumcheck_univariates;
        std::array<FF, NUM_ALL_ENTITIES> sumcheck_evaluations;
        std::vector<Commitment> zm_cq_comms;
        Commitment zm_cq_comm;
        Commitment zm_pi_comm;

        Transcript() = default;

        Transcript(const std::vector<FF>& proof)
            : NativeTranscript(proof)
        {}

        void deserialize_full_transcript()
        {
            size_t num_frs_read = 0;
            circuit_size = deserialize_from_buffer<uint32_t>(proof_data, num_frs_read);
            size_t log_n = numeric::get_msb(circuit_size);

            copy_a = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            copy_b = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            copy_c = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            copy_d = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            copy_sigma_a = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            copy_sigma_b = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            copy_sigma_c = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            copy_sigma_d = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            copy_sigma_x = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            copy_sigma_y = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            copy_sigma_z = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            copy_x = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            copy_y = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            copy_z = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            copy_main = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            id_0 = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            id_1 = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);

            for (size_t i = 0; i < log_n; ++i) {
                sumcheck_univariates.emplace_back(
                    deserialize_from_buffer<bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH>>(Transcript::proof_data,
                                                                                                 num_frs_read));
            }
            sumcheck_evaluations =
                deserialize_from_buffer<std::array<FF, NUM_ALL_ENTITIES>>(Transcript::proof_data, num_frs_read);
            for (size_t i = 0; i < log_n; ++i) {
                zm_cq_comms.push_back(deserialize_from_buffer<Commitment>(proof_data, num_frs_read));
            }
            zm_cq_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            zm_pi_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
        }

        void serialize_full_transcript()
        {
            size_t old_proof_length = proof_data.size();
            Transcript::proof_data.clear();
            size_t log_n = numeric::get_msb(circuit_size);

            serialize_to_buffer(circuit_size, Transcript::proof_data);

            serialize_to_buffer<Commitment>(copy_a, Transcript::proof_data);
            serialize_to_buffer<Commitment>(copy_b, Transcript::proof_data);
            serialize_to_buffer<Commitment>(copy_c, Transcript::proof_data);
            serialize_to_buffer<Commitment>(copy_d, Transcript::proof_data);
            serialize_to_buffer<Commitment>(copy_sigma_a, Transcript::proof_data);
            serialize_to_buffer<Commitment>(copy_sigma_b, Transcript::proof_data);
            serialize_to_buffer<Commitment>(copy_sigma_c, Transcript::proof_data);
            serialize_to_buffer<Commitment>(copy_sigma_d, Transcript::proof_data);
            serialize_to_buffer<Commitment>(copy_sigma_x, Transcript::proof_data);
            serialize_to_buffer<Commitment>(copy_sigma_y, Transcript::proof_data);
            serialize_to_buffer<Commitment>(copy_sigma_z, Transcript::proof_data);
            serialize_to_buffer<Commitment>(copy_x, Transcript::proof_data);
            serialize_to_buffer<Commitment>(copy_y, Transcript::proof_data);
            serialize_to_buffer<Commitment>(copy_z, Transcript::proof_data);
            serialize_to_buffer<Commitment>(copy_main, Transcript::proof_data);
            serialize_to_buffer<Commitment>(id_0, Transcript::proof_data);
            serialize_to_buffer<Commitment>(id_1, Transcript::proof_data);

            for (size_t i = 0; i < log_n; ++i) {
                serialize_to_buffer(sumcheck_univariates[i], Transcript::proof_data);
            }
            serialize_to_buffer(sumcheck_evaluations, Transcript::proof_data);
            for (size_t i = 0; i < log_n; ++i) {
                serialize_to_buffer(zm_cq_comms[i], proof_data);
            }
            serialize_to_buffer(zm_cq_comm, proof_data);
            serialize_to_buffer(zm_pi_comm, proof_data);

            // sanity check to make sure we generate the same length of proof as before.
            ASSERT(proof_data.size() == old_proof_length);
        }
    };
};

} // namespace bb
