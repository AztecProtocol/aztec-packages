//! Echo IPC server (Zig) — uses the ipc-runtime Zig binding for transport
//! and the GENERATED Dispatcher for framing, dispatch, and error wrapping.
//! Usage: echo_server --socket /tmp/echo.sock
const std = @import("std");
const ipc_runtime = @import("ipc_runtime");
const echo_server = @import("generated/echo_server.zig");

const EchoHandler = @import("handler.zig").EchoHandler;

const EchoDispatcher = echo_server.Dispatcher(EchoHandler);

pub fn main() !void {
    var args = std.process.args();
    _ = args.next();
    var socket_path: ?[:0]const u8 = null;
    while (args.next()) |arg| {
        if (std.mem.eql(u8, arg, "--socket")) {
            socket_path = args.next();
        }
    }
    const path = socket_path orelse {
        std.debug.print("Usage: echo_server --socket <path>\n", .{});
        return error.InvalidArgument;
    };

    var handler = EchoHandler{};
    var dispatcher = EchoDispatcher.init(&handler);

    var server = try ipc_runtime.Server.fromPath(path);
    defer server.deinit();
    server.installDefaultSignalHandlers();
    try server.listen();
    std.debug.print("ipc-server(zig): listening on {s}\n", .{path});

    server.run(*EchoDispatcher, &dispatcher, EchoDispatcher.handleRequest);
}
