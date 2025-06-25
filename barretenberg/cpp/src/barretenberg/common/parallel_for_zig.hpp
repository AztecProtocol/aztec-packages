#pragma once
#include <atomic>
#include <condition_variable>
#include <functional>
#include <memory>
#include <mutex>
#include <thread>
#include <vector>
#include <variant>
#include <optional>
#include <cstring>
#include <cstdint>
#include "barretenberg/env/hardware_concurrency.hpp"

namespace bb {

/**
 * @brief Zig-inspired thread pool implementation
 * 
 * Based on best-in-class Zig implementation with:
 * - Lock-free task queue using atomic operations
 * - Work-stealing for load balancing
 * - Efficient idle thread management
 * - Minimal contention design
 */
class ZigThreadPool {
public:
    struct Task {
        std::function<void(size_t)> callback;
        size_t index;
        Task* next = nullptr;
    };

    struct Batch {
        size_t len = 0;
        Task* head = nullptr;
        Task* tail = nullptr;

        static Batch from(Task* task) {
            return {1, task, task};
        }

        void push(const Batch& batch) {
            if (batch.len == 0) return;
            if (len == 0) {
                *this = batch;
            } else {
                tail->next = batch.head;
                tail = batch.tail;
                len += batch.len;
            }
        }
    };

private:
    // Node queue - lock-free multi-producer multi-consumer queue
    struct alignas(64) NodeQueue {
        std::atomic<uintptr_t> stack{0};
        Task* cache = nullptr;

        static constexpr uintptr_t HAS_CACHE = 0b01;
        static constexpr uintptr_t IS_CONSUMING = 0b10;
        static constexpr uintptr_t PTR_MASK = ~(HAS_CACHE | IS_CONSUMING);

        void push(Task* head, Task* tail) {
            uintptr_t old_stack = stack.load(std::memory_order_relaxed);
            while (true) {
                tail->next = reinterpret_cast<Task*>(old_stack & PTR_MASK);
                
                uintptr_t new_stack = reinterpret_cast<uintptr_t>(head);
                new_stack |= (old_stack & ~PTR_MASK);
                
                if (stack.compare_exchange_weak(old_stack, new_stack,
                                               std::memory_order_release,
                                               std::memory_order_relaxed)) {
                    break;
                }
            }
        }

        enum class AcquireError { Empty, Contended };
        
        std::variant<Task*, AcquireError> tryAcquireConsumer() {
            uintptr_t old_stack = stack.load(std::memory_order_relaxed);
            while (true) {
                if (old_stack & IS_CONSUMING) {
                    return AcquireError::Contended;
                }
                if ((old_stack & (HAS_CACHE | PTR_MASK)) == 0) {
                    return AcquireError::Empty;
                }
                
                uintptr_t new_stack = old_stack | HAS_CACHE | IS_CONSUMING;
                if ((old_stack & HAS_CACHE) == 0) {
                    new_stack &= ~PTR_MASK;
                }
                
                if (stack.compare_exchange_weak(old_stack, new_stack,
                                               std::memory_order_acquire,
                                               std::memory_order_relaxed)) {
                    return cache ? cache : reinterpret_cast<Task*>(old_stack & PTR_MASK);
                }
            }
        }

        void releaseConsumer(Task* consumer) {
            uintptr_t remove = IS_CONSUMING;
            if (!consumer) {
                remove |= HAS_CACHE;
            }
            
            cache = consumer;
            stack.fetch_sub(remove, std::memory_order_release);
        }

        Task* pop(Task** consumer_ref) {
            if (*consumer_ref) {
                Task* node = *consumer_ref;
                *consumer_ref = node->next;
                return node;
            }
            
            uintptr_t old_stack = stack.load(std::memory_order_relaxed);
            if ((old_stack & PTR_MASK) == 0) {
                return nullptr;
            }
            
            old_stack = stack.exchange(HAS_CACHE | IS_CONSUMING, std::memory_order_acquire);
            Task* node = reinterpret_cast<Task*>(old_stack & PTR_MASK);
            *consumer_ref = node->next;
            return node;
        }
    };

