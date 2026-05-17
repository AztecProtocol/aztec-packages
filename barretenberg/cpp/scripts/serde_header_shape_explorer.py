#!/usr/bin/env python3
"""Measure compiler cost of generated ACIR/msgpack header shapes."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import shlex
import subprocess
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Variant:
    name: str
    description: str
    source: str
    extra_files: dict[str, str] | None = None


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def cpp_root() -> Path:
    return Path(__file__).resolve().parents[1]


def count(pattern: str, text: str) -> int:
    return len(re.findall(pattern, text, flags=re.MULTILINE))


def strip_function_definitions(source: str, names: set[str], *, declarations: bool) -> str:
    output: list[str] = []
    i = 0
    while i < len(source):
        match = None
        for name in names:
            candidate = re.search(rf"\bvoid\s+{re.escape(name)}\s*\(", source[i:])
            if candidate and (match is None or candidate.start() < match.start()):
                match = candidate
        if match is None:
            output.append(source[i:])
            break

        start = i + match.start()
        output.append(source[i:start])
        brace = source.find("{", start)
        semicolon = source.find(";", start)
        if brace == -1 or (semicolon != -1 and semicolon < brace):
            output.append(source[start:semicolon + 1])
            i = semicolon + 1
            continue

        depth = 0
        j = brace
        while j < len(source):
            if source[j] == "{":
                depth += 1
            elif source[j] == "}":
                depth -= 1
                if depth == 0:
                    j += 1
                    break
            j += 1

        header = source[start:brace].rstrip()
        if declarations:
            output.append(header + ";\n")
        i = j
    return "".join(output)


def strip_serde_trait_specializations(source: str) -> str:
    marker = "\ntemplate <>\ntemplate <typename Serializer>"
    idx = source.find(marker)
    if idx == -1:
        return source
    return source[:idx] + "\n"


def strip_acir_helpers(source: str) -> str:
    start = source.find("namespace Acir {\nstruct Helpers {")
    if start == -1:
        return source
    end_marker = "\n} // namespace Acir\n"
    end = source.find(end_marker, start)
    if end == -1:
        return source
    return source[:start] + source[end + len(end_marker) :]


def use_light_serde(source: str) -> str:
    source = source.replace('#include "barretenberg/serialize/msgpack_impl.hpp"\n', "")
    source = source.replace('#include "serde.hpp"', '#include "serde_light.hpp"')
    return source


def light_serde_header() -> str:
    return """#pragma once

#include <array>
#include <cstdint>
#include <map>
#include <memory>
#include <optional>
#include <string>
#include <tuple>
#include <variant>
#include <vector>

