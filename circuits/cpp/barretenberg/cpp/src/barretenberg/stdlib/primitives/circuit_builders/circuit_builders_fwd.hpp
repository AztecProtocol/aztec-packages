/**
 * @brief Defines particular composer and circuit builder types expected to be used for proof or circuit
construction in stdlib and contains macros for explicit instantiation.
 *
 * @details This file is designed to be included in header files to instruct the compiler that these classes exist and
 * their instantiation will eventually take place. Given it has no dependencies, it causes no additional compilation or
 *  propagation.
 */
#pragma once
#include <concepts>

namespace proof_system::honk::flavor {
class Standard;
class Ultra;
} // namespace proof_system::honk::flavor

namespace barretenberg {
class Bn254FrParams;
template <class Params> struct alignas(32) field;
} // namespace barretenberg
namespace proof_system {
class CircuitSimulatorBN254;
template <class FF> class StandardCircuitBuilder_;
using StandardCircuitBuilder = StandardCircuitBuilder_<barretenberg::field<barretenberg::Bn254FrParams>>;
template <class FF> class TurboCircuitBuilder_;
using TurboCircuitBuilder = TurboCircuitBuilder_<barretenberg::field<barretenberg::Bn254FrParams>>;
template <class FF> class UltraCircuitBuilder_;
using UltraCircuitBuilder = UltraCircuitBuilder_<barretenberg::field<barretenberg::Bn254FrParams>>;
} // namespace proof_system

#define EXTERN_STDLIB_SIMULATOR_TYPE(stdlib_type)                                                                      \
    extern template class stdlib_type<proof_system::CircuitSimulatorBN254>;

#define EXTERN_STDLIB_TYPE(stdlib_type)                                                                                \
    extern template class stdlib_type<proof_system::StandardCircuitBuilder>;                                           \
    extern template class stdlib_type<proof_system::TurboCircuitBuilder>;                                              \
    extern template class stdlib_type<proof_system::UltraCircuitBuilder>;

#define EXTERN_STDLIB_SIMULATOR_METHOD(stdlib_method)                                                                  \
    extern template stdlib_method(proof_system::CircuitSimulatorBN254);

#define EXTERN_STDLIB_METHOD(stdlib_method)                                                                            \
    extern template stdlib_method(proof_system::StandardCircuitBuilder);                                               \
    extern template stdlib_method(proof_system::TurboCircuitBuilder);                                                  \
    extern template stdlib_method(proof_system::UltraCircuitBuilder);

#define EXTERN_STDLIB_TYPE_VA(stdlib_type, ...)                                                                        \
    extern template class stdlib_type<proof_system::StandardCircuitBuilder, __VA_ARGS__>;                              \
    extern template class stdlib_type<proof_system::TurboCircuitBuilder, __VA_ARGS__>;                                 \
    extern template class stdlib_type<proof_system::UltraCircuitBuilder, __VA_ARGS__>;

#define EXTERN_STDLIB_BASIC_TYPE(stdlib_type)                                                                          \
    extern template class stdlib_type<proof_system::StandardCircuitBuilder>;                                           \
    extern template class stdlib_type<proof_system::TurboCircuitBuilder>;

#define EXTERN_STDLIB_SIMULATOR_TYPE_VA(stdlib_type, ...)                                                              \
    extern template class stdlib_type<proof_system::CircuitSimulatorBN254, __VA_ARGS__>;

#define EXTERN_STDLIB_BASIC_TYPE_VA(stdlib_type, ...)                                                                  \
    extern template class stdlib_type<proof_system::StandardCircuitBuilder, __VA_ARGS__>;                              \
    extern template class stdlib_type<proof_system::TurboCircuitBuilder, __VA_ARGS__>;

#define EXTERN_STDLIB_ULTRA_TYPE(stdlib_type) extern template class stdlib_type<proof_system::UltraCircuitBuilder>;

#define EXTERN_STDLIB_ULTRA_TYPE_VA(stdlib_type, ...)                                                                  \
    extern template class stdlib_type<proof_system::UltraCircuitBuilder, __VA_ARGS__>;

#define EXTERN_STDLIB_ULTRA_METHOD(stdlib_method) extern template stdlib_method(proof_system::UltraCircuitBuilder);
