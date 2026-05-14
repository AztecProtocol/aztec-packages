#!/usr/bin/env python3
"""L1 gas benchmark runner.

Single entry point that drives the BenchmarkRollupTest scenarios and emits:
  - gas_benchmark.md             human-readable per-scenario report
  - gas_benchmark_results.json   structured summary by (scenario, flow)
  - bench-out/l1-gas.bench.json  flat dashboard payload

The Solidity test (test/benchmark/happy.t.sol) writes one JSONL sample per
benchmarked call to bench-out/raw_<scenario>.jsonl plus a shared
bench-out/config.json. This script aggregates those raw samples; it does not
parse Forge's gas-report output. Forge is invoked with FORGE_GAS_REPORT=true
because that flag affects EVM metering in a way that aligns gasleft() readings
with the historical dashboard baseline.
"""

from __future__ import annotations

import json
import os
import statistics
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional


L1_CONTRACTS_DIR = Path(__file__).resolve().parent.parent
BENCH_OUT = L1_CONTRACTS_DIR / "bench-out"
RAW_GLOB = "raw_*.jsonl"
CONFIG_PATH = BENCH_OUT / "config.json"

SCHEMA_VERSION = 2

SCENARIO_ORDER = [
    ("no_validators", "No Validators"),
    ("validators", "100 Validators"),
    ("slashing", "100 Validators + Slashing"),
]

SCENARIO_TESTS = {
    "no_validators": "test_no_validators",
    "validators": "test_100_validators",
    "slashing": "test_100_slashing_validators",
}

# Order in which flows are reported in each scenario table. Flows missing from a
# scenario are silently skipped.
FLOW_ORDER = [
    "setupEpoch",
    "propose",
    "proposeAndVote",
    "submitEpochRootProof",
]


@dataclass
class FlowStats:
    samples: int
    min: int
    median: int
    p95: int
    max: int
    mean: int
    calldata_bytes: Optional[int] = None
    zero_bytes: Optional[int] = None
    non_zero_bytes: Optional[int] = None
    calldata_gas_legacy: Optional[int] = None
    calldata_gas_eip7623: Optional[int] = None


@dataclass
class ScenarioResult:
    name: str
    flows: Dict[str, FlowStats] = field(default_factory=dict)


def run_forge_scenario(scenario: str) -> None:
    """Run one BenchmarkRollupTest scenario.

    FORGE_GAS_REPORT is intentionally NOT set: Foundry's gas-report tracer
    inflates per-opcode accounting, which then propagates into `gasleft()`
    readings. Running without the tracer gives gas numbers that match what a
    real L1 transaction would be charged.
    """
    test_name = SCENARIO_TESTS[scenario]
    print(f"  → forge test --match-test {test_name}")

    env = os.environ.copy()
    env.pop("FORGE_GAS_REPORT", None)

    cmd = [
        "forge",
        "test",
        "--offline",
        "--match-contract",
        "BenchmarkRollupTest",
        "--match-test",
        test_name,
        "--fuzz-seed",
        "42",
    ]

    result = subprocess.run(cmd, env=env, cwd=L1_CONTRACTS_DIR)
    if result.returncode != 0:
        print(f"    ! scenario {scenario} failed (exit {result.returncode})", file=sys.stderr)
        sys.exit(result.returncode)


def clear_raw_outputs() -> None:
    BENCH_OUT.mkdir(parents=True, exist_ok=True)
    for path in BENCH_OUT.glob(RAW_GLOB):
        path.unlink()
    if CONFIG_PATH.exists():
        CONFIG_PATH.unlink()


def load_samples(scenario: str) -> List[dict]:
    path = BENCH_OUT / f"raw_{scenario}.jsonl"
    if not path.exists():
        return []
    with path.open() as f:
        return [json.loads(line) for line in f if line.strip()]


def load_config() -> Dict[str, int]:
    if not CONFIG_PATH.exists():
        return {}
    with CONFIG_PATH.open() as f:
        return json.load(f)


