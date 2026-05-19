#pragma once

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

// Short-Schnorr signature (s, e): include the challenge `e` instead of the group element R.
//
// `s` is the prover's response to the challenge, a scalar in the grumpkin scalar field.
// `e` is the challenge hash. Conceptually a Poseidon2 output (which lives in the grumpkin base
// field = `bb::fr`); since `bb::fr modulus < bb::fq modulus`, every challenge value embeds losslessly
// into the grumpkin scalar field, so we store it as the same scalar type as `s`.
struct schnorr_signature {
    grumpkin::fr s;
    grumpkin::fr e;
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
