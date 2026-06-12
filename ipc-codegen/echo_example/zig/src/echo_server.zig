//! Echo IPC server (Zig) — uses the ipc-runtime Zig binding for transport
//! and the GENERATED Dispatcher for framing, dispatch, and error wrapping.
//! Usage: echo_server --socket /tmp/echo.sock
const std = @import("std");
const ipc_runtime = @import("ipc_runtime");
const types = @import("generated/echo_types.zig");
const echo_server = @import("generated/echo_server.zig");

const EchoHandler = struct {
    /// Diagnostic channel for handler failures — the generated dispatcher
    /// sends this as the error variant's message when set.
    error_message: ?[]const u8 = null,

    pub fn bytes(self: *EchoHandler, cmd: types.EchoBytes) !types.EchoBytesResponse {
        _ = self;
        return .{ .data = cmd.data };
    }

    pub fn fields(self: *EchoHandler, cmd: types.EchoFields) !types.EchoFieldsResponse {
        _ = self;
        return .{ .a = cmd.a, .b = cmd.b, .name = cmd.name };
    }

    pub fn nested(self: *EchoHandler, cmd: types.EchoNested) !types.EchoNestedResponse {
        _ = self;
        return .{ .inner = cmd.inner };
    }

    pub fn aliases(self: *EchoHandler, cmd: types.EchoAliases) !types.EchoAliasesResponse {
        _ = self;
        return .{
            .tree_id = cmd.tree_id,
            .hash = cmd.hash,
            .maybe_hash = cmd.maybe_hash,
            .hashes = cmd.hashes,
        };
    }

    pub fn blobs(self: *EchoHandler, cmd: types.EchoBlobs) !types.EchoBlobsResponse {
        _ = self;
        return .{ .maybe_data = cmd.maybe_data, .parts = cmd.parts };
    }

    pub fn fail(self: *EchoHandler, cmd: types.EchoFail) !types.EchoFailResponse {
        self.error_message = cmd.message;
        return error.EchoFailRequested;
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
