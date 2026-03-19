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
struct schnorr_signature {

    // `s` is a serialized grumpkin scalar (bb::fq, 32 bytes), the prover's response to the challenge `e`.
    std::array<uint8_t, 32> s;
    // `e` is a serialized grumpkin scalar (bb::fq, 32 bytes). The Poseidon2 challenge is computed over
    // bb::fr (the grumpkin base field), but since bb::fr < bb::fq the value embeds losslessly.
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
