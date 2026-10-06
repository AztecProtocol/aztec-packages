#!/usr/bin/env python3
"""Cost model for BN254 proof-of-possession (PoP) verification gas.

Runs (or reads the logs of) `PopGasGenerateTest` under several EVM versions, fits

    gas(attempts, sqrtCalls) <= F + A * attempts + S * sqrtCalls + Q * attempts^2

to the wrapper frame's gas, writes the calibration fixture `test/fixtures/bn254_pop_gas_vectors.json`
and prints markdown tables: fitted constants, residuals, the max-iterations bound N per cap and the
fraction of honest keys over each cap.

`attempts` counts loop iterations of `BN254Lib.hashToPoint` (keccak evaluations), `sqrtCalls` the
attempts with x < p (each calls the modexp precompile). Q * attempts^2 is the quadratic memory term:
every attempt allocates a 7-word `abi.encode` buffer that is never freed.

Usage (from l1-contracts/, with a forge that supports the requested EVM versions on PATH):
    python3 scripts/bn254_pop_gas_model.py                       # run forge, write fixture, print report
    python3 scripts/bn254_pop_gas_model.py --logs-dir DIR        # reuse DIR/gen_<evm>.log, skip forge
Stdlib only.
"""

import argparse
import json
import math
import os
import subprocess
import sys

P = 21888242871839275222246405745257275088696311157297823662689037894645226208583  # BASE_FIELD_ORDER
R = 21888242871839275222246405745257275088548364400416034343698204186575808495617  # GROUP_ORDER
TWO_256 = 2**256

# Per attempt: x = keccak(...) is uniform over [0, 2^256).
#  - reject: x >= p.
#  - success: x < p and x^3 + 3 is a square. BN254 G1 has prime order r (cofactor 1) and no point with y = 0,
#    so exactly (r - 1) / 2 values of x give a curve point.
#  - sqrt fail: the rest.
SUCCESS_COUNT = (R - 1) // 2
P_REJECT = (TWO_256 - P) / TWO_256
P_SUCCESS = SUCCESS_COUNT / TWO_256
P_SQRT_FAIL = (P - SUCCESS_COUNT) / TWO_256

EVMS = ["amsterdam", "osaka", "prague"]
CAPS = [250_000, 300_000, 500_000, 1_000_000]
MARGIN = 0.10
THEORETICAL_Q = 49 / 512  # 7 words per attempt, memory cost words^2 / 512

FIXTURE = "test/fixtures/bn254_pop_gas_vectors.json"


def run_forge(evm, logs_dir):
    env = dict(os.environ, POP_GAS_GENERATE="true")
    cmd = [
        "forge", "test", "--match-contract", "PopGasGenerateTest", "-vv",
        "--gas-limit", "9000000000000000000", "--evm-version", evm,
    ]
    print(f"$ POP_GAS_GENERATE=true {' '.join(cmd)}", file=sys.stderr)
    out = subprocess.run(cmd, env=env, capture_output=True, text=True)
    path = os.path.join(logs_dir, f"gen_{evm}.log")
    with open(path, "w") as f:
        f.write(out.stdout + out.stderr)
    if out.returncode != 0:
        sys.exit(f"forge failed for {evm}, see {path}")
    return path


def parse_log(path):
    vectors, bulk, precompiles = [], [], None
    for line in open(path):
        parts = line.split()
        if not parts:
            continue
        if parts[0] == "POPGAS_VEC":
            (label, sk, attempts, sqrt_calls, rejections, swapped, root_bit, gas_used, min_stipend, digest_gas,
             pk1x, pk1y, x0, x1, y0, y1, sigx, sigy, dx, dy) = parts[1:]
            vectors.append({
                "label": label, "sk": int(sk), "attempts": int(attempts), "sqrtCalls": int(sqrt_calls),
                "fieldRejections": int(rejections), "swapped": swapped == "1", "rootBit": int(root_bit),
                "gasUsed": int(gas_used), "minStipend": int(min_stipend), "digestGas": int(digest_gas),
                "pk1": (int(pk1x), int(pk1y)), "pk2": (int(x0), int(x1), int(y0), int(y1)),
                "signature": (int(sigx), int(sigy)), "digest": (int(dx), int(dy)),
            })
        elif parts[0] == "POPGAS_BULK":
            sk, attempts, sqrt_calls, gas_used, min_stipend, digest_gas = map(int, parts[1:])
            bulk.append({"sk": sk, "attempts": attempts, "sqrtCalls": sqrt_calls, "gasUsed": gas_used,
                         "minStipend": min_stipend, "digestGas": digest_gas})
        elif parts[0] == "POPGAS_PRECOMPILES":
            modexp, ecadd, ecmul, pairing = map(int, parts[1:5])
            precompiles = {"modexpSqrt": modexp, "ecAdd": ecadd, "ecMul": ecmul, "ecPairing2": pairing}
    if not vectors:
        sys.exit(f"no POPGAS_VEC lines in {path}")
    return vectors, bulk, precompiles


