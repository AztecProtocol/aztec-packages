// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

/**
 * @file flavor.hpp
 * @brief Base class templates shared across Honk flavors.
 *
 * @details This file provides the flavor-agnostic building blocks that each concrete flavor (Ultra, Mega, etc.)
 * composes into its own type definitions. The main components are:
 *
 *  - MetaData / PrecomputedData_: Execution trace metadata and the precomputed polynomials whose commitments form a VK.
 *  - NativeVerificationKey_: Base class for native verification keys (serialization, hashing, origin tagging).
 *  - StdlibVerificationKey_: Circuit-friendly (stdlib) counterpart of the native VK.
 *  - FixedVKAndHash_ / FixedStdlibVKAndHash_: Lightweight VK wrappers for fixed-size circuits (ECCVM, Translator)
 *    whose VKs are hardcoded constants.
 *  - VKAndHash_: Pairs a VK with its hash; used to bind VK identity into a proof.
 */

#pragma once
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/ref_vector.hpp"
#include "barretenberg/common/zip_view.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/ecc/fields/field_conversion.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/stdlib/hash/poseidon2/poseidon2.hpp"
#include "barretenberg/stdlib/primitives/field/field_conversion.hpp"
#include "barretenberg/transcript/transcript.hpp"

#include <array>
#include <cstddef>
#include <vector>

// ===== Flavor forward declarations =====
namespace bb {
class UltraFlavor;
class UltraZKFlavor;
class ECCVMFlavor;
class UltraKeccakFlavor;
#ifdef STARKNET_GARAGA_FLAVORS
class UltraStarknetFlavor;
class UltraStarknetZKFlavor;
#endif
class UltraKeccakZKFlavor;
class MegaFlavor;
class MegaZKFlavor;
class MegaAvmFlavor;
class TranslatorFlavor;
class ECCVMRecursiveFlavor;
class TranslatorRecursiveFlavor;
class MultilinearBatchingRecursiveFlavor;

template <typename BuilderType> class UltraRecursiveFlavor_;
template <typename BuilderType> class UltraZKRecursiveFlavor_;
template <typename BuilderType> class MegaRecursiveFlavor_;
template <typename BuilderType> class MegaZKRecursiveFlavor_;
template <typename BuilderType> class MegaAvmRecursiveFlavor_;
class MegaAppRecursiveFlavor;
class MegaKernelRecursiveFlavor;
namespace avm2 {
class AvmRecursiveFlavor;
}
} // namespace bb

namespace bb {

// ===== Trace metadata & precomputed data =====

/**
 * @brief Dyadic trace size and public inputs metadata; Common between prover and verifier keys
 */
struct MetaData {
    static constexpr size_t NUM_FIELDS = 3;
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

// ===== Fixed verification keys (ECCVM, Translator, AVM) =====

/**
 * @brief Simple verification key class for fixed-size circuits (ECCVM, Translator, AVM).
 * @details Stores only the commitments and a precomputed hash. Circuit size and public inputs
 * count are known constants for these fixed circuits and don't need to be stored.
 *
 * @tparam PrecomputedCommitments The precomputed entities containing VK commitments
 * @tparam HashType The field type for the precomputed hash (e.g., fr for both ECCVM and Translator)
 * @tparam HardcodedVKAndHash Class containing static vk_hash() and get_all() methods with hardcoded values
 */
template <typename PrecomputedCommitments, typename HashType, typename HardcodedVKAndHash>
class FixedVKAndHash_ : public PrecomputedCommitments {
  public:
    using Commitment = typename PrecomputedCommitments::DataType;

    bool operator==(const FixedVKAndHash_&) const = default;

    // Default construct the fixed VK from hardcoded commitments and precomputed hash
    FixedVKAndHash_()
        : hash(HardcodedVKAndHash::vk_hash())
    {
        for (auto [vk_commitment, fixed_commitment] : zip_view(this->get_all(), HardcodedVKAndHash::get_all())) {
            vk_commitment = fixed_commitment;
        }
    }

