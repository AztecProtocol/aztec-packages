#pragma once

#include "ipc_runtime/ipc_client.hpp"
#include <cerrno>
#include <csignal>
#include <cstddef>
#include <cstdint>
#include <optional>
#include <span>
#include <sys/types.h>
#include <sys/wait.h>

namespace ipc {

/** How a server process ended: its exit code, or the signal that killed it. -1 where it doesn't apply or is unknown. */
struct ProcessExit {
    int code = -1;
    int signal = -1;
};

/**
 * Whether process `pid` has exited, without reaping it: the process that spawned
 * it (e.g. Node's child_process) still collects its status as usual. While
 * unreaped, an exited child keeps its pid, so the pid can't have been reused.
 */
inline std::optional<ProcessExit> exited_without_reaping(pid_t pid)
{
    siginfo_t info{};
    if (::waitid(P_PID, static_cast<id_t>(pid), &info, WEXITED | WNOHANG | WNOWAIT) == 0) {
        if (info.si_pid != pid) {
            return std::nullopt; // still running
        }
        if (info.si_code == CLD_EXITED) {
            return ProcessExit{ .code = info.si_status };
        }
        return ProcessExit{ .signal = info.si_status };
    }
    // Not our child, or already reaped: all we can tell is whether it still exists.
    if (errno == ECHILD && ::kill(pid, 0) != 0 && errno == ESRCH) {
        return ProcessExit{};
    }
    return std::nullopt;
}

struct BlockingCallResult {
    enum class Status { Ok, ServerExited, TooLarge };
    Status status = Status::Ok;
    /** The response, when status is Ok. Release it on the client once read. */
    std::span<const uint8_t> response;
    /** How the server ended, when status is ServerExited. */
    ProcessExit server_exit;
};

/** How often a blocking call checks that its server is still alive. Bounds how late a death is noticed, nothing else.
 */
inline constexpr uint64_t BLOCKING_CALL_POLL_NS = 1'000'000'000;

/**
 * One blocking request/response round trip, for a caller that cannot otherwise
 * notice its server dying (e.g. a sync call holding Node's main thread, where the
 * child's exit event can't run). There is no deadline: a live server is waited on
 * however long it takes. Given the server's pid, the call checks between waits of
 * `poll_ns` whether that process has exited, and if so ends with how it exited.
 * Without a pid, it waits indefinitely.
 */
inline BlockingCallResult call_blocking(IpcClient& client,
                                        const void* data,
                                        size_t len,
                                        std::optional<pid_t> server_pid,
                                        uint64_t poll_ns = BLOCKING_CALL_POLL_NS)
{
    auto exited = [&]() -> std::optional<ProcessExit> {
        return server_pid ? exited_without_reaping(*server_pid) : std::nullopt;
    };
    for (;;) {
        errno = 0;
        if (client.send(data, len, poll_ns)) {
            break;
        }
        if (errno == EMSGSIZE) {
            return { .status = BlockingCallResult::Status::TooLarge };
        }
        if (auto exit = exited()) {
            return { .status = BlockingCallResult::Status::ServerExited, .server_exit = *exit };
        }
    }
    std::span<const uint8_t> response;
    while ((response = client.receive(poll_ns)).data() == nullptr) {
        if (auto exit = exited()) {
            return { .status = BlockingCallResult::Status::ServerExited, .server_exit = *exit };
        }
    }
    return { .response = response };
}

} // namespace ipc