def solve(matrix, rhs):
    """Gaussian elimination with partial pivoting."""
    n = len(rhs)
    m = [row[:] + [rhs[i]] for i, row in enumerate(matrix)]
    for col in range(n):
        pivot = max(range(col, n), key=lambda r: abs(m[r][col]))
        m[col], m[pivot] = m[pivot], m[col]
        for r in range(n):
            if r != col:
                f = m[r][col] / m[col][col]
                for c in range(col, n + 1):
                    m[r][c] -= f * m[col][c]
    return [m[i][n] / m[i][i] for i in range(n)]


def least_squares(rows, ys):
    k = len(rows[0])
    ata = [[sum(r[i] * r[j] for r in rows) for j in range(k)] for i in range(k)]
    aty = [sum(r[i] * y for r, y in zip(rows, ys)) for i in range(k)]
    return solve(ata, aty)


def fit(points, key):
    """Fits key ~ F + A*a + S*k + Q*a^2, then lifts F so the model upper-bounds every point."""
    rows = [[1, p["attempts"], p["sqrtCalls"], p["attempts"] ** 2] for p in points]
    ys = [p[key] for p in points]
    f, a, s, q = least_squares(rows, ys)
    residuals = [y - (f + a * r[1] + s * r[2] + q * r[3]) for r, y in zip(rows, ys)]
    # Conservative constants: per-attempt and per-sqrt rounded up, memory term at least the theoretical value,
    # and F lifted to the largest remaining under-prediction.
    if q <= THEORETICAL_Q:
        q_num, q_den = 49, 512
    else:
        q_num, q_den = math.ceil(q * 1_000_000), 1_000_000
    a_c, s_c, q_c = math.ceil(a), math.ceil(s), q_num / q_den
    lift = max(y - (a_c * r[1] + s_c * r[2] + q_c * r[3]) for r, y in zip(rows, ys))
    f_c = math.ceil(lift)
    slack = [f_c + a_c * r[1] + s_c * r[2] + q_c * r[3] - y for r, y in zip(rows, ys)]
    return {
        "fit": {"F": f, "A": a, "S": s, "Q": q},
        "maxAbsResidual": max(abs(x) for x in residuals),
        "conservative": {"F": f_c, "A": a_c, "S": s_c, "Q": q_c, "QNumerator": q_num, "QDenominator": q_den},
        "conservativeMaxOverestimate": max(slack),
        "conservativeMinOverestimate": min(slack),
    }


def model(c, attempts, sqrt_calls):
    return c["F"] + c["A"] * attempts + c["S"] * sqrt_calls + c["Q"] * attempts**2


def max_iterations(c, budget):
    """Largest N with model(N, N) <= budget: every one of N attempts pays for a sqrt."""
    n = 0
    while model(c, n + 1, n + 1) <= budget:
        n += 1
    return n


def p_attempts_exceed(n):
    return (1 - P_SUCCESS) ** n


def p_over_cap(c, cap, a_max=1500):
    """P(model(attempts, sqrtCalls) > cap) for a random key, from the exact (attempts, sqrtCalls) distribution:
    P(attempts = a, sqrtCalls = k) = C(a - 1, k - 1) * P_REJECT^(a - k) * P_SQRT_FAIL^(k - 1) * P_SUCCESS."""
    total = 0.0
    log_r, log_f, log_s = math.log(P_REJECT), math.log(P_SQRT_FAIL), math.log(P_SUCCESS)
    for a in range(1, a_max + 1):
        k_min = max(1, math.floor((cap - c["F"] - c["A"] * a - c["Q"] * a * a) / c["S"]) + 1)
        for k in range(k_min, a + 1):
            log_comb = math.lgamma(a) - math.lgamma(k) - math.lgamma(a - k + 1)
            total += math.exp(log_comb + (a - k) * log_r + (k - 1) * log_f + log_s)
    # The mass beyond a_max is (1 - P_SUCCESS)^a_max < 1e-64.
    return total


