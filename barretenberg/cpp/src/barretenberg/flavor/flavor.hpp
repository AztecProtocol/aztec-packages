// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

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
 * Another motivation is iterate on the polynomial manifest of plonk, which is nice in its compactness, but which feels
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
 *  - Some classic metadata (e.g., a circuit size, a reference string, an evaluation domain).
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
 * @note One asymmetry to note is in the use of the term "key". It is worthwhile to distinguish between prover/verifier
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
#include "barretenberg/common/ref_vector.hpp"
#include "barretenberg/common/std_array.hpp"
#include "barretenberg/common/std_vector.hpp"
#include "barretenberg/common/zip_view.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/ecc/fields/field_conversion.hpp"
#include "barretenberg/honk/types/aggregation_object_type.hpp"
#include "barretenberg/honk/types/circuit_type.hpp"
#include "barretenberg/polynomials/barycentric.hpp"
#include "barretenberg/polynomials/evaluation_domain.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib/hash/poseidon2/poseidon2.hpp"
#include "barretenberg/stdlib/primitives/field/field_conversion.hpp"
#include "barretenberg/stdlib/transcript/transcript.hpp"
#include "barretenberg/stdlib_circuit_builders/public_component_key.hpp"
#include "barretenberg/transcript/transcript.hpp"

#include <array>
#include <concepts>
#include <cstddef>
#include <numeric>
#include <utility>
#include <vector>

namespace bb {

// Specifies the regions of the execution trace containing non-trivial wire values
struct ActiveRegionData {
    void add_range(const size_t start, const size_t end)
    {
        ASSERT(start >= current_end); // ranges should be non-overlapping and increasing
        ranges.emplace_back(start, end);
        for (size_t i = start; i < end; ++i) {
            idxs.push_back(i);
        }
        current_end = end;
    }

    std::vector<std::pair<size_t, size_t>> get_ranges() const { return ranges; }
    size_t get_idx(const size_t idx) const { return idxs[idx]; }
    std::pair<size_t, size_t> get_range(const size_t idx) const { return ranges.at(idx); }
    size_t size() const { return idxs.size(); }
    size_t num_ranges() const { return ranges.size(); }

