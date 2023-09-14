/**
 * @file flavor.hpp
 * @brief Base class templates for structures that contain data parameterized by the fundamental polynomials of a Honk
 * variant (a "flavor").
 *
 * @details #Motivation
 * We choose the framework set out in these classes for several reasons.
 *
 * For one, it allows for a large amount of the information of a Honk flavor to be read at a glance in a single file.
 *
 * The primary motivation, however, is to reduce the sort loose of coupling that is a significant source of complexity
 * in the original plonk code. There, we find many similarly-named entities defined in many different places (to name
 * some: selector_properties; FooSelectors; PolynomialIndex; the labels given to the polynomial store; the commitment
 * label; inconsistent terminology and notation around these), and it can be difficult to discover or remember the
 * relationships between these. We aim for a more uniform treatment, to enfore identical and informative naming, and to
 * prevent the developer having to think very much about the ordering of protocol entities in disparate places.
 *
 * Another motivation is iterate on the polynomial manifest of plonk, which is nice in its compatness, but which feels
 * needlessly manual and low-level. In the past, this contained even more boolean parameters, making it quite hard to
 * parse. A typical construction is to loop over the polynomial manifest by extracting a globally-defined
 * "FOO_MANIFEST_SIZE" (the use of "manifest" here is distinct from the manifests in the transcript) to loop
 * over a C-style array, and then manually parsing the various tags of different types in the manifest entries. We
 * greatly enrich this structure by using basic C++ OOP functionality. Rather than recording the polynomial source in an
 * enum, we group polynomial handles using getter functions in our new class. We get code that is more compact,
 * more legible, and which is safer because it admits ranged `for` loops.
 *
 * Another motivation is proper and clear specification of Honk variants. The flavors are meant to be explicit and
 * easily comparable. In plonk, the various settings template parameters and objects like the CircuitType enum became
 * overloaded in time, and continue to be a point of accumulation for tech debt. We aim to remedy some of this by
 * putting proving system information in the flavor, and circuit construction information in the arithmetization (or
 * larger circuit constructor class).
 *
 * @details #Data model
 * All of the flavor classes derive from a single Entities_ template, which simply wraps a std::array (we would
 * inherit, but this is unsafe as std::array has a non-virtual destructor). The developer should think of every flavor
 * class as being:
 *  - A std::array<DataType, N> instance called _data.
 *  - An informative name for each entry of _data that is fixed at compile time.
 *  - Some classic metadata like we'd see in plonk (e.g., a circuit size, a reference string, an evaluation domain).
 *  - A collection of getters that record subsets of the array that are of interest in the Honk variant.
 *
 * Each getter returns a container of HandleType's, where a HandleType is a value type that is inexpensive to create and
 * that lets one view and mutate a DataType instance. The primary example here is that std::span is the handle type
 * chosen for barrtenberg::Polynomial.
 *
 * @details #Some Notes
 *
 * @note It would be ideal to codify more structure in these base class template and to have it imposed on the actual
 * flavors, but our inheritance model is complicated as it is, and we saw no reasonable way to fix this.
 *
 * @note One asymmetry to note is in the use of the term "key". It is worthwhile to distinguish betwen prover/verifier
 * circuit data, and "keys" that consist of such data augmented with witness data (whether, raw, blinded, or polynomial
 * commitments). Currently the proving key contains witness data, while the verification key does not.
 * TODO(Cody): It would be nice to resolve this but it's not essential.
 *
 * @note The VerifierCommitments classes are not 'tight' in the sense that that the underlying array contains(a few)
 * empty slots. This is a conscious choice to limit complexity. Note that there is very little memory cost here since
 * the DataType size in that case is small.
 *
 * @todo TODO(#395): Getters should return arrays?
 * @todo TODO(#396): Access specifiers?
 * @todo TODO(#397): Use more handle types?
 * @todo TODO(#398): Selectors should come from arithmetization.
 */

#pragma once
#include "barretenberg/polynomials/barycentric.hpp"
#include "barretenberg/polynomials/evaluation_domain.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/proof_system/circuit_builder/circuit_simulator.hpp"
#include "barretenberg/proof_system/types/circuit_type.hpp"
#include <array>
#include <concepts>
#include <vector>

