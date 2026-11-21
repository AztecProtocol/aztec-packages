//! Serves an asynchronous instance (async_host.zig) in a server process, for
//! handlers that call out and answer once the call comes back.
//!
//! The server's loop (ipc_runtime's Server.runReactor) only queues requests;
//! the instance runs on a thread of its own, and each call out is made on a
//! thread of its own, over its own connection to the target's path. The server
//! keeps taking requests while calls are out, so a target that calls back into
//! this server (directly or through other services) is answered rather than
//! deadlocking it. Needs the ipc_runtime module.
const std = @import("std");
const ipc_runtime = @import("ipc_runtime");
const async_host = @import("async_host.zig");

const alloc = std.heap.page_allocator;

/// A host-call target: the name a handler calls, and the .sock/.shm path of the service it reaches.
pub const Target = struct {
    name: []const u8,
    path: [:0]const u8,
};

/// Reads a `--host-call` value: `name=path`.
pub fn parseHostCall(spec: [:0]const u8) error{InvalidHostCall}!Target {
    const eq = std.mem.indexOfScalar(u8, spec, '=') orelse return error.InvalidHostCall;
    if (eq == 0 or eq + 1 == spec.len) return error.InvalidHostCall;
    return .{ .name = spec[0..eq], .path = spec[eq + 1 ..] };
}

const Job = struct {
    deliver: bool,
    id: u64,
    status: i32 = 0,
    bytes: []u8,
};

/// Serves `HandlerType` (through the generated `Dispatcher`) as an asynchronous instance on
/// `server` (listening already) until shutdown; its host calls go to `targets`.
pub fn serveAsync(
    comptime HandlerType: type,
    comptime Dispatcher: type,
    server: *ipc_runtime.Server,
    targets: []const Target,
) !void {
    const Instance = async_host.AsyncInstance(HandlerType, Dispatcher);
    const State = struct {
        const Self = @This();
        mutex: std.Thread.Mutex = .{},
        has_jobs: std.Thread.Condition = .{},
        jobs: std.ArrayListUnmanaged(Job) = .{},
        responders: std.AutoHashMapUnmanaged(u64, ipc_runtime.Respond) = .{},
        callers: std.ArrayListUnmanaged(std.Thread) = .{},
        finished: bool = false,
        next_request: u64 = 0,
        targets: []const Target,

        fn post(self: *Self, job: Job) void {
            self.mutex.lock();
            defer self.mutex.unlock();
            self.jobs.append(alloc, job) catch @panic("out of memory");
            self.has_jobs.signal();
        }

        fn onRequest(self: *Self, _: i32, request: []const u8, respond: ipc_runtime.Respond) void {
            self.next_request += 1;
            const id = self.next_request;
            const bytes = alloc.dupe(u8, request) catch @panic("out of memory");
            {
                self.mutex.lock();
                defer self.mutex.unlock();
                self.responders.put(alloc, id, respond) catch @panic("out of memory");
            }
            self.post(.{ .deliver = false, .id = id, .bytes = bytes });
        }

        fn respondTo(ctx: ?*anyopaque, request_id: u64, response: [*]const u8, len: usize) callconv(.c) void {
            const self: *Self = @ptrCast(@alignCast(ctx.?));
            const respond = blk: {
                self.mutex.lock();
                defer self.mutex.unlock();
                break :blk (self.responders.fetchRemove(request_id) orelse return).value;
            };
            respond.send(response[0..len]);
        }

        fn callOut(ctx: ?*anyopaque, call_id: u64, target: [*]const u8, target_len: usize, request: [*]const u8, len: usize) callconv(.c) void {
            const self: *Self = @ptrCast(@alignCast(ctx.?));
            const name = alloc.dupe(u8, target[0..target_len]) catch @panic("out of memory");
            const bytes = alloc.dupe(u8, request[0..len]) catch @panic("out of memory");
            self.mutex.lock();
            defer self.mutex.unlock();
            const caller = std.Thread.spawn(.{}, Self.call, .{ self, call_id, name, bytes }) catch @panic("cannot start a thread");
            self.callers.append(alloc, caller) catch @panic("out of memory");
        }

        fn call(self: *Self, call_id: u64, name: []u8, request: []u8) void {
            defer alloc.free(name);
            defer alloc.free(request);
            const path = for (self.targets) |t| {
                if (std.mem.eql(u8, t.name, name)) break t.path;
            } else return self.fail(call_id, "no host-call target \"{s}\" (start the server with --host-call {s}=<path>)", .{ name, name });
            var client = ipc_runtime.Client.fromPath(alloc, path) catch |e|
                return self.fail(call_id, "{s}: {s}", .{ path, @errorName(e) });
            defer client.deinit();
            const answer = client.call(request) catch |e|
                return self.fail(call_id, "{s}: {s}", .{ path, @errorName(e) });
            self.post(.{ .deliver = true, .id = call_id, .bytes = answer });
        }

        fn fail(self: *Self, call_id: u64, comptime fmt: []const u8, args: anytype) void {
            const message = std.fmt.allocPrint(alloc, fmt, args) catch @panic("out of memory");
            self.post(.{ .deliver = true, .id = call_id, .status = 1, .bytes = message });
        }

        fn drive(self: *Self, instance: *Instance) void {
            while (true) {
                const job = blk: {
                    self.mutex.lock();
                    defer self.mutex.unlock();
                    while (self.jobs.items.len == 0) {
                        if (self.finished) return;
                        self.has_jobs.wait(&self.mutex);
                    }
                    break :blk self.jobs.orderedRemove(0);
                };
                defer alloc.free(job.bytes);
                if (job.deliver) {
                    instance.deliver(job.id, job.status, job.bytes);
                } else {
                    instance.submit(job.id, job.bytes);
                }
            }
        }
    };

    var state = State{ .targets = targets };
    const instance = try Instance.create(.{ .ctx = &state, .respond = State.respondTo, .call = State.callOut });
    defer instance.destroy();
    const driver = try std.Thread.spawn(.{}, State.drive, .{ &state, instance });
    server.runReactor(*State, &state, State.onRequest);
    // Every request has been answered, so every call has been delivered.
    {
        state.mutex.lock();
        defer state.mutex.unlock();
        state.finished = true;
        state.has_jobs.signal();
    }
    driver.join();
    for (state.callers.items) |caller| caller.join();
}
