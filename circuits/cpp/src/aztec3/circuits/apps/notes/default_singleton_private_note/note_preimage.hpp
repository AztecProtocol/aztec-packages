#pragma once

#include <common/map.hpp>
#include <common/streams.hpp>

#include <crypto/generators/generator_data.hpp>

#include <stdlib/types/native_types.hpp>
#include <stdlib/types/circuit_types.hpp>
#include <stdlib/types/convert.hpp>

namespace aztec3::circuits::apps::notes {

using crypto::generators::generator_index_t;
using plonk::stdlib::types::CircuitTypes;
using plonk::stdlib::types::NativeTypes;

template <typename NCT, typename V> struct DefaultSingletonPrivateNotePreimage {
    typedef typename NCT::fr fr;
    typedef typename NCT::grumpkin_point grumpkin_point;
    typedef typename NCT::address address;
    typedef typename NCT::boolean boolean;

    // No custom constructors so that designated initializers can be used (for readability of test circuits).

    std::optional<V> value;
    std::optional<address> owner;

    std::optional<fr> salt;
    std::optional<fr> nonce;

    bool operator==(DefaultSingletonPrivateNotePreimage<NCT, V> const&) const = default;

    template <typename Composer> auto to_circuit_type(Composer& composer) const
    {
        static_assert((std::is_same<NativeTypes, NCT>::value));

        // Capture the composer:
        auto to_ct = [&](auto& e) { return plonk::stdlib::types::to_ct(composer, e); };

        // Depending on whether the _circuit_ type version of `V` is from the stdlib, or some custom type, the
        // conversion method will be different.
        const bool has_to_circuit_type = requires(V v) { v.to_circuit_type(); };
        const bool has_to_ct = requires(V v) { to_ct(v); };

        // To avoid messy template arguments in the calling code, we use a lambda function with `auto` return type to
        // avoid explicitly having to state the circuit type for `V`.
        auto circuit_value = [&]() -> auto
        {
            if constexpr (has_to_circuit_type) {
                return value.to_circuit_type();
            } else if (has_to_ct) {
                return to_ct(value);
            } else {
                throw_or_abort("Can't convert Value to circuit type");
            }
        }
        ();

        // When this method is called, this class must be templated over native types. We can avoid templating over the
        // circuit types (for the return values) (in order to make the calling syntax cleaner) with the below `decltype`
        // deduction of the _circuit_ version of template type `V`.
        DefaultSingletonPrivateNotePreimage<CircuitTypes<Composer>, typename decltype(circuit_value)::value_type>
            preimage = {
                circuit_value,
                to_ct(owner),
                to_ct(salt),
                to_ct(nonce),
            };

        return preimage;
    };

    template <typename Composer> auto to_native_type() const
    {

        static_assert(!std::is_same<NativeTypes, NCT>::value);

        auto to_nt = [&](auto& e) { return plonk::stdlib::types::to_nt<Composer>(e); };

        // See `to_circuit_type()` for explanation of this code.
        const bool has_to_native_type = requires(V v) { v.to_native_type(); };
        const bool has_to_nt = requires(V v) { to_nt(v); };

        auto native_value = [&]() -> auto
        {
            if constexpr (has_to_native_type) {
                return value.to_native_type();
            } else if (has_to_nt) {
                return to_nt(value);
            } else {
                throw_or_abort("Can't convert Value to native type");
            }
        }
        ();

        DefaultSingletonPrivateNotePreimage<NativeTypes, typename decltype(native_value)::value_type> preimage = {
            native_value,
            to_nt(owner),
            to_nt(salt),
            to_nt(nonce),
        };

        return preimage;
    };
};

template <typename NCT, typename V> void read(uint8_t const*& it, DefaultSingletonPrivateNotePreimage<NCT, V>& preimage)
{
    using serialize::read;

    read(it, preimage.value);
    read(it, preimage.owner);
    read(it, preimage.salt);
    read(it, preimage.nonce);
};

template <typename NCT, typename V>
void write(std::vector<uint8_t>& buf, DefaultSingletonPrivateNotePreimage<NCT, V> const& preimage)
{
    using serialize::write;

    write(buf, preimage.value);
    write(buf, preimage.owner);
    write(buf, preimage.salt);
    write(buf, preimage.nonce);
};

template <typename NCT, typename V>
std::ostream& operator<<(std::ostream& os, DefaultSingletonPrivateNotePreimage<NCT, V> const& preimage)
{
    return os << "value: " << preimage.value << "\n"
              << "owner: " << preimage.owner << "\n"
              << "salt: " << preimage.salt << "\n"
              << "nonce: " << preimage.nonce << "\n";
}

} // namespace aztec3::circuits::apps::notes