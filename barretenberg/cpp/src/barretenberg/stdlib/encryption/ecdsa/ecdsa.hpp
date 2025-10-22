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

    Builder* get_context() const
    {
        if (r.get_context() != nullptr) {
            return r.get_context();
        }

        if (s.get_context() != nullptr) {
            return s.get_context();
        }

        return nullptr;
    }
};

template <typename Builder, typename Curve, typename Fq, typename Fr, typename G1>
bool_t<Builder> ecdsa_verify_signature(const stdlib::byte_array<Builder>& hashed_message,
                                       const G1& public_key,
                                       const ecdsa_signature<Builder>& sig);

template <typename Builder> void generate_ecdsa_verification_test_circuit(Builder& builder, size_t num_iterations);

} // namespace bb::stdlib

#include "./ecdsa_impl.hpp"
