/// FFI backend scaffold for direct library linking.
///
/// Calls a C symbol with msgpack bytes — no IPC overhead. Link against a
/// native library that exports `ipc_ffi_entry`, and adjust the link
/// configuration in your build.zig to pull that library in.
///
/// Satisfies the backend interface: call(request) -> response, destroy().
const std = @import("std");

extern fn ipc_ffi_entry(input: [*]const u8, input_len: usize, output: *[*]u8, output_len: *usize) void;

pub const FfiBackend = struct {
    /// Send a msgpack command and receive the response via FFI.
    pub fn call(self: *FfiBackend, request: []const u8) ![]u8 {
        _ = self;
        var out_ptr: [*]u8 = undefined;
        var out_len: usize = 0;
        ipc_ffi_entry(request.ptr, request.len, &out_ptr, &out_len);
        return out_ptr[0..out_len];
    }

    pub fn destroy(self: *FfiBackend) void {
        _ = self;
    }
};
