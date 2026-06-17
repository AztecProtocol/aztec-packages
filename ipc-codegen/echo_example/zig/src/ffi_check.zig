//! Compile coverage for the generated FFI backend. The real FFI symbol is
//! provided by whatever native library a consumer links; a stub satisfies
//! the linker here so the backend's code is fully analyzed and built.
const std = @import("std");
const ffi = @import("generated/ffi_backend.zig");

export fn ipc_ffi_entry(input: [*]const u8, input_len: usize, output: *[*]u8, output_len: *usize) void {
    _ = input;
    _ = input_len;
    output.* = undefined;
    output_len.* = 0;
}

pub fn main() void {
    comptime {
        std.testing.refAllDeclsRecursive(ffi);
    }
    std.debug.print("ffi_check: generated FFI backend compiles\n", .{});
}
