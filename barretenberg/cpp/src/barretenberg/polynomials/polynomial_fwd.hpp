#pragma once

namespace bb {

// Forward declarations
template <typename Fr> class MemoryPolynomial;
template <typename Fr> class FileBackedPolynomial;

// Conditional alias
#ifdef BB_SLOW_LOW_MEMORY
template <typename Fr>
using Polynomial = FileBackedPolynomial<Fr>;
#else
template <typename Fr>
using Polynomial = MemoryPolynomial<Fr>;
#endif

} // namespace bb