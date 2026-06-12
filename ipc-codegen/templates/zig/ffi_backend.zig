/// FFI backend scaffold for direct library linking.
///
/// Calls a C symbol with msgpack bytes — no IPC overhead. Link against a
/// native library that exports `ipc_ffi_entry`, and adjust the link
/// configuration in your build.zig to pull that library in.
///
/// Satisfies the backend interface: call(request) -> response, destroy().
const std = @import("std");

extern fn ipc_ffi_entry(input: [*]const u8, input_len: usize, output: *[*]u8, output_len: *usize) void;

/// Allocator contract: callers free returned slices with this allocator
/// (the generated client uses std.heap.page_allocator), so the malloc'd FFI
/// buffer is copied into it and freed with the C allocator here — freeing a
/// malloc'd pointer with a Zig allocator is undefined behaviour.
const alloc = std.heap.page_allocator;

pub const FfiBackend = struct {
    /// Send a msgpack command and receive the response via FFI.
    pub fn call(self: *FfiBackend, request: []const u8) ![]u8 {
        _ = self;
        var out_ptr: [*]u8 = undefined;
        var out_len: usize = 0;
        ipc_ffi_entry(request.ptr, request.len, &out_ptr, &out_len);
        defer std.c.free(out_ptr);
        const response = try alloc.alloc(u8, out_len);
        @memcpy(response, out_ptr[0..out_len]);
        return response;
    }

    pub fn destroy(self: *FfiBackend) void {
        _ = self;
    }
};
