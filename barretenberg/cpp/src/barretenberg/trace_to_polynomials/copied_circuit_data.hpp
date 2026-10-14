#pragma once

namespace bb {

/**
 * @brief Whether building a prover instance may free circuit data as soon as it has been copied into the polynomials:
 * each trace block's gate data (wires and selectors) and the lookup tables with their gate records. With RELEASE the
 * builder keeps only the blocks' sizes and offsets, so it cannot be checked or turned into another instance afterwards.
 */
enum class CopiedCircuitData { KEEP, RELEASE };

} // namespace bb
