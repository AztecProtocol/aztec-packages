//! Echo IPC server (Zig) — uses the ipc-runtime Zig binding for transport
//! and the GENERATED Dispatcher for framing, dispatch, and error wrapping.
//! Usage: echo_server --socket /tmp/echo.sock [--host-call peer=<path>]...
//!
//! Served as an asynchronous instance (generated/async_server.zig), so a Relay
//! whose "peer" calls back into this server is answered while the hops before
//! it wait.
const std = @import("std");
const ipc_runtime = @import("ipc_runtime");
const echo_server = @import("generated/echo_server.zig");
const async_server = @import("generated/async_server.zig");

const EchoHandler = @import("handler.zig").EchoHandler;

pub fn main() !void {
    var args = std.process.args();
    _ = args.next();
    var socket_path: ?[:0]const u8 = null;
    var targets: std.ArrayListUnmanaged(async_server.Target) = .{};
    while (args.next()) |arg| {
        if (std.mem.eql(u8, arg, "--socket")) {
            socket_path = args.next();
        } else if (std.mem.eql(u8, arg, "--host-call")) {
            const spec = args.next() orelse return error.InvalidArgument;
            try targets.append(std.heap.page_allocator, try async_server.parseHostCall(spec));
        }
    }
    const path = socket_path orelse {
        std.debug.print("Usage: echo_server --socket <path> [--host-call name=path]...\n", .{});
        return error.InvalidArgument;
    };

    var server = try ipc_runtime.Server.fromPath(path);
    defer server.deinit();
    server.installDefaultSignalHandlers();
    try server.listen();
    std.debug.print("ipc-server(zig): listening on {s}\n", .{path});

    try async_server.serveAsync(EchoHandler, echo_server.Dispatcher(EchoHandler), &server, targets.items);
}
