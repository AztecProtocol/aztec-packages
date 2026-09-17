// Format generated C++ in memory. clang-format reads the source on stdin and resolves the repo's
// `.clang-format` as if the text lived at `assumeFilename`, so the result matches what an in-tree
// `clang-format -i` would produce without touching the tree. Tries `clang-format-20` first
// (matches the repo's bash hook), then `clang-format`. A missing binary or formatter failure is
// an error.

import { spawnSync } from "node:child_process";

export function formatSource(source: string, assumeFilename: string): string {
    const candidates = ["clang-format-20", "clang-format"];
    for (const bin of candidates) {
        const result = spawnSync(bin, [`--assume-filename=${assumeFilename}`], {
            input: source,
            stdio: "pipe",
            maxBuffer: 64 * 1024 * 1024,
        });
        if (result.error && (result.error as NodeJS.ErrnoException).code === "ENOENT") {
            continue; // try next candidate
        }
        if (result.status !== 0) {
            const stderr = result.stderr?.toString() ?? "";
            throw new Error(`flavor-codegen: ${bin} failed on ${assumeFilename}:\n${stderr}`);
        }
        return result.stdout.toString("utf8");
    }
    throw new Error("flavor-codegen: install clang-format-20 or clang-format before generating headers");
}