  private:
    std::vector<std::pair<size_t, size_t>> ranges; // active ranges [start_i, end_i) of the execution trace
    std::vector<size_t> idxs;                      // full set of poly indices corresposponding to active ranges
    size_t current_end{ 0 };                       // end of last range; for ensuring monotonicity of ranges
};

/**
 * @brief Base proving key class.
 *
 * @tparam PrecomputedEntities An instance of PrecomputedEntities_ with polynomial data type and span handle type.
 * @tparam FF The scalar field on which we will encode our polynomial data. When instantiating, this may be extractable
 * from the other template paramter.
 */
template <typename FF, typename CommitmentKey_> class ProvingKey_ {
  public:
    size_t circuit_size;
    PublicComponentKey pairing_inputs_public_input_key;
    bb::EvaluationDomain<FF> evaluation_domain;
    CommitmentKey_ commitment_key;
    size_t num_public_inputs;
    size_t log_circuit_size;

    // Offset off the public inputs from the start of the execution trace
    size_t pub_inputs_offset = 0;

    // The number of public inputs has to be the same for all instances because they are
    // folded element by element.
    std::vector<FF> public_inputs;

    ActiveRegionData active_region_data; // specifies active regions of execution trace

    ProvingKey_() = default;
    ProvingKey_(const size_t dyadic_circuit_size,
                const size_t num_public_inputs = 0,
                CommitmentKey_ commitment_key = CommitmentKey_())
        : circuit_size(dyadic_circuit_size)
        , evaluation_domain(bb::EvaluationDomain<FF>(dyadic_circuit_size, dyadic_circuit_size))
        , commitment_key(commitment_key)
        , num_public_inputs(num_public_inputs)
        , log_circuit_size(numeric::get_msb(dyadic_circuit_size)){};
};

/**
 * @brief Base Native verification key class.
 * @details We want a separate native and stdlib verification key class because we don't have nice mappings from native
 * to stdlib and back. Examples of mappings that don't exist are from uint64_t to field_t, .get_value() doesn't
 * have a native equivalent, and Builder also doesn't have a native equivalent.
 *
 * @tparam PrecomputedEntities An instance of PrecomputedEntities_ with affine_element data type and handle type.
 */
template <typename PrecomputedCommitments> class NativeVerificationKey_ : public PrecomputedCommitments {
  public:
    using Commitment = typename PrecomputedCommitments::DataType;
    uint64_t circuit_size;
    uint64_t log_circuit_size;
    uint64_t num_public_inputs;
    uint64_t pub_inputs_offset = 0;
    PublicComponentKey pairing_inputs_public_input_key;

    bool operator==(const NativeVerificationKey_&) const = default;
    virtual ~NativeVerificationKey_() = default;
    NativeVerificationKey_() = default;
    NativeVerificationKey_(const size_t circuit_size, const size_t num_public_inputs)
    {
        this->circuit_size = circuit_size;
        this->log_circuit_size = numeric::get_msb(circuit_size);
        this->num_public_inputs = num_public_inputs;
    };

    /**
     * @brief Serialize verification key to field elements
     *
     * @return std::vector<FF>
     */
    virtual std::vector<fr> to_field_elements() const = 0;

    /**
     * @brief A model function to show how to compute the VK hash(without the Transcript abstracting things away)
     * @details Currently only used in testing.
     * @return FF
     */
    fr hash()
    {
        fr challenge = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash(this->to_field_elements());
        // match the parameter used in stdlib, which is derived from cycle_scalar (is 128)
        static constexpr size_t LO_BITS = fr::Params::MAX_BITS_PER_ENDOMORPHISM_SCALAR;

        auto converted = static_cast<uint256_t>(challenge);
        uint256_t lo = converted.slice(0, LO_BITS);
        return lo;
    }
};

/**
 * @brief Base Stdlib verification key class.
 *
 * @tparam Builder
 * @tparam FF
 * @tparam PrecomputedCommitments
 */
template <typename Builder, typename PrecomputedCommitments>
class StdlibVerificationKey_ : public PrecomputedCommitments {
  public:
    using FF = stdlib::field_t<Builder>;
    using Commitment = typename PrecomputedCommitments::DataType;
    using Transcript = BaseTranscript<stdlib::recursion::honk::StdlibTranscriptParams<Builder>>;
    FF circuit_size;
    FF log_circuit_size;
    FF num_public_inputs;
    FF pub_inputs_offset = 0;
    PublicComponentKey pairing_inputs_public_input_key;

    bool operator==(const StdlibVerificationKey_&) const = default;
    virtual ~StdlibVerificationKey_() = default;
    StdlibVerificationKey_() = default;
    StdlibVerificationKey_(const size_t circuit_size, const size_t num_public_inputs)
    {
        this->circuit_size = circuit_size;
        this->log_circuit_size = numeric::get_msb(circuit_size);
        this->num_public_inputs = num_public_inputs;
    };

    /**
     * @brief Serialize verification key to field elements.
     *
     * @return std::vector<FF>
     */
    virtual std::vector<FF> to_field_elements() const
    {
        using namespace bb::stdlib::field_conversion;

        auto serialize_to_field_buffer = []<typename T>(const T& input, std::vector<FF>& buffer) {
            std::vector<FF> input_fields = convert_to_bn254_frs<Builder, T>(input);
            buffer.insert(buffer.end(), input_fields.begin(), input_fields.end());
        };

        std::vector<FF> elements;

        serialize_to_field_buffer(this->circuit_size, elements);
        serialize_to_field_buffer(this->num_public_inputs, elements);
        serialize_to_field_buffer(this->pub_inputs_offset, elements);
        FF pairing_points_start_idx(this->pairing_inputs_public_input_key.start_idx);
        pairing_points_start_idx.convert_constant_to_fixed_witness(this->circuit_size.context);
        serialize_to_field_buffer(pairing_points_start_idx, elements);

        for (const Commitment& commitment : this->get_all()) {
            serialize_to_field_buffer(commitment, elements);
        }

        return elements;
    }

