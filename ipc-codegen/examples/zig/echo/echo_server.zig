/// Echo IPC server (Zig) — uses GENERATED types + IPC server template.
/// Hand-written dispatch + echo handlers.
/// Usage: echo_server --socket /tmp/echo.sock
const std = @import("std");
const msgpack = @import("msgpack");
const Payload = msgpack.Payload;
const types = @import("generated/echo_types.zig");
const ipc_server = @import("generated/ipc_server.zig");

const alloc = std.heap.page_allocator;

pub fn main() !void {
    var args = std.process.args();
    _ = args.next();
    var socket_path: ?[]const u8 = null;
    while (args.next()) |arg| {
        if (std.mem.eql(u8, arg, "--socket")) {
            socket_path = args.next();
        }
    }
    const path = socket_path orelse {
        std.debug.print("Usage: echo_server --socket <path>\n", .{});
        return error.InvalidArgument;
    };

    try ipc_server.serve(path, dispatch);
}

fn dispatch(cmd_name: []const u8, fields: Payload) ipc_server.DispatchResult {
    // Shutdown
    if (std.mem.eql(u8, cmd_name, "EchoShutdown")) {
        return .{ .resp_name = "EchoShutdownResponse", .resp_payload = Payload.mapPayload(alloc) };
    }

    // EchoBytes — echo back
    if (std.mem.eql(u8, cmd_name, "EchoBytes")) {
        const cmd = types.EchoBytes.fromPayload(fields) catch return makeError("deser failed");
        const resp = types.EchoBytesResponse{ .data = cmd.data };
        return .{ .resp_name = "EchoBytesResponse", .resp_payload = resp.toPayload(alloc) };
    }

    // EchoFields — echo back
    if (std.mem.eql(u8, cmd_name, "EchoFields")) {
        const cmd = types.EchoFields.fromPayload(fields) catch return makeError("deser failed");
        const resp = types.EchoFieldsResponse{ .a = cmd.a, .b = cmd.b, .name = cmd.name };
        return .{ .resp_name = "EchoFieldsResponse", .resp_payload = resp.toPayload(alloc) };
    }

    // EchoNested — echo back
    if (std.mem.eql(u8, cmd_name, "EchoNested")) {
        const cmd = types.EchoNested.fromPayload(fields) catch return makeError("deser failed");
        const resp = types.EchoNestedResponse{ .inner = cmd.inner };
        return .{ .resp_name = "EchoNestedResponse", .resp_payload = resp.toPayload(alloc) };
    }

    return makeError("unknown command");
}

fn makeError(message: []const u8) ipc_server.DispatchResult {
    var err_map = Payload.mapPayload(alloc);
    err_map.mapPut("message", Payload.strToPayload(message, alloc) catch return .{ .resp_name = "EchoErrorResponse", .resp_payload = Payload.mapPayload(alloc) }) catch {};
    return .{ .resp_name = "EchoErrorResponse", .resp_payload = err_map };
}