    // Buffer - bounded single-producer multi-consumer ring buffer
    struct alignas(64) Buffer {
        static constexpr size_t capacity = 256;
        std::atomic<uint32_t> head{0};
        std::atomic<uint32_t> tail{0};
        std::atomic<Task*> array[capacity];

        void push(Task** list_head, size_t& pushed_count) {
            uint32_t h = head.load(std::memory_order_relaxed);
            uint32_t t = tail.load(std::memory_order_relaxed);
            
            pushed_count = 0;
            while (true) {
                uint32_t size = t - h;
                if (size >= capacity) break;
                
                Task* node = *list_head;
                while (size < capacity && node) {
                    array[t % capacity].store(node, std::memory_order_relaxed);
                    t++;
                    size++;
                    pushed_count++;
                    node = node->next;
                }
                
                tail.store(t, std::memory_order_release);
                *list_head = node;
                if (!node) break;
                
                h = head.load(std::memory_order_relaxed);
            }
        }

        Task* pop() {
            uint32_t h = head.load(std::memory_order_relaxed);
            uint32_t t = tail.load(std::memory_order_relaxed);
            
            while (true) {
                uint32_t size = t - h;
                if (size == 0) return nullptr;
                
                if (head.compare_exchange_weak(h, h + 1,
                                              std::memory_order_acquire,
                                              std::memory_order_relaxed)) {
                    return array[h % capacity].load(std::memory_order_relaxed);
                }
            }
        }

        struct Stole {
            Task* task;
            bool pushed;
        };

        std::optional<Stole> consume(NodeQueue* queue) {
            auto consumer_result = queue->tryAcquireConsumer();
            if (std::holds_alternative<NodeQueue::AcquireError>(consumer_result)) {
                return std::nullopt;
            }
            
            Task* consumer = std::get<Task*>(consumer_result);
            struct ConsumerGuard {
                NodeQueue* q;
                Task* c;
                ~ConsumerGuard() { q->releaseConsumer(c); }
            };
            ConsumerGuard guard{queue, consumer};
            
            // Push tasks from queue to buffer
            uint32_t t = tail.load(std::memory_order_relaxed);
            uint32_t pushed = 0;
            while (pushed < capacity) {
                Task* node = queue->pop(&consumer);
                if (!node) break;
                array[(t + pushed) % capacity].store(node, std::memory_order_relaxed);
                pushed++;
            }
            
            // Get one extra task to return
            Task* task = queue->pop(&consumer);
            if (!task && pushed > 0) {
                pushed--;
                task = array[(t + pushed) % capacity].load(std::memory_order_relaxed);
            }
            
            if (pushed > 0) {
                tail.store(t + pushed, std::memory_order_release);
            }
            
            return task ? std::optional<Stole>{{task, pushed > 0}} : std::nullopt;
        }

        std::optional<Stole> steal(Buffer* target) {
            [[maybe_unused]] uint32_t h = head.load(std::memory_order_relaxed);
            uint32_t t = tail.load(std::memory_order_relaxed);
            
            while (true) {
                uint32_t target_h = target->head.load(std::memory_order_acquire);
                uint32_t target_t = target->tail.load(std::memory_order_acquire);
                
                uint32_t target_size = target_t - target_h;
                if (target_size > capacity || target_size == 0) {
                    return std::nullopt;
                }
                
                // Steal half
                uint32_t steal_size = target_size - (target_size / 2);
                
                // Copy tasks
                for (uint32_t i = 0; i < steal_size; i++) {
                    Task* node = target->array[(target_h + i) % capacity].load(std::memory_order_relaxed);
                    array[(t + i) % capacity].store(node, std::memory_order_relaxed);
                }
                
                if (target->head.compare_exchange_weak(target_h, target_h + steal_size,
                                                      std::memory_order_acq_rel,
                                                      std::memory_order_relaxed)) {
                    uint32_t pushed = steal_size - 1;
                    Task* task = array[(t + pushed) % capacity].load(std::memory_order_relaxed);
                    
                    if (pushed > 0) {
                        tail.store(t + pushed, std::memory_order_release);
                    }
                    
                    return Stole{task, pushed > 0};
                }
            }
        }
    };

