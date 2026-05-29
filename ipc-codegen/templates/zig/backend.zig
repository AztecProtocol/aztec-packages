/// Backend abstraction — comptime interface for transport.
///
/// A valid backend type must provide:
///   fn call(self: *T, request: []const u8) ![]u8
///   fn destroy(self: *T) void
///
/// Implementations:
///   UdsBackend (uds_backend.zig) — Unix Domain Socket IPC
///   FfiBackend (ffi_backend.zig) — Direct C FFI linking
///
/// Usage with the generated client:
///   const Client = @import("wsdb_client.zig").Client;
///   const UdsBackend = @import("uds_backend.zig").UdsBackend;
///   var backend = try UdsBackend.connect("/tmp/wsdb.sock");
///   var client = Client(UdsBackend){ .backend = &backend };

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
