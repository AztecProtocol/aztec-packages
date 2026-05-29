#pragma once
/**
 * @file bbapi_wire_convert.hpp
 * @brief Wire <-> domain conversion helpers for the bbapi handlers.
 *
 * All conversions are field-by-field: each handler in bbapi_handlers.cpp
 * builds the domain command struct from the wire fields, calls execute(),
 * and builds the wire response from the domain response fields.
 *
 * Wire field types (Fr / Fq / Uint256 / … — nominal bin32 aliases) and
 * domain field types (`bb::fr`, `bb::fq`, `uint256_t`, …) share a 32-byte
 * msgpack `bin32` encoding, so the byte-level conversion is a
 * `serialize_to_buffer` / `serialize_from_buffer` call.
 */
#include "barretenberg/bbapi/bbapi_chonk.hpp"
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/bbapi/generated/bb_types.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/bn254/fq.hpp"
#include "barretenberg/ecc/curves/bn254/fq2.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/ecc/curves/secp256k1/secp256k1.hpp"
#include "barretenberg/ecc/curves/secp256r1/secp256r1.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/serialize/msgpack.hpp"

#include <array>
#include <utility>
#include <vector>

namespace bb::bbapi {

// ---------------------------------------------------------------------------
// Field element conversions. All field types (bb::fr, bb::fq, grumpkin::fr,
// grumpkin::fq, secp256k1::*, secp256r1::*) pack as msgpack bin32. The wire
// aliases are nominal C++ wrappers over the same 32 bytes, so conversions are
// just serialize_to_buffer / serialize_from_buffer at the boundary.
// ---------------------------------------------------------------------------

inline const std::array<uint8_t, 32>& wire_bytes(const std::array<uint8_t, 32>& w)
{
    return w;
}

template <typename Wire> inline const std::array<uint8_t, 32>& wire_bytes(const Wire& w)
{
    return static_cast<const std::array<uint8_t, 32>&>(w);
}

template <typename Field> inline std::array<uint8_t, 32> field_to_bytes(const Field& d)
{
    std::array<uint8_t, 32> r{};
    Field::serialize_to_buffer(d, r.data());
    return r;
}

template <typename Field> inline std::array<uint8_t, 32> field_to_wire(const Field& d)
{
    return field_to_bytes(d);
}

template <typename Wire, typename Field> inline Wire field_to_wire_as(const Field& d)
{
    return Wire{ field_to_bytes(d) };
}

template <typename Field, typename Wire> inline Field field_from_wire(const Wire& w)
{
    return Field::serialize_from_buffer(wire_bytes(w).data());
}

inline ::Fr fr_to_wire(const bb::fr& d)
{
    return field_to_wire_as<::Fr>(d);
}
inline bb::fr fr_from_wire(const ::Fr& w)
{
    return field_from_wire<bb::fr>(w);
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
    return { .x = field_to_wire_as<::Fr>(d.x), .y = field_to_wire_as<::Fr>(d.y) };
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
    return { .x = field_to_wire_as<::Fq>(d.x), .y = field_to_wire_as<::Fq>(d.y) };
}

inline bb::g1::affine_element bn254_g1_point_from_wire(const wire::Bn254G1Point& w)
{
    return { field_from_wire<bb::fq>(w.x), field_from_wire<bb::fq>(w.y) };
}

// Fq2 = { c0: bb::fq, c1: bb::fq }; wire Fq2 is two fq bin32 aliases.
inline std::array<::Fq, 2> fq2_to_wire(const bb::fq2& d)
{
    return { field_to_wire_as<::Fq>(d.c0), field_to_wire_as<::Fq>(d.c1) };
}

inline bb::fq2 fq2_from_wire(const std::array<::Fq, 2>& w)
{
    return { field_from_wire<bb::fq>(w[0]), field_from_wire<bb::fq>(w[1]) };
}

inline wire::Bn254G2Point bn254_g2_point_to_wire(const bb::g2::affine_element& d)
{
    return { .x = fq2_to_wire(d.x), .y = fq2_to_wire(d.y) };
}

inline bb::g2::affine_element bn254_g2_point_from_wire(const wire::Bn254G2Point& w)
{
    return { fq2_from_wire(w.x), fq2_from_wire(w.y) };
}

inline wire::Secp256k1Point secp256k1_point_to_wire(const secp256k1::g1::affine_element& d)
{
    return { .x = field_to_wire_as<::Secp256k1Fq>(d.x), .y = field_to_wire_as<::Secp256k1Fq>(d.y) };
}

inline secp256k1::g1::affine_element secp256k1_point_from_wire(const wire::Secp256k1Point& w)
{
    return { field_from_wire<secp256k1::fq>(w.x), field_from_wire<secp256k1::fq>(w.y) };
}

inline wire::Secp256r1Point secp256r1_point_to_wire(const secp256r1::g1::affine_element& d)
{
    return { .x = field_to_wire_as<::Secp256r1Fq>(d.x), .y = field_to_wire_as<::Secp256r1Fq>(d.y) };
}

inline secp256r1::g1::affine_element secp256r1_point_from_wire(const wire::Secp256r1Point& w)
{
    return { field_from_wire<secp256r1::fq>(w.x), field_from_wire<secp256r1::fq>(w.y) };
}

// ---------------------------------------------------------------------------
// uint256_t ↔ Uint256 (= std::array<uint8_t, 32>).
// Wire format is 32 bytes big-endian (matches uint256_t::msgpack_pack).
// ---------------------------------------------------------------------------

inline ::Uint256 uint256_to_wire(const bb::numeric::uint256_t& d)
{
    ::Uint256 r{};
    for (std::size_t i = 0; i < 4; ++i) {
        const uint64_t v = d.data[3 - i];
        for (std::size_t j = 0; j < 8; ++j) {
            r[i * 8 + j] = static_cast<uint8_t>(v >> (56 - j * 8));
        }
    }
    return r;
}

inline bb::numeric::uint256_t uint256_from_wire(const ::Uint256& w)
{
    uint64_t parts[4]{};
    for (std::size_t i = 0; i < 4; ++i) {
        uint64_t v = 0;
        for (std::size_t j = 0; j < 8; ++j) {
            v = (v << 8) | w[i * 8 + j];
        }
        parts[i] = v;
    }
    return bb::numeric::uint256_t(parts[3], parts[2], parts[1], parts[0]);
}

inline std::vector<::Uint256> uint256_vec_to_wire(const std::vector<bb::numeric::uint256_t>& d)
{
    std::vector<::Uint256> r;
    r.reserve(d.size());
    for (const auto& x : d) {
        r.push_back(uint256_to_wire(x));
    }
    return r;
}

inline std::vector<bb::numeric::uint256_t> uint256_vec_from_wire(const std::vector<::Uint256>& w)
{
    std::vector<bb::numeric::uint256_t> r;
    r.reserve(w.size());
    for (const auto& x : w) {
        r.push_back(uint256_from_wire(x));
    }
    return r;
}

inline ChonkProof chonk_proof_from_wire(wire::ChonkProof&& w)
{
    return ChonkProof(fr_vec_from_wire(w.hiding_oink_proof),
                      fr_vec_from_wire(w.merge_proof),
                      fr_vec_from_wire(w.eccvm_proof),
                      fr_vec_from_wire(w.ipa_proof),
                      fr_vec_from_wire(w.joint_proof));
}

inline wire::ChonkProof chonk_proof_to_wire(const ChonkProof& d)
{
    return { .hiding_oink_proof = fr_vec_to_wire(d.hiding_oink_proof),
             .merge_proof = fr_vec_to_wire(d.merge_proof),
             .eccvm_proof = fr_vec_to_wire(d.eccvm_proof),
             .ipa_proof = fr_vec_to_wire(d.ipa_proof),
             .joint_proof = fr_vec_to_wire(d.joint_proof) };
}

inline std::vector<ChonkProof> chonk_proof_vec_from_wire(std::vector<wire::ChonkProof>&& w)
{
    std::vector<ChonkProof> r;
    r.reserve(w.size());
    for (auto& p : w) {
        r.push_back(chonk_proof_from_wire(std::move(p)));
    }
    return r;
}

} // namespace bb::bbapi