    // Thread structure
    struct alignas(64) Thread {
        Thread* next = nullptr;
        Thread* target = nullptr;
        std::condition_variable join_event;
        std::mutex join_mutex;
        NodeQueue run_queue;
        Buffer run_buffer;
        
        static thread_local Thread* current;
    };

    // Sync state
    struct Sync {
        uint32_t idle : 14;
        uint32_t spawned : 14;
        uint32_t unused : 1;
        uint32_t notified : 1;
        uint32_t state : 2;
        
        enum State : uint32_t {
            PENDING = 0,
            SIGNALED = 1,
            WAKING = 2,
            SHUTDOWN = 3
        };
    };

    // Member variables
    [[maybe_unused]] uint32_t stack_size;
    uint32_t max_threads;
    std::atomic<uint32_t> sync{0};
    std::condition_variable idle_event;
    std::mutex idle_mutex;
    std::condition_variable join_event;
    std::mutex join_mutex;
    NodeQueue run_queue;
    std::atomic<Thread*> threads{nullptr};

public:
    explicit ZigThreadPool(size_t num_threads = 0) 
        : stack_size(8 * 1024 * 1024)  // 8MB default stack
        , max_threads(static_cast<uint32_t>(num_threads ? num_threads : env_hardware_concurrency())) {
    }

    ~ZigThreadPool() {
        shutdown();
        join();
    }

    void schedule(Batch batch) {
        if (batch.len == 0) return;
        
        // Push to appropriate queue
        if (Thread::current) {
            Task* head = batch.head;
            size_t pushed;
            Thread::current->run_buffer.push(&head, pushed);
            if (head) {
                // Overflow to queue
                Task* tail = head;
                while (tail->next) tail = tail->next;
                Thread::current->run_queue.push(head, tail);
            }
        } else {
            run_queue.push(batch.head, batch.tail);
        }
        
        notify(false);
    }

    void shutdown() {
        Sync old_sync, new_sync;
        uint32_t sync_val = sync.load(std::memory_order_relaxed);
        do {
            std::memcpy(&old_sync, &sync_val, sizeof(uint32_t));
            if (old_sync.state == Sync::SHUTDOWN) return;
            
            new_sync = old_sync;
            new_sync.notified = 1;
            new_sync.state = Sync::SHUTDOWN;
            new_sync.idle = 0;
            
            uint32_t new_val;
            std::memcpy(&new_val, &new_sync, sizeof(uint32_t));
            if (sync.compare_exchange_weak(sync_val, new_val,
                                          std::memory_order_acq_rel,
                                          std::memory_order_relaxed)) {
                if (old_sync.idle > 0) {
                    std::unique_lock<std::mutex> lock(idle_mutex);
                    idle_event.notify_all();
                }
                return;
            }
        } while (true);
    }

private:
    void notify(bool is_waking) {
        if (!is_waking) {
            uint32_t sync_val = sync.load(std::memory_order_relaxed);
            Sync s;
            std::memcpy(&s, &sync_val, sizeof(uint32_t));
            if (s.notified) return;
        }
        
        notifySlow(is_waking);
    }

    void notifySlow(bool is_waking) {
        Sync old_sync, new_sync;
        uint32_t sync_val = sync.load(std::memory_order_relaxed);
        
        while (true) {
            std::memcpy(&old_sync, &sync_val, sizeof(uint32_t));
            if (old_sync.state == Sync::SHUTDOWN) return;
            
            bool can_wake = is_waking || (old_sync.state == Sync::PENDING);
            
            new_sync = old_sync;
            new_sync.notified = 1;
            
            if (can_wake && old_sync.idle > 0) {
                new_sync.state = Sync::SIGNALED;
            } else if (can_wake && old_sync.spawned < max_threads) {
                new_sync.state = Sync::SIGNALED;
                new_sync.spawned++;
            } else if (is_waking) {
                new_sync.state = Sync::PENDING;
            } else if (old_sync.notified) {
                return;
            }
            
            uint32_t new_val;
            std::memcpy(&new_val, &new_sync, sizeof(uint32_t));
            
            if (sync.compare_exchange_weak(sync_val, new_val,
                                          std::memory_order_release,
                                          std::memory_order_relaxed)) {
                if (can_wake && old_sync.idle > 0) {
                    std::unique_lock<std::mutex> lock(idle_mutex);
                    idle_event.notify_one();
                } else if (can_wake && old_sync.spawned < max_threads) {
                    std::thread([this]() { threadRun(); }).detach();
                }
                return;
            }
        }
    }

