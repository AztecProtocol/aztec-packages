/**
 * @brief Contains all the headers required to adequately compile the types defined in circuit_builders_fwd.hpp and
 * instantiate templates.
 */
#pragma once
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

// A property of the arithmetization, not an enumeration of builder types: there is one builder type per
// arithmetization (see mega_circuit_builder.hpp), and every Mega one selects the goblin-style stdlib
// primitives that the ecc op queue and databus make available.
template <typename T>
concept IsCircuitBuilder = requires { typename T::ExecutionTrace; };
template <typename T>
concept IsUltraBuilder = IsCircuitBuilder<T> && !T::ExecutionTrace::IS_MEGA_ARITHMETIZATION;
template <typename T>
concept IsMegaBuilder = IsCircuitBuilder<T> && T::ExecutionTrace::IS_MEGA_ARITHMETIZATION;
