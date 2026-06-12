//! Zig binding to ipc-runtime — UDS + MPSC-SHM transport.
//!
//! `Server.fromPath(path)` / `Client.fromPath(path)` pick UDS vs MPSC-SHM
//! by the path suffix (`.sock` → UDS, `.shm` → SHM). Same call/listen/run
//! methods across transports. See ipc-runtime/cpp/ipc_runtime/c_abi.h for
//! the underlying C ABI.
//!
//! Zig's build.zig compiles the C++ sources directly with the bundled
//! clang + libc++, so there's no prebuilt-archive dependency.

const std = @import("std");

const c = @cImport({
    @cInclude("ipc_runtime/c_abi.h");
});

/// 0 = infinite, matching the C ABI's unified timeout semantics. `call`
/// blocks until the reply arrives.
const default_call_timeout_ns: u64 = 0;

pub const Error = error{
    InvalidPath,
    Connect,
    Listen,
    Send,
    Receive,
};

/// Server handle. `deinit` releases the underlying C++ object.
pub const Server = struct {
    handle: *c.ipc_server,

    pub fn fromPath(path: [:0]const u8) Error!Server {
        const raw = c.ipc_make_server(path.ptr, null);
        if (raw == null) return Error.InvalidPath;
        return .{ .handle = raw.? };
    }

    pub fn deinit(self: *Server) void {
        c.ipc_server_close(self.handle);
        c.ipc_server_destroy(self.handle);
    }

    pub fn listen(self: *Server) Error!void {
        if (!c.ipc_server_listen(self.handle)) return Error.Listen;
    }

    pub fn requestShutdown(self: *Server) void {
        c.ipc_server_request_shutdown(self.handle);
    }

    pub fn installDefaultSignalHandlers(self: *Server) void {
        c.ipc_install_default_signal_handlers(self.handle);
    }

    /// Run the event loop. `handler` is invoked per request; its return slice
    /// must remain valid until the next call (a per-context arena works well).
    pub fn run(
        self: *Server,
        comptime Ctx: type,
        ctx: Ctx,
        handler: *const fn (ctx: Ctx, client_id: i32, req: []const u8) []u8,
    ) void {
        const Bridge = struct {
            ctx: Ctx,
            handler: *const fn (ctx: Ctx, client_id: i32, req: []const u8) []u8,

            fn shim(
                client_id: c_int,
                req: [*c]const u8,
                req_len: usize,
                resp_out: [*c][*c]u8,
                resp_len_out: [*c]usize,
                ctx_raw: ?*anyopaque,
            ) callconv(.c) void {
                const bridge: *@This() = @ptrCast(@alignCast(ctx_raw.?));
                const req_slice = if (req_len == 0) &[_]u8{} else req[0..req_len];
                const resp = bridge.handler(bridge.ctx, @intCast(client_id), req_slice);
                resp_out[0] = @constCast(resp.ptr);
                resp_len_out[0] = resp.len;
            }
        };
        var bridge = Bridge{ .ctx = ctx, .handler = handler };
        c.ipc_server_run(self.handle, Bridge.shim, &bridge);
    }
};

/// Client handle. `deinit` releases the underlying C++ object.
pub const Client = struct {
    handle: *c.ipc_client,
    allocator: std.mem.Allocator,

    /// Open a client connection. `.sock` → UDS, `.shm` → MPSC-SHM (slot 0;
    /// use `fromPathWithId` for a different slot).
    pub fn fromPath(allocator: std.mem.Allocator, path: [:0]const u8) Error!Client {
        return fromPathWithId(allocator, path, 0);
    }

    pub fn fromPathWithId(allocator: std.mem.Allocator, path: [:0]const u8, shm_client_id: usize) Error!Client {
        const raw = c.ipc_make_client(path.ptr, shm_client_id);
        if (raw == null) return Error.InvalidPath;
        const client = Client{ .handle = raw.?, .allocator = allocator };
        if (!c.ipc_client_connect(client.handle)) {
            c.ipc_client_destroy(client.handle);
            return Error.Connect;
        }
        return client;
    }

    pub fn deinit(self: *Client) void {
        c.ipc_client_close(self.handle);
        c.ipc_client_destroy(self.handle);
    }

    /// Alias for deinit() so Client satisfies the ipc-codegen Backend
    /// contract (which expects `destroy(self: *T) void`). Generated typed
    /// clients call `backend.destroy()` at end-of-life.
    pub fn destroy(self: *Client) void {
        self.deinit();
    }

    /// Synchronous request/response. Returns an owned slice (free with the
    /// allocator passed at construction). A zero-length reply is a valid
    /// empty slice, not an error.
    pub fn call(self: *Client, request: []const u8) ![]u8 {
        if (!c.ipc_client_send(self.handle, request.ptr, request.len, default_call_timeout_ns)) {
            return Error.Send;
        }
        var out_ptr: [*c]const u8 = null;
        var out_len: usize = 0;
        const status = c.ipc_client_receive(self.handle, default_call_timeout_ns, &out_ptr, &out_len);
        if (status != c.IPC_OK) {
            return Error.Receive;
        }
        // IPC_OK with out_len == 0 is a valid zero-length response; release
        // must still run (it consumes the frame header for SHM).
        const copied = try self.allocator.alloc(u8, out_len);
        if (out_len > 0) {
            @memcpy(copied, out_ptr[0..out_len]);
        }
        c.ipc_client_release(self.handle, out_len);
        return copied;
    }
};