namespace proof_system::honk::flavor {

/**
 * @brief Base data class template, a wrapper for std::array, from which every flavor class ultimately derives.
 *
 * @tparam T The underlying data type stored in the array
 * @tparam HandleType The type that will be used to
 * @tparam NUM_ENTITIES The size of the underlying array.
 */
template <typename DataType, typename HandleType, size_t NUM_ENTITIES> class Entities_ {
  public:
    using ArrayType = std::array<DataType, NUM_ENTITIES>;
    ArrayType _data;

    virtual ~Entities_() = default;

    DataType& operator[](size_t idx) { return _data[idx]; };
    typename ArrayType::iterator begin() { return _data.begin(); };
    typename ArrayType::iterator end() { return _data.end(); };

    constexpr size_t size() { return NUM_ENTITIES; };
};

/**
 * @brief Base class template containing circuit-specifying data.
 *
 */
template <typename DataType_, typename HandleType, size_t NUM_PRECOMPUTED_ENTITIES>
class PrecomputedEntities_ : public Entities_<DataType_, HandleType, NUM_PRECOMPUTED_ENTITIES> {
  public:
    using DataType = DataType_;

    size_t circuit_size;
    size_t log_circuit_size;
    size_t num_public_inputs;
    CircuitType circuit_type; // TODO(#392)

    virtual std::vector<HandleType> get_selectors() = 0;
    virtual std::vector<HandleType> get_sigma_polynomials() = 0;
    virtual std::vector<HandleType> get_id_polynomials() = 0;
};

/**
 * @brief Base class template containing witness (wires and derived witnesses).
 * @details Shifts are not included here since they do not occupy their own memory.
 */
template <typename DataType, typename HandleType, size_t NUM_WITNESS_ENTITIES>
class WitnessEntities_ : public Entities_<DataType, HandleType, NUM_WITNESS_ENTITIES> {
  public:
    virtual std::vector<HandleType> get_wires() = 0;
};

/**
 * @brief Base proving key class.
 *
 * @tparam PrecomputedEntities An instance of PrecomputedEntities_ with polynomial data type and span handle type.
 * @tparam FF The scalar field on which we will encode our polynomial data. When instantiating, this may be extractable
 * from the other template paramter.
 */
template <typename PrecomputedPolynomials, typename WitnessPolynomials>
class ProvingKey_ : public PrecomputedPolynomials, public WitnessPolynomials {
  public:
    using Polynomial = typename PrecomputedPolynomials::DataType;
    using FF = typename Polynomial::FF;

    typename PrecomputedPolynomials::ArrayType& _precomputed_polynomials = PrecomputedPolynomials::_data;
    typename WitnessPolynomials::ArrayType& _witness_polynomials = WitnessPolynomials::_data;

    bool contains_recursive_proof;
    std::vector<uint32_t> recursive_proof_public_input_indices;
    barretenberg::EvaluationDomain<FF> evaluation_domain;

    ProvingKey_() = default;
    ProvingKey_(const size_t circuit_size, const size_t num_public_inputs)
    {
        this->evaluation_domain = barretenberg::EvaluationDomain<FF>(circuit_size, circuit_size);
        PrecomputedPolynomials::circuit_size = circuit_size;
        this->log_circuit_size = numeric::get_msb(circuit_size);
        this->num_public_inputs = num_public_inputs;
        // Allocate memory for precomputed polynomials
        for (auto& poly : _precomputed_polynomials) {
            poly = Polynomial(circuit_size);
        }
        // Allocate memory for witness polynomials
        for (auto& poly : _witness_polynomials) {
            poly = Polynomial(circuit_size);
        }
    };
};

/**
 * @brief Base verification key class.
 *
 * @tparam PrecomputedEntities An instance of PrecomputedEntities_ with affine_element data type and handle type.
 */
template <typename PrecomputedCommitments> class VerificationKey_ : public PrecomputedCommitments {
  public:
    VerificationKey_() = default;
    VerificationKey_(const size_t circuit_size, const size_t num_public_inputs)
    {
        this->circuit_size = circuit_size;
        this->log_circuit_size = numeric::get_msb(circuit_size);
        this->num_public_inputs = num_public_inputs;
    };
};

/**
 * @brief Base class containing all entities (or handles on these) in one place.
 *
 * @tparam PrecomputedEntities An instance of PrecomputedEntities_ with affine_element data type and handle type.
 */
template <typename DataType, typename HandleType, size_t NUM_ALL_ENTITIES>
class AllEntities_ : public Entities_<DataType, DataType, NUM_ALL_ENTITIES> {
  public:
    virtual std::vector<HandleType> get_wires() = 0;
    virtual std::vector<HandleType> get_unshifted() = 0;
    virtual std::vector<HandleType> get_to_be_shifted() = 0;
    virtual std::vector<HandleType> get_shifted() = 0;

