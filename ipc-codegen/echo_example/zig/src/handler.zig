//! The echo handlers, shared by the socket server (echo_server.zig) and the
//! in-process FFI (ffi_test.zig).
const std = @import("std");
const types = @import("generated/echo_types.zig");
const echo_server = @import("generated/echo_server.zig");
const echo_client = @import("generated/echo_client.zig");

const alloc = std.heap.page_allocator;

/// What a Relay needs once "peer" answers: where its own response goes.
const RelayState = struct {
    respond: echo_server.Responder(types.EchoRelayResponse),

    fn done(self: *RelayState, result: echo_client.AsyncResult(types.EchoRelayResponse)) void {
        defer alloc.destroy(self);
        switch (result) {
            .ok => |response| self.respond.ok(response),
            .failed => |message| self.respond.err(message),
        }
    }
};

pub const EchoHandler = struct {
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

    /// Calls "peer" with one more byte and one hop fewer, and answers with what
    /// comes back. Zig has no async/await, so the rest of the handler is
    /// RelayState.done, run when the host delivers the answer; on an
    /// asynchronous instance the instance takes other requests meanwhile (the
    /// next hop among them, when "peer" leads back here).
    pub fn relay(self: *EchoHandler, cmd: types.EchoRelay, respond: *echo_server.Responder(types.EchoRelayResponse)) void {
        _ = self;
        if (cmd.hops == 0) return respond.ok(.{ .data = cmd.data });
        const data = alloc.alloc(u8, cmd.data.len + 1) catch return respond.err("out of memory");
        @memcpy(data[0..cmd.data.len], cmd.data);
        data[cmd.data.len] = @intCast(cmd.hops);
        const state = alloc.create(RelayState) catch return respond.err("out of memory");
        state.* = .{ .respond = respond.keep() };
        echo_client.AsyncClient.init("peer").relay(.{ .data = data, .hops = cmd.hops - 1 }, state, RelayState.done);
    }
};
