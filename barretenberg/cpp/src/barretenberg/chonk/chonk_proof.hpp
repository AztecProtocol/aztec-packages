// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/constants.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/honk/types/public_inputs_type.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"

#include <msgpack/sbuffer_decl.hpp>
#include <stdexcept>
#include <string>
#include <type_traits>
#include <vector>

namespace bb {

namespace stdlib {
template <typename Builder> class Proof;
template <typename Builder> class field_t;
} // namespace stdlib

/**
 * @brief Chonk proof type.
 * @details Contains five proof segments produced by the batched MegaZK + Translator protocol:
 *   1. hiding_oink_proof: Hiding kernel Oink (pre-sumcheck commitments for the hiding kernel)
 *   2. merge_proof: Merge proof for the hiding kernel's ECC op subtable
 *   3. eccvm_proof: ECCVM proof
 *   4. ipa_proof: IPA opening proof for ECCVM (separate transcript)
 *   5. joint_proof: Translator Oink + joint sumcheck + joint Shplemini/KZG PCS
 *
 * The joint sumcheck and PCS batch the MegaZK and translator circuits together,
 * eliminating separate sumcheck/PCS phases and reducing overall proof size.
 */
template <bool IsRecursive = false> struct ChonkProof_ {
    using Builder = std::conditional_t<IsRecursive, UltraCircuitBuilder, void>;
    using HonkProof = std::conditional_t<IsRecursive, stdlib::Proof<Builder>, std::vector<bb::fr>>;
    using FF = std::conditional_t<IsRecursive, stdlib::field_t<Builder>, bb::fr>;

    HonkProof hiding_oink_proof; // Hiding kernel Oink (pre-sumcheck only)
    HonkProof merge_proof;       // Merge proof
    HonkProof eccvm_proof;       // ECCVM proof
    HonkProof ipa_proof;         // IPA opening proof (separate transcript)
    HonkProof joint_proof;       // Translator Oink + joint sumcheck + joint PCS

    // Sub-proof sizes (in field elements, excluding public inputs).
    static constexpr size_t HIDING_OINK_LENGTH = 108;

    // Joint proof = translator proof structure (with committed sumcheck) + MegaZK evaluations.
    static constexpr size_t JOINT_PROOF_LENGTH = 499;

    static constexpr size_t PROOF_LENGTH_WITHOUT_PUB_INPUTS =
        HIDING_OINK_LENGTH + MERGE_PROOF_SIZE + 608 + IPA_PROOF_LENGTH + JOINT_PROOF_LENGTH;
    static constexpr size_t PROOF_LENGTH = PROOF_LENGTH_WITHOUT_PUB_INPUTS + HIDING_KERNEL_PUBLIC_INPUTS_SIZE;

    // Default constructor
    ChonkProof_() = default;

    // 5-arg constructor
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

    SERIALIZATION_FIELDS(hiding_oink_proof, merge_proof, eccvm_proof, ipa_proof, joint_proof);
    bool operator==(const ChonkProof_& other) const = default;
};

// Type aliases for convenience
using ChonkProof = ChonkProof_<false>;      // Native proof
using ChonkStdlibProof = ChonkProof_<true>; // Recursive proof

} // namespace bb
