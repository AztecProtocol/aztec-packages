// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/chonk/chonk_proof.hpp"
#include "barretenberg/flavor/mega_zk_flavor.hpp"
#include "barretenberg/honk/proof_length.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include "barretenberg/special_public_inputs/special_public_inputs.hpp"
#include <fstream>

namespace bb {

/**
 * @brief Serialize Chonk Proof to a flat vector of field elements.
 */
template <bool IsRecursive>
std::vector<typename ChonkProof_<IsRecursive>::FF> ChonkProof_<IsRecursive>::to_field_elements() const
{
    HonkProof proof;

    proof.insert(proof.end(), hiding_oink_proof.begin(), hiding_oink_proof.end());
    proof.insert(proof.end(), merge_proof.begin(), merge_proof.end());
    proof.insert(proof.end(), eccvm_proof.begin(), eccvm_proof.end());
    proof.insert(proof.end(), ipa_proof.begin(), ipa_proof.end());
    proof.insert(proof.end(), joint_proof.begin(), joint_proof.end());
    return proof;
};

/**
 * @brief Split a flat vector of field elements into ChonkProof components.
 * @details Uses known fixed sizes for merge/eccvm/ipa proofs, and derives the hiding_oink_proof and
 * joint_proof sizes from the total.
 */
template <bool IsRecursive>
ChonkProof_<IsRecursive> ChonkProof_<IsRecursive>::from_field_elements(const std::vector<FF>& fields)
{
    // Fixed-size components
    constexpr size_t merge_size = MERGE_PROOF_SIZE;
    constexpr size_t eccvm_size = ECCVMFlavor::PROOF_LENGTH;
    constexpr size_t ipa_size = IPA_PROOF_LENGTH;
    constexpr size_t joint_size = JOINT_PROOF_LENGTH;

    // MegaZK Oink proof size = total - all other fixed-size components.
    // This correctly accounts for any ACIR public inputs prepended to the oink portion.
    constexpr size_t fixed_total = merge_size + eccvm_size + ipa_size + joint_size;
    if (fields.size() < fixed_total) {
        throw_or_abort("ChonkProof::from_field_elements: proof too short");
    }
    const size_t mega_zk_oink_length = fields.size() - fixed_total;

    auto it = fields.begin();

    HonkProof hiding_oink_proof(it, it + static_cast<std::ptrdiff_t>(mega_zk_oink_length));
    it += static_cast<std::ptrdiff_t>(mega_zk_oink_length);

    HonkProof merge_proof_out(it, it + static_cast<std::ptrdiff_t>(merge_size));
    it += static_cast<std::ptrdiff_t>(merge_size);

    HonkProof eccvm_proof_out(it, it + static_cast<std::ptrdiff_t>(eccvm_size));
    it += static_cast<std::ptrdiff_t>(eccvm_size);

    HonkProof ipa_proof_out(it, it + static_cast<std::ptrdiff_t>(ipa_size));
    it += static_cast<std::ptrdiff_t>(ipa_size);

    // Remainder is the joint_proof
    HonkProof joint_proof_out(it, fields.end());

    return ChonkProof_{ std::move(hiding_oink_proof),
                        std::move(merge_proof_out),
                        std::move(eccvm_proof_out),
                        std::move(ipa_proof_out),
                        std::move(joint_proof_out) };
}

template <bool IsRecursive>
msgpack::sbuffer ChonkProof_<IsRecursive>::to_msgpack_buffer() const
    requires(!IsRecursive)
{
    msgpack::sbuffer buffer;
    msgpack::pack(buffer, *this);
    return buffer;
}

template <bool IsRecursive>
uint8_t* ChonkProof_<IsRecursive>::to_msgpack_heap_buffer() const
    requires(!IsRecursive)
{
    msgpack::sbuffer buffer = to_msgpack_buffer();
    std::vector<uint8_t> buf(buffer.data(), buffer.data() + buffer.size());
    return to_heap_buffer(buf);
}

template <bool IsRecursive>
ChonkProof_<IsRecursive> ChonkProof_<IsRecursive>::from_msgpack_buffer(uint8_t const*& buffer)
    requires(!IsRecursive)
{
    auto uint8_buffer = from_buffer<std::vector<uint8_t>>(buffer);
    msgpack::sbuffer sbuf;
    sbuf.write(reinterpret_cast<char*>(uint8_buffer.data()), uint8_buffer.size());
    return from_msgpack_buffer(sbuf);
}

template <bool IsRecursive>
ChonkProof_<IsRecursive> ChonkProof_<IsRecursive>::from_msgpack_buffer(const msgpack::sbuffer& buffer)
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

template <bool IsRecursive>
void ChonkProof_<IsRecursive>::to_file_msgpack(const std::string& filename) const
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

template <bool IsRecursive>
ChonkProof_<IsRecursive> ChonkProof_<IsRecursive>::from_file_msgpack(const std::string& filename)
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

// Explicit template instantiations
template std::vector<bb::fr> ChonkProof_<false>::to_field_elements() const;
template std::vector<stdlib::field_t<UltraCircuitBuilder>> ChonkProof_<true>::to_field_elements() const;

template ChonkProof_<false> ChonkProof_<false>::from_field_elements(const std::vector<bb::fr>& fields);
template ChonkProof_<true> ChonkProof_<true>::from_field_elements(
    const std::vector<stdlib::field_t<UltraCircuitBuilder>>& fields);

template msgpack::sbuffer ChonkProof_<false>::to_msgpack_buffer() const;
template uint8_t* ChonkProof_<false>::to_msgpack_heap_buffer() const;
template ChonkProof_<false> ChonkProof_<false>::from_msgpack_buffer(uint8_t const*& buffer);
template ChonkProof_<false> ChonkProof_<false>::from_msgpack_buffer(const msgpack::sbuffer& buffer);
template void ChonkProof_<false>::to_file_msgpack(const std::string& filename) const;
template ChonkProof_<false> ChonkProof_<false>::from_file_msgpack(const std::string& filename);

} // namespace bb
