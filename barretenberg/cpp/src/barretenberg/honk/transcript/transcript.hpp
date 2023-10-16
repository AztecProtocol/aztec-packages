#pragma once

#include "barretenberg/common/serialize.hpp"
#include "barretenberg/crypto/blake3s/blake3s.hpp"
#include "barretenberg/crypto/pedersen_commitment/pedersen.hpp"

#include <algorithm>
#include <array>
#include <concepts>
#include <cstddef>
#include <cstdint>
#include <map>
#include <span>
#include <string>
#include <utility>
#include <vector>

namespace proof_system::honk {

class TranscriptManifest {
    struct RoundData {
        std::vector<std::string> challenge_label;
        std::vector<std::pair<std::string, size_t>> entries;

        bool operator==(const RoundData& other) const = default;
    };

    std::map<size_t, RoundData> manifest;

  public:
    void print()
    {
        for (auto& round : manifest) {
            info("Round: ", round.first);
            for (auto& label : round.second.challenge_label) {
                info("\tchallenge: ", label);
            }
            for (auto& entry : round.second.entries) {
                info("\telement (", entry.second, "): ", entry.first);
            }
        }
    }

    template <typename... Strings> void add_challenge(size_t round, Strings&... labels)
    {
        manifest[round].challenge_label = { labels... };
    }
    void add_entry(size_t round, const std::string& element_label, size_t element_size)
    {
        manifest[round].entries.emplace_back(element_label, element_size);
    }

    [[nodiscard]] size_t size() const { return manifest.size(); }

    RoundData operator[](const size_t& round) { return manifest[round]; };

