// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

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
class Bn254FrParams;
class Bn254FqParams;
template <class Params> struct alignas(32) field;
class UltraExecutionTraceBlocks;
template <class ExecutionTrace> class UltraCircuitBuilder_;
using UltraCircuitBuilder = UltraCircuitBuilder_<UltraExecutionTraceBlocks>;
template <class FF> class MegaCircuitBuilder_;
using MegaCircuitBuilder = MegaCircuitBuilder_<field<Bn254FrParams>>;

class StandardFlavor;
class UltraFlavor;
class UltraZKFlavor;
class MegaFlavor;
class MegaZKFlavor;
class UltraKeccakFlavor;
class UltraKeccakZKFlavor;
class UltraRollupFlavor;
class ECCVMFlavor;
class TranslatorFlavor;

template <typename BuilderType> class UltraRecursiveFlavor_;
template <typename BuilderType> class UltraZKRecursiveFlavor_;
template <typename BuilderType> class UltraKeccakRecursiveFlavor_;
template <typename BuilderType> class UltraRollupRecursiveFlavor_;
template <typename BuilderType> class MegaRecursiveFlavor_;
template <typename BuilderType> class MegaZKRecursiveFlavor_;
template <typename BuilderType> class ECCVMRecursiveFlavor_;
template <typename BuilderType> class TranslatorRecursiveFlavor_;
template <typename BuilderType> class AvmRecursiveFlavor_;
namespace avm2 {
template <typename BuilderType> class AvmRecursiveFlavor_;
}

#ifdef STARKNET_GARAGA_FLAVORS
class UltraStarknetFlavor;
#endif
} // namespace bb
