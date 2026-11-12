import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const toml = path.resolve(import.meta.dirname, "../../netlify.toml");

type Redirect = { line: number; from?: string; to?: string; status?: number };

/**
 * The `[[redirects]]` blocks of a netlify.toml. Reads only the subset the file uses (`from`/`to` as plain
 * double-quoted strings, an integer `status`, comments) and throws on any other line inside a block, so a
 * new key or syntax extends this reader instead of slipping past the checks.
 */
function readRedirects(text: string): Redirect[] {
  const redirects: Redirect[] = [];
  let current: Redirect | undefined;
  text.split("\n").forEach((raw, i) => {
    const row = raw.trim();
    const fail = (why: string) => {
      throw new Error(`netlify.toml:${i + 1}: ${why}, extend readRedirects: ${row}`);
    };
    if (/^\[\[\s*redirects\s*\]\]\s*(#.*)?$/.test(row)) redirects.push((current = { line: i + 1 }));
    else if (row === "" || row.startsWith("#")) return;
    else if (row.startsWith("[")) {
      // Any other spelling (quoted, dotted, single brackets) would declare rules this reader skips.
      if (row.replace(/#[^\]"']*$/, "").includes("redirects")) fail("unsupported redirect table");
      current = undefined;
    } else if (!current && /^["']?redirects\b/.test(row)) fail("unsupported redirects key");
    else if (current) {
      const m = row.match(/^(from|to)\s*=\s*"([^"\\]*)"$|^(status)\s*=\s*(\d+)$/);
      if (!m) fail("unsupported line");
      const [key, value] = m[1] ? [m[1], m[2]] : [m[3], Number(m[4])];
      if (key in current) fail(`duplicate ${key}`);
      Object.assign(current, { [key]: value });
    }
  });
  return redirects;
}

// Netlify matches a path with or without its trailing slash, and a target's query or anchor does not change the path.
const route = (p: string) => p.replace(/[?#].*$/, "").replace(/(.)\/+$/, "$1");

/** Rules Netlify can never apply, or that send a reader through a second redirect, as `netlify.toml:<line>: <why>`. */
function redirectProblems(redirects: Redirect[]): string[] {
  const problems: string[] = [];
  const first = new Map<string, number>();
  for (const { line, from, to } of redirects) {
    if (from === undefined || to === undefined) problems.push(`netlify.toml:${line}: needs both from and to`);
    else if (!from.startsWith("/")) problems.push(`netlify.toml:${line}: from "${from}" must start with /, or it never matches`);
    else if (first.has(route(from))) problems.push(`netlify.toml:${line}: from "${from}" repeats line ${first.get(route(from))}, whose rule wins`);
    else first.set(route(from), line);
  }
  for (const { line, to } of redirects) {
    const target = to === undefined ? undefined : route(to);
    if (target !== undefined && first.has(target)) {
      problems.push(`netlify.toml:${line}: to "${to}" is redirected again by line ${first.get(target)}: point at its final target`);
    }
  }
  return problems;
}

test("readRedirects reads the file's subset and refuses anything else", () => {
  const text = [
    "[build]",
    '  command = "exit 1"',
    "[[redirects]]",
    "  # a comment",
    '  from= "/a"',
    '  to = "/b"',
    "  status = 301",
    "",
    "[[headers]] # headers, not redirects",
    '  for = "/*"',
  ].join("\n");
  assert.deepEqual(readRedirects(text), [{ line: 3, from: "/a", to: "/b", status: 301 }]);
  const rows = ["force = true", 'from = "/a" # x', "from = '/a'", 'query = { a = ":a" }', "[redirects.headers]", 'to = "/c"', '[["redirects"]]', "[ redirects ]"];
  for (const row of rows) assert.throws(() => readRedirects(`[[redirects]]\nto = "/b"\n${row}`), /extend readRedirects/, row);
  assert.throws(() => readRedirects('redirects = [{ from = "a", to = "/b" }]'), /extend readRedirects/);
});

test("redirectProblems flags rules that never match, repeat or chain", () => {
  const rules = [
    { line: 1, from: "/a", to: "/b" },
    { line: 2, from: "c", to: "/d" },
    { line: 3, from: "/a", to: "/e" },
    { line: 4, from: "/b", to: "/f" },
    { line: 5, from: "/g", to: "/b#anchor" },
    { line: 6, from: "/h/*", to: "/f/:splat" },
    { line: 7, to: "/f" },
    { line: 8, from: "/g/", to: "/f" },
    { line: 9, from: "/i", to: "/b/" },
    { line: 10, from: "/j", to: "/b?lang=en" },
  ];
  assert.deepEqual(redirectProblems(rules), [
    'netlify.toml:2: from "c" must start with /, or it never matches',
    'netlify.toml:3: from "/a" repeats line 1, whose rule wins',
    "netlify.toml:7: needs both from and to",
    'netlify.toml:8: from "/g/" repeats line 5, whose rule wins',
    'netlify.toml:1: to "/b" is redirected again by line 4: point at its final target',
    'netlify.toml:5: to "/b#anchor" is redirected again by line 4: point at its final target',
    'netlify.toml:9: to "/b/" is redirected again by line 4: point at its final target',
    'netlify.toml:10: to "/b?lang=en" is redirected again by line 4: point at its final target',
  ]);
});

test("netlify.toml redirects all match, none repeats and none chains", () => {
  const redirects = readRedirects(fs.readFileSync(toml, "utf8"));
  assert.ok(redirects.length > 100, `read ${redirects.length} redirects`);
  assert.deepEqual(redirectProblems(redirects), []);
});
