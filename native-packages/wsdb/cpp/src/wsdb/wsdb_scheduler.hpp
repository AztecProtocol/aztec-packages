#pragma once
/**
 * @file wsdb_scheduler.hpp
 * @brief Server-side per-fork ordering for the concurrent wsdb.
 *
 * Owns the ordering that used to live in the TypeScript client's per-fork
 * WorldStateOpsQueue, moved server-side so the database — not each client —
 * guarantees its own consistency. Handlers classify themselves (a read calls
 * submit_read, a write calls submit_write) and pass the fork they touch, so this
 * scheduler needs no knowledge of the wire format. Per fork:
 *   - committed reads run concurrently, never ordered (independent snapshots);
 *   - uncommitted reads run concurrently with each other but wait behind an
 *     in-flight write on the same fork;
 *   - a write is exclusive on its fork: it waits for in-flight ops on that fork
 *     to drain, runs alone, and only then are later ops on that fork released.
 * Different forks never block each other.
 *
 * This is the read-batch / write-barrier model: a run of reads proceeds in
 * parallel; the next write is a barrier; reads after it wait for it.
 *
 * Threading: submit_* is called only on the reactor thread (arrival order);
 * work runs on the thread pool; completions re-pump under the lock. The inline
 * fast path runs work directly on the reactor thread when nothing is in flight
 * and no further request is pending — so a synchronous single-in-flight client
 * (e.g. an AVM sim) never queues. Lifetime is via shared_from_this so a
 * completion can safely outlive the reactor loop's return.
 */

#include "common/thread_pool.hpp"
#include "ipc_runtime/ipc_server.hpp"

#include <atomic>
#include <cstdint>
#include <deque>
#include <functional>
#include <memory>
#include <mutex>
#include <unordered_map>
#include <utility>

namespace azteclabs::wsdb {

class WsdbScheduler : public std::enable_shared_from_this<WsdbScheduler> {
  public:
    WsdbScheduler(azteclabs::wsdb::ThreadPool& pool, ipc::IpcServer& server)
        : pool_(pool)
        , server_(server)
    {}

    // A read on `fork`. Committed reads (independent snapshots) run concurrently
    // with everything; uncommitted reads wait behind an in-flight write on the
    // same fork. Called only on the reactor thread.
    void submit_read(uint64_t fork, bool committed, std::function<void()> work)
    {
        if (run_inline_if_idle(work)) {
            return;
        }
        if (committed) {
            dispatch_unordered(std::move(work));
            return;
        }
        std::lock_guard<std::mutex> lock(mtx_);
        Lane& lane = lanes_[fork];
        lane.pending.push_back({ false, std::move(work) });
        inflight_.fetch_add(1, std::memory_order_relaxed);
        pump(fork, lane);
    }

    // A write on `fork`: exclusive on that fork. Called only on the reactor thread.
    void submit_write(uint64_t fork, std::function<void()> work)
    {
        if (run_inline_if_idle(work)) {
            return;
        }
        std::lock_guard<std::mutex> lock(mtx_);
        Lane& lane = lanes_[fork];
        lane.pending.push_back({ true, std::move(work) });
        inflight_.fetch_add(1, std::memory_order_relaxed);
        pump(fork, lane);
    }

  private:
    struct Op {
        bool mutating;
        std::function<void()> work;
    };
    struct Lane {
        std::deque<Op> pending;
        int in_flight = 0;          // ops dispatched on this fork, not yet completed
        int in_flight_mutating = 0; // of which, writes
    };

    // Fully idle => run on the reactor thread, skipping the pool handoff AND the
    // ordering bookkeeping. Safe because submit_* is reactor-only, so with
    // nothing in flight this request is alone and ordering is moot.
    bool run_inline_if_idle(std::function<void()>& work)
    {
        if (inflight_.load(std::memory_order_acquire) == 0 && !server_.has_pending_request()) {
            work();
            return true;
        }
        return false;
    }

    void dispatch_unordered(std::function<void()> work)
    {
        inflight_.fetch_add(1, std::memory_order_relaxed);
        auto self = shared_from_this();
        pool_.enqueue([self, work = std::move(work)]() {
            work();
            self->inflight_.fetch_sub(1, std::memory_order_release);
        });
    }

    // Caller holds mtx_. Dispatch as many head ops as ordering allows: a run of
    // reads concurrently; a write only when the fork has drained, and nothing
    // after it until it completes.
    void pump(uint64_t fork, Lane& lane)
    {
        while (!lane.pending.empty()) {
            Op& front = lane.pending.front();
            if (front.mutating) {
                if (lane.in_flight != 0) {
                    break; // write needs exclusive access; wait for the fork to drain
                }
                dispatch(fork, lane, true);
                break; // barrier: release nothing else on this fork until it completes
            }
            if (lane.in_flight_mutating != 0) {
                break; // uncommitted read waits behind an in-flight write
            }
            dispatch(fork, lane, false); // reads go concurrently
        }
    }

    // Caller holds mtx_.
    void dispatch(uint64_t fork, Lane& lane, bool mutating)
    {
        Op op = std::move(lane.pending.front());
        lane.pending.pop_front();
        lane.in_flight++;
        if (mutating) {
            lane.in_flight_mutating++;
        }
        auto self = shared_from_this();
        pool_.enqueue([self, fork, mutating, work = std::move(op.work)]() {
            work();
            self->complete(fork, mutating);
        });
    }

    void complete(uint64_t fork, bool mutating)
    {
        std::lock_guard<std::mutex> lock(mtx_);
        Lane& lane = lanes_[fork]; // references stay valid: lanes are never erased
        lane.in_flight--;
        if (mutating) {
            lane.in_flight_mutating--;
        }
        inflight_.fetch_sub(1, std::memory_order_release);
        pump(fork, lane);
    }

    azteclabs::wsdb::ThreadPool& pool_;
    ipc::IpcServer& server_;
    std::mutex mtx_;
    std::unordered_map<uint64_t, Lane> lanes_; // per fork; references stable (never erased)
    std::atomic<int> inflight_{ 0 };           // submitted-but-not-completed ops (queued + running)
};

} // namespace azteclabs::wsdb