namespace serde {

struct uint128_t {
    uint64_t high;
    uint64_t low;
    friend bool operator==(const uint128_t&, const uint128_t&) = default;
};

struct int128_t {
    int64_t high;
    uint64_t low;
    friend bool operator==(const int128_t&, const int128_t&) = default;
};

template <typename T> class value_ptr {
  public:
    value_ptr() = default;
    value_ptr(const T& value)
        : ptr_(new T{ value })
    {}
    value_ptr(const value_ptr& other)
        : ptr_(other ? new T{ *other } : nullptr)
    {}
    value_ptr& operator=(const value_ptr& other)
    {
        value_ptr temp{ other };
        std::swap(ptr_, temp.ptr_);
        return *this;
    }
    value_ptr(value_ptr&&) = default;
    value_ptr& operator=(value_ptr&&) = default;

    T& operator*() { return *ptr_; }
    const T& operator*() const { return *ptr_; }
    T* operator->() { return ptr_.get(); }
    const T* operator->() const { return ptr_.get(); }
    const T* get() const { return ptr_.get(); }
    explicit operator bool() const { return static_cast<bool>(ptr_); }

    template <typename U> friend bool operator==(const value_ptr<U>&, const value_ptr<U>&);

  private:
    std::unique_ptr<T> ptr_;
};

template <typename T> bool operator==(const value_ptr<T>& lhs, const value_ptr<T>& rhs)
{
    if (!lhs || !rhs) {
        return !lhs && !rhs;
    }
    return *lhs == *rhs;
}

} // namespace serde
"""


def make_variants(source: str) -> list[Variant]:
    no_pack = strip_function_definitions(source, {"msgpack_pack"}, declarations=False)
    no_msgpack = strip_function_definitions(source, {"msgpack_pack", "msgpack_unpack"}, declarations=False)
    decl_msgpack = strip_function_definitions(source, {"msgpack_pack", "msgpack_unpack"}, declarations=True)
    no_traits = strip_serde_trait_specializations(source)
    types_only = strip_serde_trait_specializations(no_msgpack)
    types_only_light = use_light_serde(strip_acir_helpers(types_only))
    return [
        Variant("current", "as generated today", source),
        Variant("no_pack_methods", "remove generated msgpack_pack method bodies", no_pack),
        Variant("decl_msgpack_methods", "declare msgpack methods but move bodies out of header", decl_msgpack),
        Variant("no_msgpack_methods", "remove generated pack and unpack method bodies", no_msgpack),
        Variant("no_serde_traits", "remove Serializable/Deserializable specializations", no_traits),
        Variant("types_only", "ACIR type declarations without generated msgpack methods or serde traits", types_only),
        Variant(
            "types_only_light_serde",
            "ACIR type declarations with a tiny serde support header and no msgpack include",
            types_only_light,
            {"serde_light.hpp": light_serde_header()},
        ),
    ]


def metrics(source: str) -> dict[str, int]:
    return {
        "bytes": len(source.encode()),
        "lines": source.count("\n") + 1,
        "variants": count(r"\bstd::variant\s*<", source),
        "visits": count(r"\bstd::visit\s*\(", source),
        "msgpack_pack": count(r"\bmsgpack_pack\s*\(", source),
        "msgpack_unpack": count(r"\bmsgpack_unpack\s*\(", source),
        "serializable": count(r"\bSerializable\s*<", source),
        "deserializable": count(r"\bDeserializable\s*<", source),
        "operators_eq": count(r"\boperator==\s*\(", source),
        "std_map": count(r"\bstd::map\s*<", source),
        "std_vector": count(r"\bstd::vector\s*<", source),
    }


def include_flags(build_dir: Path) -> list[str]:
    compile_commands = build_dir / "compile_commands.json"
    commands = json.loads(compile_commands.read_text())
    for entry in commands:
        if entry["file"].endswith("src/barretenberg/dsl/acir_format/acir_to_constraint_buf.cpp"):
            tokens = shlex.split(entry["command"])
            flags: list[str] = []
            for token in tokens:
                if token.startswith("-I") or token.startswith("-D"):
                    flags.append(token)
            return flags
    raise RuntimeError("could not find acir_to_constraint_buf.cpp in compile_commands.json")


def build_variant_tree(tmp: Path, variant: Variant, header: Path) -> Path:
    variant_root = tmp / variant.name
    serde_dir = variant_root / "barretenberg/dsl/acir_format/serde"
    serde_dir.mkdir(parents=True)
    source_serde_dir = header.parent
    for path in source_serde_dir.iterdir():
        if path.name == header.name:
            continue
        if path.is_file():
            shutil.copy2(path, serde_dir / path.name)
    for name, contents in (variant.extra_files or {}).items():
        (serde_dir / name).write_text(contents)
    (serde_dir / header.name).write_text(variant.source)
    tu = variant_root / "tu.cpp"
    tu.write_text('#include "barretenberg/dsl/acir_format/serde/acir.hpp"\nint main() { return 0; }\n')
    return tu


def time_syntax_only(command: list[str], repetitions: int) -> list[dict[str, float]]:
    samples: list[dict[str, float]] = []
    for _ in range(repetitions):
        start = time.perf_counter()
        proc = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        elapsed = time.perf_counter() - start
        if proc.returncode != 0:
            raise RuntimeError(proc.stderr[-4000:])
        samples.append({"wall_s": elapsed})
    return samples


def report_row(name: str, m: dict[str, int], samples: list[dict[str, float]]) -> str:
    wall = sum(sample["wall_s"] for sample in samples) / len(samples)
    return (
        f"| {name} | {wall:.3f} | {m['bytes']} | {m['lines']} | {m['variants']} | {m['visits']} | "
        f"{m['msgpack_pack']} | {m['msgpack_unpack']} | {m['serializable']} | {m['deserializable']} | "
        f"{m['operators_eq']} |"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--header",
        type=Path,
        default=cpp_root() / "src/barretenberg/dsl/acir_format/serde/acir.hpp",
    )
    parser.add_argument(
        "--build-dir",
        type=Path,
        default=cpp_root() / "build-bb-report-current-trace-no-pch",
    )
    parser.add_argument("--repetitions", type=int, default=1)
    parser.add_argument("--output", type=Path, default=Path("/tmp/acir-serde-header-shapes.md"))
    args = parser.parse_args()

    header = args.header.resolve()
    build_dir = args.build_dir.resolve()
    source = header.read_text()
    variants = make_variants(source)
    flags = include_flags(build_dir)

    tmp = Path(tempfile.mkdtemp(prefix="acir-header-shapes-"))
    rows: list[str] = []
    details: list[str] = []
    try:
        for variant in variants:
            tu = build_variant_tree(tmp, variant, header)
            command = [
                "/usr/bin/clang++",
                f"-I{tmp / variant.name}",
                *flags,
                f"-I{cpp_root() / 'src'}",
                "-std=gnu++20",
                "-fsyntax-only",
                "-Wno-unused-command-line-argument",
                "-Wno-everything",
                str(tu),
            ]
            samples = time_syntax_only(command, args.repetitions)
            rows.append(report_row(variant.name, metrics(variant.source), samples))
            details.append(f"- `{variant.name}`: {variant.description}")
    finally:
        shutil.rmtree(tmp)

    report = [
        "# ACIR Serde Header Shape Explorer",
        "",
        f"- Header: `{header}`",
        f"- Build dir: `{build_dir}`",
        f"- Repetitions: `{args.repetitions}`",
        "",
        "## Variants",
        *details,
        "",
        "## Syntax-Only Compile Cost",
        "",
        "| variant | mean wall s | bytes | lines | variants | visits | pack | unpack | Serializable | Deserializable | operator== |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
        *rows,
        "",
    ]
    args.output.write_text("\n".join(report))
    print(args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
