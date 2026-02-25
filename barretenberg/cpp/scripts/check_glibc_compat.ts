#!/usr/bin/env -S node --experimental-strip-types --no-warnings
// Checks that ELF binaries don't require a glibc version newer than the specified maximum.
//
// Usage: check_glibc_compat.ts <max_glibc_version> <binary> [binary...]
// Example: check_glibc_compat.ts 2.35 build-zig-amd64-linux/bin/bb

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error(
    "Usage: check_glibc_compat.ts <max_glibc_version> <binary> [binary...]"
  );
  process.exit(1);
}

const maxVersion = args[0];
const binaries = args.slice(1);

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

let exitCode = 0;

for (const binary of binaries) {
  if (!existsSync(binary)) {
    console.log(`WARNING: ${binary} not found, skipping`);
    continue;
  }

  const fileOutput = execSync(`file ${binary}`, { encoding: "utf-8" });
  if (!fileOutput.includes("ELF")) {
    console.log(`SKIP: ${binary} is not an ELF binary`);
    continue;
  }

  let readelfOutput: string;
  try {
    readelfOutput = execSync(`readelf -V ${binary} 2>/dev/null`, {
      encoding: "utf-8",
    });
  } catch {
    readelfOutput = "";
  }

  const glibcVersions = [
    ...new Set(
      [...readelfOutput.matchAll(/GLIBC_([0-9.]+)/g)].map((m) => m[1])
    ),
  ].sort(compareVersions);

  if (glibcVersions.length === 0) {
    console.log(
      `OK: ${binary} - no glibc version requirements (statically linked?)`
    );
    continue;
  }

  const maxRequired = glibcVersions[glibcVersions.length - 1];

  if (compareVersions(maxRequired, maxVersion) <= 0) {
    console.log(
      `OK: ${binary} - max glibc required: ${maxRequired} (<= ${maxVersion})`
    );
  } else {
    console.log(
      `FAIL: ${binary} - requires glibc ${maxRequired} (exceeds max ${maxVersion})`
    );
    console.log(`  Required versions: ${glibcVersions.join(" ")}`);
    exitCode = 1;
  }
}

if (exitCode === 0) {
  console.log(`\nAll binaries are compatible with glibc <= ${maxVersion}`);
} else {
  console.log(
    `\nERROR: Some binaries require a glibc version newer than ${maxVersion}`
  );
}

process.exit(exitCode);
