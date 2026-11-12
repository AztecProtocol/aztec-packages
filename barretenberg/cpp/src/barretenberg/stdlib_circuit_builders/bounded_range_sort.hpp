#pragma once

#include "barretenberg/common/thread.hpp"

#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <vector>

namespace bb::range_sort {
/**
 * Contiguous chunks of [0, size); chunk c is [begin(c), begin(c + 1)). `run` processes them in parallel when there are
 * several. A chunk must write only outputs it owns or positions fixed before the run, so that results do not depend on
 * the number of chunks.
 */
class Chunks {
  public:
    // At most one chunk per CPU, each of at least `min_chunk_size` elements unless there is a single chunk.
    static Chunks of_min_size(size_t size, size_t min_chunk_size)
    {
        return Chunks(size, std::min(size / std::max<size_t>(min_chunk_size, 1), get_num_cpus()));
    }

    // `count` chunks (at least one), some of them empty when `count` exceeds `size`.
    static Chunks with_count(size_t size, size_t count) { return Chunks(size, count); }

    size_t count() const { return count_; }
    size_t begin(size_t chunk) const
    {
        return static_cast<size_t>(static_cast<uint64_t>(size_) * static_cast<uint64_t>(chunk) / count_);
    }

    // Calls body(chunk, begin, end) for every chunk.
    template <typename Body> void run(const Body& body) const
    {
        if (count_ == 1) {
            body(size_t{ 0 }, size_t{ 0 }, size_);
            return;
        }
        parallel_for(count_, [&](size_t chunk) { body(chunk, begin(chunk), begin(chunk + 1)); });
    }

  private:
    Chunks(size_t size, size_t count)
        : size_(size)
        , count_(std::max<size_t>(count, 1))
    {}

    size_t size_;
    size_t count_;
};

/**
 * Sort a large primitive range-value list using its small declared alphabet.
 * Return false without changing values when the general sort should handle it.
 * Counts use size_t: the number of equal values need not fit in uint32_t.
 */
inline bool try_counting_sort(std::vector<uint32_t>& values, uint64_t maximum)
{
    constexpr size_t MAX_ALPHABET = 1U << 16;
    constexpr size_t MIN_VALUES = 256;
    // Each chunk counts into its own alphabet-sized counters; with at least four values per counter, the counters of
    // several chunks take at most half the memory of `values`.
    constexpr size_t MIN_CHUNK_VALUES = 1U << 16;
    constexpr size_t MIN_VALUES_PER_COUNTER = 4;
    if (maximum >= MAX_ALPHABET || values.size() < MIN_VALUES) {
        return false;
    }
    const size_t alphabet = static_cast<size_t>(maximum) + 1;
    if (values.size() < alphabet) {
        return false;
    }
    // Avoid allocating counters for an already sorted valid list.
    if (std::is_sorted(values.begin(), values.end())) {
        return values.back() <= maximum;
    }
    const auto chunks =
        Chunks::of_min_size(values.size(), std::max(MIN_CHUNK_VALUES, MIN_VALUES_PER_COUNTER * alphabet));
    std::vector<size_t> counts(chunks.count() * alphabet, 0);
    std::vector<uint8_t> chunk_out_of_range(chunks.count(), 0);
    chunks.run([&](size_t chunk, size_t begin, size_t end) {
        size_t* chunk_counts = counts.data() + (chunk * alphabet);
        for (size_t i = begin; i < end; ++i) {
            if (values[i] > maximum) {
                chunk_out_of_range[chunk] = 1;
                return;
            }
            ++chunk_counts[values[i]];
        }
    });
    if (std::ranges::any_of(chunk_out_of_range, [](uint8_t out_of_range) { return out_of_range != 0; })) {
        return false; // No output writes have occurred: preserve the original invalid-input path.
    }
    for (size_t chunk = 1; chunk < chunks.count(); ++chunk) {
        const size_t* chunk_counts = counts.data() + (chunk * alphabet);
        for (size_t value = 0; value < alphabet; ++value) {
            counts[value] += chunk_counts[value];
        }
    }
    size_t position = 0;
    for (size_t value = 0; value < alphabet; ++value) {
        std::fill_n(values.data() + position, counts[value], static_cast<uint32_t>(value));
        position += counts[value];
    }
    return true;
}
} // namespace bb::range_sort
