#pragma once
/**
 * @file bbapi_wire_convert.hpp
 * @brief Wire <-> domain conversion helpers for the bbapi handlers.
 *
 * Two conversion strategies coexist:
 *
 * 1. **Field-by-field** (`fr_to_wire`/`fr_from_wire`/`grumpkin_point_to_wire`/etc.).
 *    Used by simple handlers (Poseidon2, Pedersen, Blake2s, AES, Grumpkin,
 *    Bn254 G1/G2, Secp256k1/r1, Schnorr, ECDSA, SrsInit). Explicit, fast,
 *    compile-time-safe.
 *
 * 2. **msgpack_roundtrip** (generic pack-then-unpack). Used by handlers
 *    whose wire/domain types are intricate nested aggregates (CircuitInput,
 *    ChonkProof, ProofSystemSettings — chonk/ultra_honk/avm/circuit
 *    commands). The wire and domain types share a SERIALIZATION_FIELDS
 *    shape so this is correct; the extra pack+unpack per call is
 *    acceptable for these non-hot-path commands.
 */
#include "barretenberg/bbapi/generated/bb_types.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/bn254/fq.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/ecc/curves/secp256k1/secp256k1.hpp"
#include "barretenberg/ecc/curves/secp256r1/secp256r1.hpp"
#include "barretenberg/serialize/msgpack.hpp"

#include <array>
#include <cstring>
#include <vector>

