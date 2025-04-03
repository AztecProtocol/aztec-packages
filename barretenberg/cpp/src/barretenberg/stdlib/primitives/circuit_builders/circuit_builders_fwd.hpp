/**
 * @brief Defines particular circuit builder types expected to be used for circuit
construction in stdlib and contains macros for explicit instantiation.
 *
 * @details This file is designed to be included in header files to instruct the compiler that these classes exist and
 * their instantiation will eventually take place. Given it has no dependencies, it causes no additional compilation or
 *  propagation.
 */
#pragma once
#include <concepts>

namespace bb {
class StandardFlavor;
class UltraFlavor;
class UltraKeccakFlavor;
class UltraStarknetFlavor;

class Bn254FrParams;
class Bn254FqParams;
template <class Params> struct alignas(32) field;
class UltraExecutionTraceBlocks;
template <class FF> class StandardCircuitBuilder_;
using StandardCircuitBuilder = StandardCircuitBuilder_<field<Bn254FrParams>>;
using StandardGrumpkinCircuitBuilder = StandardCircuitBuilder_<field<Bn254FqParams>>;
template <class ExecutionTrace> class UltraCircuitBuilder_;
using UltraCircuitBuilder = UltraCircuitBuilder_<UltraExecutionTraceBlocks>;
template <class FF> class MegaCircuitBuilder_;
using MegaCircuitBuilder = MegaCircuitBuilder_<field<Bn254FrParams>>;
class CircuitSimulatorBN254;
} // namespace bb
