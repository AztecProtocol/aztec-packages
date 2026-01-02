// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/streams.hpp"
#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include <fstream>

namespace bb {

/**
 * @brief Chonk proof type.
 * @details When IsRecursive=false (native): Contains native proof types with msgpack serialization.
 *          When IsRecursive=true (recursive): Contains stdlib proof types for in-circuit verification.
 */
template <bool IsRecursive = false> struct ChonkProof_ {
    using Builder = std::conditional_t<IsRecursive, UltraCircuitBuilder, void>;
    using HonkProof = std::conditional_t<IsRecursive, stdlib::Proof<Builder>, ::bb::HonkProof>;
    using GoblinProof = std::conditional_t<IsRecursive, GoblinStdlibProof, ::bb::GoblinProof>;
    using FF = std::conditional_t<IsRecursive, stdlib::field_t<Builder>, bb::fr>;

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

    // Copy constructor (needed for msgpack deserialization)
    ChonkProof_(const HonkProof& mega, const GoblinProof& goblin)
        : mega_proof(mega)
        , goblin_proof(goblin)
    {}

    // Move constructor for both native and recursive modes
    ChonkProof_(HonkProof&& mega, GoblinProof&& goblin)
        : mega_proof(std::move(mega))
        , goblin_proof(std::move(goblin))
    {}

    // Constructs a stdlib Chonk proof from a native Chonk proof
    template <typename B = Builder>
        requires IsRecursive
    ChonkProof_(B& builder, const ChonkProof_<false>& proof)
        : mega_proof(builder, proof.mega_proof)
        , goblin_proof(builder, proof.goblin_proof)
    {}

    // Serde methods

    size_t size() const { return mega_proof.size() + goblin_proof.size(); }

    /**
     * @brief Serialize proof to field elements (native mode)
     */
    std::vector<FF> to_field_elements() const;

    /**
     * @brief Common logic to reconstruct proof from field elements
     * @tparam FieldType Either bb::fr (native) or stdlib::field_t<Builder> (recursive)
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
        msgpack::object_handle oh = msgpack::unpack(buffer.data(), buffer.size());
        msgpack::object obj = oh.get();
        ChonkProof_ proof;
        obj.convert(proof);
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

    MSGPACK_FIELDS(mega_proof, goblin_proof);
    bool operator==(const ChonkProof_& other) const = default;
};

// Type aliases for convenience
using ChonkProof = ChonkProof_<false>;      // Native proof
using ChonkStdlibProof = ChonkProof_<true>; // Recursive proof

} // namespace bb
