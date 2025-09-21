#include <atomic>
#include <chrono>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <mutex>
#include <thread>
#include <vector>

std::atomic<int> counter{ 0 };
std::mutex print_mutex;

void worker_thread(int thread_id)
{
    for (int i = 0; i < 10; ++i) {
        counter++;

        // Use mutex to safely print
        {
            std::lock_guard<std::mutex> lock(print_mutex);
            std::cout << "Thread " << thread_id << " increment " << i << ", counter = " << counter.load() << std::endl;
        }

        // Small delay to make threading more visible
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }
}

int main()
{
    std::ofstream file("test.txt");
    file << "This is a test file." << std::endl;
    file.close();

    if (std::filesystem::exists("test.txt")) {
        std::cout << "filesystem working, test file exists..." << std::endl;
    }
    std::filesystem::remove("test.txt");

    std::cout << "Starting threading test..." << std::endl;

    const int num_threads = 4;
    std::vector<std::thread> threads;

    // Start worker threads
    for (int i = 0; i < num_threads; ++i) {
        threads.emplace_back(worker_thread, i);
    }

    // Wait for all threads to complete
    for (auto& thread : threads) {
        thread.join();
    }

    std::cout << "All threads completed. Final counter value: " << counter.load() << std::endl;
    std::cout << "Expected value: " << (num_threads * 10) << std::endl;

    if (counter.load() == num_threads * 10) {
        std::cout << "✓ Threading test PASSED!" << std::endl;
        return 0;
    } else {
        std::cout << "✗ Threading test FAILED!" << std::endl;
        return 1;
    }
}
