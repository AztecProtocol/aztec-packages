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
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/ref_vector.hpp"
#include "barretenberg/common/std_array.hpp"
#include "barretenberg/common/std_vector.hpp"
#include "barretenberg/common/tuple.hpp"
#include "barretenberg/common/zip_view.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/ecc/fields/field_conversion.hpp"
#include "barretenberg/honk/types/circuit_type.hpp"
#include "barretenberg/polynomials/barycentric.hpp"
#include "barretenberg/polynomials/evaluation_domain.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/public_input_component/public_component_key.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib/hash/poseidon2/poseidon2.hpp"
#include "barretenberg/stdlib/primitives/field/field_conversion.hpp"
#include "barretenberg/stdlib/transcript/transcript.hpp"
#include "barretenberg/transcript/transcript.hpp"

#include <array>
#include <concepts>
#include <cstddef>
#include <numeric>
#include <utility>
#include <vector>

namespace bb {

/**
 * @brief Enum to control verification key metadata serialization
 */
enum class VKSerializationMode : std::uint8_t {
    FULL,       // Serialize all metadata (log_circuit_size, num_public_inputs, pub_inputs_offset)
    NO_METADATA // Serialize only commitments, no metadata
};

// Specifies the regions of the execution trace containing non-trivial wire values
struct ActiveRegionData {
    void add_range(const size_t start, const size_t end)
    {
        BB_ASSERT_GTE(start, current_end, "Ranges should be non-overlapping and increasing.");
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
 * @brief Dyadic trace size and public inputs metadata; Common between prover and verifier keys
 */
struct MetaData {
    size_t dyadic_size = 0; // power-of-2 size of the execution trace
    size_t num_public_inputs = 0;
    size_t pub_inputs_offset = 0;
};

/**
 * @brief The precomputed data needed to compute a Honk VK
 */
template <typename Polynomial, size_t NUM_PRECOMPUTED_ENTITIES> struct PrecomputedData_ {
    RefArray<Polynomial, NUM_PRECOMPUTED_ENTITIES> polynomials; // polys whose commitments comprise the VK
    MetaData metadata;                                          // execution trace metadata
};

/**
 * @brief Base Native verification key class.
 * @details We want a separate native and stdlib verification key class because we don't have nice mappings from native
 * to stdlib and back. Examples of mappings that don't exist are from uint64_t to field_t, .get_value() doesn't
 * have a native equivalent, and Builder also doesn't have a native equivalent.
 *
 * @tparam PrecomputedEntities An instance of PrecomputedEntities_ with affine_element data type and handle type.
 */
template <typename PrecomputedCommitments,
          typename Transcript,
          VKSerializationMode SerializeMetadata = VKSerializationMode::FULL>
class NativeVerificationKey_ : public PrecomputedCommitments {
  public:
    using Commitment = typename PrecomputedCommitments::DataType;
    uint64_t log_circuit_size = 0;
    uint64_t num_public_inputs = 0;
    uint64_t pub_inputs_offset = 0;

    bool operator==(const NativeVerificationKey_&) const = default;
    virtual ~NativeVerificationKey_() = default;
    NativeVerificationKey_() = default;
    NativeVerificationKey_(const size_t circuit_size, const size_t num_public_inputs)
    {
        this->log_circuit_size = numeric::get_msb(circuit_size);
        this->num_public_inputs = num_public_inputs;
    };

    /**
     * @brief Calculate the number of field elements needed for serialization
     * @return size_t Number of field elements
     */
    static size_t calc_num_data_types()
    {
        using namespace bb::field_conversion;
        // Create a temporary instance to get the number of precomputed entities
        size_t commitments_size =
            PrecomputedCommitments::size() * Transcript::template calc_num_data_types<Commitment>();
        size_t metadata_size = 0;
        if constexpr (SerializeMetadata == VKSerializationMode::FULL) {
            // 3 metadata fields + commitments
            metadata_size = 3 * Transcript::template calc_num_data_types<uint64_t>();
        }
        // else NO_METADATA: metadata_size remains 0
        return metadata_size + commitments_size;
    }

    /**
     * @brief Serialize verification key to field elements
     *
     * @return std::vector<FF>
     */
    virtual std::vector<typename Transcript::DataType> to_field_elements() const
    {
        using namespace bb::field_conversion;

        auto serialize = [](const auto& input, std::vector<typename Transcript::DataType>& buffer) {
            std::vector<typename Transcript::DataType> input_fields = Transcript::serialize(input);
            buffer.insert(buffer.end(), input_fields.begin(), input_fields.end());
        };

        std::vector<typename Transcript::DataType> elements;

        if constexpr (SerializeMetadata == VKSerializationMode::FULL) {
            serialize(this->log_circuit_size, elements);
            serialize(this->num_public_inputs, elements);
            serialize(this->pub_inputs_offset, elements);
        }
        // else NO_METADATA: skip metadata serialization

        for (const Commitment& commitment : this->get_all()) {
            serialize(commitment, elements);
        }

        NativeVerificationKey_ key;
        key.from_field_elements(elements);
        return elements;
    };

    /**
     * @brief Populate verification key from field elements
     * @param elements Field elements to deserialize from
     */
    size_t from_field_elements(const std::span<const typename Transcript::DataType>& elements)
    {
        using namespace bb::field_conversion;

        size_t idx = 0;
        auto deserialize = [&idx, &elements]<typename T>(T& target) {
            size_t size = Transcript::template calc_num_data_types<T>();
            target = Transcript::template deserialize<T>(elements.subspan(idx, size));
            idx += size;
        };

        if constexpr (SerializeMetadata == VKSerializationMode::FULL) {
            deserialize(this->log_circuit_size);
            deserialize(this->num_public_inputs);
            deserialize(this->pub_inputs_offset);
        }
        // else NO_METADATA: skip metadata deserialization

        for (Commitment& commitment : this->get_all()) {
            deserialize(commitment);
        }
        return idx;
    }

    /**
     * @brief A model function to show how to compute the VK hash(without the Transcript abstracting things away)
     * @details Currently only used in testing.
     * @return FF
     */
    fr hash() const
    {
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1498): should hash be dependent on transcript?
        fr vk_hash = Transcript::hash(this->to_field_elements());
        return vk_hash;
    }

    /**
     * @brief Hashes the vk using the transcript's independent buffer and returns the hash.
     * @details Needed to make sure the Origin Tag system works. We need to set the origin tags of the VK witnesses in
     * the transcript. If we instead did the hashing outside of the transcript and submitted just the hash, only the
     * origin tag of the hash would be set properly. We want to avoid backpropagating origin tags to the actual VK
     * witnesses because it would be manual, as backpropagation of tags is not generally correct. By doing it like this,
     * the origin tags of the VK all get set, so our tooling won't complain when we use the VK later on in the protocol.
     *
     * @param domain_separator
     * @param transcript
     * @returns The hash of the verification key
     */
    virtual typename Transcript::DataType hash_through_transcript(const std::string& domain_separator,
                                                                  Transcript& transcript) const
    {
        transcript.add_to_independent_hash_buffer(domain_separator + "vk_log_circuit_size", this->log_circuit_size);
        transcript.add_to_independent_hash_buffer(domain_separator + "vk_num_public_inputs", this->num_public_inputs);
        transcript.add_to_independent_hash_buffer(domain_separator + "vk_pub_inputs_offset", this->pub_inputs_offset);

        for (const Commitment& commitment : this->get_all()) {
            transcript.add_to_independent_hash_buffer(domain_separator + "vk_commitment", commitment);
        }

        return transcript.hash_independent_buffer();
    }
};

/**
 * @brief Base Stdlib verification key class.
 *
 * @tparam Builder
 * @tparam FF
 * @tparam PrecomputedCommitments
 * @tparam SerializeMetadata Controls how metadata is serialized (FULL, NO_METADATA)
 */
template <typename Builder_,
          typename PrecomputedCommitments,
          VKSerializationMode SerializeMetadata = VKSerializationMode::FULL>
class StdlibVerificationKey_ : public PrecomputedCommitments {
  public:
    using Builder = Builder_;
    using FF = stdlib::field_t<Builder>;
    using Commitment = typename PrecomputedCommitments::DataType;
    using Transcript = BaseTranscript<stdlib::recursion::honk::StdlibTranscriptParams<Builder>>;
    FF log_circuit_size;
    FF num_public_inputs;
    FF pub_inputs_offset = 0;

