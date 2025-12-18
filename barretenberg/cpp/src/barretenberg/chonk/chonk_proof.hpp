// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

namespace bb {

struct ChonkProof {
    HonkProof mega_proof;
    GoblinProof goblin_proof;

    /**
     * @brief The size of a Chonk proof without backend-added public inputs
     *
     * @param virtual_log_n
     * @return constexpr size_t
     */
    static constexpr size_t PROOF_LENGTH_WITHOUT_PUB_INPUTS(size_t virtual_log_n = MegaZKFlavor::VIRTUAL_LOG_N)
    {
        return /*mega_proof*/ MegaZKFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS(virtual_log_n) +
               /*merge_proof*/ MERGE_PROOF_SIZE +
               /*eccvm proof*/ ECCVMFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS +
               /*ipa proof*/ IPA_PROOF_LENGTH +
               /*translator*/ TranslatorFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS;
    }

    /**
     * @brief The size of a Chonk proof with backend-added public inputs: HidingKernelIO
     *
     * @param virtual_log_n
     * @return constexpr size_t
     */
    static constexpr size_t PROOF_LENGTH(size_t virtual_log_n = MegaZKFlavor::VIRTUAL_LOG_N)
    {
        return PROOF_LENGTH_WITHOUT_PUB_INPUTS(virtual_log_n) +
               /*public_inputs*/ bb::HidingKernelIO::PUBLIC_INPUTS_SIZE;
    }

    size_t size() const;

    /**
     * @brief Serialize proof to field elements
     *
     * @return std::vector<bb::fr>
     */
    std::vector<bb::fr> to_field_elements() const;

    static ChonkProof from_field_elements(const std::vector<bb::fr>& fields);

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1299): The following msgpack methods are generic
    // and should leverage some kind of shared msgpack utility.
    msgpack::sbuffer to_msgpack_buffer() const;

    /**
     * @brief Very quirky method to convert a msgpack buffer to a "heap" buffer
     * @details This method results in a buffer that is double-size-prefixed with the buffer size. This is to mimmic
     * the original bb.js behavior which did a *out_proof = to_heap_buffer(to_buffer(proof));
     *
     * @return uint8_t* Double size-prefixed msgpack buffer
     */
    uint8_t* to_msgpack_heap_buffer() const;
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkProof";

    class DeserializationError : public std::runtime_error {
      public:
        DeserializationError(const std::string& msg)
            : std::runtime_error(std::string("Chonk Proof deserialization error: ") + msg)
        {}
    };

    static ChonkProof from_msgpack_buffer(uint8_t const*& buffer);
    static ChonkProof from_msgpack_buffer(const msgpack::sbuffer& buffer);

    void to_file_msgpack(const std::string& filename) const;
    static ChonkProof from_file_msgpack(const std::string& filename);

    MSGPACK_FIELDS(mega_proof, goblin_proof);
    bool operator==(const ChonkProof& other) const = default;
};

/**
 * @brief Stdlib representation of a Chonk proof for recursive verification.
 * @details Contains the proof as circuit witness elements (field_t). Can be constructed from a native Chonk::Proof
 * or from a vector of witness indices.
 */
struct ChonkStdlibProof {
    using Builder = UltraCircuitBuilder;
    using HonkProof = stdlib::Proof<Builder>;
    using GoblinProof = GoblinStdlibProof;

    static constexpr size_t HIDING_KERNEL_PROOF_LENGTH_WITHOUT_PUBLIC_INPUTS =
        MegaZKFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS();

    HonkProof mega_proof;           // MegaZK proof of the hiding kernel circuit
    GoblinStdlibProof goblin_proof; // Goblin proof (Merge + ECCVM + IPA + Translator)

    ChonkStdlibProof(Builder& builder, const ChonkProof& proof)
        : mega_proof(builder, proof.mega_proof)
        , goblin_proof(builder, proof.goblin_proof)
    {}

    /**
     * @brief Construct a new Stdlib Proof object from indices in a builder
     *
     * @param proof_indices Field elements representing the proof
     * @param public_inputs_size Number of public inputs
     * @param virtual_log_n Virtual circuit size (log2)
     */
    ChonkStdlibProof(const std::vector<stdlib::field_t<Builder>>& proof_indices, size_t public_inputs_size)
    {
        BB_ASSERT_EQ(proof_indices.size(),
                     ChonkProof::PROOF_LENGTH() + public_inputs_size,
                     "Number of indices differs from the expected proof size.");

        auto it = proof_indices.begin();

        // Mega proof
        std::ptrdiff_t start_idx = 0;
        std::ptrdiff_t end_idx = static_cast<std::ptrdiff_t>(
            HIDING_KERNEL_PROOF_LENGTH_WITHOUT_PUBLIC_INPUTS +
            stdlib::recursion::honk::HidingKernelIO<Builder>::PUBLIC_INPUTS_SIZE + public_inputs_size);
        mega_proof.insert(mega_proof.end(), it + start_idx, it + end_idx);

        // Merge proof
        start_idx = end_idx;
        end_idx += static_cast<std::ptrdiff_t>(MERGE_PROOF_SIZE);
        goblin_proof.merge_proof.insert(goblin_proof.merge_proof.end(), it + start_idx, it + end_idx);

        // ECCVM proof (IPA is separate)
        start_idx = end_idx;
        end_idx += static_cast<std::ptrdiff_t>(ECCVMFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS);
        goblin_proof.eccvm_proof.insert(goblin_proof.eccvm_proof.end(), it + start_idx, it + end_idx);

        // IPA proof
        start_idx = end_idx;
        end_idx += static_cast<std::ptrdiff_t>(IPA_PROOF_LENGTH);
        goblin_proof.ipa_proof.insert(goblin_proof.ipa_proof.end(), it + start_idx, it + end_idx);

        // Translator proof
        start_idx = end_idx;
        end_idx += static_cast<std::ptrdiff_t>(TranslatorFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS);
        goblin_proof.translator_proof.insert(goblin_proof.translator_proof.end(), it + start_idx, it + end_idx);

        BB_ASSERT_EQ(static_cast<uint32_t>(end_idx),
                     bb::ChonkProof::PROOF_LENGTH() + public_inputs_size,
                     "Reconstructed a Chonk proof of wrong the length from proof indices.");
    }
};

} // namespace bb
