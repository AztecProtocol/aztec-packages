#pragma once

#include <array>
#include <cstdint>
#include <cstring>
#include <functional>
#include <ostream>
#include <random>
#include <string>

namespace azteclabs::wsdb {

/**
 * @brief A 256-bit field element as wsdb sees it: 32 canonical bytes, no arithmetic.
 *
 * wsdb never does field arithmetic — it only stores field values (node hashes, leaf
 * keys), orders them, compares them, serialises them, and feeds them to the hash
 * primitive. So it owns this minimal value type instead of depending on barretenberg's
 * `fr` (and the montgomery form, constexpr field machinery, and stdlib coupling that
 * pulling in `fr` implies). The 32 bytes are barretenberg's canonical field
 * serialisation (big-endian): byte order == numeric order, and the msgpack encoding is
 * byte-identical to `azteclabs::wsdb::fr` (a 32-byte bin), so on-disk data and the IPC wire are
 * unchanged.
 */
struct FieldElement {
    std::array<uint8_t, 32> bytes{};

    FieldElement() = default;
    explicit FieldElement(const std::array<uint8_t, 32>& b)
        : bytes(b)
    {}

    // Construct from a small integer (canonical big-endian), matching azteclabs::wsdb::fr(uint64_t).
    FieldElement(uint64_t v)
    {
        for (size_t i = 0; i < sizeof(v); ++i) {
            bytes[bytes.size() - 1 - i] = static_cast<uint8_t>(v >> (8 * i));
        }
    }

    // Construct from a "0x..."-style hex string (big-endian), matching azteclabs::wsdb::fr(std::string).
    // Right-aligned: shorter strings are zero-padded on the left. Used by tests/fixtures.
    explicit FieldElement(const std::string& hex)
    {
        std::string h = (hex.rfind("0x", 0) == 0 || hex.rfind("0X", 0) == 0) ? hex.substr(2) : hex;
        if (h.size() > 64) {
            h = h.substr(h.size() - 64);
        }
        h = std::string(64 - h.size(), '0') + h;
        auto nib = [](char c) -> uint8_t {
            if (c >= '0' && c <= '9') {
                return static_cast<uint8_t>(c - '0');
            }
            return static_cast<uint8_t>((c | 0x20) - 'a' + 10);
        };
        for (size_t i = 0; i < 32; ++i) {
            bytes[i] = static_cast<uint8_t>((nib(h[2 * i]) << 4) | nib(h[2 * i + 1]));
        }
    }

    static FieldElement zero() { return {}; }

    // A random field element, guaranteed < modulus (top byte zero => < 2^248 < bn254 r).
    // Test/fixture helper, mirroring azteclabs::wsdb::fr::random_element().
    static FieldElement random_element()
    {
        static thread_local std::mt19937_64 rng{ std::random_device{}() };
        FieldElement fe;
        for (size_t i = 1; i < fe.bytes.size(); ++i) {
            fe.bytes[i] = static_cast<uint8_t>(rng());
        }
        return fe;
    }
    [[nodiscard]] bool is_zero() const { return *this == FieldElement{}; }

    // Big-endian canonical bytes => lexicographic byte order is numeric order, which is
    // what the indexed-tree low-leaf search and the lmdb key comparator require.
    bool operator==(const FieldElement&) const = default;
    auto operator<=>(const FieldElement&) const = default;

    [[nodiscard]] const uint8_t* data() const { return bytes.data(); }
    uint8_t* data() { return bytes.data(); }

    // Raw 32-byte (de)serialisation, mirroring azteclabs::wsdb::fr's buffer API.
    static void serialize_to_buffer(const FieldElement& v, uint8_t* buffer) { std::memcpy(buffer, v.bytes.data(), 32); }
    static FieldElement serialize_from_buffer(const uint8_t* buffer)
    {
        FieldElement fe;
        std::memcpy(fe.bytes.data(), buffer, 32);
        return fe;
    }

    // msgpack: a 32-byte bin, byte-identical to azteclabs::wsdb::fr. The bytes are already canonical
    // (no montgomery form here), so we pack/unpack them directly. Intrusive members,
    // matching azteclabs::wsdb::fr, so msgpack-c dispatches to them.
    void msgpack_pack(auto& packer) const
    {
        packer.pack_bin(static_cast<uint32_t>(bytes.size()));
        packer.pack_bin_body(reinterpret_cast<const char*>(bytes.data()), static_cast<uint32_t>(bytes.size()));
    }
    void msgpack_unpack(auto o) { bytes = static_cast<std::array<uint8_t, 32>>(o); }
};

inline std::ostream& operator<<(std::ostream& os, const FieldElement& fe)
{
    static constexpr char hex[] = "0123456789abcdef";
    os << "0x";
    for (uint8_t b : fe.bytes) {
        os << hex[b >> 4] << hex[b & 0xf];
    }
    return os;
}

} // namespace azteclabs::wsdb

// In the decoupled (bb-free) build there is no barretenberg `fr`; wsdb's merkle code
// refers to the node/leaf field type as `fr`/`azteclabs::wsdb::fr`, so alias it to FieldElement.
// Lets the forked merkle headers compile unchanged. The parity/equivalence tests DO link
// barretenberg and need the real azteclabs::wsdb::fr alongside FieldElement, so they compile with
// -DWSDB_NO_FR_ALIAS to suppress this alias.
namespace azteclabs::wsdb {
using fr = ::azteclabs::wsdb::FieldElement;
} // namespace azteclabs::wsdb

template <> struct std::hash<azteclabs::wsdb::FieldElement> {
    size_t operator()(const azteclabs::wsdb::FieldElement& fe) const noexcept
    {
        size_t h = 0;
        std::memcpy(&h, fe.bytes.data(), sizeof(h));
        return h;
    }
};
