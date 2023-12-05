#include "barretenberg/numeric/uint256/uint256.hpp"
#include <iostream>
#include <mutex>
#include <thread>
#include <vector>

// Function for heavy math computation
static numeric::uint256_t heavyMathOperation(size_t n)
{
    numeric::uint256_t result = 1;
    for (size_t i = 1; i <= n; ++i) {
        result *= i;
        // Additional computation layer
        for (size_t j = 0; j <= n; ++j) {
            result += j;
        }
    }
    return result;
}

static std::mutex mutex;

// Thread function
static void threadFunction(int threadId, size_t n)
{
    // Start timing
    auto start = std::chrono::high_resolution_clock::now();

    auto result = heavyMathOperation(n);

    // End timing
    auto end = std::chrono::high_resolution_clock::now();
    // Calculate elapsed time
    auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);

    mutex.lock();
    std::cout << "Thread " << threadId << " result: " << result << std::endl;
    std::cout << "Elapsed time: " << duration.count() << " ms" << std::endl;
    mutex.unlock();
}

int main()
{
    // Start timing
    auto start = std::chrono::high_resolution_clock::now();
    const int numThreads = 128;

    // Creating threads
    std::vector<std::thread> threads;
    threads.reserve(numThreads);
    for (int i = 0; i < numThreads; ++i) {
        threads.emplace_back(threadFunction, i, 100000 + i);
    }

    // Joining threads
    for (auto& th : threads) {
        th.join();
    }
    // End timing
    auto end = std::chrono::high_resolution_clock::now();
    // Calculate elapsed time
    auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);

    mutex.lock();
    std::cout << "Total time: " << duration.count() << " ms" << std::endl;
    mutex.unlock();

    return 0;
}