    bool operator==(const StdlibVerificationKey_&) const = default;
    virtual ~StdlibVerificationKey_() = default;
    StdlibVerificationKey_() = default;
    StdlibVerificationKey_(const size_t circuit_size, const size_t num_public_inputs)
    {
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

        serialize_to_field_buffer(this->log_circuit_size, elements);
        serialize_to_field_buffer(this->num_public_inputs, elements);
        serialize_to_field_buffer(this->pub_inputs_offset, elements);

        for (const Commitment& commitment : this->get_all()) {
            serialize_to_field_buffer(commitment, elements);
        }

        return elements;
    };

    /**
     * @brief A model function to show how to compute the VK hash (without the Transcript abstracting things away).
     * @details Currently only used in testing.
     * @param builder
     * @return FF
     */
    FF hash()
    {
        FF vk_hash = stdlib::poseidon2<Builder>::hash(to_field_elements());
        return vk_hash;
    }

    /**
     * @brief Hashes the vk using the transcript's independent buffer and returns the hash.
     * @details Needed to make sure the Origin Tag system works. We need to set the origin tags of the VK witnesses in
     * the transcript. If we instead did the hashing outside of the transcript and submitted just the hash, only the
     * origin tag of the hash would be set properly. We want to avoid backpropagating origin tags to the actual VK
     * witnesses because it would be manual, as backpropagation of tags is not generally correct. By doing it like this,
     * the origin tags of the VK all get set, so our tooling won't complain when we use the VK later on in the protocol.
     *
     * @param domain_separator
     * @param transcript
     * @returns The hash of the verification key
     */
    virtual FF hash_through_transcript(const std::string& domain_separator, Transcript& transcript) const
    {
        transcript.add_to_independent_hash_buffer(domain_separator + "vk_log_circuit_size", this->log_circuit_size);
        transcript.add_to_independent_hash_buffer(domain_separator + "vk_num_public_inputs", this->num_public_inputs);
        transcript.add_to_independent_hash_buffer(domain_separator + "vk_pub_inputs_offset", this->pub_inputs_offset);
        for (const Commitment& commitment : this->get_all()) {
            transcript.add_to_independent_hash_buffer(domain_separator + "vk_commitment", commitment);
        }
        return transcript.hash_independent_buffer();
    }
};

template <typename FF, typename VerificationKey> class VKAndHash_ {
  public:
    using Builder = VerificationKey::Builder;
    using NativeVerificationKey = VerificationKey::NativeVerificationKey;

    VKAndHash_() = default;
    VKAndHash_(const std::shared_ptr<VerificationKey>& vk)
        : vk(vk)
        , hash(vk->hash())
    {}

    VKAndHash_(const std::shared_ptr<VerificationKey>& vk, const FF& hash)
        : vk(vk)
        , hash(hash)
    {}

    VKAndHash_(Builder& builder, const std::shared_ptr<NativeVerificationKey>& native_vk)
        : vk(std::make_shared<VerificationKey>(&builder, native_vk))
        , hash(FF::from_witness(&builder, native_vk->hash()))
    {}
    std::shared_ptr<VerificationKey> vk;
    FF hash;
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
 * @tparam optimized Enable optimized version with skipping some of the computation
 */
template <typename Tuple, size_t NUM_INSTANCES, bool optimized = false>
constexpr auto create_protogalaxy_tuple_of_tuples_of_univariates()
{
    constexpr auto seq = std::make_index_sequence<std::tuple_size_v<Tuple>>();
    return []<size_t... I>(std::index_sequence<I...>) {
        if constexpr (optimized) {
            return flat_tuple::make_tuple(
                typename std::tuple_element_t<I, Tuple>::template ProtogalaxyTupleOfUnivariatesOverSubrelations<
                    NUM_INSTANCES>{}...);
        } else {
            return flat_tuple::make_tuple(
                typename std::tuple_element_t<I, Tuple>::
                    template ProtogalaxyTupleOfUnivariatesOverSubrelationsNoOptimisticSkipping<NUM_INSTANCES>{}...);
        }
    }(seq);
}

/**
 * @brief Utility function to construct a container for the subrelation accumulators of sumcheck proving.
 * @details The size of the outer tuple is equal to the number of relations. Each relation contributes an inner
 * tuple of univariates whose size is equal to the number of subrelations of the relation. The length of a
 * univariate in an inner tuple is determined by the corresponding subrelation length.
 */
template <typename RelationsTuple> constexpr auto create_sumcheck_tuple_of_tuples_of_univariates()
{
    constexpr auto seq = std::make_index_sequence<std::tuple_size_v<RelationsTuple>>();
    return []<size_t... I>(std::index_sequence<I...>) {
        return flat_tuple::make_tuple(
            typename std::tuple_element_t<I, RelationsTuple>::SumcheckTupleOfUnivariatesOverSubrelations{}...);
    }(seq);
}

/**
 * @brief Construct tuple of arrays
 * @details Container for storing value of each identity in each relation. Each Relation contributes an array of
 * length num-identities.
 */
template <typename RelationsTuple> constexpr auto create_tuple_of_arrays_of_values()
{
    constexpr auto seq = std::make_index_sequence<std::tuple_size_v<RelationsTuple>>();
    return []<size_t... I>(std::index_sequence<I...>) {
        return flat_tuple::make_tuple(
            typename std::tuple_element_t<I, RelationsTuple>::SumcheckArrayOfValuesOverSubrelations{}...);
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
class ECCVMRecursiveFlavor;
class TranslatorRecursiveFlavor;
class AvmRecursiveFlavor;

template <typename BuilderType> class UltraRecursiveFlavor_;
template <typename BuilderType> class UltraZKRecursiveFlavor_;
template <typename BuilderType> class UltraRollupRecursiveFlavor_;
template <typename BuilderType> class MegaRecursiveFlavor_;
template <typename BuilderType> class MegaZKRecursiveFlavor_;

// Serialization methods for NativeVerificationKey_.
// These should cover all base classes that do not need additional members, as long as the appropriate SerializeMetadata
// is set in the template parameters.
template <typename PrecomputedCommitments, typename Transcript, VKSerializationMode SerializeMetadata>
inline void read(uint8_t const*& it, NativeVerificationKey_<PrecomputedCommitments, Transcript, SerializeMetadata>& vk)
{
    using serialize::read;

    // Get the size directly from the static method
    size_t num_frs =
        NativeVerificationKey_<PrecomputedCommitments, Transcript, SerializeMetadata>::calc_num_data_types();

    // Read exactly num_frs field elements from the buffer
    std::vector<typename Transcript::DataType> field_elements(num_frs);
    for (auto& element : field_elements) {
        read(it, element);
    }
    // Then use from_field_elements to populate the verification key
    vk.from_field_elements(field_elements);
}

template <typename PrecomputedCommitments, typename Transcript, VKSerializationMode SerializeMetadata>
inline void write(std::vector<uint8_t>& buf,
                  NativeVerificationKey_<PrecomputedCommitments, Transcript, SerializeMetadata> const& vk)
{
    using serialize::write;
    size_t before = buf.size();
    // Convert to field elements and write them directly without length prefix
    auto field_elements = vk.to_field_elements();
    for (const auto& element : field_elements) {
        write(buf, element);
    }
    size_t after = buf.size();
    size_t num_frs =
        NativeVerificationKey_<PrecomputedCommitments, Transcript, SerializeMetadata>::calc_num_data_types();
    BB_ASSERT_EQ(after - before, num_frs * sizeof(bb::fr), "VK serialization mismatch");
}

namespace avm2 {
class AvmRecursiveFlavor;
}

} // namespace bb
