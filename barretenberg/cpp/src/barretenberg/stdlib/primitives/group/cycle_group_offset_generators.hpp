#pragma once

#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"

#include <cstddef>
#include <memory>
#include <mutex>
#include <span>
#include <string_view>
#include <vector>

namespace bb::stdlib {

/**
 * @brief The offset generators cycle_group adds into its MSM accumulators to avoid incomplete-addition edge cases.
 *
 * Generator `i` depends only on the domain separator and `i`, so every request returns the same prefix. Derivation
 * costs ~65us per generator, so blocks are memoized; they are append-only and retained, which keeps a span valid
 * after another thread has grown the store.
 */
template <typename Curve> class cycle_group_offset_generators {
  public:
    using AffineElement = typename Curve::AffineElement;
    using Group = typename Curve::Group;

    static constexpr std::string_view DOMAIN_SEPARATOR = "cycle_group_offset_generator";

    /**
     * @brief The process-wide store, shared so generators are derived at most once.
     */
    static const cycle_group_offset_generators& default_generators()
    {
        static const cycle_group_offset_generators instance;
        return instance;
    }

    /**
     * @brief Return the first `num_generators` offset generators.
     */
    [[nodiscard]] std::span<const AffineElement> get(const size_t num_generators) const
    {
        const std::lock_guard<std::mutex> lock(mutex);

        if (blocks.empty() || blocks.back()->size() < num_generators) {
            size_t block_size = blocks.empty() ? MIN_BLOCK_SIZE : blocks.back()->size();
            while (block_size < num_generators) {
                block_size *= 2;
            }
            blocks.push_back(std::make_unique<const Block>(Group::derive_generators(DOMAIN_SEPARATOR, block_size, 0)));
        }

        return { blocks.back()->data(), num_generators };
    }

  private:
    using Block = std::vector<AffineElement>;

    // Doubling keeps a circuit built from many differently sized MSMs to a handful of derivations.
    static constexpr size_t MIN_BLOCK_SIZE = 32;

    mutable std::mutex mutex;
    mutable std::vector<std::unique_ptr<const Block>> blocks;
};

} // namespace bb::stdlib
