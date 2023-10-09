
#pragma once
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/honk/pcs/commitment_key.hpp"
#include "barretenberg/honk/pcs/ipa/ipa.hpp"
#include "barretenberg/honk/pcs/kzg/kzg.hpp"
#include "barretenberg/honk/pcs/verification_key.hpp"
#include "barretenberg/polynomials/barycentric.hpp"
#include "barretenberg/polynomials/univariate.hpp"

#include "barretenberg/honk/transcript/transcript.hpp"
#include "barretenberg/polynomials/evaluation_domain.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/proof_system/circuit_builder/fib_vm/fib_vm_trace_builder.hpp"
#include "barretenberg/proof_system/flavor/flavor.hpp"
#include "barretenberg/proof_system/relations/auxiliary_relation.hpp"
#include "barretenberg/proof_system/relations/elliptic_relation.hpp"
#include "barretenberg/proof_system/relations/fib_vm/fib_relation.hpp"
#include "barretenberg/proof_system/relations/gen_perm_sort_relation.hpp"
#include "barretenberg/proof_system/relations/lookup_relation.hpp"
#include "barretenberg/proof_system/relations/permutation_relation.hpp"
#include "barretenberg/proof_system/relations/ultra_arithmetic_relation.hpp"
#include "barretenberg/proof_system/types/circuit_type.hpp"
#include <array>
#include <concepts>
#include <span>
#include <string>
#include <type_traits>
#include <vector>

namespace proof_system::honk::flavor::fib_vm {

class FibVM {

  public:
    using CircuitBuilder = proof_system::FibVMTraceBuilder;
    using Curve = curve::BN254;
    using FF = Curve::ScalarField;
    using PCS = pcs::kzg::KZG<Curve>;
    using GroupElement = Curve::AffineElement;
    using Commitment = Curve::AffineElement;
    using CommitmentHandle = Curve::AffineElement;
    using Polynomial = barretenberg::Polynomial<FF>;
    using PolynomialHandle = std::span<FF>;
    using CommitmentKey = pcs::CommitmentKey<Curve>;
    using VerifierCommitmentKey = pcs::VerifierCommitmentKey<Curve>;

    static constexpr size_t NUM_WIRES = CircuitBuilder::NUM_WIRES;

    static constexpr size_t NUM_ALL_ENTITIES = 5;
    static constexpr size_t NUM_PRECOMPUTED_ENTITIES = 0;
    // We are including shifts as witnesses on this occasion to work out how to perform
    // permutation checks
    static constexpr size_t NUM_WITNESS_ENTITIES = 5;

    // TODO: implement the FibPerm relation
    // using GrandProductRelations = std::tuple<proof_system::fib_vm::FibPermRelation<FF>>;

    // We only have the one relation here and one permutation relation to work with
    // using Relations = std::tuple<proof_system::fib_vm::FibRelation<FF>, proof_system::fib_vm::FibPermRelation<FF>>;
    using Relations = std::tuple<proof_system::fib_vm::FibRelation<FF>>;

    static constexpr size_t MAX_RELATION_LENGTH = get_max_relation_length<Relations>();

    // MAX_RANDOM_RELATION_LENGTH = algebraic degree of sumcheck relation *after* multiplying by the `pow_zeta` random
    // polynomial e.g. For \sum(x) [A(x) * B(x) + C(x)] * PowZeta(X), relation length = 2 and random relation length = 3
    static constexpr size_t MAX_RANDOM_RELATION_LENGTH = MAX_RELATION_LENGTH + 1;
    static constexpr size_t NUM_RELATIONS = std::tuple_size<Relations>::value;

    // define the container for storing the univariate contribution from each relation in Sumcheck
    using RelationUnivariates = decltype(create_relation_univariates_container<FF, Relations>());
    using RelationValues = decltype(create_relation_values_container<FF, Relations>());

    // Whether or not the first row of the execution trace is reserved for 0s to enable shifts
    // We have it false here as we are not using shifts in their traditional self, where they can
    // be hidden by the PCS, instead we are using a permutation relation to deal with shifted polys
    static constexpr bool has_zero_row = false;

  private:
    // Container for precomputed entities
    // We do not have any for the FibVM as it is all commitments baby
    template <typename DataType, typename HandleType>
    class PrecomputedEntities : public PrecomputedEntities_<DataType, HandleType, NUM_PRECOMPUTED_ENTITIES> {
      public:
        // NOTE: This is an enum for STANDARD, ULTRA and undefined, I think there is a good amount of
        // tech debt to clean up here, what does the eccvm have for here, does it not generalize properly

        // static constexpr CircuitType CIRCUIT_TYPE = CircuitType::UNDEFINED;
        static constexpr CircuitType CIRCUIT_TYPE = CircuitType::UNDEFINED;

