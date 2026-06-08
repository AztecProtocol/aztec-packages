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
class MegaAvmFlavor;
class UltraKeccakFlavor;
class UltraKeccakZKFlavor;
class ECCVMFlavor;
class TranslatorFlavor;
class TranslatorRecursiveFlavor;
class ECCVMRecursiveFlavor;

// Forward declare SumcheckTestFlavor template and Grumpkin ZK variant
namespace curve {
class Grumpkin;
}
template <typename CurveType, bool HasZK_, bool UseShortMonomials_> class SumcheckTestFlavor_;
using SumcheckTestFlavorGrumpkinZK = SumcheckTestFlavor_<curve::Grumpkin, true, true>;

template <typename BuilderType> class UltraRecursiveFlavor_;
template <typename BuilderType> class UltraZKRecursiveFlavor_;
template <typename BuilderType> class UltraKeccakRecursiveFlavor_;
template <typename BuilderType> class MegaRecursiveFlavor_;
template <typename BuilderType> class MegaZKRecursiveFlavor_;
template <typename BuilderType> class MegaAvmRecursiveFlavor_;
class MegaAppRecursiveFlavor;
class MegaKernelRecursiveFlavor;

namespace avm2 {
class AvmRecursiveFlavor;
}

#ifdef STARKNET_GARAGA_FLAVORS
class UltraStarknetFlavor;
#endif
} // namespace bb
