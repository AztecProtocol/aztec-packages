// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

/**
 * @brief Contains all the headers required to adequately compile the types defined in circuit_builders_fwd.hpp and
 * instantiate templates.
 */
#pragma once
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

template <typename T>
concept HasPlookup = bb::IsAnyOf<T, bb::UltraCircuitBuilder, bb::MegaCircuitBuilder>;

template <typename T>
concept IsUltraBuilder = bb::IsAnyOf<T, bb::UltraCircuitBuilder>;
template <typename T>
concept IsMegaBuilder = bb::IsAnyOf<T, bb::MegaCircuitBuilder>;
template <typename T>
concept IsNotMegaBuilder = !IsMegaBuilder<T>;
