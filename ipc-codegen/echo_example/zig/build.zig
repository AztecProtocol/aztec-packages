const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    const msgpack_dep = b.dependency("zig_msgpack", .{
        .target = target,
        .optimize = optimize,
    });
    const msgpack_mod = msgpack_dep.module("msgpack");

    const ipc_runtime_dep = b.dependency("ipc_runtime", .{
        .target = target,
        .optimize = optimize,
    });
    const ipc_runtime_mod = ipc_runtime_dep.module("ipc_runtime");

    // Echo server
    const server_exe = b.addExecutable(.{
        .name = "echo_server",
        .root_module = b.createModule(.{
            .root_source_file = b.path("src/echo_server.zig"),
            .target = target,
            .optimize = optimize,
        }),
    });
    server_exe.root_module.addImport("msgpack", msgpack_mod);
    server_exe.root_module.addImport("ipc_runtime", ipc_runtime_mod);
    b.installArtifact(server_exe);

    // Echo client
    const client_exe = b.addExecutable(.{
        .name = "echo_client",
        .root_module = b.createModule(.{
            .root_source_file = b.path("src/echo_client.zig"),
            .target = target,
            .optimize = optimize,
        }),
    });
    client_exe.root_module.addImport("msgpack", msgpack_mod);
    client_exe.root_module.addImport("ipc_runtime", ipc_runtime_mod);
    b.installArtifact(client_exe);

    // Golden wire-format conformance test (no transport, msgpack only)
    const golden_exe = b.addExecutable(.{
        .name = "golden_test",
        .root_module = b.createModule(.{
            .root_source_file = b.path("src/golden_test.zig"),
            .target = target,
            .optimize = optimize,
        }),
    });
    golden_exe.root_module.addImport("msgpack", msgpack_mod);
    b.installArtifact(golden_exe);

    // In-process round trip: the generated client over FfiBackend, against the
    // generated FFI entry exported from the same binary (libc for its buffers).
    const ffi_test_exe = b.addExecutable(.{
        .name = "ffi_test",
        .root_module = b.createModule(.{
            .root_source_file = b.path("src/ffi_test.zig"),
            .target = target,
            .optimize = optimize,
            .link_libc = true,
        }),
    });
    ffi_test_exe.root_module.addImport("msgpack", msgpack_mod);
    b.installArtifact(ffi_test_exe);
}
