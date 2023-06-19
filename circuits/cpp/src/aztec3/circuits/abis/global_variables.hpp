#pragma once
#include "function_data.hpp"
#include "tx_context.hpp"

#include "aztec3/utils/array.hpp"
#include "aztec3/utils/types/circuit_types.hpp"
#include "aztec3/utils/types/convert.hpp"
#include "aztec3/utils/types/native_types.hpp"

#include <barretenberg/barretenberg.hpp>

namespace aztec3::circuits::abis {

using aztec3::utils::types::CircuitTypes;
using aztec3::utils::types::NativeTypes;

template <typename NCT> struct GlobalVariables {
    using address = typename NCT::address;
    using fr = typename NCT::fr;
    using boolean = typename NCT::boolean;

    fr chain_id = 0;
    fr version = 0;

    boolean operator==(GlobalVariables<NCT> const& other) const
    {
        return chain_id == other.chain_id && version == other.version;
    };

    template <typename Composer> GlobalVariables<CircuitTypes<Composer>> to_circuit_type(Composer& composer) const
    {
        static_assert((std::is_same<NativeTypes, NCT>::value));

        // Capture the composer:
        auto to_ct = [&](auto& e) { return aztec3::utils::types::to_ct(composer, e); };
        auto to_circuit_type = [&](auto& e) { return e.to_circuit_type(composer); };

        GlobalVariables<CircuitTypes<Composer>> globals = {
            to_ct(chain_id),
            to_ct(version),
        };

        return globals;
    };

    fr hash() const
    {
        std::vector<fr> inputs;
        inputs.push_back(chain_id);
        inputs.push_back(version);

        return NCT::compress(inputs, GeneratorIndex::GLOBAL_VARIABLES);
    }
};

template <typename NCT> void read(uint8_t const*& it, GlobalVariables<NCT>& globals)
{
    using serialize::read;

    read(it, globals.chain_id);
    read(it, globals.version);
};

template <typename NCT> void write(std::vector<uint8_t>& buf, GlobalVariables<NCT> const& globals)
{
    using serialize::write;

    write(buf, globals.chain_id);
    write(buf, globals.version);
};

template <typename NCT> std::ostream& operator<<(std::ostream& os, GlobalVariables<NCT> const& globals)
{
    return os << "chain_id: " << globals.chain_id << "\n"
              << "version: " << globals.version << "\n";
}

}  // namespace aztec3::circuits::abis