namespace bb::bbapi {

// ---------------------------------------------------------------------------
// Generic msgpack roundtrip (escape hatch for intricate nested aggregates).
// ---------------------------------------------------------------------------

template <typename Target, typename Source> inline Target msgpack_roundtrip(const Source& src)
{
    msgpack::sbuffer buf;
    msgpack::pack(buf, src);
    auto unpacked = msgpack::unpack(buf.data(), buf.size());
    Target target;
    unpacked.get().convert(target);
    return target;
}

// ---------------------------------------------------------------------------
// Field element conversions. All field types (bb::fr, bb::fq, grumpkin::fr,
// grumpkin::fq, secp256k1::*, secp256r1::*) pack as msgpack bin32. Wire `Fr`
// also packs as bin32 (codegen Fr struct with custom adaptor). So a wire
// `Fr` and any domain field element have identical wire bytes and can be
// converted via serialize_to_buffer / serialize_from_buffer.
// ---------------------------------------------------------------------------

template <typename Field> inline ::Fr field_to_wire(const Field& d)
{
    ::Fr r{};
    Field::serialize_to_buffer(d, r.data());
    return r;
}

template <typename Field> inline Field field_from_wire(const ::Fr& w)
{
    return Field::serialize_from_buffer(w.data());
}

inline ::Fr fr_to_wire(const bb::fr& d)
{
    return field_to_wire<bb::fr>(d);
}
inline bb::fr fr_from_wire(const ::Fr& w)
{
    return field_from_wire<bb::fr>(w);
}

// Wrap/unwrap a raw 32-byte buffer as the wire Fr struct. Used when the
// domain side already speaks std::array<uint8_t, 32> (e.g. Schnorr/ECDSA
// signature components, Blake2s hash output) and the wire side needs Fr.
inline ::Fr fr_wrap(std::array<uint8_t, 32> bytes)
{
    return ::Fr{ .bytes = bytes };
}
inline std::array<uint8_t, 32> fr_unwrap(const ::Fr& w)
{
    return w.bytes;
}

// Fixed-size array <-> std::vector<uint8_t> for fields the schema declares as
// ["array","unsigned char",N] when N != 32 (which would collapse to fr). Used
// for AES iv/key (16 bytes) and GrumpkinReduce512/Secp256k1Reduce512 input
// (64 bytes). The wire side is a length-prefixed vector; the domain side is
// a fixed std::array.
template <std::size_t N> inline std::array<uint8_t, N> array_from_vec(const std::vector<uint8_t>& v)
{
    std::array<uint8_t, N> r{};
    if (v.size() != N)
        throw std::runtime_error("array_from_vec: size mismatch");
    std::memcpy(r.data(), v.data(), N);
    return r;
}
template <std::size_t N> inline std::vector<uint8_t> vec_from_array(const std::array<uint8_t, N>& a)
{
    return std::vector<uint8_t>(a.begin(), a.end());
}

inline std::vector<::Fr> fr_vec_to_wire(const std::vector<bb::fr>& d)
{
    std::vector<::Fr> r;
    r.reserve(d.size());
    for (const auto& x : d) {
        r.push_back(fr_to_wire(x));
    }
    return r;
}

inline std::vector<bb::fr> fr_vec_from_wire(const std::vector<::Fr>& w)
{
    std::vector<bb::fr> r;
    r.reserve(w.size());
    for (const auto& x : w) {
        r.push_back(fr_from_wire(x));
    }
    return r;
}

template <std::size_t N> inline std::array<::Fr, N> fr_array_to_wire(const std::array<bb::fr, N>& d)
{
    std::array<::Fr, N> r{};
    for (std::size_t i = 0; i < N; ++i) {
        r[i] = fr_to_wire(d[i]);
    }
    return r;
}

template <std::size_t N> inline std::array<bb::fr, N> fr_array_from_wire(const std::array<::Fr, N>& w)
{
    std::array<bb::fr, N> r{};
    for (std::size_t i = 0; i < N; ++i) {
        r[i] = fr_from_wire(w[i]);
    }
    return r;
}

// ---------------------------------------------------------------------------
// Curve point conversions. Wire types follow a uniform {Fr x, Fr y} shape.
// Domain types use the curve-specific affine_element. The default
// affine_element msgpack adapter packs as a 2-field map {x: bin32, y: bin32},
// matching the wire encoding, so field-by-field conversion is safe.
// ---------------------------------------------------------------------------

inline wire::GrumpkinPoint grumpkin_point_to_wire(const grumpkin::g1::affine_element& d)
{
    return { .x = field_to_wire<grumpkin::fq>(d.x), .y = field_to_wire<grumpkin::fq>(d.y) };
}

inline grumpkin::g1::affine_element grumpkin_point_from_wire(const wire::GrumpkinPoint& w)
{
    return { field_from_wire<grumpkin::fq>(w.x), field_from_wire<grumpkin::fq>(w.y) };
}

inline std::vector<wire::GrumpkinPoint> grumpkin_point_vec_to_wire(const std::vector<grumpkin::g1::affine_element>& d)
{
    std::vector<wire::GrumpkinPoint> r;
    r.reserve(d.size());
    for (const auto& p : d) {
        r.push_back(grumpkin_point_to_wire(p));
    }
    return r;
}

inline std::vector<grumpkin::g1::affine_element> grumpkin_point_vec_from_wire(const std::vector<wire::GrumpkinPoint>& w)
{
    std::vector<grumpkin::g1::affine_element> r;
    r.reserve(w.size());
    for (const auto& p : w) {
        r.push_back(grumpkin_point_from_wire(p));
    }
    return r;
}

inline wire::Bn254G1Point bn254_g1_point_to_wire(const bb::g1::affine_element& d)
{
    return { .x = field_to_wire<bb::fq>(d.x), .y = field_to_wire<bb::fq>(d.y) };
}

inline bb::g1::affine_element bn254_g1_point_from_wire(const wire::Bn254G1Point& w)
{
    return { field_from_wire<bb::fq>(w.x), field_from_wire<bb::fq>(w.y) };
}

inline wire::Bn254G2Point bn254_g2_point_to_wire(const bb::g2::affine_element& d)
{
    return msgpack_roundtrip<wire::Bn254G2Point>(d);
}

inline bb::g2::affine_element bn254_g2_point_from_wire(const wire::Bn254G2Point& w)
{
    return msgpack_roundtrip<bb::g2::affine_element>(w);
}

inline wire::Secp256k1Point secp256k1_point_to_wire(const secp256k1::g1::affine_element& d)
{
    return { .x = field_to_wire<secp256k1::fq>(d.x), .y = field_to_wire<secp256k1::fq>(d.y) };
}

inline secp256k1::g1::affine_element secp256k1_point_from_wire(const wire::Secp256k1Point& w)
{
    return { field_from_wire<secp256k1::fq>(w.x), field_from_wire<secp256k1::fq>(w.y) };
}

inline wire::Secp256r1Point secp256r1_point_to_wire(const secp256r1::g1::affine_element& d)
{
    return { .x = field_to_wire<secp256r1::fq>(d.x), .y = field_to_wire<secp256r1::fq>(d.y) };
}

inline secp256r1::g1::affine_element secp256r1_point_from_wire(const wire::Secp256r1Point& w)
{
    return { field_from_wire<secp256r1::fq>(w.x), field_from_wire<secp256r1::fq>(w.y) };
}

} // namespace bb::bbapi
