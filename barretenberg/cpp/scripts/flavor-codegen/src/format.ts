// Run clang-format in-place so the committed (formatted) files don't drift from a fresh regen.
// Tries `clang-format-20` first (matches the repo's bash hook), then `clang-format`. A missing
// binary is a warning, not an error.

import { spawnSync } from "node:child_process";

let warned = false;

export function formatInPlace(filePath: string): void {
    const candidates = ["clang-format-20", "clang-format"];
    for (const bin of candidates) {
        const result = spawnSync(bin, ["-i", filePath], { stdio: "pipe" });
        if (result.error && (result.error as NodeJS.ErrnoException).code === "ENOENT") {
            continue; // try next candidate
        }
        if (result.status !== 0) {
            const stderr = result.stderr?.toString() ?? "";
            process.stderr.write(`flavor-codegen: ${bin} failed on ${filePath}:\n${stderr}`);
        }
        return;
    }
    if (!warned) {
        process.stderr.write(
            "flavor-codegen: clang-format not found; generated files will drift from the committed " +
                "(clang-formatted) versions. Install clang-format-20 or clang-format.\n"
        );
        warned = true;
    }
}