    bool wait(bool is_waking) {
        bool is_idle = false;
        Sync old_sync, new_sync;
        uint32_t sync_val = sync.load(std::memory_order_relaxed);
        
        while (true) {
            std::memcpy(&old_sync, &sync_val, sizeof(uint32_t));
            if (old_sync.state == Sync::SHUTDOWN) {
                throw std::runtime_error("Thread pool shutdown");
            }
            
            if (old_sync.notified) {
                new_sync = old_sync;
                new_sync.notified = 0;
                if (is_idle) new_sync.idle--;
                if (old_sync.state == Sync::SIGNALED) {
                    new_sync.state = Sync::WAKING;
                }
                
                uint32_t new_val;
                std::memcpy(&new_val, &new_sync, sizeof(uint32_t));
                
                if (sync.compare_exchange_weak(sync_val, new_val,
                                              std::memory_order_acquire,
                                              std::memory_order_relaxed)) {
                    return is_waking || (old_sync.state == Sync::SIGNALED);
                }
            } else if (!is_idle) {
                new_sync = old_sync;
                new_sync.idle++;
                if (is_waking) new_sync.state = Sync::PENDING;
                
                uint32_t new_val;
                std::memcpy(&new_val, &new_sync, sizeof(uint32_t));
                
                if (sync.compare_exchange_weak(sync_val, new_val,
                                              std::memory_order_relaxed,
                                              std::memory_order_relaxed)) {
                    is_waking = false;
                    is_idle = true;
                }
            } else {
                std::unique_lock<std::mutex> lock(idle_mutex);
                idle_event.wait(lock);
                sync_val = sync.load(std::memory_order_relaxed);
            }
        }
    }

    void threadRun() {
        Thread self;
        Thread::current = &self;
        
        register_thread(&self);
        
        try {
            bool is_waking = false;
            while (true) {
                is_waking = wait(is_waking);
                
                while (auto result = pop(&self)) {
                    if (result->pushed || is_waking) {
                        notify(is_waking);
                    }
                    is_waking = false;
                    
                    if (result->task && result->task->callback) {
                        result->task->callback(result->task->index);
                        delete result->task;
                    }
                }
            }
        } catch (...) {
            unregister(&self);
        }
    }

    struct PopResult {
        Task* task;
        bool pushed;
    };

    std::optional<PopResult> pop(Thread* self) {
        // Check local buffer first
        if (Task* task = self->run_buffer.pop()) {
            return PopResult{task, false};
        }
        
        // Check local queue
        if (auto stole = self->run_buffer.consume(&self->run_queue)) {
            return PopResult{stole->task, stole->pushed};
        }
        
        // Check global queue
        if (auto stole = self->run_buffer.consume(&run_queue)) {
            return PopResult{stole->task, stole->pushed};
        }
        
        // Work stealing
        uint32_t sync_val = sync.load(std::memory_order_relaxed);
        Sync s;
        std::memcpy(&s, &sync_val, sizeof(uint32_t));
        uint32_t num_threads = s.spawned;
        
        while (num_threads > 0) {
            Thread* target = self->target ? self->target : threads.load(std::memory_order_acquire);
            if (!target) break;
            
            self->target = target->next;
            num_threads--;
            
            if (auto stole = self->run_buffer.consume(&target->run_queue)) {
                return PopResult{stole->task, stole->pushed};
            }
            
            if (target == self) continue;
            
            if (auto stole = self->run_buffer.steal(&target->run_buffer)) {
                return PopResult{stole->task, stole->pushed};
            }
        }
        
        return std::nullopt;
    }

