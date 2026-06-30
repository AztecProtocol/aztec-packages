#!/usr/bin/env python3
"""Assemble a combined inlined view of one example kernel/rollup chain.

NOT a compilable artifact: it concatenates the inlined `main` of each stage in
composition order, joined by comments describing the databus hand-offs, plus a
single deduplicated appendix of helper definitions. Purpose is cross-circuit
(P8) reading — spotting constraints that should span a hand-off but are owned by
no single circuit. Any candidate finding must be verified against the real
per-circuit source / artifacts.
"""
import re
from pathlib import Path

FLAT = Path(__file__).resolve().parent
OUT = FLAT / "output"

# (artifact basename, stage label, join description from the previous stage)
STAGES = [
    ("private-kernel-init", "init", None),
    ("private-kernel-inner", "inner_1",
     "init.return_data (PrivateKernelCircuitPublicInputs) == inner.call_data(0)"),
    ("private-kernel-reset", "reset",
     "inner.return_data == reset.call_data(0)"),
    ("private-kernel-inner", "inner_2",
     "reset.return_data == inner.call_data(0)"),
    ("private-kernel-reset-tail-to-public", "reset_tail_to_public",
     "inner.return_data == reset_tail_to_public.call_data(0)"),
    ("hiding-kernel-to-public", "hiding_to_public",
     "reset_tail_to_public.return_data (PrivateToPublicKernelCircuitPublicInputs) "
     "== hiding.call_data(0)"),
    ("rollup-tx-base-public", "rollup_tx_base_public",
     "hiding_to_public's proof is verified as the public CHONK proof input to the "
     "rollup base (ProofData<PublicChonkVerifierPublicInputs>)"),
]

ITEM_START = re.compile(r"^(type |global |fn |unconstrained fn |#\[)")


def strip_strings(line):
    # Drop "..." and f"..." contents so braces inside assert messages don't
    # throw off depth counting.
    return re.sub(r'"(?:[^"\\]|\\.)*"', '""', line)


def parse_items(text):
    """Yield (kind, text) top-level items. kind in {type, global, main, helper}."""
    lines = text.splitlines()
    i, n = 0, len(lines)
    while i < n:
        line = lines[i]
        if not ITEM_START.match(line):
            i += 1
            continue
        start = i
        # type/global may be single-line (end ';') or block (end '};').
        depth = 0
        buf = []
        while i < n:
            buf.append(lines[i])
            s = strip_strings(lines[i])
            depth += s.count("{") - s.count("}")
            stripped = lines[i].rstrip()
            if depth <= 0 and (stripped.endswith(";") or stripped.endswith("}")):
                # End of a complete item once braces balance and the line
                # terminates a statement/block.
                i += 1
                break
            i += 1
        item = "\n".join(buf)
        head = lines[start]
        if head.startswith("type "):
            kind = "type"
        elif head.startswith("global "):
            kind = "global"
        elif re.match(r"^fn main\(", head):
            kind = "main"
        else:
            kind = "helper"
        yield kind, item


def main():
    legend, globals_, helpers = {}, {}, {}  # text -> first-seen order via dict
    stage_blocks = []

    for base, label, join in STAGES:
        path = OUT / f"{base}.monomorphized-inlined.nr"
        text = path.read_text()
        main_item = None
        for kind, item in parse_items(text):
            if kind == "type":
                legend.setdefault(item, None)
            elif kind == "global":
                globals_.setdefault(item, None)
            elif kind == "helper":
                helpers.setdefault(item, None)
            elif kind == "main":
                main_item = item.replace("fn main(", f"fn main__{label}(", 1)
        if main_item is None:
            raise SystemExit(f"no main found in {path}")
        stage_blocks.append((label, base, join, main_item))

    out = []
    out.append("// ============================================================")
    out.append("// CHAIN EXAMPLE (inlined) — one legal composition of the kernels + rollup base")
    out.append("//")
    out.append("// Order: init -> inner -> reset -> inner -> reset-tail-to-public")
    out.append("//        -> hiding-to-public -> rollup-tx-base-public")
    out.append("//")
    out.append("// NOT COMPILABLE and NOT a single circuit. Each stage is a separate proof;")
    out.append("// stages are joined by the CHONK databus (return_data of one == call_data of")
    out.append("// the next) and recursive verification, both enforced by barretenberg, NOT by")
    out.append("// any Noir assert here. The `// JOIN` comments mark those hand-offs.")
    out.append("//")
    out.append("// PROVER FREEDOM: the prover chooses the composition — how many inner/reset")
    out.append("// iterations, which batch/reset variants, and the ordering (within the VK")
    out.append("// allow-lists). This file shows ONE instance; the semantic output must be")
    out.append("// identical across all legal compositions, so do not read this shape as the")
    out.append("// only one. (reset shown is the MAX-size variant.)")
    out.append("//")
    out.append("// Use for cross-circuit (P8) reading: trace a value's lifecycle across folds,")
    out.append("// and look for a check that lives 'between' circuits and is owned by none.")
    out.append("// Verify any finding against the real per-circuit source/artifacts.")
    out.append("// ============================================================")
    out.append("")
    out.append(f"// TYPE LEGEND (union across all stages; {len(legend)} entries)")
    out.extend(legend.keys())
    out.append("")
    out.append(f"// GLOBALS (union across all stages; {len(globals_)} entries)")
    out.extend(globals_.keys())
    out.append("")

    for idx, (label, base, join, main_item) in enumerate(stage_blocks, 1):
        out.append("")
        out.append("// ============================================================")
        out.append(f"// STAGE {idx}: {label}   (circuit: {base})")
        if join:
            out.append(f"// JOIN (bb/CHONK databus + recursion, NOT a Noir assert): {join}")
        else:
            out.append("// ENTRY: first kernel, no previous-kernel input.")
        out.append("// ============================================================")
        out.append(main_item)

    out.append("")
    out.append("// ============================================================")
    out.append(f"// SHARED HELPER DEFINITIONS (deduped across stages; {len(helpers)} items)")
    out.append("// Not-inlined functions: unconstrained composers/hints, crypto and")
    out.append("// serialization plumbing (sha256, AVM column map, Serialize), and")
    out.append("// constrained helpers called from many sites. Same-named items with")
    out.append("// differing bodies are distinct monomorphizations and both kept.")
    out.append("// ============================================================")
    out.extend(helpers.keys())

    OUT.mkdir(exist_ok=True)
    dest = OUT / "chain-example.inlined.nr"
    dest.write_text("\n".join(out) + "\n")
    print(f"wrote {dest} ({len(out)} lines; "
          f"{len(legend)} types, {len(globals_)} globals, "
          f"{len(stage_blocks)} stages, {len(helpers)} helpers)")


if __name__ == "__main__":
    main()
