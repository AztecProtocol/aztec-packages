// Write a generated header without ever exposing a partial file.
//
// `test.sh` runs the generator as a CI test, and the CI test engine starts while the slower
// barretenberg presets (fuzzing, asan) are still compiling translation units that include these
// headers. A truncate-and-rewrite of a header — `fs.writeFileSync` on the tree, or
// `clang-format -i` — hands a concurrently running compiler an empty or half-written file: clang
// then reports the class the header defines as an unknown name, or dies with SIGBUS when the
// mapping it holds is truncated underneath it. So the write is never done in place:
//
//   1. the source is formatted in memory, not by rewriting the file on disk;
//   2. a file whose content is already current is left untouched — in CI, where the run only
//      confirms there is no drift, nothing on disk changes at all;
//   3. otherwise the content goes to a sibling temp file that is renamed over the target. On POSIX
//      the rename is atomic, so any reader sees either the old file or the new one, never a mix.

import * as fs from "node:fs";
import * as path from "node:path";

import { formatSource } from "./format.js";

/** Returns true when the file on disk was replaced, false when it was already up to date. */
export function writeGenerated(outFile: string, source: string): boolean {
    const formatted = formatSource(source, outFile);
    if (fs.existsSync(outFile) && fs.readFileSync(outFile, "utf8") === formatted) {
        return false;
    }
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    const tmpFile = `${outFile}.${process.pid}.tmp`;
    try {
        fs.writeFileSync(tmpFile, formatted, "utf8");
        fs.renameSync(tmpFile, outFile);
    } catch (err) {
        fs.rmSync(tmpFile, { force: true });
        throw err;
    }
    return true;
}