    bool operator==(const TranscriptManifest& other) const = default;
};

/**
 * @brief Common transcript functionality for both parties. Stores the data for the current round, as well as the
 * manifest.
 *
 * @tparam FF Field from which we sample challenges.
 */
template <typename FF> class BaseTranscript {
    // TODO(Adrian): Make these tweakable
  public:
    static constexpr size_t HASH_OUTPUT_SIZE = 32;
    BaseTranscript() = default; // TODO(Lucas): delete this?

  private:
    static constexpr size_t MIN_BYTES_PER_CHALLENGE = 128 / 8; // 128 bit challenges

    size_t num_objects_processed = 0;

    size_t round_number = 0;        // current round for manifest
    bool is_first_challenge = true; // indicates if this is the first challenge this transcript is generating
    std::array<uint8_t, HASH_OUTPUT_SIZE> previous_challenge_buffer{}; // default-initialized to zeros
    std::vector<uint8_t> current_round_data;

    // "Manifest" object that records a summary of the transcript interactions
    TranscriptManifest manifest;

    /**
     * @brief Checks that the current object is the expected next one.
     *
     * @param object_name
     * @return bool
     */
    [[nodiscard]] bool check_current_object(const std::string& object_name) const
    {
        ASSERT(num_objects_processed < ordered_objects.size());
        return (get<0>(ordered_objects[num_objects_processed]) == object_name);
    }

    /**
     * @brief Compute next challenge c_next = H( Compress(c_prev || round_buffer) )
     * @details This function computes a new challenge for the current round using the previous challenge
     * and the current round data, if they are exist. It clears the current_round_data if nonempty after
     * computing the challenge to minimize how much we compress. It also sets previous_challenge_buffer
     * to the current challenge buffer to set up next function call.
     * @return std::array<uint8_t, HASH_OUTPUT_SIZE>
     */
    [[nodiscard]] std::array<uint8_t, HASH_OUTPUT_SIZE> get_next_challenge_buffer()
    {
        // Prevent challenge generation if this is the first challenge we're generating,
        // AND nothing was sent by the prover.
        if (is_first_challenge) {
            ASSERT(!current_round_data.empty());
        }

        // concatenate the previous challenge (if this is not the first challenge) with the current round data.
        // TODO(Adrian): Do we want to use a domain separator as the initial challenge buffer?
        // We could be cheeky and use the hash of the manifest as domain separator, which would prevent us from having
        // to domain separate all the data. (See https://safe-hash.dev)
        std::vector<uint8_t> full_buffer;
        if (!is_first_challenge) {
            // if not the first challenge, we can use the previous_challenge_buffer
            full_buffer.insert(full_buffer.end(), previous_challenge_buffer.begin(), previous_challenge_buffer.end());
        } else {
            // Update is_first_challenge for the future
            is_first_challenge = false;
        }
        if (!current_round_data.empty()) {
            full_buffer.insert(full_buffer.end(), current_round_data.begin(), current_round_data.end());
            current_round_data.clear(); // clear the round data buffer since it has been used
        }

        // Pre-hash the full buffer to minimize the amount of data passed to the cryptographic hash function.
        // Only a collision-resistant hash-function like Pedersen is required for this step.
        // Note: this pre-hashing is an efficiency trick that may be discareded if using a SNARK-friendly or in contexts
        // (eg smart contract verification) where the cost of elliptic curve operations is high.
        std::vector<uint8_t> compressed_buffer = to_buffer(crypto::pedersen_commitment::compress_native(full_buffer));

        // Use a strong hash function to derive the new challenge_buffer.
        auto base_hash = blake3::blake3s(compressed_buffer);

        std::array<uint8_t, HASH_OUTPUT_SIZE> new_challenge_buffer;
        std::copy_n(base_hash.begin(), HASH_OUTPUT_SIZE, new_challenge_buffer.begin());
        // update previous challenge buffer for next time we call this function
        previous_challenge_buffer = new_challenge_buffer;
        return new_challenge_buffer;
    };

  protected:
    // Enum to deal with various types in Transcript
    enum TranscriptObjectType { UInt32Obj, FieldElementObj, CommitmentObj, SumcheckUnivariateObj, SumcheckEvalObj };
    // conversion mapping from type to TranscriptObjectType enum object
    template <typename T> static TranscriptObjectType convert_type_to_enum([[maybe_unused]] T _);
    static std::vector<uint8_t> serialize_obj(TranscriptObjectType enum_type, void* obj);
    void deserialize_obj(void* obj_ptr, TranscriptObjectType enum_type, const std::span<const uint8_t>& buf);

    class TranscriptObject {
      public:
        template <typename T>
        TranscriptObject(std::string name, T* ptr)
            : obj_name(std::move(name))
            , obj_ptr(static_cast<void*>(ptr))
            , obj_size(sizeof(T))
            , obj_type(convert_type_to_enum(*ptr))
        {}
        std::string obj_name; // object name as a string
        void* obj_ptr;        // ptr to member variable object in class
        size_t obj_size;      // in bytes
        TranscriptObjectType obj_type;
    };
    // List of objects in the transcript by name, pointer, and size in bytes
    std::vector<TranscriptObject> ordered_objects;

    /**
     * @brief Adds challenge elements to the current_round_buffer and updates the manifest.
     *
     * @param label of the element sent
     * @param element_bytes serialized
     */
    void consume_prover_element_bytes(const std::string& label, std::span<const uint8_t> element_bytes)
    {
        // Add an entry to the current round of the manifest
        manifest.add_entry(round_number, label, element_bytes.size());

        current_round_data.insert(current_round_data.end(), element_bytes.begin(), element_bytes.end());
    }

    // TODO(lucas): make this pure virtual
    void set_up_structure(uint32_t circuit_size);

    void set_up_structure_and_deserialize(uint32_t circuit_size, const std::vector<uint8_t>& proof_data)
    {
        set_up_structure(circuit_size);
        size_t num_bytes_read_ = 0;
        for (TranscriptObject& obj : ordered_objects) {
            size_t element_size = obj.obj_size;
            ASSERT(num_bytes_read_ + element_size <= proof_data.size());

            auto element_bytes = std::span{ proof_data }.subspan(num_bytes_read_, element_size);
            num_bytes_read_ += element_size;
            deserialize_obj(obj.obj_ptr, obj.obj_type, element_bytes);
        }
    }

  public:
    template <typename T> void send_to_verifier(std::string object_name, T object)
    {
        if (!check_current_object(object_name)) {
            throw_or_abort("Object being sent is not expected.");
        }
        T* obj_ptr = static_cast<T*>(ordered_objects[num_objects_processed].obj_ptr);
        // set the current object pointed to by ordered_objects as object
        *obj_ptr = object;
        ++num_objects_processed; // update num_objects_processed to point to the next object
    }
    template <typename T> T receive_from_verifier(std::string object_name)
    {
        if (!check_current_object(object_name)) {
            throw_or_abort("Object being sent is not expected.");
        }
        T* obj_ptr = static_cast<T*>(ordered_objects[num_objects_processed].obj_ptr);
        ++num_objects_processed; // update num_objects_processed to point to the next object
        return *obj_ptr;
    }

    /**
     * @brief After all the prover messages have been sent, finalize the round by hashing all the data and then create
     * the number of requested challenges.
     * @details Challenges are generated by iteratively hashing over the previous challenge, using
     * get_next_challenge_buffer().
     * TODO(#741): Optimizations for this function include generalizing type of hash, splitting hashes into
     * multiple challenges.
     *
     * @param labels human-readable names for the challenges for the manifest
     * @return std::array<FF, num_challenges> challenges for this round.
     */
    template <typename... Strings> std::array<FF, sizeof...(Strings)> get_challenges(const Strings&... labels)
    {
        constexpr size_t num_challenges = sizeof...(Strings);

        // Add challenge labels for current round to the manifest
        manifest.add_challenge(round_number, labels...);

        // Compute the new challenge buffer from which we derive the challenges.

        // Create challenges from bytes.
        std::array<FF, num_challenges> challenges{};

        // Generate the challenges by iteratively hashing over the previous challenge.
        for (size_t i = 0; i < num_challenges; i++) {
            auto next_challenge_buffer = get_next_challenge_buffer(); // get next challenge buffer
            std::array<uint8_t, sizeof(FF)> field_element_buffer{};
            // copy half of the hash to lower 128 bits of challenge
            // Note: because of how read() from buffers to fields works (in field_declarations.hpp),
            // we use the later half of the buffer
            std::copy_n(next_challenge_buffer.begin(),
                        HASH_OUTPUT_SIZE / 2,
                        field_element_buffer.begin() + HASH_OUTPUT_SIZE / 2);
            challenges[i] = from_buffer<FF>(field_element_buffer);
        }

        // Prepare for next round.
        ++round_number;

        return challenges;
    }

    FF get_challenge(const std::string& label) { return get_challenges(label)[0]; }

    [[nodiscard]] TranscriptManifest get_manifest() const { return manifest; };

    std::vector<uint8_t> serialize()
    { // TODO(Lucas): make this pure virtual
        std::vector<uint8_t> proof_data;
        for (TranscriptObject& obj : ordered_objects) {
            std::vector<uint8_t> obj_bytes = serialize_obj(obj.obj_type, obj.obj_ptr);
            proof_data.insert(proof_data.end(), obj_bytes.begin(), obj_bytes.end());
        }
        return proof_data;
    }

    void print() { manifest.print(); }
};

template <typename FF> class ProverTranscript : public BaseTranscript<FF> {

  public:
    /// Contains the raw data sent by the prover.
    std::vector<uint8_t> proof_data;

    /**
     * @brief Adds a prover message to the transcript.
     *
     * @details Serializes the provided object into `proof_data`, and updates the current round state.
     *
     * @param label Description/name of the object being added.
     * @param element Serializable object that will be added to the transcript
     *
     * @todo Use a concept to only allow certain types to be passed. Requirements are that the object should be
     * serializable.
     *
     */
    template <class T> void send_to_verifier(const std::string& label, const T& element)
    {
        using serialize::write;
        // TODO(Adrian): Ensure that serialization of affine elements (including point at infinity) is consistent.
        // TODO(Adrian): Consider restricting serialization (via concepts) to types T for which sizeof(T) reliably
        // returns the size of T in bytes. (E.g. this is true for std::array but not for std::vector).
        info(label);
        auto element_bytes = to_buffer(element);
        proof_data.insert(proof_data.end(), element_bytes.begin(), element_bytes.end());

        BaseTranscript<FF>::consume_prover_element_bytes(label, element_bytes);
    }

    /**
     * @brief For testing: initializes transcript with some arbitrary data so that a challenge can be generated after
     * initialization
     *
     * @return ProverTranscript
     */
    static ProverTranscript init_empty()
    {
        ProverTranscript<FF> transcript;
        constexpr uint32_t init{ 42 }; // arbitrary
        transcript.send_to_verifier("Init", init);
        return transcript;
    };
};

template <class FF> class VerifierTranscript : public BaseTranscript<FF> {

    /// Contains the raw data sent by the prover.
    std::vector<uint8_t> proof_data_;
    uint32_t num_bytes_read_ = 0;

  public:
    VerifierTranscript() = default;

    explicit VerifierTranscript(const std::vector<uint8_t>& proof_data)
        : proof_data_(proof_data.begin(), proof_data.end())
    {}

    /**
     * @brief For testing: initializes transcript based on proof data then receives junk data produced by
     * ProverTranscript::init_empty()
     *
     * @param transcript
     * @return VerifierTranscript
     */
    static VerifierTranscript init_empty(const ProverTranscript<FF>& transcript)
    {
        VerifierTranscript<FF> verifier_transcript{ transcript.proof_data };
        [[maybe_unused]] auto _ = verifier_transcript.template receive_from_prover<uint32_t>("Init");
        return verifier_transcript;
    };

    /**
     * @brief Reads the next element of type `T` from the transcript, with a predefined label.
     *
     * @param label Human readable name for the challenge.
     * @return deserialized element of type T
     */
    template <class T> T receive_from_prover(const std::string& label)
    {
        constexpr size_t element_size = sizeof(T);
        ASSERT(num_bytes_read_ + element_size <= proof_data_.size());

        auto element_bytes = std::span{ proof_data_ }.subspan(num_bytes_read_, element_size);
        num_bytes_read_ += element_size;

        BaseTranscript<FF>::consume_prover_element_bytes(label, element_bytes);

        T element = from_buffer<T>(element_bytes);

        return element;
    }
};
} // namespace proof_system::honk
