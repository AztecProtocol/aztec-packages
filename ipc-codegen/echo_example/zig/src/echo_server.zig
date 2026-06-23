//! Echo IPC server (Zig) — uses the ipc-runtime Zig binding for transport
//! and the GENERATED Dispatcher for framing, dispatch, and error wrapping.
//! Usage: echo_server --socket /tmp/echo.sock
const std = @import("std");
const ipc_runtime = @import("ipc_runtime");
const types = @import("generated/echo_types.zig");
const echo_server = @import("generated/echo_server.zig");

const EchoHandler = struct {
    // Handlers are asynchronous: they produce their result via respond.ok(...) /
    // respond.err(...) (synchronously here; an async transport could defer).
    pub fn bytes(self: *EchoHandler, cmd: types.EchoBytes, respond: *echo_server.Responder(types.EchoBytesResponse)) void {
        _ = self;
        respond.ok(.{ .data = cmd.data });
    }

    pub fn fields(self: *EchoHandler, cmd: types.EchoFields, respond: *echo_server.Responder(types.EchoFieldsResponse)) void {
        _ = self;
        respond.ok(.{ .a = cmd.a, .b = cmd.b, .name = cmd.name });
    }

    pub fn nested(self: *EchoHandler, cmd: types.EchoNested, respond: *echo_server.Responder(types.EchoNestedResponse)) void {
        _ = self;
        respond.ok(.{ .inner = cmd.inner });
    }

    pub fn aliases(self: *EchoHandler, cmd: types.EchoAliases, respond: *echo_server.Responder(types.EchoAliasesResponse)) void {
        _ = self;
        respond.ok(.{
            .tree_id = cmd.tree_id,
            .hash = cmd.hash,
            .maybe_hash = cmd.maybe_hash,
            .hashes = cmd.hashes,
        });
    }

    pub fn blobs(self: *EchoHandler, cmd: types.EchoBlobs, respond: *echo_server.Responder(types.EchoBlobsResponse)) void {
        _ = self;
        respond.ok(.{ .maybe_data = cmd.maybe_data, .parts = cmd.parts });
    }

    pub fn fail(self: *EchoHandler, cmd: types.EchoFail, respond: *echo_server.Responder(types.EchoFailResponse)) void {
        _ = self;
        respond.err(cmd.message);
    }
};

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