    HashType get_hash() const { return hash; }

  private:
    HashType hash{};
};

// ===== Native verification key =====

/**
 * @brief Base Native verification key class.
 * @details We want a separate native and stdlib verification key class because we don't have nice mappings from native
 * to stdlib and back. Examples of mappings that don't exist are from uint64_t to field_t, .get_value() doesn't
 * have a native equivalent, and Builder also doesn't have a native equivalent.
 *
 * @tparam PrecomputedEntities An instance of PrecomputedEntities_ with affine_element data type and handle type.
 * @tparam Codec The codec used for serialization (e.g., FrCodec, U256Codec)
 * @tparam HashFunction The hash function used for VK hashing (e.g., Poseidon2, Keccak)
 */
template <typename PrecomputedCommitments, typename Codec, typename HashFunction, typename CommitmentKey = void>
class NativeVerificationKey_ : public PrecomputedCommitments {
  public:
    using Commitment = typename PrecomputedCommitments::DataType;
    using DataType = typename Codec::DataType;
    uint64_t log_circuit_size = 0;
    uint64_t num_public_inputs = 0;
    uint64_t pub_inputs_offset = 0;
    bool operator==(const NativeVerificationKey_&) const = default;

#ifndef NDEBUG
    template <typename CommitmentLabels>
    bool compare(const NativeVerificationKey_& other, CommitmentLabels commitment_labels) const
    {
        bool is_equal = true;

        if (this->log_circuit_size != other.log_circuit_size) {
            info("Log circuit size mismatch: ", this->log_circuit_size, " vs ", other.log_circuit_size);
            is_equal = false;
        }

        if (this->num_public_inputs != other.num_public_inputs) {
            info("Num public inputs mismatch: ", this->num_public_inputs, " vs ", other.num_public_inputs);
            is_equal = false;
        }

        if (this->pub_inputs_offset != other.pub_inputs_offset) {
            info("Pub inputs offset mismatch: ", this->pub_inputs_offset, " vs ", other.pub_inputs_offset);
            is_equal = false;
        }

        for (auto [this_comm, other_comm, label] : zip_view(this->get_all(), other.get_all(), commitment_labels)) {
            if (this_comm != other_comm) {
                info("Commitment mismatch: ", label);
                is_equal = false;
            }
        }
        return is_equal;
    }
#endif

    virtual ~NativeVerificationKey_() = default;
    NativeVerificationKey_() = default;

    /**
     * @brief Construct VK from precomputed data by committing to polynomials
     * @details Only available when CommitmentKeyType is specified (not void)
     */
    template <typename PrecomputedData>
        requires(!std::is_void_v<CommitmentKey>)
    explicit NativeVerificationKey_(const PrecomputedData& precomputed)
        : log_circuit_size(numeric::get_msb(precomputed.metadata.dyadic_size))
        , num_public_inputs(precomputed.metadata.num_public_inputs)
        , pub_inputs_offset(precomputed.metadata.pub_inputs_offset)
    {
        CommitmentKey commitment_key{ precomputed.metadata.dyadic_size };
        for (auto [polynomial, commitment] : zip_view(precomputed.polynomials, this->get_all())) {
            commitment = commitment_key.commit(polynomial);
        }
    }

    /**
     * @brief Calculate the number of field elements needed for serialization
     * @return size_t Number of field elements
     */
    static constexpr size_t calc_num_data_types()
    {
        size_t commitments_size = PrecomputedCommitments::size() * Codec::template calc_num_fields<Commitment>();
        size_t metadata_size = MetaData::NUM_FIELDS * Codec::template calc_num_fields<uint64_t>();
        return metadata_size + commitments_size;
    }

