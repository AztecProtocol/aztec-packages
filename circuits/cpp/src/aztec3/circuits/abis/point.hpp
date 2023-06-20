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

template <typename NCT> struct Point {
    using fr = typename NCT::fr;
    using boolean = typename NCT::boolean;

    std::array<fr, 2> x;
    std::array<fr, 2> y;

    // for serialization, update with new fields
    MSGPACK_FIELDS(x, y);
    bool operator==(Point<NCT> const&) const = default;

    template <typename Composer> Point<CircuitTypes<Composer>> to_circuit_type(Composer& composer) const
    {
        static_assert((std::is_same<NativeTypes, NCT>::value));

        // Capture the composer:
        auto to_ct = [&](auto& e) { return aztec3::utils::types::to_ct(composer, e); };

        Point<CircuitTypes<Composer>> point = {
            to_ct(x),
            to_ct(y),
        };

        return point;
    };

    template <typename Composer> Point<NativeTypes> to_native_type() const
    {
        static_assert((std::is_same<CircuitTypes<Composer>, NCT>::value));

        auto to_nt = [&](auto& e) { return aztec3::utils::types::to_nt<Composer>(e); };

        Point<NativeTypes> point = {
            to_nt(x),
            to_nt(y),
        };

        return point;
    };

    void set_public()
    {
        static_assert(!(std::is_same<NativeTypes, NCT>::value));

        x[0].set_public();
        x[1].set_public();
        y[0].set_public();
        y[1].set_public();
    }

    void assert_is_zero()
    {
        static_assert(!(std::is_same<NativeTypes, NCT>::value));

        x[0].assert_is_zero();
        x[1].assert_is_zero();
        y[0].assert_is_zero();
        y[1].assert_is_zero();
    }
};

template <typename NCT> void read(uint8_t const*& it, Point<NCT>& point)
{
    using serialize::read;

    read(it, point.x);
    read(it, point.y);
};

template <typename NCT> void write(std::vector<uint8_t>& buf, Point<NCT> const& point)
{
    using serialize::write;

    write(buf, point.x);
    write(buf, point.y);
};

template <typename NCT> std::ostream& operator<<(std::ostream& os, Point<NCT> const& point)
{
    return os << "x: " << point.x << "\n"
              << "y: " << point.y << "\n";
}

}  // namespace aztec3::circuits::abis