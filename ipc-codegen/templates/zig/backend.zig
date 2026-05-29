/// Backend abstraction — comptime interface for transport.
///
/// A valid backend type must provide:
///   fn call(self: *T, request: []const u8) ![]u8
///   fn destroy(self: *T) void
///
/// Implementations:
///   ipc_runtime.Client — UDS / MPSC-SHM transport from ipc-runtime/zig
///   FfiBackend (ffi_backend.zig) — Direct C FFI linking
///
/// Usage with the generated client:
///   const Client = @import("my_service_client.zig").Client;
///   const ipc_runtime = @import("ipc_runtime");
///   var backend = try ipc_runtime.Client.fromPath(allocator, "/tmp/my-service.sock");
///   var client = Client(ipc_runtime.Client){ .backend = &backend };

/// Compile-time check that a type satisfies the backend interface.
pub fn assertBackend(comptime T: type) void {
    // Must have: fn call(self: *T, request: []const u8) ![]u8
    if (!@hasDecl(T, "call")) {
        @compileError("Backend type " ++ @typeName(T) ++ " missing 'call' method");
    }
    // Must have: fn destroy(self: *T) void
    if (!@hasDecl(T, "destroy")) {
        @compileError("Backend type " ++ @typeName(T) ++ " missing 'destroy' method");
    }
}
