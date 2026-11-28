#pragma once

#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/experimental_optimizations.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"

#include <algorithm>
#include <cstddef>
#include <cstdint>
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
 * after another thread has grown the store. A new block copies the generators already held and derives only the new
 * indices, in parallel.
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
            const std::span<const AffineElement> held =
                blocks.empty() ? std::span<const AffineElement>{} : std::span<const AffineElement>(*blocks.back());
            if (bb::rollup_experimental_optimizations_enabled()) {
                blocks.push_back(std::make_unique<const Block>(derive_block(held, block_size)));
            } else {
                blocks.push_back(
                    std::make_unique<const Block>(Group::derive_generators(DOMAIN_SEPARATOR, block_size, 0)));
            }
        }

        return { blocks.back()->data(), num_generators };
    }

  private:
    using Block = std::vector<AffineElement>;

    // Doubling keeps a circuit built from many differently sized MSMs to a handful of derivations.
    static constexpr size_t MIN_BLOCK_SIZE = 32;

    /**
     * @brief The first `block_size` generators, given the first `held.size()` of them.
     */
    static Block derive_block(const std::span<const AffineElement> held, const size_t block_size)
    {
        BB_ASSERT(block_size - 1 <= static_cast<size_t>(UINT32_MAX),
                  "cycle_group_offset_generators: generator index exceeds uint32 range");
        Block block(block_size);
        std::copy(held.begin(), held.end(), block.begin());

        const std::vector<uint8_t> domain_separator_bytes(DOMAIN_SEPARATOR.begin(), DOMAIN_SEPARATOR.end());
        const auto domain_hash = Group::hash_domain_separator(domain_separator_bytes);
        const size_t num_held = held.size();
        // Each index is a pure function written to its own slot, so the block does not depend on scheduling.
        parallel_for(block_size - num_held, [&](size_t i) {
            const size_t index = num_held + i;
            block[index] = Group::derive_generator(domain_hash, static_cast<uint32_t>(index));
        });
        return block;
    }

    mutable std::mutex mutex;
    mutable std::vector<std::unique_ptr<const Block>> blocks;
};

} // namespace bb::stdlib
