#pragma once

#include "tx_request.hpp"

#include <aztec3/utils/types/circuit_types.hpp>
#include <aztec3/utils/types/convert.hpp>
#include <aztec3/utils/types/native_types.hpp>

#include <barretenberg/crypto/hashers/hashers.hpp>
#include <barretenberg/stdlib/primitives/witness/witness.hpp>

namespace aztec3::circuits::abis {

using aztec3::utils::types::CircuitTypes;
using aztec3::utils::types::NativeTypes;

template <typename NCT> struct SignedTxRequest {
    using fr = typename NCT::fr;
    using boolean = typename NCT::boolean;
    using Signature = typename NCT::ecdsa_signature;
    using secp256k1_point = typename NCT::secp256k1_point;

    TxRequest<NCT> tx_request{};
    secp256k1_point signing_key;
    Signature signature{};

    boolean operator==(SignedTxRequest<NCT> const& other) const
    {
        return tx_request == other.tx_request && signing_key == other.signing_key && signature == other.signature;
    };

    template <typename Composer> SignedTxRequest<CircuitTypes<Composer>> to_circuit_type(Composer& composer) const
    {
        static_assert((std::is_same<NativeTypes, NCT>::value));

        // Capture the composer:
        auto to_ct = [&](auto& e) { return aztec3::utils::types::to_ct(composer, e); };
        auto to_circuit_type = [&](auto& e) { return e.to_circuit_type(composer); };

        SignedTxRequest<CircuitTypes<Composer>> signed_tx_request = { to_circuit_type(tx_request),
                                                                      to_ct(signing_key),
                                                                      to_ct(signature) };
        return signed_tx_request;
    };

    template <typename Composer> SignedTxRequest<NativeTypes> to_native_type() const
    {
        static_assert((std::is_same<CircuitTypes<Composer>, NCT>::value));

        auto to_native_type = []<typename T>(T& e) { return e.template to_native_type<Composer>(); };

        SignedTxRequest<NativeTypes> signed_tx_request = {
            to_native_type(tx_request),
            to_native_type(signing_key),
            to_native_type(signature),
        };

        return signed_tx_request;
    };

    fr hash() const
    {
        // TODO: This is probably not the right thing to do here!!
        fr const sfr = fr::serialize_from_buffer(signature.s.cbegin());
        fr const rfr = fr::serialize_from_buffer(signature.r.cbegin());
        fr const vfr = signature.v;
        std::vector<fr> const inputs = { tx_request.hash(), rfr, sfr, vfr };
        return NCT::compress(inputs, GeneratorIndex::SIGNED_TX_REQUEST);
    }

    fr compute_signing_message() const
    {
        std::vector<fr> messages;
        messages.push_back(tx_request.from.to_field());
        messages.push_back(tx_request.to.to_field());
        messages.push_back(tx_request.function_data.hash());
        messages.push_back(NCT::compress(tx_request.args, aztec3::CONSTRUCTOR_ARGS));
        messages.push_back(tx_request.nonce);
        messages.push_back(tx_request.tx_context.hash());
        messages.push_back(tx_request.chain_id);

        return NCT::compress(messages, aztec3::SIGNED_TX_REQUEST_MESSAGE);
    }

    void compute_signature(const NativeTypes::secp256k1_fr& private_key)
    {
        static_assert((std::is_same<NativeTypes, NCT>::value));
        auto signing_message = compute_signing_message().to_buffer();
        const std::string signing_message_str(signing_message.begin(), signing_message.end());
        crypto::ecdsa::key_pair<NativeTypes::secp256k1_fr, NativeTypes::secp256k1_group> account;
        account.private_key = private_key;
        account.public_key = this->signing_key;

        signature = crypto::ecdsa::construct_signature<Sha256Hasher,
                                                       NativeTypes::secp256k1_group::Fq,
                                                       NativeTypes::secp256k1_group::Fr,
                                                       NativeTypes::secp256k1_group>(signing_message_str, account);
    }
};

template <typename NCT> void read(uint8_t const*& it, SignedTxRequest<NCT>& signed_tx_request)
{
    using serialize::read;

    read(it, signed_tx_request.tx_request);
    read(it, signed_tx_request.signing_key);
    read(it, signed_tx_request.signature);
};

template <typename NCT> void write(std::vector<uint8_t>& buf, SignedTxRequest<NCT> const& signed_tx_request)
{
    using serialize::write;

    write(buf, signed_tx_request.tx_request);
    write(buf, signed_tx_request.signing_key);
    write(buf, signed_tx_request.signature);
};

template <typename NCT> std::ostream& operator<<(std::ostream& os, SignedTxRequest<NCT> const& signed_tx_request)
{
    return os << "tx_request:\n"
              << signed_tx_request.tx_request << "\n"
              << "signing_key: " << signed_tx_request.signing_key << "\n"
              << "signature: " << signed_tx_request.signature << "\n";
}

}  // namespace aztec3::circuits::abis