def hex32(v):
    return "0x" + format(v, "064x")


def write_fixture(per_evm, analysis, path):
    labels = [v["label"] for v in per_evm[EVMS[0]][0]]
    by_label = {evm: {v["label"]: v for v in per_evm[evm][0]} for evm in EVMS}
    vectors = []
    for label in labels:
        v = by_label[EVMS[0]][label]
        for evm in EVMS:
            w = by_label[evm][label]
            assert (w["attempts"], w["sqrtCalls"], w["pk1"], w["pk2"]) == (
                v["attempts"], v["sqrtCalls"], v["pk1"], v["pk2"]), label
        # pk1, pk2 and the signature are not stored: they are scalar multiples of sk that the consumer derives.
        vectors.append({
            "label": label,
            "sk": hex32(v["sk"]),
            "attempts": v["attempts"],
            "sqrtCalls": v["sqrtCalls"],
            "fieldRejections": v["fieldRejections"],
            "swapped": v["swapped"],
            "rootBit": v["rootBit"],
            "digest": {"x": hex32(v["digest"][0]), "y": hex32(v["digest"][1])},
            "gas": {evm: {"verification": by_label[evm][label]["gasUsed"],
                          "minStipend": by_label[evm][label]["minStipend"]} for evm in EVMS},
        })
    fixture = {
        "description": (
            "BN254 proof-of-possession calibration vectors for Bn254LibWrapper.proofOfPossession. Every sk is a "
            "public test scalar: never use any of these keys for a real validator. See "
            "test/shared/bn254-pop-gas/README.md for the field definitions."),
        "domainSeparator": "AZTEC_BLS_POP_BN254_V1",
        "evmVersions": EVMS,
        "model": {evm: {"minStipend": _int_model(analysis[evm]["stipend"]["conservative"]),
                        "verification": _int_model(analysis[evm]["verification"]["conservative"])}
                  for evm in EVMS},
        "maxIterations": [
            {"cap": cap, "marginPercent": int(MARGIN * 100),
             **{evm: max_iterations(analysis[evm]["stipend"]["conservative"], cap * (1 - MARGIN)) for evm in EVMS}}
            for cap in CAPS],
        "vectors": vectors,
    }
    dump_fixture(fixture, path)


def dump_fixture(fixture, path):
    """Indented header and model, then one vector per line, so a regeneration diffs as one line per vector."""
    head = {k: v for k, v in fixture.items() if k != "vectors"}
    text = json.dumps(head, indent=2)
    assert text.endswith("\n}")
    lines = [text[:-2] + ',\n  "vectors": [']
    rows = [json.dumps(v, separators=(",", ":")) for v in fixture["vectors"]]
    lines += ["    " + row + ("," if i + 1 < len(rows) else "") for i, row in enumerate(rows)]
    lines += ["  ]", "}"]
    with open(path, "w") as f:
        f.write("\n".join(lines) + "\n")


def _int_model(c):
    return {"F": c["F"], "A": c["A"], "S": c["S"], "QNumerator": c["QNumerator"], "QDenominator": c["QDenominator"]}


