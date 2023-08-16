#pragma once

namespace aztec3 {

// Utility to avoid lots of confusing 'typename' when using a nested fr name in a template
template <typename T> using Uint32Of = typename T::uint32;
template <typename T> using FrOf = typename T::fr;
template <typename T> using AddressOf = typename T::address;
template <typename T> using BoolOf = typename T::boolean;

}  // namespace aztec3