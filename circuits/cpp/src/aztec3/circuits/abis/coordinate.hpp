#pragma once
#include "aztec3/constants.hpp"
#include "aztec3/utils/types/circuit_types.hpp"
#include "aztec3/utils/types/convert.hpp"
#include "aztec3/utils/types/native_types.hpp"

#include <barretenberg/barretenberg.hpp>

namespace aztec3::circuits::abis {

using aztec3::GeneratorIndex;
using aztec3::utils::types::CircuitTypes;
using aztec3::utils::types::NativeTypes;

template <typename NCT> struct Coordinate {
    using fr = typename NCT::fr;
    using boolean = typename NCT::boolean;

    std::array<fr, 2> limbs;

    // for serialization, update with new fields
    MSGPACK_FIELDS(limbs);
    bool operator==(Coordinate<NCT> const&) const = default;

    template <typename Composer> Coordinate<CircuitTypes<Composer>> to_circuit_type(Composer& composer) const
    {
        static_assert((std::is_same<NativeTypes, NCT>::value));

        // Capture the composer:
        auto to_ct = [&](auto& e) { return aztec3::utils::types::to_ct(composer, e); };

        Coordinate<CircuitTypes<Composer>> coordinate = {
            to_ct(limbs),
        };

        return coordinate;
    };

    template <typename Composer> Coordinate<NativeTypes> to_native_type() const
    {
        static_assert((std::is_same<CircuitTypes<Composer>, NCT>::value));

        auto to_nt = [&](auto& e) { return aztec3::utils::types::to_nt<Composer>(e); };

        Coordinate<NativeTypes> coordinate = {
            to_nt(limbs),
        };

        return coordinate;
    };

    void set_public()
    {
        static_assert(!(std::is_same<NativeTypes, NCT>::value));

        limbs[0].set_public();
        limbs[1].set_public();
    }

    void assert_is_zero()
    {
        static_assert(!(std::is_same<NativeTypes, NCT>::value));

        limbs[0].assert_is_zero();
        limbs[1].assert_is_zero();
    }
};

template <typename NCT> void read(uint8_t const*& it, Coordinate<NCT>& coordinate)
{
    using serialize::read;

    read(it, coordinate.limbs);
};

template <typename NCT> void write(std::vector<uint8_t>& buf, Coordinate<NCT> const& coordinate)
{
    using serialize::write;

    write(buf, coordinate.limbs);
};

template <typename NCT> std::ostream& operator<<(std::ostream& os, Coordinate<NCT> const& coordinate)
{
    return os << "coordinate: " << coordinate.limbs << "\n";
}

}  // namespace aztec3::circuits::abis