
#include "thread_pool.hpp"
#include "barretenberg/common/log.hpp"
#include <iostream>
namespace bb {

ThreadPool::ThreadPool(size_t num_threads)
{
    workers.reserve(num_threads);
    for (size_t i = 0; i < num_threads; ++i) {
        workers.emplace_back(&ThreadPool::worker_loop, this, i);
    }
}

ThreadPool::~ThreadPool()
{
    std::cout << "Destroying thread pool\n";
    {
        std::unique_lock<std::mutex> lock(tasks_mutex);
        stop = true;
    }
    condition.notify_all();
    for (auto& worker : workers) {
        worker.join();
    }
}

void ThreadPool::enqueue(const std::function<void()>& task)
{
    std::cout << "Enqueueing task\n";
    {
        std::cout << "acquiring lock\n";
        std::unique_lock<std::mutex> lock(tasks_mutex);
        std::cout << "lock acquired\n";
        tasks.push(task);
        std::cout << "task pushed\n";
    }
    std::cout << "notifying\n";
    condition.notify_one();
    std::cout << "notified\n";
}

void ThreadPool::wait()
{
    std::unique_lock<std::mutex> lock(tasks_mutex);
    finished_condition.wait(lock, [this] { return tasks.empty() && tasks_running == 0; });
}

void ThreadPool::worker_loop(size_t /*unused*/)
{
    // info("created worker ", worker_num);
    while (true) {
        std::function<void()> task;
        {
            std::unique_lock<std::mutex> lock(tasks_mutex);
            std::cout << "worker waiting\n";
            condition.wait(lock, [this] { return !tasks.empty() || stop; });

            if (tasks.empty() && stop) {
                break;
            }

            task = tasks.front();
            std::cout << "task popped\n";
            tasks.pop();
            tasks_running++;
        }
        std::cout << "worker processing task\n";
        // info("worker ", worker_num, " processing a task!");
        task();
        std::cout << "worker finished task\n";
        // info("task done");
        {
            std::unique_lock<std::mutex> lock(tasks_mutex);
            tasks_running--;
            if (tasks.empty() && tasks_running == 0) {
                // info("notifying main thread");
                finished_condition.notify_all();
            }
        }
        // info("worker ", worker_num, " done!");
    }
    // info("worker exit ", worker_num);
}
} // namespace bb
