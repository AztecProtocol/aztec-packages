//! Asynchronous instances: a service whose handlers call out to another service
//! (a host call) and answer once the call comes back, while the instance keeps
//! taking requests.
//!
//! Zig has no async/await, so a call out takes a continuation: the state the
//! handler needs afterwards (its Responder, a copy of which carries where the
//! response goes) and a function to run with the answer. With the generated
//! AsyncClient:
//!
//!     pub fn relay(self: *Self, cmd: types.Relay, respond: *Responder(types.RelayResponse)) void {
//!         const state = alloc.create(RelayState) catch return respond.err("out of memory");
//!         state.* = .{ .respond = respond.* };
//!         PeerAsyncClient.init("peer").relay(.{ ... }, state, RelayState.done);
//!     }
//!
//! On an AsyncInstance, the call hands the host a call (call id, target,
//! request) and returns; the instance returns to its host, which may submit
//! further requests (one the call itself leads to, nested on the same
//! instance, included). The host's answer comes back through
//! AsyncInstance.deliver, which runs the continuation. Everything runs on the
//! thread driving the instance, inside submit() and deliver(), so a handler
//! needs no locking and no threads.
//!
//! Anywhere else (a blocking FFI call, a server answering one request at a
//! time), there is no instance to call out from: the continuation runs at once
//! with an error answer.
const std = @import("std");

const alloc = std.heap.page_allocator;

/// A native host's two callbacks, which take borrowed bytes and may be called on any thread.
pub const RespondFn = *const fn (ctx: ?*anyopaque, request_id: u64, response: [*]const u8, len: usize) callconv(.c) void;
pub const CallFn = *const fn (ctx: ?*anyopaque, call_id: u64, target: [*]const u8, target_len: usize, request: [*]const u8, request_len: usize) callconv(.c) void;

pub const Host = struct {
    ctx: ?*anyopaque,
    respond: RespondFn,
    call: CallFn,
};

/// A host call's answer: the service's response bytes (an error response included), or the
/// host's message saying why the call never reached a service. Valid only during the continuation.
pub const Answer = union(enum) {
    ok: []const u8,
    failed: []const u8,
};

pub const Continuation = struct {
    ctx: *anyopaque,
    run: *const fn (ctx: *anyopaque, answer: Answer) void,
};

/// One instance's calls out, awaiting their answers by call id.
const Driver = struct {
    host: Host,
    next_call: u64 = 0,
    calls: std.AutoHashMapUnmanaged(u64, Continuation) = .{},
};

/// The instance this thread is driving, inside its submit() or deliver().
threadlocal var current: ?*Driver = null;

/// Calls the service the host binds to `target`; `then` runs with the answer, later on an
/// asynchronous instance and at once (failed) anywhere else.
pub fn hostCall(target: []const u8, request: []const u8, then: Continuation) void {
    const driver = current orelse
        return then.run(then.ctx, .{ .failed = "no asynchronous instance to call out from" });
    const call_id = driver.next_call;
    driver.next_call += 1;
    driver.calls.put(alloc, call_id, then) catch
        return then.run(then.ctx, .{ .failed = "out of memory" });
    driver.host.call(driver.host.ctx, call_id, target.ptr, target.len, request.ptr, request.len);
}

/// The byte-level response sink the generated Dispatcher.submitRequest takes.
pub const RawRespond = struct {
    ctx: *anyopaque,
    respond: *const fn (ctx: *anyopaque, response: []const u8) void,

    pub fn send(self: RawRespond, response: []const u8) void {
        self.respond(self.ctx, response);
    }
};

/// An instance of a service driven without blocking: requests go in through submit(), answers to
/// its host calls through deliver(), and its responses and calls out go to its Host. One thread at a
/// time drives it, and the host never calls into it from inside its callbacks. `Dispatcher` is the
/// generated <service>_server.Dispatcher(Handler).
pub fn AsyncInstance(comptime HandlerType: type, comptime Dispatcher: type) type {
    return struct {
        const Self = @This();
        handler: HandlerType = .{},
        dispatcher: Dispatcher = undefined,
        driver: Driver,

        pub fn create(host: Host) !*Self {
            const self = try std.heap.c_allocator.create(Self);
            self.* = .{ .driver = .{ .host = host } };
            self.dispatcher = Dispatcher.init(&self.handler);
            return self;
        }

        /// Calls still out never get their continuations run.
        pub fn destroy(self: *Self) void {
            self.driver.calls.deinit(alloc);
            std.heap.c_allocator.destroy(self);
        }

        const Request = struct {
            host: Host,
            id: u64,

            fn respond(ctx: *anyopaque, response: []const u8) void {
                const request: *Request = @ptrCast(@alignCast(ctx));
                request.host.respond(request.host.ctx, request.id, response.ptr, response.len);
                alloc.destroy(request);
            }
        };

        /// Runs a request, answered (now or once its host calls are answered) through the host's respond.
        pub fn submit(self: *Self, request_id: u64, request: []const u8) void {
            const previous = current;
            current = &self.driver;
            defer current = previous;
            const pending = alloc.create(Request) catch @panic("out of memory");
            pending.* = .{ .host = self.driver.host, .id = request_id };
            self.dispatcher.submitRequest(request, .{ .ctx = pending, .respond = Request.respond });
        }

        /// The host's answer to call `call_id`: 0 and the service's response, or non-zero and the
        /// host's message saying why the call never reached a service.
        pub fn deliver(self: *Self, call_id: u64, status: i32, response: []const u8) void {
            const previous = current;
            current = &self.driver;
            defer current = previous;
            const then = (self.driver.calls.fetchRemove(call_id) orelse return).value;
            then.run(then.ctx, if (status == 0) .{ .ok = response } else .{ .failed = response });
        }
    };
}
