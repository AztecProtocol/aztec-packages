//! The echo handlers, shared by the socket server (echo_server.zig) and the
//! in-process FFI entry (ffi_test.zig).
const types = @import("generated/echo_types.zig");
const echo_server = @import("generated/echo_server.zig");

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
};
