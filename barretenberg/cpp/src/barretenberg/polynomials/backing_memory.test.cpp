#include "barretenberg/polynomials/backing_memory.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/polynomials/polynomial.hpp"

#include <gtest/gtest.h>
#include <vector>

#if !defined(__wasm__) && !defined(_WIN32)

namespace {

using FF = bb::fr;

class FileBackedMemory : public ::testing::Test {
  protected:
    void SetUp() override
    {
        saved_slow_low_memory_ = slow_low_memory;
        saved_storage_budget_ = storage_budget;
        slow_low_memory = true;
    }
    void TearDown() override
    {
        slow_low_memory = saved_slow_low_memory_;
        storage_budget = saved_storage_budget_;
    }

  private:
    bool saved_slow_low_memory_ = false;
    size_t saved_storage_budget_ = 0;
};

// Writes through the mapping must land in the file's page cache, not in private anonymous copies.
TEST_F(FileBackedMemory, WritesAreVisibleThroughTheFile)
{
    constexpr size_t SIZE = 4096;
    auto memory = BackingMemory<FF>::allocate(SIZE);
    ASSERT_NE(memory.file_backed, nullptr);
    for (size_t i = 0; i < SIZE; ++i) {
        memory.raw_data[i] = FF(i + 1);
    }

    std::vector<FF> from_file(SIZE);
    const auto bytes = static_cast<ssize_t>(SIZE * sizeof(FF));
    ASSERT_EQ(pread(memory.file_backed->fd, from_file.data(), SIZE * sizeof(FF), 0), bytes);
    for (size_t i = 0; i < SIZE; ++i) {
        EXPECT_EQ(from_file[i], FF(i + 1)) << "mismatch at index " << i;
    }
}

TEST_F(FileBackedMemory, PolynomialCopiesAreIndependent)
{
    constexpr size_t SIZE = 1024;
    auto poly = bb::Polynomial<FF>::random(SIZE);
    auto copy = poly;
    copy.at(7) = poly[7] + FF(1);
    EXPECT_NE(copy[7], poly[7]);
    for (size_t i = 0; i < SIZE; ++i) {
        if (i != 7) {
            EXPECT_EQ(copy[i], poly[i]);
        }
    }
}

} // namespace

#endif
