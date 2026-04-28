#pragma once

#include <array>
#include <memory.h>

#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"

#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/streams.hpp"
#include "barretenberg/serialize/msgpack.hpp"

namespace bb::crypto {
template <typename Fr, typename G1> struct schnorr_key_pair {
    Fr private_key;
    typename G1::affine_element public_key;
};

// Raw representation of a Schnorr signature (s, e). We use the short variant of Schnorr
// where we include the challenge `e` instead of the group element R.
//
// We do not enforce that `s` or `e` are canonical: `Fr::serialize_from_buffer` reduces the input mod
// the field order, so multiple byte representations decode to the same field element and all verify.
// This is fine when signatures are private inputs to a circuit (the in-circuit deserializer enforces
// canonicity), but consumers who hash the raw signature bytes for replay prevention or equality must
// canonicalize first.
struct schnorr_signature {

    // `s` is a serialized grumpkin scalar (bb::fq, 32 bytes), the prover's response to the challenge `e`.
    std::array<uint8_t, 32> s;
    // `e` is the Fiat-Shamir challenge. Conceptually a Poseidon2 output, which lives in bb::fr (the
    // grumpkin base field). We store its bytes in a 32-byte slot sized for bb::fq (the grumpkin scalar
    // field): because bb::fr modulus < bb::fq modulus, every bb::fr value embeds into bb::fq with no
    // reduction or bias, and the in-signature byte representation is the canonical bb::fr form.
    std::array<uint8_t, 32> e;
    SERIALIZATION_FIELDS(s, e);
};

template <typename Fr, typename G1>
bool schnorr_verify_signature(const typename G1::Fq& message_field,
                              const typename G1::affine_element& public_key,
                              const schnorr_signature& sig);

template <typename Fr, typename G1>
schnorr_signature schnorr_construct_signature(const typename G1::Fq& message_field,
                                              const schnorr_key_pair<Fr, G1>& account);

inline bool operator==(schnorr_signature const& lhs, schnorr_signature const& rhs)
{
    return lhs.s == rhs.s && lhs.e == rhs.e;
}

inline std::ostream& operator<<(std::ostream& os, schnorr_signature const& sig)
{
    os << "{ " << sig.s << ", " << sig.e << " }";
    return os;
}

template <typename B> inline void read(B& it, schnorr_key_pair<grumpkin::fr, grumpkin::g1>& keypair)
{
    read(it, keypair.private_key);
    read(it, keypair.public_key);
}

template <typename B> inline void write(B& buf, schnorr_key_pair<grumpkin::fr, grumpkin::g1> const& keypair)
{
    write(buf, keypair.private_key);
    write(buf, keypair.public_key);
}
} // namespace bb::crypto
#include "./schnorr.tcc"