    /**
     * @brief Serialize verification key to field elements
     *
     * @return std::vector<FF>
     */
    virtual std::vector<DataType> to_field_elements() const
    {

        auto serialize = [](const auto& input, std::vector<DataType>& buffer) {
            std::vector<DataType> input_fields = Codec::serialize_to_fields(input);
            buffer.insert(buffer.end(), input_fields.begin(), input_fields.end());
        };

        std::vector<DataType> elements;

        serialize(this->log_circuit_size, elements);
        serialize(this->num_public_inputs, elements);
        serialize(this->pub_inputs_offset, elements);

        for (const Commitment& commitment : this->get_all()) {
            serialize(commitment, elements);
        }

        return elements;
    };

    /**
     * @brief Populate verification key from field elements
     * @param elements Field elements to deserialize from
     */
    size_t from_field_elements(const std::span<const DataType>& elements)
    {

        size_t idx = 0;
        auto deserialize = [&idx, &elements]<typename T>(T& target) {
            size_t size = Codec::template calc_num_fields<T>();
            target = Codec::template deserialize_from_fields<T>(elements.subspan(idx, size));
            idx += size;
        };

        deserialize(this->log_circuit_size);
        deserialize(this->num_public_inputs);
        deserialize(this->pub_inputs_offset);

        for (Commitment& commitment : this->get_all()) {
            deserialize(commitment);
        }
        return idx;
    }

    /**
     * @brief Compute VK hash
     * @return FF
     */
    fr hash() const
    {
        fr vk_hash = HashFunction::hash(this->to_field_elements());
        return vk_hash;
    }

    /**
     * @brief Tag VK components and hash.
     * @details Needed to make sure the Origin Tag system works. We need to set the origin tags of the VK witnesses.
     * If we instead did the hashing outside and just submitted the hash, only the origin tag of the hash would be set
     * properly. By tagging the VK components directly, we ensure all VK witnesses have proper origin tags.
     *
     * @param tag The origin tag extracted from the transcript
     * @returns The hash of the verification key
     */
    virtual DataType hash_with_origin_tagging(const OriginTag& tag) const
    {
        static constexpr bool in_circuit = InCircuit<DataType>;
        std::vector<DataType> vk_elements;

        // Tag, serialize, and append to vk_elements
        auto tag_and_append = [&]<typename T>(const T& component) {
            auto frs = bb::tag_and_serialize<in_circuit, Codec>(component, tag);
            vk_elements.insert(vk_elements.end(), frs.begin(), frs.end());
        };

        // Tag and serialize VK metadata
        tag_and_append(this->log_circuit_size);
        tag_and_append(this->num_public_inputs);
        tag_and_append(this->pub_inputs_offset);

        // Tag and serialize VK commitments. Point-at-infinity canonicalization to (0,0) is handled by
        // FrCodec::serialize_to_fields on the native path.
        for (const Commitment& commitment : this->get_all()) {
            tag_and_append(commitment);
        }

        // Sanitize free witness tags before hashing
        bb::unset_free_witness_tags<in_circuit, DataType>(vk_elements);

        // Hash the tagged elements directly
        return HashFunction::hash(vk_elements);
    }

    /**
     * @brief An overload that accepts a transcript and extracts the tag internally
     * @tparam TranscriptType The transcript type (Codec and HashFunction deduced automatically)
     * @param transcript The transcript to extract the origin tag from
     * @returns The hash of the verification key
     */
    template <typename Transcript> DataType hash_with_origin_tagging(const Transcript& transcript) const
    {
        const OriginTag tag = bb::extract_transcript_tag(transcript);
        return hash_with_origin_tagging(tag);
    }
};

// ===== Fixed stdlib verification key (ECCVM, Translator, AVM) =====

/**
 * @brief Simple stdlib verification key class for fixed-size circuits (ECCVM, Translator, AVM).
 * @details Stores only the commitments and precomputed VK hash as witnesses. Circuit size and public inputs
 * are known constants for these fixed circuits and don't need to be stored.
 *
 * @tparam Builder_ The circuit builder type
 * @tparam PrecomputedCommitments The precomputed entities type
 * @tparam NativeVerificationKey The native VK type for construction from native key
 */
template <typename Builder_, typename PrecomputedCommitments, typename NativeVerificationKey>
class FixedStdlibVKAndHash_ : public PrecomputedCommitments {
  public:
    using Builder = Builder_;
    using Commitment = typename PrecomputedCommitments::DataType;
    using FF = stdlib::field_t<Builder>;

