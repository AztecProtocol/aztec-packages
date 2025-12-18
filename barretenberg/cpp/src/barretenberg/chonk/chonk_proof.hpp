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

/**
 * @brief Unified Chonk proof type for both native and recursive verification.
 * @details When IsRecursive=false (native): Contains native proof types with msgpack serialization.
 *          When IsRecursive=true (recursive): Contains stdlib proof types for in-circuit verification.
 */
template <bool IsRecursive = false> struct ChonkProof_ {
    using Builder = std::conditional_t<IsRecursive, UltraCircuitBuilder, void>;
    using HonkProof = std::conditional_t<IsRecursive, stdlib::Proof<Builder>, ::bb::HonkProof>;
    using GoblinProof = std::conditional_t<IsRecursive, GoblinStdlibProof, ::bb::GoblinProof>;

    HonkProof mega_proof;     // MegaZK proof of the hiding kernel circuit
    GoblinProof goblin_proof; // Goblin proof (Merge + ECCVM + IPA + Translator)

    /**
     * @brief The size of a Chonk proof without backend-added public inputs
     */
    static constexpr size_t PROOF_LENGTH_WITHOUT_PUB_INPUTS =
        /*mega_proof*/ MegaZKFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS() +
        /*merge_proof*/ MERGE_PROOF_SIZE +
        /*eccvm proof*/ ECCVMFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS +
        /*ipa proof*/ IPA_PROOF_LENGTH +
        /*translator*/ TranslatorFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS;

    /**
     * @brief The size of a Chonk proof with backend-added public inputs: HidingKernelIO
     */
    static constexpr size_t PROOF_LENGTH = PROOF_LENGTH_WITHOUT_PUB_INPUTS +
                                           /*public_inputs*/ bb::HidingKernelIO::PUBLIC_INPUTS_SIZE;

    static constexpr size_t HIDING_KERNEL_PROOF_LENGTH_WITHOUT_PUBLIC_INPUTS =
        MegaZKFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS();

    // Default constructor
    ChonkProof_() = default;

    // Constructor for both native and recursive modes
    ChonkProof_(HonkProof&& mega, GoblinProof&& goblin)
        : mega_proof(std::move(mega))
        , goblin_proof(std::move(goblin))
    {}

    // Constructors for recursive mode (IsRecursive=true)
    template <typename B = Builder>
    ChonkProof_(B& builder, const ChonkProof_<false>& proof)
        requires IsRecursive
        : mega_proof(builder, proof.mega_proof)
        , goblin_proof(builder, proof.goblin_proof)
    {}

    /**
     * @brief Construct from field elements (recursive mode only)
     * @param proof_indices Field elements representing the proof
     * @param public_inputs_size Number of public inputs
     */
    template <typename B = Builder>
    ChonkProof_(const std::vector<stdlib::field_t<B>>& proof_indices, size_t public_inputs_size)
        requires IsRecursive
    {
        BB_ASSERT_EQ(proof_indices.size(),
                     PROOF_LENGTH + public_inputs_size,
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
                     PROOF_LENGTH + public_inputs_size,
                     "Reconstructed a Chonk proof of wrong the length from proof indices.");
    }

    // Common methods (available for both native and recursive)
    size_t size() const { return mega_proof.size() + goblin_proof.size(); }

    /**
     * @brief Serialize proof to field elements
     */
    std::vector<bb::fr> to_field_elements() const;

    static ChonkProof_ from_field_elements(const std::vector<bb::fr>& fields);

    // MSGPACK methods (native mode only, IsRecursive=false)
    msgpack::sbuffer to_msgpack_buffer() const
        requires(!IsRecursive);

    uint8_t* to_msgpack_heap_buffer() const
        requires(!IsRecursive);

    static ChonkProof_ from_msgpack_buffer(uint8_t const*& buffer)
        requires(!IsRecursive);

    static ChonkProof_ from_msgpack_buffer(const msgpack::sbuffer& buffer)
        requires(!IsRecursive);

    void to_file_msgpack(const std::string& filename) const
        requires(!IsRecursive);

    static ChonkProof_ from_file_msgpack(const std::string& filename)
        requires(!IsRecursive);

    // MSGPACK support (native mode only)
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkProof";

    class DeserializationError : public std::runtime_error {
      public:
        DeserializationError(const std::string& msg)
            : std::runtime_error(std::string("Chonk Proof deserialization error: ") + msg)
        {}
    };

    MSGPACK_FIELDS(mega_proof, goblin_proof);
    bool operator==(const ChonkProof_& other) const = default;
};

// Type aliases for convenience
using ChonkProof = ChonkProof_<false>;      // Native proof
using ChonkStdlibProof = ChonkProof_<true>; // Recursive proof

} // namespace bb
