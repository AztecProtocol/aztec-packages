const std = @import("std");

/// Build the ipc-runtime C++ sources into a static archive that Zig owns.
/// We compile the same .cpp files other consumers do, but with Zig's
/// bundled clang + libc++. The archive lives in Zig's build cache and is
/// internally consistent with whatever libc++ the final Zig binary links.
/// No prebuilt artifact, no IPC_RUNTIME_LIB_DIR.
pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    const cpp_root = b.path("../cpp");

    // Build the runtime sources into a static library Zig owns. Same .cpp
    // files other consumers compile, but here through Zig's bundled clang +
    // libc++ — internally consistent with whatever the final Zig binary
    // links.
    const runtime_mod = b.createModule(.{
        .target = target,
        .optimize = optimize,
        .link_libc = true,
        .link_libcpp = true,
    });
    runtime_mod.addIncludePath(cpp_root);
    runtime_mod.addCSourceFiles(.{
        .root = cpp_root,
        .files = collectCppSources(b, cpp_root, "ipc_runtime"),
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

/// Every non-test .cpp under the runtime's source tree, relative to `root`.
///
/// Discovered rather than listed: a hand-maintained copy of the CMake target's
/// sources silently drifts when a file is added there, and the symptom is an
/// undefined symbol at link time in whichever consumer links this archive, far
/// from the change that caused it.
fn collectCppSources(b: *std.Build, root: std.Build.LazyPath, subdir: []const u8) []const []const u8 {
    var files: std.ArrayList([]const u8) = .empty;
    // Only the runtime's own sources: cpp/ also holds the NAPI addon (needs
    // node headers) and CMake build directories.
    const root_path = b.pathJoin(&.{ root.getPath(b), subdir });
    var dir = std.fs.cwd().openDir(root_path, .{ .iterate = true }) catch |err|
        std.debug.panic("cannot open {s}: {s}", .{ root_path, @errorName(err) });
    defer dir.close();
    var walker = dir.walk(b.allocator) catch @panic("out of memory");
    defer walker.deinit();
    while (walker.next() catch @panic("failed walking ipc-runtime sources")) |entry| {
        if (entry.kind != .file) continue;
        if (!std.mem.endsWith(u8, entry.path, ".cpp")) continue;
        if (std.mem.endsWith(u8, entry.path, ".test.cpp")) continue;
        // Paths are relative to `root`, which is what addCSourceFiles expects.
        files.append(b.allocator, b.pathJoin(&.{ subdir, entry.path })) catch @panic("out of memory");
    }
    if (files.items.len == 0) std.debug.panic("no C++ sources under {s}", .{root_path});
    return files.toOwnedSlice(b.allocator) catch @panic("out of memory");
}
