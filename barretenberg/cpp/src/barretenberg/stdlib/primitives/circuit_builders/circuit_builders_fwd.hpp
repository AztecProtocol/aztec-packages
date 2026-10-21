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
#include <cstddef>

namespace bb {
class Bn254FrParams;
class Bn254FqParams;
template <class Params> struct alignas(32) field;
// The two arithmetization families' trace wrappers and builders. The concrete trace and builder types
// over them -- one per arithmetization -- are emitted alongside the flavors that define them, so this
// header carries no hand-maintained copy of the set.
template <class BlockData> class UltraExecutionTraceBlocks_;
template <class BlockData> class MegaExecutionTraceBlocks_;
template <class ExecutionTrace> class UltraCircuitBuilder_;
template <class FF, class ExecutionTrace> class MegaCircuitBuilder_;
} // namespace bb

#include "barretenberg/stdlib/primitives/circuit_builders/generated/circuit_builders_fwd_generated.hpp"

namespace bb {

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
template <typename BuilderType> class MegaAppRecursiveFlavor_;
template <typename BuilderType> class MegaKernelRecursiveFlavor_;
using MegaAppRecursiveFlavor = MegaAppRecursiveFlavor_<MegaKernelCircuitBuilder>;
using HidingMegaAppRecursiveFlavor = MegaAppRecursiveFlavor_<MegaHidingKernelCircuitBuilder>;
using MegaKernelRecursiveFlavor = MegaKernelRecursiveFlavor_<MegaKernelCircuitBuilder>;
using HidingMegaKernelRecursiveFlavor = MegaKernelRecursiveFlavor_<MegaHidingKernelCircuitBuilder>;

template <size_t NumClaims> class MultilinearBatchingFlavor_;
template <size_t NumClaims, class Builder> class MultilinearBatchingRecursiveFlavor_;

namespace avm2 {
class AvmRecursiveFlavor;
}

#ifdef STARKNET_GARAGA_FLAVORS
class UltraStarknetFlavor;
#endif
} // namespace bb