    bool operator==(const FixedStdlibVKAndHash_&) const = default;
    FixedStdlibVKAndHash_() = default;

    /**
     * @brief Construct from native verification key and fix all witnesses (VK is constant for fixed circuits)
     */
    FixedStdlibVKAndHash_(Builder* builder, const std::shared_ptr<NativeVerificationKey>& native_key)
        : hash(FF::from_witness(builder, native_key->get_hash()))
    {
        for (auto [native_comm, comm] : zip_view(native_key->get_all(), this->get_all())) {
            comm = Commitment::from_witness(builder, native_comm);
        }
        // Fix all witnesses since fixed VKs are always constant
        hash.fix_witness();
        for (Commitment& commitment : this->get_all()) {
            commitment.fix_witness();
        }
    }

    FF get_hash() const { return hash; }

  private:
    FF hash;
};

// ===== Stdlib verification key =====

/**
 * @brief Base Stdlib verification key class.
 *
 * @tparam Builder_ The circuit builder type
 * @tparam PrecomputedCommitments The precomputed entities type
 * @tparam NativeVerificationKey_ The native VK type (optional, enables native<->stdlib conversion)
 */
template <typename Builder_, typename PrecomputedCommitments, typename NativeVerificationKey_ = void>
class StdlibVerificationKey_ : public PrecomputedCommitments {
  public:
    using Builder = Builder_;
    using FF = stdlib::field_t<Builder>;
    using Commitment = typename PrecomputedCommitments::DataType;
    using Transcript = StdlibTranscript<Builder>;
    using NativeVerificationKey = NativeVerificationKey_;
    FF log_circuit_size;
    FF num_public_inputs;
    FF pub_inputs_offset = 0;

    bool operator==(const StdlibVerificationKey_&) const = default;
    virtual ~StdlibVerificationKey_() = default;
    StdlibVerificationKey_() = default;

    /**
     * @brief Construct a new Verification Key with stdlib types from a provided native verification key
     * @details Only available when NativeVerificationKey is specified (not void)
     */
    template <typename T = NativeVerificationKey_>
        requires(!std::is_void_v<T>)
    StdlibVerificationKey_(Builder* builder, const std::shared_ptr<T>& native_key)
        : log_circuit_size(FF::from_witness(builder, typename FF::native(native_key->log_circuit_size)))
        , num_public_inputs(FF::from_witness(builder, typename FF::native(native_key->num_public_inputs)))
        , pub_inputs_offset(FF::from_witness(builder, typename FF::native(native_key->pub_inputs_offset)))
    {

        for (auto [commitment, native_commitment] : zip_view(this->get_all(), native_key->get_all())) {
            commitment = Commitment::from_witness(builder, native_commitment);
        }
    }

    /**
     * @brief Deserialize a verification key from a vector of field elements
     */
    explicit StdlibVerificationKey_(std::span<FF> elements)
    {
        using Codec = stdlib::StdlibCodec<FF>;

        size_t num_frs_read = 0;

        this->log_circuit_size = Codec::template deserialize_from_frs<FF>(elements, num_frs_read);
        this->num_public_inputs = Codec::template deserialize_from_frs<FF>(elements, num_frs_read);
        this->pub_inputs_offset = Codec::template deserialize_from_frs<FF>(elements, num_frs_read);

        for (Commitment& commitment : this->get_all()) {
            commitment = Codec::template deserialize_from_frs<Commitment>(elements, num_frs_read);
        }
    }

