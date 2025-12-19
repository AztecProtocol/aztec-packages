// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/chonk/chonk_proof.hpp"
#include "barretenberg/common/streams.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include "barretenberg/special_public_inputs/special_public_inputs.hpp"

namespace bb {

// Forward declarations of template specializations
template <> msgpack::sbuffer ChonkProof_<false>::to_msgpack_buffer() const;

template <> uint8_t* ChonkProof_<false>::to_msgpack_heap_buffer() const;

template <> ChonkProof_<false> ChonkProof_<false>::from_msgpack_buffer(uint8_t const*& buffer);

template <> ChonkProof_<false> ChonkProof_<false>::from_msgpack_buffer(const msgpack::sbuffer& buffer);

template <> void ChonkProof_<false>::to_file_msgpack(const std::string& filename) const;

template <> ChonkProof_<false> ChonkProof_<false>::from_file_msgpack(const std::string& filename);

// ChonkProof_ template method implementations

template <bool IsRecursive>
std::vector<typename ChonkProof_<IsRecursive>::FF> ChonkProof_<IsRecursive>::to_field_elements() const
{
    HonkProof proof;

    proof.insert(proof.end(), mega_proof.begin(), mega_proof.end());
    proof.insert(proof.end(), goblin_proof.merge_proof.begin(), goblin_proof.merge_proof.end());
    proof.insert(proof.end(), goblin_proof.eccvm_proof.begin(), goblin_proof.eccvm_proof.end());
    proof.insert(proof.end(), goblin_proof.ipa_proof.begin(), goblin_proof.ipa_proof.end());
    proof.insert(proof.end(), goblin_proof.translator_proof.begin(), goblin_proof.translator_proof.end());
    return proof;
};

// MSGPACK methods (native mode only)
template <> msgpack::sbuffer ChonkProof_<false>::to_msgpack_buffer() const
{
    msgpack::sbuffer buffer;
    msgpack::pack(buffer, *this);
    return buffer;
}

template <> uint8_t* ChonkProof_<false>::to_msgpack_heap_buffer() const
{
    msgpack::sbuffer buffer = to_msgpack_buffer();

    std::vector<uint8_t> buf(buffer.data(), buffer.data() + buffer.size());
    return to_heap_buffer(buf);
}

template <> ChonkProof_<false> ChonkProof_<false>::from_msgpack_buffer(uint8_t const*& buffer)
{
    auto uint8_buffer = from_buffer<std::vector<uint8_t>>(buffer);

    msgpack::sbuffer sbuf;
    sbuf.write(reinterpret_cast<char*>(uint8_buffer.data()), uint8_buffer.size());

    return from_msgpack_buffer(sbuf);
}

template <> ChonkProof_<false> ChonkProof_<false>::from_msgpack_buffer(const msgpack::sbuffer& buffer)
{
    msgpack::object_handle oh = msgpack::unpack(buffer.data(), buffer.size());
    msgpack::object obj = oh.get();
    ChonkProof_<false> proof;
    obj.convert(proof);
    return proof;
}

template <> void ChonkProof_<false>::to_file_msgpack(const std::string& filename) const
{
    msgpack::sbuffer buffer = to_msgpack_buffer();
    std::ofstream ofs(filename, std::ios::binary);
    if (!ofs.is_open()) {
        throw_or_abort("Failed to open file for writing.");
    }
    ofs.write(buffer.data(), static_cast<std::streamsize>(buffer.size()));
    ofs.close();
}

template <> ChonkProof_<false> ChonkProof_<false>::from_file_msgpack(const std::string& filename)
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

    return ChonkProof_<false>::from_msgpack_buffer(msgpack_buffer);
}

} // namespace bb
