#pragma once
#include <barretenberg/stdlib/primitives/witness/witness.hpp>
#include <aztec3/utils/types/native_types.hpp>
#include <aztec3/utils/types/circuit_types.hpp>
#include <aztec3/utils/types/convert.hpp>

namespace aztec3::circuits::abis {

using aztec3::utils::types::CircuitTypes;
using aztec3::utils::types::NativeTypes;
using plonk::stdlib::witness_t;

template <typename NCT> struct StateRead {
    typedef typename NCT::fr fr;

    fr storage_slot;
    fr current_value;

    bool operator==(StateRead<NCT> const&) const = default;

    static StateRead<NCT> empty() { return { 0, 0 }; };

    template <typename Composer> StateRead<CircuitTypes<Composer>> to_circuit_type(Composer& composer) const
    {
        static_assert((std::is_same<NativeTypes, NCT>::value));

        // Capture the composer:
        auto to_ct = [&](auto& e) { return aztec3::utils::types::to_ct(composer, e); };

        StateRead<CircuitTypes<Composer>> state_read = {
            to_ct(storage_slot),
            to_ct(current_value),
        };

        return state_read;
    };

    fr hash() const
    {
        std::vector<fr> inputs = {
            storage_slot,
            current_value,
        };

        return NCT::compress(inputs, GeneratorIndex::STATE_READ);
    }
};

template <typename NCT> void read(uint8_t const*& it, StateRead<NCT>& state_read)
{
    using serialize::read;

    read(it, state_read.l1_result_hash);
    read(it, state_read.current_value);
};

template <typename NCT> void write(std::vector<uint8_t>& buf, StateRead<NCT> const& state_read)
{
    using serialize::write;

    write(buf, state_read.storage_slot);
    write(buf, state_read.current_value);
};

template <typename NCT> std::ostream& operator<<(std::ostream& os, StateRead<NCT> const& state_read)
{
    return os << "storage_slot: " << state_read.storage_slot << "\n"
              << "current_value: " << state_read.current_value << "\n";
}

} // namespace aztec3::circuits::abis