    void register_thread(Thread* thread) {
        Thread* old_head = threads.load(std::memory_order_relaxed);
        do {
            thread->next = old_head;
        } while (!threads.compare_exchange_weak(old_head, thread,
                                               std::memory_order_release,
                                               std::memory_order_relaxed));
    }

    void unregister(Thread* thread) {
        // Decrement spawned count
        const uint32_t one_spawned = 1 << 14;  // spawned is at bit 14
        uint32_t old_sync = sync.fetch_sub(one_spawned, std::memory_order_release);
        
        Sync s;
        std::memcpy(&s, &old_sync, sizeof(uint32_t));
        
        if (s.state == Sync::SHUTDOWN && s.spawned == 1) {
            std::unique_lock<std::mutex> lock(join_mutex);
            join_event.notify_all();
        }
        
        // Wait for shutdown signal
        {
            std::unique_lock<std::mutex> lock(thread->join_mutex);
            thread->join_event.wait(lock);
        }
        
        // Signal next thread
        if (thread->next) {
            std::unique_lock<std::mutex> lock(thread->next->join_mutex);
            thread->next->join_event.notify_one();
        }
    }

    void join() {
        std::unique_lock<std::mutex> lock(join_mutex);
        join_event.wait(lock, [this]() {
            uint32_t sync_val = sync.load(std::memory_order_relaxed);
            Sync s;
            std::memcpy(&s, &sync_val, sizeof(uint32_t));
            return s.state == Sync::SHUTDOWN && s.spawned == 0;
        });
        
        // Start shutdown chain
        if (Thread* thread = threads.load(std::memory_order_acquire)) {
            std::unique_lock<std::mutex> lock(thread->join_mutex);
            thread->join_event.notify_one();
        }
    }
};

thread_local ZigThreadPool::Thread* ZigThreadPool::Thread::current = nullptr;

// Global thread pool instance
inline ZigThreadPool& get_global_zig_pool() {
    static ZigThreadPool pool;
    return pool;
}

/**
 * @brief Execute parallel_for using Zig-inspired thread pool
 */
inline void parallel_for_zig(size_t num_iterations, const std::function<void(size_t)>& func) {
    if (num_iterations == 0) return;
    if (num_iterations == 1) {
        func(0);
        return;
    }
    
    auto& pool = get_global_zig_pool();
    
    // Create tasks
    std::vector<std::unique_ptr<ZigThreadPool::Task>> tasks;
    tasks.reserve(num_iterations);
    
    for (size_t i = 0; i < num_iterations; ++i) {
        auto task = std::make_unique<ZigThreadPool::Task>();
        task->callback = func;
        task->index = i;
        tasks.push_back(std::move(task));
    }
    
    // Link tasks and create batch
    for (size_t i = 0; i < tasks.size() - 1; ++i) {
        tasks[i]->next = tasks[i + 1].get();
    }
    
    ZigThreadPool::Batch batch;
    batch.len = tasks.size();
    batch.head = tasks.front().get();
    batch.tail = tasks.back().get();
    
    // Schedule and wait
    std::atomic<size_t> completed{0};
    std::mutex completion_mutex;
    std::condition_variable completion_cv;
    
    // Wrap the function to track completion
    auto wrapped_func = [&func, &completed, &completion_cv, num_iterations](size_t i) {
        func(i);
        if (completed.fetch_add(1, std::memory_order_relaxed) + 1 == num_iterations) {
            completion_cv.notify_all();
        }
    };
    
    // Update task callbacks
    for (auto& task : tasks) {
        task->callback = wrapped_func;
    }
    
    pool.schedule(batch);
    
    // Release ownership of tasks
    for (auto& task : tasks) {
        task.release();
    }
    
    // Wait for completion
    std::unique_lock<std::mutex> lock(completion_mutex);
    completion_cv.wait(lock, [&completed, num_iterations]() {
        return completed.load(std::memory_order_relaxed) >= num_iterations;
    });
}

} // namespace bb