    /**
     * @brief Construct a VerificationKey from a set of corresponding witness indices
     */
    static StdlibVerificationKey_ from_witness_indices(Builder& builder,
                                                       const std::span<const uint32_t>& witness_indices)
    {
        std::vector<FF> vk_fields;
        vk_fields.reserve(witness_indices.size());
        for (const auto& idx : witness_indices) {
            vk_fields.emplace_back(FF::from_witness_index(&builder, idx));
        }
        return StdlibVerificationKey_(vk_fields);
    }

    /**
     * @brief Fixes witnesses of VK to be constants.
     */
    void fix_witness()
    {
        this->log_circuit_size.fix_witness();
        this->num_public_inputs.fix_witness();
        this->pub_inputs_offset.fix_witness();
        for (Commitment& commitment : this->get_all()) {
            commitment.fix_witness();
        }
    }

#ifndef NDEBUG
    /**
     * @brief Get the native verification key corresponding to this stdlib verification key
     * @details Only available when NativeVerificationKey is specified (not void)
     */
    template <typename T = NativeVerificationKey_>
        requires(!std::is_void_v<T>)
    T get_value() const
    {
        T native_vk;
        native_vk.log_circuit_size = static_cast<uint64_t>(this->log_circuit_size.get_value());
        native_vk.num_public_inputs = static_cast<uint64_t>(this->num_public_inputs.get_value());
        native_vk.pub_inputs_offset = static_cast<uint64_t>(this->pub_inputs_offset.get_value());
        for (auto [commitment, native_commitment] : zip_view(this->get_all(), native_vk.get_all())) {
            native_commitment = commitment.get_value();
        }
        return native_vk;
    }
#endif

    /**
     * @brief Tag VK components and hash.
     * @details Needed to make sure the Origin Tag system works. We need to set the origin tags of the VK witnesses.
     * If we instead did the hashing outside and just submitted the hash, only the origin tag of the hash would be set
     * properly. By tagging the VK components directly, we ensure all VK witnesses have proper origin tags.
     *
     * @param tag The origin tag extracted from the transcript
     * @returns The hash of the verification key
     */
    virtual FF hash_with_origin_tagging(const OriginTag& tag) const
    {
        using Codec = stdlib::StdlibCodec<FF>;
        static constexpr bool in_circuit = true; // StdlibVerificationKey_ is always in-circuit
        std::vector<FF> vk_elements;

        // Tag, serialize, and append to vk_elements
        auto append_tagged = [&]<typename T>(const T& component) {
            auto frs = bb::tag_and_serialize<in_circuit, Codec>(component, tag);
            vk_elements.insert(vk_elements.end(), frs.begin(), frs.end());
        };

        // Tag and serialize VK metadata
        append_tagged(this->log_circuit_size);
        append_tagged(this->num_public_inputs);
        append_tagged(this->pub_inputs_offset);

        // Tag and serialize VK commitments.
        // Note that commitments have been already deserialized and the point at infinity is constrained to (0,0)).
        for (const Commitment& commitment : this->get_all()) {
            append_tagged(commitment);
        }

        // Sanitize free witness tags before hashing
        bb::unset_free_witness_tags<in_circuit, FF>(vk_elements);

        // Hash the tagged elements directly
        return stdlib::poseidon2<Builder>::hash(vk_elements);
    }

