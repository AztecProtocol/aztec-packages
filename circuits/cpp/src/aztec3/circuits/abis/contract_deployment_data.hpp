#pragma once
#include <barretenberg/crypto/generators/generator_data.hpp>
#include <barretenberg/stdlib/hash/pedersen/pedersen.hpp>
#include <barretenberg/stdlib/primitives/witness/witness.hpp>
#include <aztec3/utils/types/circuit_types.hpp>
#include <aztec3/utils/types/convert.hpp>
#include <aztec3/utils/types/native_types.hpp>

namespace aztec3::circuits::abis {

using aztec3::utils::types::CircuitTypes;
using aztec3::utils::types::NativeTypes;
using plonk::stdlib::witness_t;
using std::is_same;

template <typename NCT> struct ContractDeploymentData {
    typedef typename NCT::boolean boolean;
    typedef typename NCT::fr fr;

    fr contract_data_hash;
    fr function_tree_root;
    fr constructor_hash;
    fr contract_address_salt;
    fr portal_contract_address; // TODO: no uint160 circuit type?

    bool operator==(ContractDeploymentData<NCT> const&) const = default;

    static ContractDeploymentData<NCT> empty() { return { 0, 0, 0, 0, 0 }; };

    template <typename Composer>
    ContractDeploymentData<CircuitTypes<Composer>> to_circuit_type(Composer& composer) const
    {
        static_assert((std::is_same<NativeTypes, NCT>::value));

        // Capture the composer:
        auto to_ct = [&](auto& e) { return aztec3::utils::types::to_ct(composer, e); };

        ContractDeploymentData<CircuitTypes<Composer>> data = {
            to_ct(contract_data_hash),    to_ct(function_tree_root),      to_ct(constructor_hash),
            to_ct(contract_address_salt), to_ct(portal_contract_address),
        };

        return data;
    };

    template <typename Composer> ContractDeploymentData<NativeTypes> to_native_type() const
    {
        static_assert(std::is_same<CircuitTypes<Composer>, NCT>::value);
        auto to_nt = [&](auto& e) { return aztec3::utils::types::to_nt<Composer>(e); };

        ContractDeploymentData<NativeTypes> call_context = {
            to_nt(contract_data_hash),    to_nt(function_tree_root),      to_nt(constructor_hash),
            to_nt(contract_address_salt), to_nt(portal_contract_address),
        };

        return call_context;
    };

    template <typename Composer> void assert_is_zero()
    {
        static_assert((std::is_same<CircuitTypes<Composer>, NCT>::value));

        contract_data_hash.assert_is_zero();
        function_tree_root.assert_is_zero();
        constructor_hash.assert_is_zero();
        contract_address_salt.assert_is_zero();
        portal_contract_address.assert_is_zero();
    }

    void set_public()
    {
        static_assert(!(std::is_same<NativeTypes, NCT>::value));

        contract_data_hash.set_public();
        function_tree_root.set_public();
        constructor_hash.set_public();
        contract_address_salt.set_public();
        portal_contract_address.set_public();
    }

    fr hash() const
    {
        std::vector<fr> inputs = {
            contract_data_hash, function_tree_root, constructor_hash, contract_address_salt, portal_contract_address,
        };

        return NCT::compress(inputs, GeneratorIndex::CONTRACT_DEPLOYMENT_DATA);
    }
};

template <typename NCT> void read(uint8_t const*& it, ContractDeploymentData<NCT>& data)
{
    using serialize::read;

    read(it, data.contract_data_hash);
    read(it, data.function_tree_root);
    read(it, data.constructor_hash);
    read(it, data.contract_address_salt);
    read(it, data.portal_contract_address);
};

template <typename NCT> void write(std::vector<uint8_t>& buf, ContractDeploymentData<NCT> const& data)
{
    using serialize::write;

    write(buf, data.contract_data_hash);
    write(buf, data.function_tree_root);
    write(buf, data.constructor_hash);
    write(buf, data.contract_address_salt);
    write(buf, data.portal_contract_address);
};

template <typename NCT> std::ostream& operator<<(std::ostream& os, ContractDeploymentData<NCT> const& data)
{
    return os << "contract_data_hash: " << data.contract_data_hash << "\n"
              << "function_tree_root: " << data.function_tree_root << "\n"
              << "constructor_hash: " << data.constructor_hash << "\n"
              << "contract_address_salt: " << data.contract_address_salt << "\n"
              << "portal_contract_address: " << data.portal_contract_address << "\n";
}

} // namespace aztec3::circuits::abis