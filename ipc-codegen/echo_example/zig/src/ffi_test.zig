//! In-process round trip (Zig): the generated Client over the generated
//! FfiBackend, an instance of this binary's own generated FFI service, no process
//! involved. The requests the typed client cannot make (an unknown command,
//! malformed bytes) go through the backend's raw call(). Instances made with
//! create() answer the same. Then the asynchronous exports, driven by a host
//! written here that binds "peer" back to the same instance, so each hop of a
//! Relay is another request submitted while the hops before it wait (the Zig
//! twin of the Rust example's tests/async_relay.rs).
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
const async_host = @import("generated/async_host.zig");
extern fn echo_ipc_ffi_create_async(host_ctx: ?*anyopaque, respond: async_host.RespondFn, call: async_host.CallFn) ?*anyopaque;
extern fn echo_ipc_ffi_submit(instance: *anyopaque, request_id: u64, input: [*]const u8, input_len: usize) void;
extern fn echo_ipc_ffi_deliver(instance: *anyopaque, call_id: u64, status: i32, response: [*]const u8, response_len: usize) void;
extern fn echo_ipc_ffi_destroy_async(instance: ?*anyopaque) void;

const alloc = std.heap.page_allocator;

const Event = struct { call: bool, id: u64, target: []u8, bytes: []u8 };

/// The host's queue: the callbacks only record, so nothing calls into the instance from inside them.
const Queue = struct {
    events: std.ArrayListUnmanaged(Event) = .{},
    next: usize = 0,

    fn push(self: *Queue, event: Event) void {
        self.events.append(alloc, event) catch @panic("out of memory");
    }

    fn onRespond(ctx: ?*anyopaque, request_id: u64, response: [*]const u8, len: usize) callconv(.c) void {
        const self: *Queue = @ptrCast(@alignCast(ctx.?));
        self.push(.{ .call = false, .id = request_id, .target = &.{}, .bytes = alloc.dupe(u8, response[0..len]) catch @panic("oom") });
    }

    fn onCall(ctx: ?*anyopaque, call_id: u64, target: [*]const u8, target_len: usize, request: [*]const u8, len: usize) callconv(.c) void {
        const self: *Queue = @ptrCast(@alignCast(ctx.?));
        self.push(.{ .call = true, .id = call_id, .target = alloc.dupe(u8, target[0..target_len]) catch @panic("oom"), .bytes = alloc.dupe(u8, request[0..len]) catch @panic("oom") });
    }
};

const Outcome = struct { data: []const u8 = &.{}, failed: ?[]const u8 = null, most_waiting: usize = 0 };

/// Runs one Relay on an asynchronous instance, routing `peer` back into it and failing calls to
/// any other target.
fn runRelay(hops: u32, peer: []const u8) !Outcome {
    var queue = Queue{};
    const instance = echo_ipc_ffi_create_async(&queue, Queue.onRespond, Queue.onCall).?;
    defer echo_ipc_ffi_destroy_async(instance);
    // The peer requests this host submitted, by request id: the call each one answers.
    var answers_call = std.AutoHashMapUnmanaged(u64, u64){};
    var next_id: u64 = 1;
    var outcome = Outcome{};
    const request = try encodeRelay(&[_]u8{9}, hops);
    echo_ipc_ffi_submit(instance, 0, request.ptr, request.len);
    while (queue.next < queue.events.items.len) {
        const event = queue.events.items[queue.next];
        queue.next += 1;
        if (!event.call) {
            if (event.id == 0) {
                switch (decodeRelay(event.bytes)) {
                    .ok => |response| outcome.data = response.data,
                    .failed => |message| outcome.failed = message,
                }
                return outcome;
            }
            const call_id = answers_call.fetchRemove(event.id).?.value;
            echo_ipc_ffi_deliver(instance, call_id, 0, event.bytes.ptr, event.bytes.len);
        } else if (std.mem.eql(u8, event.target, peer)) {
            try answers_call.put(alloc, next_id, event.id);
            outcome.most_waiting = @max(outcome.most_waiting, answers_call.count());
            echo_ipc_ffi_submit(instance, next_id, event.bytes.ptr, event.bytes.len);
            next_id += 1;
        } else {
            const message = try std.fmt.allocPrint(alloc, "no target {s}", .{event.target});
            echo_ipc_ffi_deliver(instance, event.id, 1, message.ptr, message.len);
        }
    }
    outcome.failed = "the instance went quiet";
    return outcome;
}

/// [["EchoRelay", {"data": <bin>, "hops": <u32>}]], through a blocking client over a recording backend.
fn encodeRelay(data: []const u8, hops: u32) ![]u8 {
    const Recorder = struct {
        request: []u8 = &.{},
        pub fn call(self: *@This(), request: []const u8) ![]u8 {
            self.request = try alloc.dupe(u8, request);
            return error.Recorded;
        }
        pub fn destroy(_: *@This()) void {}
    };
    var recorder = Recorder{};
    var client = echo_client.Client(Recorder).init(&recorder);
    _ = client.relay(.{ .data = data, .hops = hops }) catch {};
    return recorder.request;
}

fn decodeRelay(response: []const u8) echo_client.AsyncResult(types.EchoRelayResponse) {
    const Replayer = struct {
        response: []const u8,
        pub fn call(self: *@This(), _: []const u8) ![]u8 {
            return alloc.dupe(u8, self.response);
        }
        pub fn destroy(_: *@This()) void {}
    };
    var replayer = Replayer{ .response = response };
    var client = echo_client.Client(Replayer).init(&replayer);
    const relayed = client.relay(.{ .data = &.{}, .hops = 0 }) catch |e|
        return .{ .failed = if (e == error.ServerError) client.last_server_error orelse "server error" else @errorName(e) };
    return .{ .ok = relayed };
}

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
    var backend = try FfiBackend.init();
    defer backend.destroy();
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

    {
        const outcome = try runRelay(5, "peer");
        check(outcome.failed == null and std.mem.eql(u8, outcome.data, &[_]u8{ 9, 5, 4, 3, 2, 1 }), "a relay nests 5 hops on one asynchronous instance");
        check(outcome.most_waiting == 5, "every hop waits on the next, on the one instance");
    }
    {
        const outcome = try runRelay(0, "peer");
        check(std.mem.eql(u8, outcome.data, &[_]u8{9}) and outcome.most_waiting == 0, "a relay of no hops answers at once");
    }
    {
        const outcome = try runRelay(2, "nobody");
        check(outcome.failed != null and std.mem.indexOf(u8, outcome.failed.?, "no target peer") != null, "a call the host cannot route fails the relay with the host's message");
    }
    {
        const failed_now = if (client.relay(.{ .data = &[_]u8{9}, .hops = 1 })) |_| false else |err| err == error.ServerError;
        const why = client.last_server_error orelse "";
        check(failed_now and std.mem.indexOf(u8, why, "no asynchronous instance") != null, "over the blocking FFI, a relay's call out fails at once");
    }

    if (failures > 0) {
        std.debug.print("ffi_test: {d} failure(s)\n", .{failures});
        std.process.exit(1);
    }
    std.debug.print("ffi_test: all passed\n", .{});
}