    /**
     * @brief An overload that accepts a transcript and extracts the tag internally
     * @tparam TranscriptType The transcript type (Codec and HashFunction deduced automatically)
     * @param transcript The transcript to extract the origin tag from
     * @returns The hash of the verification key
     */
    template <typename Transcript> FF hash_with_origin_tagging(const Transcript& transcript) const
    {
        const OriginTag tag = bb::extract_transcript_tag(transcript);
        return hash_with_origin_tagging(tag);
    }
};

// ===== VK + hash wrapper =====

/**
 * @brief Wrapper holding a verification key and its precomputed hash.
 * @details The hash is used to bind the verification key to the proof during verification, ensuring that the
 * correct VK is used.
 *
 * This class provides three constructors for different use cases:
 *
 * 1. **VKAndHash_(vk)** - Auto-computes hash from VK
 *    - Use case: Native verification entry points (e.g., `bb verify`, ACIR proof verification)
 *
 * 2. **VKAndHash_(builder, native_vk)** - Creates stdlib VK from native and computes hash (recursive only)
 *    - Use case: Setting up recursive verifiers with a native VK reference
 *
 * 3. **VKAndHash_(vk, hash)** - Takes both VK and hash separately
 *    - Use case: Constraint-based recursion (ACIR) where hash is provided as a separate circuit witness
 *
 * @tparam FF The field type (native fr or stdlib field_t)
 * @tparam VerificationKey The verification key type (native or stdlib)
 */
template <typename FF, typename VerificationKey> class VKAndHash_ {
  public:
    template <typename T = VerificationKey>
    using Builder = typename std::enable_if_t<requires { typename T::Builder; }, T>::Builder;

    template <typename T = VerificationKey>
    using NativeVerificationKey =
        typename std::enable_if_t<requires { typename T::NativeVerificationKey; }, T>::NativeVerificationKey;

    VKAndHash_() = default;

    /**
     * @brief Construct from VK, auto-computing the hash.
     */
    VKAndHash_(const std::shared_ptr<VerificationKey>& vk)
        : vk(vk)
        , hash(vk->hash())
    {}

    /**
     * @brief Construct from VK and pre-provided hash.
     */
    VKAndHash_(const std::shared_ptr<VerificationKey>& vk, const FF& hash)
        : vk(vk)
        , hash(hash)
    {}

    /**
     * @brief Construct stdlib VKAndHash from a native VK (recursive verification keys only).
     */
    template <typename VK = VerificationKey,
              typename B = typename VK::Builder,
              typename NVK = typename VK::NativeVerificationKey>
    VKAndHash_(B& builder, const std::shared_ptr<NVK>& native_vk)
        : vk(std::make_shared<VerificationKey>(&builder, native_vk))
        , hash(FF::from_witness(&builder, native_vk->hash()))
    {}
    std::shared_ptr<VerificationKey> vk;
    FF hash;
};

// ===== NativeVerificationKey_ Serde =====

template <typename PrecomputedCommitments, typename Codec, typename HashFunction, typename CommitmentKey>
inline void read(uint8_t const*& it,
                 NativeVerificationKey_<PrecomputedCommitments, Codec, HashFunction, CommitmentKey>& vk)
{
    using serialize::read;
    using VK = NativeVerificationKey_<PrecomputedCommitments, Codec, HashFunction, CommitmentKey>;

    // Get the size directly from the static method
    size_t num_frs = VK::calc_num_data_types();

    // Read exactly num_frs field elements from the buffer
    std::vector<typename Codec::DataType> field_elements(num_frs);
    for (auto& element : field_elements) {
        read(it, element);
    }
    // Then use from_field_elements to populate the verification key
    vk.from_field_elements(field_elements);
}

template <typename PrecomputedCommitments, typename Codec, typename HashFunction, typename CommitmentKey>
inline void write(std::vector<uint8_t>& buf,
                  NativeVerificationKey_<PrecomputedCommitments, Codec, HashFunction, CommitmentKey> const& vk)
{
    using serialize::write;
    using VK = NativeVerificationKey_<PrecomputedCommitments, Codec, HashFunction, CommitmentKey>;

    size_t before = buf.size();
    // Convert to field elements and write them directly without length prefix
    auto field_elements = vk.to_field_elements();
    for (const auto& element : field_elements) {
        write(buf, element);
    }
    size_t after = buf.size();
    size_t num_frs = VK::calc_num_data_types();
    BB_ASSERT_EQ(after - before, num_frs * sizeof(bb::fr), "VK serialization mismatch");
}

} // namespace bb
