import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import { writeGenerated } from "./write.js";

// Already-formatted C++, so the assertions do not depend on which style clang-format resolves.
const source = "#pragma once\n\nnamespace bb {\nstruct Generated {};\n} // namespace bb\n";

function tmpHeader(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flavor-codegen-write-"));
    return path.join(dir, "generated", "x_generated.hpp");
}

test("creates a missing header and leaves no temp file behind", () => {
    const file = tmpHeader();
    assert.equal(writeGenerated(file, source), true);
    assert.equal(fs.readFileSync(file, "utf8"), source);
    assert.deepEqual(fs.readdirSync(path.dirname(file)), ["x_generated.hpp"]);
});

test("does not touch a header whose content is already current", () => {
    const file = tmpHeader();
    writeGenerated(file, source);
    const before = fs.statSync(file);
    assert.equal(writeGenerated(file, source), false);
    const after = fs.statSync(file);
    assert.equal(after.ino, before.ino);
    assert.equal(after.mtimeMs, before.mtimeMs);
});

test("replaces a stale header by renaming a complete file over it", () => {
    const file = tmpHeader();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "// stale\n", "utf8");
    const before = fs.statSync(file);
    assert.equal(writeGenerated(file, source), true);
    const after = fs.statSync(file);
    assert.notEqual(after.ino, before.ino, "content must arrive via rename, not by rewriting the inode in place");
    assert.equal(fs.readFileSync(file, "utf8"), source);
    assert.deepEqual(fs.readdirSync(path.dirname(file)), ["x_generated.hpp"]);
});