def percentile(sorted_values: List[int], pct: float) -> int:
    if not sorted_values:
        return 0
    if len(sorted_values) == 1:
        return sorted_values[0]
    rank = (len(sorted_values) - 1) * pct
    lo, hi = int(rank), min(int(rank) + 1, len(sorted_values) - 1)
    if lo == hi:
        return sorted_values[lo]
    weight = rank - lo
    return int(round(sorted_values[lo] * (1 - weight) + sorted_values[hi] * weight))


def calldata_gas_legacy(zero_bytes: int, non_zero_bytes: int) -> int:
    """Pre-EIP-7623 calldata gas: 4 per zero, 16 per non-zero."""
    return 4 * zero_bytes + 16 * non_zero_bytes


def calldata_gas_eip7623(zero_bytes: int, non_zero_bytes: int, execution_gas: int) -> int:
    """EIP-7623 calldata gas: max(legacy_calldata, floor_calldata) accounting for floor.

    Intentionally simplified: assumes a single-call transaction where the floor
    binds on `execution_gas + standard_calldata_cost`. See EIP-7623 for details.
    """
    standard = calldata_gas_legacy(zero_bytes, non_zero_bytes)
    floor = 10 * (4 * non_zero_bytes + zero_bytes)
    return floor if execution_gas + standard < floor else standard


