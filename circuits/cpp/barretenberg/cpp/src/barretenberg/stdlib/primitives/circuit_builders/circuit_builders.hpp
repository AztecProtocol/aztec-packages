/**
 * @brief Contains all the headers required to adequately compile the types defined in composers_fwd.hpp and instantiate
 * templates.
 */
#pragma once
#include "barretenberg/proof_system/circuit_builder/circuit_simulator.hpp"
#include "barretenberg/proof_system/circuit_builder/standard_circuit_builder.hpp"
#include "barretenberg/proof_system/circuit_builder/turbo_circuit_builder.hpp"
#include "barretenberg/proof_system/circuit_builder/ultra_circuit_builder.hpp"

template <typename T>
concept HasPlookup =
    proof_system::IsAnyOf<T, proof_system::UltraCircuitBuilder /* , proof_system::CircuitSimulatorBN254 */>;

#define INSTANTIATE_STDLIB_SIMULATOR_METHOD(stdlib_method) template stdlib_method(proof_system::CircuitSimulatorBN254);
#define INSTANTIATE_STDLIB_METHOD(stdlib_method)                                                                       \
    template stdlib_method(proof_system::StandardCircuitBuilder);                                                      \
    template stdlib_method(proof_system::TurboCircuitBuilder);                                                         \
    template stdlib_method(proof_system::UltraCircuitBuilder);

#define INSTANTIATE_STDLIB_SIMULATOR_TYPE(stdlib_type) template class stdlib_type<proof_system::CircuitSimulatorBN254>;

#define INSTANTIATE_STDLIB_TYPE(stdlib_type)                                                                           \
    template class stdlib_type<proof_system::StandardCircuitBuilder>;                                                  \
    template class stdlib_type<proof_system::TurboCircuitBuilder>;                                                     \
    template class stdlib_type<proof_system::UltraCircuitBuilder>;

#define INSTANTIATE_STDLIB_TYPE_VA(stdlib_type, ...)                                                                   \
    template class stdlib_type<proof_system::StandardCircuitBuilder, __VA_ARGS__>;                                     \
    template class stdlib_type<proof_system::TurboCircuitBuilder, __VA_ARGS__>;                                        \
    template class stdlib_type<proof_system::UltraCircuitBuilder, __VA_ARGS__>;

#define INSTANTIATE_STDLIB_BASIC_TYPE(stdlib_type)                                                                     \
    template class stdlib_type<proof_system::StandardCircuitBuilder>;                                                  \
    template class stdlib_type<proof_system::TurboCircuitBuilder>;

#define INSTANTIATE_STDLIB_SIMULATOR_TYPE_VA(stdlib_type, ...)                                                         \
    template class stdlib_type<proof_system::CircuitSimulatorBN254, __VA_ARGS__>;

#define INSTANTIATE_STDLIB_BASIC_TYPE_VA(stdlib_type, ...)                                                             \
    template class stdlib_type<proof_system::StandardCircuitBuilder, __VA_ARGS__>;                                     \
    template class stdlib_type<proof_system::TurboCircuitBuilder, __VA_ARGS__>;

#define INSTANTIATE_STDLIB_ULTRA_METHOD(stdlib_method) template stdlib_method(proof_system::UltraCircuitBuilder);

#define INSTANTIATE_STDLIB_ULTRA_TYPE(stdlib_type) template class stdlib_type<proof_system::UltraCircuitBuilder>;

#define INSTANTIATE_STDLIB_ULTRA_TYPE_VA(stdlib_type, ...)                                                             \
    template class stdlib_type<proof_system::UltraCircuitBuilder, __VA_ARGS__>;
