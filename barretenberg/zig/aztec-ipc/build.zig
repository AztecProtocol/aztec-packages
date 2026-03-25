const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    // zig-msgpack dependency
    const msgpack_dep = b.dependency("zig_msgpack", .{
        .target = target,
        .optimize = optimize,
    });
    const msgpack_mod = msgpack_dep.module("msgpack");

    // Main library module (importable by downstream projects)
    const lib_mod = b.addModule("aztec-ipc", .{
        .root_source_file = b.path("src/root.zig"),
        .target = target,
        .optimize = optimize,
    });
    lib_mod.addImport("msgpack", msgpack_mod);

    // Unit tests
    const tests = b.addTest(.{
        .root_module = b.createModule(.{
            .root_source_file = b.path("src/root.zig"),
            .target = target,
            .optimize = optimize,
        }),
    });
    tests.root_module.addImport("msgpack", msgpack_mod);

    const run_tests = b.addRunArtifact(tests);
    const test_step = b.step("test", "Run unit tests");
    test_step.dependOn(&run_tests.step);
}
