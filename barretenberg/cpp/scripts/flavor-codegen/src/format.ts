// Run clang-format in-place so the committed (formatted) files don't drift from a fresh regen.
// Tries `clang-format-20` first (matches the repo's bash hook), then `clang-format`. A missing
// binary or formatter failure is an error.

import { spawnSync } from "node:child_process";

export function formatInPlace(filePath: string): void {
    const candidates = ["clang-format-20", "clang-format"];
    for (const bin of candidates) {
        const result = spawnSync(bin, ["-i", filePath], { stdio: "pipe" });
        if (result.error && (result.error as NodeJS.ErrnoException).code === "ENOENT") {
            continue; // try next candidate
        }
        if (result.status !== 0) {
            const stderr = result.stderr?.toString() ?? "";
            throw new Error(`flavor-codegen: ${bin} failed on ${filePath}:\n${stderr}`);
        }
        return;
    }
    throw new Error("flavor-codegen: install clang-format-20 or clang-format before generating headers");
}
