// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "../../primitives/byte_array/byte_array.hpp"
#include "../../primitives/circuit_builders/circuit_builders_fwd.hpp"
#include "barretenberg/crypto/ecdsa/ecdsa.hpp"
namespace bb::stdlib {

template <typename Builder> struct ecdsa_signature {
    stdlib::byte_array<Builder> r;
    stdlib::byte_array<Builder> s;
    stdlib::byte_array<Builder> v; // v is single byte (byte_array of size 1)
};

template <typename Builder, typename Curve, typename Fq, typename Fr, typename G1>
bool_t<Builder> ecdsa_verify_signature(const stdlib::byte_array<Builder>& message,
                                       const G1& public_key,
                                       const ecdsa_signature<Builder>& sig);

template <typename Builder, typename Curve, typename Fq, typename Fr, typename G1>
bool_t<Builder> ecdsa_verify_signature_noassert(const stdlib::byte_array<Builder>& message,
                                                const G1& public_key,
                                                const ecdsa_signature<Builder>& sig);

template <typename Builder, typename Curve, typename Fq, typename Fr, typename G1>
bool_t<Builder> ecdsa_verify_signature_prehashed_message_noassert(const stdlib::byte_array<Builder>& hashed_message,
                                                                  const G1& public_key,
                                                                  const ecdsa_signature<Builder>& sig);

template <typename Builder>
static ecdsa_signature<Builder> ecdsa_from_witness(Builder* ctx, const crypto::ecdsa_signature& input)
{
    std::vector<uint8_t> r_vec(std::begin(input.r), std::end(input.r));
    std::vector<uint8_t> s_vec(std::begin(input.s), std::end(input.s));
    std::vector<uint8_t> v_vec = { input.v }; // Create single-element vector for v
    stdlib::byte_array<Builder> r(ctx, r_vec);
    stdlib::byte_array<Builder> s(ctx, s_vec);
    stdlib::byte_array<Builder> v(ctx, v_vec); // v is now a byte_array with size 1
    ecdsa_signature<Builder> out;
    out.r = r;
    out.s = s;
    out.v = v;
    return out;
}

template <typename Builder> void generate_ecdsa_verification_test_circuit(Builder& builder, size_t num_iterations);

} // namespace bb::stdlib

#include "./ecdsa_impl.hpp"