def aggregate_flow(samples: List[dict]) -> FlowStats:
    gases = sorted(s["executionGas"] for s in samples)
    n = len(gases)

    cd_bytes = samples[0].get("calldataBytes") if samples else None
    zero_bytes = samples[0].get("zeroBytes") if samples else None
    non_zero_bytes = samples[0].get("nonZeroBytes") if samples else None

    median_gas = gases[n // 2] if n else 0

    calldata_legacy = None
    calldata_7623 = None
    if cd_bytes is not None:
        # All sampled calldata for a given flow has the same selector + arg shape;
        # we report per-call calldata gas using the first sample's byte split.
        # (Some samples may differ slightly because of dynamic field content; the
        # raw JSONL still carries per-sample bytes for downstream analysis.)
        calldata_legacy = calldata_gas_legacy(zero_bytes or 0, non_zero_bytes or 0)
        calldata_7623 = calldata_gas_eip7623(zero_bytes or 0, non_zero_bytes or 0, median_gas)

    return FlowStats(
        samples=n,
        min=gases[0] if n else 0,
        median=median_gas,
        p95=percentile(gases, 0.95),
        max=gases[-1] if n else 0,
        mean=int(round(statistics.fmean(gases))) if n else 0,
        calldata_bytes=cd_bytes,
        zero_bytes=zero_bytes,
        non_zero_bytes=non_zero_bytes,
        calldata_gas_legacy=calldata_legacy,
        calldata_gas_eip7623=calldata_7623,
    )


def aggregate_scenario(scenario: str) -> ScenarioResult:
    samples = load_samples(scenario)
    by_flow: Dict[str, List[dict]] = {}
    for s in samples:
        by_flow.setdefault(s["flow"], []).append(s)

    result = ScenarioResult(name=scenario)
    for flow, flow_samples in by_flow.items():
        result.flows[flow] = aggregate_flow(flow_samples)
    return result


def fmt_int(n: Optional[int]) -> str:
    return f"{n:,}" if isinstance(n, int) else "-"


def render_markdown_table(scenario: ScenarioResult) -> List[str]:
    flows = [f for f in FLOW_ORDER if f in scenario.flows]
    if not flows:
        return ["*No samples recorded.*", ""]

    rows = []
    for flow in flows:
        s = scenario.flows[flow]
        rows.append(
            (
                flow,
                fmt_int(s.samples),
                fmt_int(s.median),
                fmt_int(s.p95),
                fmt_int(s.min),
                fmt_int(s.max),
                fmt_int(s.mean),
                fmt_int(s.calldata_bytes) if s.calldata_bytes else "-",
                fmt_int(s.calldata_gas_eip7623) if s.calldata_gas_eip7623 else "-",
            )
        )

    headers = ("Flow", "Samples", "Median", "p95", "Min", "Max", "Mean", "Calldata Bytes", "Calldata Gas (EIP-7623)")
    widths = [
        max(len(h), max(len(r[i]) for r in rows))
        for i, h in enumerate(headers)
    ]

    def fmt_row(row, align_left_first=True) -> str:
        cells = []
        for i, cell in enumerate(row):
            if i == 0 and align_left_first:
                cells.append(f"{cell:<{widths[i]}}")
            else:
                cells.append(f"{cell:>{widths[i]}}")
        return "| " + " | ".join(cells) + " |"

    lines = [
        fmt_row(headers),
        "|" + "|".join("-" * (w + 2) for w in widths) + "|",
    ]
    for row in rows:
        lines.append(fmt_row(row))
    lines.append("")
    return lines


def render_config_block(config: Dict[str, int]) -> List[str]:
    if not config:
        return []
    mana = f"{config.get('MANA_TARGET', 0):,}" if "MANA_TARGET" in config else "-"
    proofs = (
        f"{config['PROOFS_PER_EPOCH'] / 100:.2f}"
        if "PROOFS_PER_EPOCH" in config
        else "-"
    )
    rows = [
        ("Slot Duration", str(config.get("SLOT_DURATION", "-"))),
        ("Epoch Duration", str(config.get("EPOCH_DURATION", "-"))),
        ("Target Committee Size", str(config.get("TARGET_COMMITTEE_SIZE", "-"))),
        ("Mana Target", mana),
        ("Proofs per Epoch", proofs),
    ]
    name_w = max(len("Parameter"), max(len(r[0]) for r in rows))
    val_w = max(len("Value"), max(len(r[1]) for r in rows))
    lines = ["## Configuration", ""]
    lines.append(f"| {'Parameter':<{name_w}} | {'Value':>{val_w}} |")
    lines.append(f"|{'-' * (name_w + 2)}|{'-' * (val_w + 2)}|")
    for name, value in rows:
        lines.append(f"| {name:<{name_w}} | {value:>{val_w}} |")
    lines.append("")
    return lines


def render_methodology_note(config: Dict[str, int]) -> List[str]:
    return [
        "## Methodology",
        "",
        "Each scenario runs `BenchmarkRollupTest` end-to-end across a long slot range and records",
        "one sample per measured call (`setupEpoch`, `propose`, `proposeAndVote`, `submitEpochRootProof`)",
        "via `gasleft()` deltas. Raw per-sample data is in `bench-out/raw_<scenario>.jsonl`.",
        "",
        "- Forge runs **without** `FORGE_GAS_REPORT` so the EVM trace does not inflate per-call gas",
        "  accounting. Numbers reflect real L1 execution gas, which means they may differ from older",
        "  reports that were generated with the tracer enabled.",
        "- The proposer-side `propose` call has `skipBlobCheck` applied beforehand, so the live",
        "  `blobhash()` equality check is *not* charged. Add ~50k gas per blob for production cost.",
        "- The slashing scenario reports both `propose` (rounds before tally voting becomes active)",
        "  and `proposeAndVote` (the multicall transaction once tally voting is active).",
        "- Calldata gas uses real zero/non-zero byte counts. The EIP-7623 column applies the floor",
        "  pricing rule using the median execution gas of the same flow.",
        "",
    ]


def gas_per_second(scenario: ScenarioResult, config: Dict[str, int]) -> Optional[float]:
    needed = {"SLOT_DURATION", "EPOCH_DURATION", "PROOFS_PER_EPOCH"}
    if not needed.issubset(config):
        return None
    flows = scenario.flows
    if not all(f in flows for f in ("setupEpoch", "propose", "submitEpochRootProof")):
        return None

    epoch_seconds = config["SLOT_DURATION"] * config["EPOCH_DURATION"]
    if epoch_seconds == 0:
        return None
    proofs_per_epoch = config["PROOFS_PER_EPOCH"] / 100
    propose_flow = "proposeAndVote" if "proposeAndVote" in flows else "propose"
    total = (
        flows["setupEpoch"].median
        + flows[propose_flow].median * config["EPOCH_DURATION"]
        + flows["submitEpochRootProof"].median * proofs_per_epoch
    )
    return total / epoch_seconds


def emit_markdown(results: List[ScenarioResult], config: Dict[str, int], out_path: Path) -> None:
    lines = ["# Gas Benchmark Report", ""]
    lines.extend(render_config_block(config))
    lines.extend(render_methodology_note(config))

    name_lookup = dict(SCENARIO_ORDER)
    for scenario in results:
        lines.append(f"## {name_lookup.get(scenario.name, scenario.name)}")
        lines.append("")
        lines.extend(render_markdown_table(scenario))

        gps = gas_per_second(scenario, config)
        if gps is not None:
            lines.append(f"**Median Gas/Second**: {gps:,.1f} gas/second")
            secs = config["SLOT_DURATION"] * config["EPOCH_DURATION"]
            h, rem = divmod(secs, 3600)
            m, s = divmod(rem, 60)
            lines.append(f"*Epoch duration*: {h}h {m}m {s}s")
            lines.append("")

    out_path.write_text("\n".join(lines).rstrip() + "\n")
    print(f"  wrote {out_path}")


def emit_summary_json(results: List[ScenarioResult], config: Dict[str, int], out_path: Path) -> None:
    payload = {
        "schema_version": SCHEMA_VERSION,
        "config": config,
        "scenarios": {},
    }
    for scenario in results:
        payload["scenarios"][scenario.name] = {
            flow: {
                "samples": s.samples,
                "min": s.min,
                "median": s.median,
                "p95": s.p95,
                "max": s.max,
                "mean": s.mean,
                "calldata_bytes": s.calldata_bytes,
                "zero_bytes": s.zero_bytes,
                "non_zero_bytes": s.non_zero_bytes,
                "calldata_gas_legacy": s.calldata_gas_legacy,
                "calldata_gas_eip7623": s.calldata_gas_eip7623,
            }
            for flow, s in scenario.flows.items()
        }
    out_path.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"  wrote {out_path}")


