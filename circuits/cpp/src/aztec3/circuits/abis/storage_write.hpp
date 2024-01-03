#pragma once
#include "aztec3/utils/msgpack_derived_output.hpp"
#include "aztec3/utils/types/circuit_types.hpp"
#include "aztec3/utils/types/convert.hpp"
#include "aztec3/utils/types/native_types.hpp"

#include <barretenberg/barretenberg.hpp>

namespace aztec3::circuits::abis {

using aztec3::utils::types::CircuitTypes;
using aztec3::utils::types::NativeTypes;
using plonk::stdlib::witness_t;

template <typename NCT> struct ContractStorageWrite {
    using fr = typename NCT::fr;
    using boolean = typename NCT::boolean;

    fr storage_slot = 0;
    fr old_value = 0;
    fr new_value = 0;

    // for serialization, update with new fields
    MSGPACK_FIELDS(storage_slot, old_value, new_value);
    bool operator==(ContractStorageWrite<NCT> const&) const = default;
    template <typename Builder> ContractStorageWrite<CircuitTypes<Builder>> to_circuit_type(Builder& builder) const
    {
        static_assert((std::is_same<NativeTypes, NCT>::value));

        // Capture the circuit builder:
        auto to_ct = [&](auto& e) { return aztec3::utils::types::to_ct(builder, e); };

        ContractStorageWrite<CircuitTypes<Builder>> write = {
            to_ct(storage_slot),
            to_ct(old_value),
            to_ct(new_value),
        };

        return write;
    };

    template <typename Builder> ContractStorageWrite<NativeTypes> to_native_type() const
    {
        static_assert((std::is_same<CircuitTypes<Builder>, NCT>::value));

        auto to_nt = [&](auto& e) { return aztec3::utils::types::to_nt<Builder>(e); };

        ContractStorageWrite<NativeTypes> write = {
            to_nt(storage_slot),
            to_nt(old_value),
            to_nt(new_value),
        };

        return write;
    };

    fr hash() const
    {
        std::vector<fr> const inputs = {
            storage_slot,
            old_value,
            new_value,
        };

        return NCT::hash(inputs, GeneratorIndex::PUBLIC_DATA_WRITE);
    }

    void set_public()
    {
        static_assert(!(std::is_same<NativeTypes, NCT>::value));

        storage_slot.set_public();
        old_value.set_public();
        new_value.set_public();
    }

    boolean is_empty() const { return storage_slot == 0; }
};

}  // namespace aztec3::circuits::abis
