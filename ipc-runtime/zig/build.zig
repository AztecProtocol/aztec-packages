const std = @import("std");

/// Build the ipc-runtime C++ sources into a static archive that Zig owns.
/// We compile the same .cpp files barretenberg / cargo do, but with Zig's
/// bundled clang + libc++. The archive lives in Zig's build cache and is
/// internally consistent with whatever libc++ the final Zig binary links.
/// No prebuilt artifact, no IPC_RUNTIME_LIB_DIR.
pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    const cpp_root = b.path("../cpp");

    // Build the runtime sources into a static library Zig owns. Same .cpp
    // files barretenberg and cargo compile, but here through Zig's bundled
    // clang + libc++ — internally consistent with whatever the final Zig
    // binary links.
    const runtime_mod = b.createModule(.{
        .target = target,
        .optimize = optimize,
        .link_libc = true,
        .link_libcpp = true,
    });
    runtime_mod.addIncludePath(cpp_root);
    runtime_mod.addCSourceFiles(.{
        .root = cpp_root,
        .files = &.{
            "ipc_runtime/c_abi.cpp",
            "ipc_runtime/ipc_client.cpp",
            "ipc_runtime/ipc_server.cpp",
            "ipc_runtime/serve_helper.cpp",
            "ipc_runtime/signal_handlers.cpp",
            "ipc_runtime/socket_client.cpp",
            "ipc_runtime/socket_server.cpp",
            "ipc_runtime/shm/mpsc_shm.cpp",
            "ipc_runtime/shm/spsc_shm.cpp",
        },
        .flags = &.{ "-std=c++20", "-fPIC" },
    });
    const runtime = b.addLibrary(.{
        .name = "ipc_runtime",
        .linkage = .static,
        .root_module = runtime_mod,
    });

    // Module others can @import("ipc_runtime") from their build.zig.
    const mod = b.addModule("ipc_runtime", .{
        .root_source_file = b.path("src/main.zig"),
        .target = target,
        .optimize = optimize,
        .link_libc = true,
        .link_libcpp = true,
    });
    mod.addIncludePath(cpp_root);
    mod.linkLibrary(runtime);

    // Smoke executable so `zig build` produces something verifiable.
    const smoke = b.addExecutable(.{
        .name = "ipc_runtime_smoke",
        .root_module = b.createModule(.{
            .root_source_file = b.path("src/smoke.zig"),
            .target = target,
            .optimize = optimize,
            .link_libc = true,
            .link_libcpp = true,
        }),
    });
    smoke.root_module.addImport("ipc_runtime", mod);
    smoke.linkLibrary(runtime);
    b.installArtifact(smoke);
}