        std::vector<HandleType> get_selectors() override { return {}; }
        std::vector<HandleType> get_sigma_polynomials() override { return {}; }
        std::vector<HandleType> get_id_polynomials() override { return {}; }
        std::vector<HandleType> get_table_polynomials() { return {}; }
    };

    // Container for witness entities
    // In this case we include our shifts, as we are not being optimal here.
    template <typename DataType, typename HandleType>
    class WitnessEntities : public WitnessEntities_<DataType, HandleType, NUM_WITNESS_ENTITIES> {
      public:
        DataType& x = std::get<0>(this->data);
        DataType& y = std::get<1>(this->data);
        DataType& x_shift = std::get<2>(this->data);
        DataType& y_shift = std::get<3>(this->data);
        DataType& is_last = std::get<4>(this->data);

        // NOTE: look at the ultra honk flavour, here z_perm and z_lookup are included here,
        // Are these selectors that are turned on by the user? Why would they not be rigid and used
        // by the proving system for general polynomial stuff

        std::vector<HandleType> get_wires() override
        {
            return {
                x, y, x_shift, y_shift, is_last,
            };
        }

        std::vector<HandleType> get_sorted_polynomials() { return {}; };
    };

    // Container for all entities
    template <typename DataType, typename HandleType>
    class AllEntities : public AllEntities_<DataType, HandleType, NUM_ALL_ENTITIES> {
      public:
        DataType& x = std::get<0>(this->_data);
        DataType& y = std::get<1>(this->_data);
        DataType& x_shift = std::get<2>(this->_data);
        DataType& y_shift = std::get<3>(this->_data);
        DataType& is_last = std::get<4>(this->_data);

        // static constexpr CircuitType CIRCUIT_TYPE = CircuitType::CIRCUIT_TYPE;
        static constexpr CircuitType CIRCUIT_TYPE = CircuitType::UNDEFINED;

        // Boilerplate taken from ultra
        AllEntities() = default;
        AllEntities(const AllEntities& other)
            : AllEntities_<DataType, HandleType, NUM_ALL_ENTITIES>(other){};

        AllEntities(AllEntities&& other)
            : AllEntities_<DataType, HandleType, NUM_ALL_ENTITIES>(other){};
        AllEntities& operator=(const AllEntities& other)
        {
            if (this == &other) {
                return *this;
            }
            AllEntities_<DataType, HandleType, NUM_ALL_ENTITIES>::operator=(other);
            return *this;
        }

        AllEntities& operator=(AllEntities&& other)
        {
            AllEntities_<DataType, HandleType, NUM_ALL_ENTITIES>::operator=(other);
            return *this;
        }
        ~AllEntities() = default;
    };

    class ProvingKey : public ProvingKey_<PrecomputedEntities<Polynomial, PolynomialHandle>,
                                          WitnessEntities<Polynomial, PolynomialHandle>> {
      public:
        using Base = ProvingKey_<PrecomputedEntities<Polynomial, PolynomialHandle>,
                                 WitnessEntities<Polynomial, PolynomialHandle>>;
        using Base::Base;

        std::vector<uint32_t> memory_read_records;
    };

    using RawPolynomials = AllEntities<Polynomial, PolynomialHandle>;

    // All univariates produced during sumcheck
    template <size_t MAX_RELATION_LENGTH>
    using ExtendedEdges = AllEntities<barretenberg::Univariate<FF, MAX_RELATION_LENGTH>,
                                      barretenberg::Univariate<FF, MAX_RELATION_LENGTH>>;

    /**
     * @brief A container for the polynomials evaluations produced during sumcheck, which are purported to be the
     * evaluations of polynomials committed in earlier rounds.
     */
    class ClaimedEvaluations : public AllEntities<FF, FF> {
      public:
        using Base = AllEntities<FF, FF>;
        using Base::Base;
        ClaimedEvaluations(std::array<FF, NUM_ALL_ENTITIES> _data_in) { this->_data = _data_in; }
    };

    /**
     * @brief A container for commitment labels.
     * @note It's debatable whether this should inherit from AllEntities. since most entries are not strictly needed. It
     * has, however, been useful during debugging to have these labels available.
     *
     */
    class CommitmentLabels : public AllEntities<std::string, std::string> {
      public:
        CommitmentLabels()
        {
            x = "X";
            y = "Y";
            x_shift = "X_SHIFT";
            y_shift = "Y_SHIFT";
            is_last = "IS_LAST";
        };
    };

    using VerificationKey = VerificationKey_<PrecomputedEntities<Commitment, CommitmentHandle>>;

    class VerifierCommitments : public AllEntities<Commitment, CommitmentHandle> {
      public:
        VerifierCommitments(std::shared_ptr<VerificationKey> verification_key, VerifierTranscript<FF> transcript)
        {
            // TODO(Maddiaa): these are placeholders
            static_cast<void>(transcript);
            static_cast<void>(verification_key);
        }
    };
};

} // namespace proof_system::honk::flavor::fib_vm