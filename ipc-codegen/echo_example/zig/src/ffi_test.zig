//! In-process round trip (Zig): the generated Client over the generated
//! FfiBackend, calling this binary's own generated FFI entry, no process
//! involved. The requests the typed client cannot make (an unknown command,
//! malformed bytes) go through the backend's raw call(). Instances made with
//! create() answer the same.
const std = @import("std");
const echo_client = @import("generated/echo_client.zig");
const echo_ffi = @import("generated/echo_ffi.zig");
const FfiBackend = @import("generated/ffi_backend.zig").FfiBackend;
const types = @import("generated/echo_types.zig");

comptime {
    echo_ffi.exportFfi(@import("handler.zig").EchoHandler);
}

extern fn echo_ipc_ffi_create() ?*anyopaque;
extern fn echo_ipc_ffi_call(instance: *anyopaque, input: [*]const u8, input_len: usize, output: *[*]u8, output_len: *usize) void;
extern fn echo_ipc_ffi_destroy(instance: ?*anyopaque) void;
extern fn echo_ipc_ffi_free(ptr: [*]u8) void;

var failures: usize = 0;

fn check(ok: bool, label: []const u8) void {
    std.debug.print("  {s}: {s}\n", .{ if (ok) "PASS" else "FAIL", label });
    if (!ok) failures += 1;
}

/// The raw response is an error frame whose message contains `expected`. The
/// frame's strings are plain bytes in msgpack, so a substring search finds them.
fn isErrorWith(backend: *FfiBackend, request: []const u8, expected: []const u8) !bool {
    const response = try backend.call(request);
    defer std.heap.page_allocator.free(response);
    return std.mem.indexOf(u8, response, "EchoErrorResponse") != null and
        std.mem.indexOf(u8, response, expected) != null;
}

pub fn main() !void {
    var backend = FfiBackend{};
    var client = echo_client.Client(FfiBackend).init(&backend);

    const data = [_]u8{ 0xde, 0xad, 0xbe, 0xef, 0x42 };
    check(std.mem.eql(u8, (try client.bytes(.{ .data = &data })).data, &data), "EchoBytes round trip");

    const fields = try client.fields(.{ .a = 42, .b = 999999, .name = "hello ffi" });
    check(fields.a == 42 and fields.b == 999999 and std.mem.eql(u8, fields.name, "hello ffi"), "EchoFields round trip");

    const failed = if (client.fail(.{ .message = "boom" })) |_| false else |err| err == error.ServerError;
    const message = client.last_server_error orelse "";
    check(failed and std.mem.indexOf(u8, message, "boom") != null, "EchoFail surfaces the server's message");

    // [["NoSuchCommand", 0]]
    check(try isErrorWith(&backend, &[_]u8{ 0x91, 0x92, 0xad } ++ "NoSuchCommand" ++ &[_]u8{0x00}, "unknown command"), "unknown command becomes an error frame");
    // A bare msgpack string where the [[name, payload]] envelope belongs.
    check(try isErrorWith(&backend, &[_]u8{0xa3} ++ "bad", "malformed request"), "malformed input becomes an error frame");

    // Two instances, called in turn and ended.
    const instances = [_]*anyopaque{ echo_ipc_ffi_create().?, echo_ipc_ffi_create().? };
    for (instances) |instance| {
        var out_ptr: [*]u8 = undefined;
        var out_len: usize = 0;
        // [["EchoBytes", {"data": <bin 2>}]]
        const request: []const u8 = &[_]u8{ 0x91, 0x92, 0xa9 } ++ "EchoBytes" ++ [_]u8{ 0x81, 0xa4 } ++ "data" ++ [_]u8{ 0xc4, 0x02, 0xca, 0xfe };
        echo_ipc_ffi_call(instance, request.ptr, request.len, &out_ptr, &out_len);
        const response = out_ptr[0..out_len];
        check(std.mem.indexOf(u8, response, "EchoBytesResponse") != null and std.mem.indexOf(u8, response, &[_]u8{ 0xc4, 0x02, 0xca, 0xfe }) != null, "an instance answers EchoBytes");
        echo_ipc_ffi_free(out_ptr);
        echo_ipc_ffi_destroy(instance);
    }

    if (failures > 0) {
        std.debug.print("ffi_test: {d} failure(s)\n", .{failures});
        std.process.exit(1);
    }
    std.debug.print("ffi_test: all passed\n", .{});
}
