#pragma once
/**
 * @file wsdb_schedule.hpp
 * @brief Helpers that wrap a handler's work in the per-fork scheduler.
 *
 * A handler declares its own ordering by which helper it calls — schedule_read
 * (concurrent; committed reads bypass ordering entirely) or schedule_write
 * (exclusive on its fork) — and supplies the fork it touches plus a `logic`
 * lambda returning the typed response. The helper runs `logic` on the scheduler
 * (inline when idle, else a pool thread), turning a return value into
 * respond.ok(...) and any thrown exception into respond.error(...), so handler
 * bodies stay free of threading and error-frame boilerplate.
 */

#include "wsdb/generated/wsdb_dispatch.hpp" // Responder
#include "wsdb/wsdb_request.hpp"
#include "wsdb/wsdb_scheduler.hpp"

#include <cstdint>
#include <exception>
#include <string>
#include <utility>

namespace bb::wsdb {

namespace detail {
template <typename Resp, typename Fn> std::function<void()> wrap(Responder<Resp> respond, Fn&& logic)
{
    return [respond = std::move(respond), logic = std::forward<Fn>(logic)]() mutable {
        try {
            respond.ok(logic());
        } catch (const std::exception& e) {
            respond.error(e.what());
        }
    };
}
} // namespace detail

/**
 * @brief Run a read on `fork` and respond. `committed` true => independent
 * snapshot, never ordered; false => waits behind an in-flight write on the fork.
 */
template <typename Resp, typename Fn>
void schedule_read(WsdbRequest& ctx, uint64_t fork, bool committed, Responder<Resp> respond, Fn&& logic)
{
    ctx.scheduler->submit_read(fork, committed, detail::wrap(std::move(respond), std::forward<Fn>(logic)));
}

/** @brief Run a write on `fork` (exclusive on that fork) and respond. */
template <typename Resp, typename Fn>
void schedule_write(WsdbRequest& ctx, uint64_t fork, Responder<Resp> respond, Fn&& logic)
{
    ctx.scheduler->submit_write(fork, detail::wrap(std::move(respond), std::forward<Fn>(logic)));
}

} // namespace bb::wsdb