def emit_dashboard_json(results: List[ScenarioResult], config: Dict[str, int], out_path: Path) -> None:
    """Flat list consumed by the github-action-benchmark dashboard.

    Headline value per (scenario, flow) is the median execution gas. Mean is no
    longer the headline because setupEpoch has cold-call outliers that drag mean
    well above the modal cost. The per-scenario gasPerSecond entry uses the same
    medians.
    """
    entries = []
    for scenario in results:
        for flow, s in scenario.flows.items():
            entries.append({
                "name": f"{scenario.name}/{flow}",
                "value": s.median,
                "unit": "gas",
            })
        gps = gas_per_second(scenario, config)
        if gps is not None:
            entries.append({
                "name": f"{scenario.name}/gasPerSecond",
                "value": round(gps, 1),
                "unit": "gas/second",
            })
    entries.sort(key=lambda e: e["name"])

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(entries, indent=2) + "\n")
    print(f"  wrote {out_path}")


def main() -> None:
    print("==> L1 gas benchmark")
    print("[1/3] Clearing previous bench-out raw artefacts")
    clear_raw_outputs()

    print("[2/3] Running scenarios")
    for scenario, _ in SCENARIO_ORDER:
        print(f"  scenario: {scenario}")
        run_forge_scenario(scenario)

    print("[3/3] Aggregating samples and emitting reports")
    results = [aggregate_scenario(name) for name, _ in SCENARIO_ORDER]
    config = load_config()

    emit_markdown(results, config, L1_CONTRACTS_DIR / "gas_benchmark.md")
    emit_summary_json(results, config, L1_CONTRACTS_DIR / "gas_benchmark_results.json")
    emit_dashboard_json(results, config, BENCH_OUT / "l1-gas.bench.json")
    print("==> Done")


if __name__ == "__main__":
    main()