    // Because of how Gemini is written, is importat to put the polynomials out in this order.
    std::vector<HandleType> get_unshifted_then_shifted()
    {
        std::vector<HandleType> result{ get_unshifted() };
        std::vector<HandleType> shifted{ get_shifted() };
        result.insert(result.end(), shifted.begin(), shifted.end());
        return result;
    };
};

/**
 * @brief Recursive utility function to find max RELATION_LENGTH over tuple of Relations
 *
 */
template <typename Tuple, std::size_t Index = 0> static constexpr size_t get_max_relation_length()
{
    if constexpr (Index >= std::tuple_size<Tuple>::value) {
        return 0; // Return 0 when reach end of the tuple
    } else {
        constexpr size_t current_length = std::tuple_element<Index, Tuple>::type::RELATION_LENGTH;
        constexpr size_t next_length = get_max_relation_length<Tuple, Index + 1>();
        return (current_length > next_length) ? current_length : next_length;
    }
}

/**
 * @brief Recursive utility function to construct tuple of tuple of Univariates
 * @details This is the container for storing the univariate contributions from each identity in each relation. Each
 * Relation contributes a tuple with num-identities many Univariates and there are num-relations many tuples in the
 * outer tuple.
 */
template <class FF, typename Tuple, std::size_t Index = 0> static constexpr auto create_relation_univariates_container()
{
    if constexpr (Index >= std::tuple_size<Tuple>::value) {
        return std::tuple<>{}; // Return empty when reach end of the tuple
    } else {
        using UnivariateTuple = typename std::tuple_element_t<Index, Tuple>::RelationUnivariates;
        return std::tuple_cat(std::tuple<UnivariateTuple>{},
                              create_relation_univariates_container<FF, Tuple, Index + 1>());
    }
}

/**
 * @brief Recursive utility function to construct tuple of arrays
 * @details Container for storing value of each identity in each relation. Each Relation contributes an array of
 * length num-identities.
 */
template <class FF, typename Tuple, std::size_t Index = 0> static constexpr auto create_relation_values_container()
{
    if constexpr (Index >= std::tuple_size<Tuple>::value) {
        return std::tuple<>{}; // Return empty when reach end of the tuple
    } else {
        using ValuesArray = typename std::tuple_element_t<Index, Tuple>::RelationValues;
        return std::tuple_cat(std::tuple<ValuesArray>{}, create_relation_values_container<FF, Tuple, Index + 1>());
    }
}

} // namespace proof_system::honk::flavor

// Forward declare honk flavors
namespace proof_system::honk::flavor {
class Standard;
class StandardGrumpkin;
class Ultra;
class UltraGrumpkin;
class GoblinUltra;
class UltraRecursive;
} // namespace proof_system::honk::flavor

// Forward declare plonk flavors
namespace proof_system::plonk::flavor {
class Standard;
class Turbo;
class Ultra;
} // namespace proof_system::plonk::flavor

// Establish concepts for testing flavor attributes
namespace proof_system {
/**
 * @brief Test whether a type T lies in a list of types ...U.
 *
 * @tparam T The type being tested
 * @tparam U A parameter pack of types being checked against T.
 */
// clang-format off

template <typename T>
concept IsPlonkFlavor = IsAnyOf<T, plonk::flavor::Standard, plonk::flavor::Turbo, plonk::flavor::Ultra>;

template <typename T> 
concept IsHonkFlavor = IsAnyOf<T, honk::flavor::Standard, honk::flavor::Ultra, honk::flavor::StandardGrumpkin, honk::flavor::UltraGrumpkin, honk::flavor::GoblinUltra>;

template <typename T> 
concept IsUltraFlavor = IsAnyOf<T, honk::flavor::Ultra, honk::flavor::UltraGrumpkin, honk::flavor::GoblinUltra>;

template <typename T> 
concept IsGoblinFlavor = IsAnyOf<T, honk::flavor::GoblinUltra>;

// WORKTODO: Find the right place for this.
template <typename T> 
concept IsSimulator = IsAnyOf<T, proof_system::CircuitSimulatorBN254>;
template <typename T> 
concept IsRecursiveFlavor = IsAnyOf<T, honk::flavor::UltraRecursive>;

template <typename T> concept IsGrumpkinFlavor = IsAnyOf<T, honk::flavor::StandardGrumpkin, honk::flavor::UltraGrumpkin>;

template <typename T> concept StandardFlavor = IsAnyOf<T, honk::flavor::Standard,  honk::flavor::StandardGrumpkin>;

template <typename T> concept UltraFlavor = IsAnyOf<T, honk::flavor::Ultra, honk::flavor::UltraGrumpkin, honk::flavor::GoblinUltra>;

// clang-format on
} // namespace proof_system
