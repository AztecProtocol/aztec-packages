// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/streams.hpp"
#include "barretenberg/eccvm/eccvm_flavor.hpp"
#include "barretenberg/flavor/mega_zk_flavor.hpp"
#include "barretenberg/goblin/types.hpp"
#include "barretenberg/honk/proof_length.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include "barretenberg/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/translator_vm/translator_flavor.hpp"
#include <fstream>

namespace bb {

/**
 * @brief Chonk proof type.
 * @details Contains five proof segments produced by the batched MegaZK + Translator protocol:
 *   1. hiding_oink_proof: Hiding kernel Oink (pre-sumcheck commitments for the hiding kernel)
 *   2. merge_proof: Merge proof for the hiding kernel's ECC op subtable
 *   3. eccvm_proof: ECCVM proof without the final TripleIPA proof
 *   4. ipa_proof: TripleIPA transcript for reducing ECCVM PCS checks to an accumulator
 *   5. joint_proof: Translator Oink + joint sumcheck + joint Shplemini/KZG PCS
 *
 * The joint sumcheck and PCS batch the MegaZK and translator circuits together,
 * eliminating separate sumcheck/PCS phases and reducing overall proof size.
 */
template <bool IsRecursive = false> struct ChonkProof_ {
    using Builder = std::conditional_t<IsRecursive, UltraCircuitBuilder, void>;
    using HonkProof = std::conditional_t<IsRecursive, stdlib::Proof<Builder>, ::bb::HonkProof>;
    using FF = std::conditional_t<IsRecursive, stdlib::field_t<Builder>, bb::fr>;

    HonkProof hiding_oink_proof; // Hiding kernel Oink (pre-sumcheck only)
    HonkProof merge_proof;       // Merge proof
    HonkProof eccvm_proof;       // ECCVM proof
    HonkProof ipa_proof;         // TripleIPA transcript
    HonkProof joint_proof;       // Translator Oink + joint sumcheck + joint PCS

    // Sub-proof sizes (in field elements, excluding public inputs).
    static constexpr size_t HIDING_OINK_LENGTH = ProofLength::Oink<MegaZKFlavor>::LENGTH_WITHOUT_PUB_INPUTS;

    // Joint proof = translator proof structure (with committed sumcheck) + MegaZK evaluations.
    static constexpr size_t JOINT_PROOF_LENGTH =
        TranslatorFlavor::COMMITTED_SUMCHECK_PROOF_LENGTH + MegaZKFlavor::NUM_ALL_ENTITIES;

    static constexpr size_t PROOF_LENGTH_WITHOUT_PUB_INPUTS = HIDING_OINK_LENGTH + MERGE_PROOF_SIZE +
                                                              ECCVMFlavor::PROOF_LENGTH +
                                                              ECCVMFlavor::TRIPLE_IPA_PROOF_LENGTH + JOINT_PROOF_LENGTH;
    static constexpr size_t PROOF_LENGTH = PROOF_LENGTH_WITHOUT_PUB_INPUTS + bb::HidingKernelIO::PUBLIC_INPUTS_SIZE;

    // Default constructor
    ChonkProof_() = default;

    ChonkProof_(HonkProof mega_zk, HonkProof merge, HonkProof eccvm, HonkProof ipa, HonkProof joint)
        : hiding_oink_proof(std::move(mega_zk))
        , merge_proof(std::move(merge))
        , eccvm_proof(std::move(eccvm))
        , ipa_proof(std::move(ipa))
        , joint_proof(std::move(joint))
    {}

    // Constructs a stdlib Chonk proof from a native Chonk proof
    template <typename B = Builder>
        requires IsRecursive
    ChonkProof_(B& builder, const ChonkProof_<false>& proof)
        : hiding_oink_proof(builder, proof.hiding_oink_proof)
        , merge_proof(builder, proof.merge_proof)
        , eccvm_proof(builder, proof.eccvm_proof)
        , ipa_proof(builder, proof.ipa_proof)
        , joint_proof(builder, proof.joint_proof)
    {}

    size_t size() const
    {
        return hiding_oink_proof.size() + merge_proof.size() + eccvm_proof.size() + ipa_proof.size() +
               joint_proof.size();
    }

    /**
     * @brief Serialize proof to field elements (native mode)
     */
    std::vector<FF> to_field_elements() const;

    /**
     * @brief Reconstruct proof from field elements
     */
    static ChonkProof_ from_field_elements(const std::vector<FF>& fields);

  public:
    // MSGPACK methods (native mode only)
    msgpack::sbuffer to_msgpack_buffer() const
        requires(!IsRecursive)
    {
        msgpack::sbuffer buffer;
        msgpack::pack(buffer, *this);
        return buffer;
    }

    uint8_t* to_msgpack_heap_buffer() const
        requires(!IsRecursive)
    {
        msgpack::sbuffer buffer = to_msgpack_buffer();
        std::vector<uint8_t> buf(buffer.data(), buffer.data() + buffer.size());
        return to_heap_buffer(buf);
    }

    static ChonkProof_ from_msgpack_buffer(uint8_t const*& buffer)
        requires(!IsRecursive)
    {
        auto uint8_buffer = from_buffer<std::vector<uint8_t>>(buffer);
        msgpack::sbuffer sbuf;
        sbuf.write(reinterpret_cast<char*>(uint8_buffer.data()), uint8_buffer.size());
        return from_msgpack_buffer(sbuf);
    }

    static ChonkProof_ from_msgpack_buffer(const msgpack::sbuffer& buffer)
        requires(!IsRecursive)
    {
        std::size_t offset = 0;
        msgpack::object_handle oh = msgpack::unpack(buffer.data(), buffer.size(), offset);
        if (offset != buffer.size()) {
            throw_or_abort("ChonkProof::from_msgpack_buffer: trailing data (" + std::to_string(buffer.size() - offset) +
                           " extra bytes)");
        }
        ChonkProof_ proof;
        oh.get().convert(proof);
        return proof;
    }

    void to_file_msgpack(const std::string& filename) const
        requires(!IsRecursive)
    {
        msgpack::sbuffer buffer = to_msgpack_buffer();
        std::ofstream ofs(filename, std::ios::binary);
        if (!ofs.is_open()) {
            throw_or_abort("Failed to open file for writing.");
        }
        ofs.write(buffer.data(), static_cast<std::streamsize>(buffer.size()));
        ofs.close();
    }

    static ChonkProof_ from_file_msgpack(const std::string& filename)
        requires(!IsRecursive)
    {
        std::ifstream ifs(filename, std::ios::binary);
        if (!ifs.is_open()) {
            throw_or_abort("Failed to open file for reading.");
        }
        ifs.seekg(0, std::ios::end);
        size_t file_size = static_cast<size_t>(ifs.tellg());
        ifs.seekg(0, std::ios::beg);
        std::vector<char> buffer(file_size);
        ifs.read(buffer.data(), static_cast<std::streamsize>(file_size));
        ifs.close();
        msgpack::sbuffer msgpack_buffer;
        msgpack_buffer.write(buffer.data(), file_size);
        return ChonkProof_::from_msgpack_buffer(msgpack_buffer);
    }

    // MSGPACK support (native mode only)
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkProof";

    class DeserializationError : public std::runtime_error {
      public:
        DeserializationError(const std::string& msg)
            : std::runtime_error(std::string("Chonk Proof deserialization error: ") + msg)
        {}
    };

    SERIALIZATION_FIELDS(hiding_oink_proof, merge_proof, eccvm_proof, ipa_proof, joint_proof);
    bool operator==(const ChonkProof_& other) const = default;
};

// Type aliases for convenience
using ChonkProof = ChonkProof_<false>;      // Native proof
using ChonkStdlibProof = ChonkProof_<true>; // Recursive proof

} // namespace bb
