#pragma once

#include <cstddef>

// ===== Flavor forward declarations =====
namespace bb {
class UltraFlavor;
class UltraZKFlavor;
class ECCVMFlavor;
class UltraKeccakFlavor;
#ifdef STARKNET_GARAGA_FLAVORS
class UltraStarknetFlavor;
class UltraStarknetZKFlavor;
#endif
class UltraKeccakZKFlavor;
class MegaFlavor;
class MegaZKFlavor;
class MegaAvmFlavor;
class TranslatorFlavor;
class ECCVMRecursiveFlavor;
class TranslatorRecursiveFlavor;
class MultilinearBatchingRecursiveFlavor;

template <typename BuilderType> class UltraRecursiveFlavor_;
template <typename BuilderType> class UltraZKRecursiveFlavor_;
template <typename BuilderType> class MegaRecursiveFlavor_;
template <typename BuilderType> class MegaZKRecursiveFlavor_;
template <typename BuilderType> class MegaAvmRecursiveFlavor_;
namespace avm2 {
class AvmRecursiveFlavor;
}

// ===== Trace metadata & precomputed data =====

/**
 * @brief Dyadic trace size and public inputs metadata; Common between prover and verifier keys
 */
struct MetaData {
    static constexpr size_t NUM_FIELDS = 3;
    size_t dyadic_size = 0; // power-of-2 size of the execution trace
    size_t num_public_inputs = 0;
    size_t pub_inputs_offset = 0;
};
} // namespace bb