    /**
     * @brief A model function to show how to compute the VK hash (without the Transcript abstracting things away).
     * @details Currently only used in testing.
     * @param builder
     * @return FF
     */
    FF hash(Builder& builder)
    {
        // use existing field-splitting code in cycle_scalar
        FF challenge = stdlib::poseidon2<Builder>::hash(builder, to_field_elements());
        using cycle_scalar = typename stdlib::cycle_group<Builder>::cycle_scalar;
        const cycle_scalar scalar = cycle_scalar(challenge);
        scalar.lo.create_range_constraint(cycle_scalar::LO_BITS);
        return scalar.lo;
    }
    /**
     * @brief Adds the verification key witnesses directly to the transcript.
     * @details Needed to make sure the Origin Tag system works. Rather than converting into a vector of fields and
     * submitting that, we want to submit the values directly to the transcript.
     *
     * @param domain_separator
     * @param transcript
     */
    virtual void add_to_transcript(const std::string& domain_separator, Transcript& transcript)
    {
        transcript.add_to_hash_buffer(domain_separator + "vkey_circuit_size", this->circuit_size);
        transcript.add_to_hash_buffer(domain_separator + "vkey_num_public_inputs", this->num_public_inputs);
        transcript.add_to_hash_buffer(domain_separator + "vkey_pub_inputs_offset", this->pub_inputs_offset);
        FF pairing_points_start_idx(this->pairing_inputs_public_input_key.start_idx);
        pairing_points_start_idx.convert_constant_to_fixed_witness(this->circuit_size.context);
        transcript.add_to_hash_buffer(domain_separator + "vkey_pairing_points_start_idx", pairing_points_start_idx);
        for (const Commitment& commitment : this->get_all()) {
            transcript.add_to_hash_buffer(domain_separator + "vkey_commitment", commitment);
        }
    }
};

// Because of how Gemini is written, it is important to put the polynomials out in this order.
auto get_unshifted_then_shifted(const auto& all_entities)
{
    return concatenate(all_entities.get_unshifted(), all_entities.get_shifted());
};

/**
 * @brief Utility function to find max PARTIAL_RELATION_LENGTH tuples of Relations.
 * @details The "partial length" of a relation is 1 + the degree of the relation, where any challenges used in the
 * relation are as constants, not as variables..
 */
template <typename Tuple> constexpr size_t compute_max_partial_relation_length()
{
    constexpr auto seq = std::make_index_sequence<std::tuple_size_v<Tuple>>();
    return []<std::size_t... Is>(std::index_sequence<Is...>) {
        return std::max({ std::tuple_element_t<Is, Tuple>::RELATION_LENGTH... });
    }(seq);
}

/**
 * @brief Utility function to find max TOTAL_RELATION_LENGTH among tuples of Relations.
 * @details The "total length" of a relation is 1 + the degree of the relation, where any challenges used in the
 * relation are regarded as variables.
 */
template <typename Tuple> constexpr size_t compute_max_total_relation_length()
{
    constexpr auto seq = std::make_index_sequence<std::tuple_size_v<Tuple>>();
    return []<std::size_t... Is>(std::index_sequence<Is...>) {
        return std::max({ std::tuple_element_t<Is, Tuple>::TOTAL_RELATION_LENGTH... });
    }(seq);
}

/**
 * @brief Utility function to find the number of subrelations.
 */
template <typename Tuple> constexpr size_t compute_number_of_subrelations()
{
    constexpr auto seq = std::make_index_sequence<std::tuple_size_v<Tuple>>();
    return []<std::size_t... I>(std::index_sequence<I...>) {
        return (0 + ... + std::tuple_element_t<I, Tuple>::SUBRELATION_PARTIAL_LENGTHS.size());
    }(seq);
}

/**
 * @brief Utility function to construct a container for the subrelation accumulators of Protogalaxy folding.
 * @details The size of the outer tuple is equal to the number of relations. Each relation contributes an inner
 * tuple of univariates whose size is equal to the number of subrelations of the relation. The length of a
 * univariate in an inner tuple is determined by the corresponding subrelation length and the number of keys to be
 * folded.
 * @tparam optimised Enable optimised version with skipping some of the computation
 */
template <typename Tuple, size_t NUM_KEYS, bool optimised = false>
constexpr auto create_protogalaxy_tuple_of_tuples_of_univariates()
{
    constexpr auto seq = std::make_index_sequence<std::tuple_size_v<Tuple>>();
    return []<size_t... I>(std::index_sequence<I...>) {
        if constexpr (optimised) {
            return std::make_tuple(
                typename std::tuple_element_t<I, Tuple>::template ProtogalaxyTupleOfUnivariatesOverSubrelations<
                    NUM_KEYS>{}...);
        } else {
            return std::make_tuple(
                typename std::tuple_element_t<I, Tuple>::
                    template ProtogalaxyTupleOfUnivariatesOverSubrelationsNoOptimisticSkipping<NUM_KEYS>{}...);
        }
    }(seq);
}

/**
 * @brief Utility function to construct a container for the subrelation accumulators of sumcheck proving.
 * @details The size of the outer tuple is equal to the number of relations. Each relation contributes an inner
 * tuple of univariates whose size is equal to the number of subrelations of the relation. The length of a
 * univariate in an inner tuple is determined by the corresponding subrelation length.
 */
template <typename Tuple, bool ZK = false> constexpr auto create_sumcheck_tuple_of_tuples_of_univariates()
{
    constexpr auto seq = std::make_index_sequence<std::tuple_size_v<Tuple>>();
    return []<size_t... I>(std::index_sequence<I...>) {
        if constexpr (ZK) {
            return std::make_tuple(
                typename std::tuple_element_t<I, Tuple>::ZKSumcheckTupleOfUnivariatesOverSubrelations{}...);
        } else {
            return std::make_tuple(
                typename std::tuple_element_t<I, Tuple>::SumcheckTupleOfUnivariatesOverSubrelations{}...);
        }
    }(seq);
}

/**
 * @brief Construct tuple of arrays
 * @details Container for storing value of each identity in each relation. Each Relation contributes an array of
 * length num-identities.
 */
template <typename Tuple> constexpr auto create_tuple_of_arrays_of_values()
{
    constexpr auto seq = std::make_index_sequence<std::tuple_size_v<Tuple>>();
    return []<size_t... I>(std::index_sequence<I...>) {
        return std::make_tuple(typename std::tuple_element_t<I, Tuple>::SumcheckArrayOfValuesOverSubrelations{}...);
    }(seq);
}

} // namespace bb

// Forward declare honk flavors
namespace bb {
class UltraFlavor;
class UltraZKFlavor;
class UltraRollupFlavor;
class ECCVMFlavor;
class UltraKeccakFlavor;
#ifdef STARKNET_GARAGA_FLAVORS
class UltraStarknetFlavor;
class UltraStarknetZKFlavor;
#endif
class UltraKeccakZKFlavor;
class MegaFlavor;
class MegaZKFlavor;
class TranslatorFlavor;

template <typename BuilderType> class UltraRecursiveFlavor_;
template <typename BuilderType> class UltraZKRecursiveFlavor_;
template <typename BuilderType> class UltraRollupRecursiveFlavor_;
template <typename BuilderType> class MegaRecursiveFlavor_;
template <typename BuilderType> class MegaZKRecursiveFlavor_;
template <typename BuilderType> class TranslatorRecursiveFlavor_;
template <typename BuilderType> class ECCVMRecursiveFlavor_;
template <typename BuilderType> class AvmRecursiveFlavor_;
namespace avm2 {

template <typename BuilderType> class AvmRecursiveFlavor_;

}

} // namespace bb
