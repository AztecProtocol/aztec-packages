#pragma once
#include "private_circuit_public_inputs.hpp"
#include "public_circuit_public_inputs.hpp"

#include <barretenberg/barretenberg.hpp>

namespace aztec3::circuits::abis {

template <typename NCT> struct PrivateTypes {
    using AppCircuitPublicInputs = PrivateCircuitPublicInputs<NCT>;
    // used in schema serialization
    static constexpr char schema_name[] = "Private";  // NOLINT
};

template <typename NCT> struct PublicTypes {
    using AppCircuitPublicInputs = PublicCircuitPublicInputs<NCT>;
    // used in schema serialization
    static constexpr char schema_name[] = "Public";  // NOLINT
};

template <typename B> inline void read(B& buf, verification_key& key)
{
    using serialize::read;
    verification_key_data data;
    read(buf, data);
    key = verification_key{ std::move(data), barretenberg::srs::get_crs_factory()->get_verifier_crs() };
}

}  // namespace aztec3::circuits::abis
