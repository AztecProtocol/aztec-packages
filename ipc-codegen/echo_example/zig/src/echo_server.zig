/// Echo IPC server (Zig) — uses the ipc-runtime Zig binding for transport
/// and codegen-emitted types for msgpack encode/decode of payloads.
/// Usage: echo_server --socket /tmp/echo.sock
const std = @import("std");
const ipc_runtime = @import("ipc_runtime");
const msgpack = @import("msgpack");
const Payload = msgpack.Payload;
const types = @import("generated/echo_types.zig");

const alloc = std.heap.page_allocator;

// Per-request scratch buffer. The runtime expects the handler's returned slice
// to remain valid until the next call, so we keep one buffer that the handler
// reuses each iteration.
var resp_scratch: ?[]u8 = null;

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

    var server = try ipc_runtime.Server.fromPath(path);
    defer server.deinit();
    try server.listen();
    std.debug.print("ipc-server(zig): listening on {s}\n", .{path});

    server.run(*u8, undefined, handle);
}

fn handle(_: *u8, _: i32, req: []const u8) []u8 {
    // Free the previous response (the runtime has already copied it out).
    if (resp_scratch) |prev| alloc.free(prev);
    resp_scratch = null;

    var reader = std.Io.Reader.fixed(req);
    var packer = msgpack.PackerIO.init(&reader, undefined);
    const request = packer.read(alloc) catch return makeError("decode failed");

    const outer_len = request.getArrLen() catch return makeError("expected outer array");
    if (outer_len != 1) return makeError("expected outer array of size 1");

    const inner = request.getArrElement(0) catch return makeError("expected [name, payload]");
    const inner_len = inner.getArrLen() catch return makeError("expected [name, payload]");
    if (inner_len != 2) return makeError("expected [name, payload]");

    const cmd_name = (inner.getArrElement(0) catch return makeError("missing cmd name")).asStr() catch return makeError("cmd name not a string");
    const fields = inner.getArrElement(1) catch return makeError("missing fields");

    const resp = dispatch(cmd_name, fields) catch return makeError("dispatch failed");
    return resp;
}

fn dispatch(cmd_name: []const u8, fields: Payload) ![]u8 {
    if (std.mem.eql(u8, cmd_name, "EchoShutdown")) {
        return try packResponse("EchoShutdownResponse", Payload.mapPayload(alloc));
    }
    if (std.mem.eql(u8, cmd_name, "EchoBytes")) {
        const cmd = try types.EchoBytes.fromPayload(fields);
        const resp = types.EchoBytesResponse{ .data = cmd.data };
        return try packResponse("EchoBytesResponse", try resp.toPayload(alloc));
    }
    if (std.mem.eql(u8, cmd_name, "EchoFields")) {
        const cmd = try types.EchoFields.fromPayload(fields);
        const resp = types.EchoFieldsResponse{ .a = cmd.a, .b = cmd.b, .name = cmd.name };
        return try packResponse("EchoFieldsResponse", try resp.toPayload(alloc));
    }
    if (std.mem.eql(u8, cmd_name, "EchoNested")) {
        const cmd = try types.EchoNested.fromPayload(fields);
        const resp = types.EchoNestedResponse{ .inner = cmd.inner };
        return try packResponse("EchoNestedResponse", try resp.toPayload(alloc));
    }
    return makeErrorBytes("unknown command");
}

fn packResponse(name: []const u8, payload: Payload) ![]u8 {
    // Wire format: [responseName, {payload}]
    var arr = try Payload.arrPayload(2, alloc);
    try arr.setArrElement(0, try Payload.strToPayload(name, alloc));
    try arr.setArrElement(1, payload);

    var writer = std.Io.Writer.Allocating.init(alloc);
    defer writer.deinit();
    var packer = msgpack.PackerIO.init(undefined, &writer.writer);
    try packer.write(arr);
    const bytes = try writer.toOwnedSlice();
    resp_scratch = bytes;
    return bytes;
}

fn makeError(message: []const u8) []u8 {
    return makeErrorBytes(message) catch {
        // Last-ditch: return a fixed empty bytes (the runtime treats len=0 as
        // an empty response; that's acceptable in this catastrophic path).
        const empty = alloc.alloc(u8, 0) catch unreachable;
        resp_scratch = empty;
        return empty;
    };
}

fn makeErrorBytes(message: []const u8) ![]u8 {
    var err_map = Payload.mapPayload(alloc);
    try err_map.mapPut("message", try Payload.strToPayload(message, alloc));
    return try packResponse("EchoErrorResponse", err_map);
}