def fmt(x, digits=1):
    return f"{x:,.{digits}f}"


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--logs-dir", help="read gen_<evm>.log from here instead of running forge")
    parser.add_argument("--out-logs-dir", default="out/bn254-pop-gas", help="where forge logs are written")
    parser.add_argument("--fixture", default=FIXTURE)
    args = parser.parse_args()

    per_evm = {}
    for evm in EVMS:
        if args.logs_dir:
            path = os.path.join(args.logs_dir, f"gen_{evm}.log")
        else:
            os.makedirs(args.out_logs_dir, exist_ok=True)
            path = run_forge(evm, args.out_logs_dir)
        per_evm[evm] = parse_log(path)

    analysis = {}
    for evm in EVMS:
        vectors, bulk, _ = per_evm[evm]
        points = vectors + bulk
        for p in points:
            p["fixed"] = p["gasUsed"] - p["digestGas"]
            p["stipendOffset"] = p["minStipend"] - p["gasUsed"]
        analysis[evm] = {
            "verification": fit(points, "gasUsed"),
            "stipend": fit(points, "minStipend"),
            "digest": fit(points, "digestGas"),
            "fixedRange": (min(p["fixed"] for p in points), max(p["fixed"] for p in points)),
            "offsetRange": (min(p["stipendOffset"] for p in points), max(p["stipendOffset"] for p in points)),
            "n": len(points),
            "maxAttempts": max(p["attempts"] for p in points),
            "maxSqrt": max(p["sqrtCalls"] for p in points),
        }

    write_fixture(per_evm, analysis, args.fixture)
    print(f"wrote {args.fixture}", file=sys.stderr)

    print("## Per-attempt probabilities\n")
    print(f"- P(x < p) = p / 2^256 = {P / TWO_256:.12f}")
    print(f"- P(success per attempt) = ((r - 1) / 2) / 2^256 = {P_SUCCESS:.12f}")
    print(f"- P(sqrt fails | x < p) = {P_SQRT_FAIL / (P / TWO_256):.12f}")
    print(f"- mean attempts = {1 / P_SUCCESS:.4f}, mean sqrt calls = {(P / TWO_256) / P_SUCCESS:.4f}\n")

    print("## Precompile prices (measured)\n")
    print("| EVM | modexp (sqrt) | ecAdd | ecMul | ecPairing (2 pairs) |")
    print("|---|---|---|---|---|")
    for evm in EVMS:
        pc = per_evm[evm][2]
        print(f"| {evm} | {pc['modexpSqrt']} | {pc['ecAdd']} | {pc['ecMul']} | {pc['ecPairing2']} |")

    print("\n## Fitted model: gas <= F + A*attempts + S*sqrtCalls + Q*attempts^2\n")
    print("| EVM | quantity | F | A | S | Q | max abs residual (LSQ) | conservative F, A, S, Q | "
          "conservative overestimate (min..max) |")
    print("|---|---|---|---|---|---|---|---|---|")
    for evm in EVMS:
        for key, name in (("verification", "verification gas"), ("stipend", "min stipend"),
                          ("digest", "g1ToDigestPoint call")):
            m = analysis[evm][key]
            f = m["fit"]
            c = m["conservative"]
            print(f"| {evm} | {name} | {fmt(f['F'])} | {fmt(f['A'], 2)} | {fmt(f['S'], 2)} | {f['Q']:.4f} | "
                  f"{fmt(m['maxAbsResidual'])} | {c['F']}, {c['A']}, {c['S']}, {c['Q']:.4f} | "
                  f"{fmt(m['conservativeMinOverestimate'])}..{fmt(m['conservativeMaxOverestimate'])} |")
    print()
    for evm in EVMS:
        a = analysis[evm]
        print(f"- {evm}: {a['n']} points (attempts <= {a['maxAttempts']}, sqrtCalls <= {a['maxSqrt']}); "
              f"verification - digest call in [{a['fixedRange'][0]}, {a['fixedRange'][1]}]; "
              f"min stipend - verification in [{a['offsetRange'][0]}, {a['offsetRange'][1]}]")

    print(f"\n## Max iterations N (worst case: every attempt pays for a sqrt), margin {int(MARGIN * 100)}%\n")
    print("| EVM | cap | budget (cap - margin) | N | worst-case stipend at N | P(attempts > N) | "
          "N with no margin |")
    print("|---|---|---|---|---|---|---|")
    for evm in EVMS:
        c = analysis[evm]["stipend"]["conservative"]
        for cap in CAPS:
            budget = cap * (1 - MARGIN)
            n = max_iterations(c, budget)
            n0 = max_iterations(c, cap)
            print(f"| {evm} | {cap:,} | {int(budget):,} | {n} | {fmt(model(c, n, n), 0)} | "
                  f"{p_attempts_exceed(n):.4g} | {n0} |")

    print("\n## Honest keys over the cap (min stipend model > cap)\n")
    print("| EVM | cap | P(key over cap) | 1 in | typical invalid entry burn | max burn of a failing entry |")
    print("|---|---|---|---|---|---|")
    for evm in EVMS:
        c = analysis[evm]["stipend"]["conservative"]
        v = analysis[evm]["verification"]["fit"]
        # Median key: attempts ~ 7, sqrt calls ~ 1.
        typical = v["F"] + v["A"] * 7 + v["S"] * 1 + v["Q"] * 49
        for cap in CAPS:
            q = p_over_cap(c, cap)
            print(f"| {evm} | {cap:,} | {q:.3g} | {(fmt(1 / q, 0) if 1 / q < 1e9 else f'{1 / q:.3g}') if q > 0 else 'inf'} | ~{fmt(typical, 0)} | "
                  f"{cap:,} |")


if __name__ == "__main__":
    main()
