#!/usr/bin/env python3
"""Builds, proves and verifies a real-kernel Chonk flow from foundation code only.

The stack is app_uh_verifier (a private function that recursively verifies an UltraHonk ZK
proof) -> private_kernel_init -> private_kernel_reset_tail -> hiding_kernel_to_rollup. The
flow_inputs_builder circuit derives every kernel input; each circuit's return data is chained
into the next one's call data with noir-execute; bb proves the stack and verifies the proof.
See README.md next to this script.
"""

import argparse
import base64
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

FLOWS_DIR = Path(__file__).resolve().parent
ROOT = Path(
    subprocess.check_output(["git", "-C", str(FLOWS_DIR), "rev-parse", "--show-toplevel"], text=True).strip()
)
KERNELS_DIR = FLOWS_DIR.parents[1]
NARGO = Path(os.environ.get("NARGO") or ROOT / "noir/noir-repo/target/release/nargo")
NOIR_EXECUTE = Path(os.environ.get("NOIR_EXECUTE") or NARGO.parent / "noir-execute")
BB = Path(os.environ.get("BB") or ROOT / "barretenberg/cpp/build/bin/bb")
NARGO_FLAGS = ["--skip-brillig-constraints-check", "--silence-warnings"]

INNER, APP, BUILDER = "inner_circuit", "app_uh_verifier", "flow_inputs_builder"
INIT, RESET_TAIL, HIDING = "private_kernel_init", "private_kernel_reset_tail", "hiding_kernel_to_rollup"
FLOW_NAME = "uh-verifier-app"

# CircuitKind wire values, see barretenberg/cpp/src/barretenberg/chonk/circuit_input.hpp.
KIND_APP, KIND_KERNEL, KIND_HIDING = 0, 1, 2
CIRCUIT_KIND_FLAG = {KIND_APP: "app", KIND_KERNEL: "kernel", KIND_HIDING: "hiding"}

START = time.monotonic()
VERBOSE = False


def log(msg):
    print(f"[{time.monotonic() - START:7.1f}s] {msg}", file=sys.stderr, flush=True)


def run(cmd, cwd=None):
    cmd = [str(c) for c in cmd]
    log("$ " + " ".join(cmd))
    proc = subprocess.run(cmd, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    if proc.returncode != 0 or VERBOSE:
        sys.stderr.write(proc.stdout)
    if proc.returncode != 0:
        raise SystemExit(f"command failed with exit code {proc.returncode}: {' '.join(cmd)}")
    return proc.stdout


def load_json(path):
    with open(path) as f:
        return json.load(f)


def dump_json(path, value):
    with open(path, "w") as f:
        json.dump(value, f)


def kernel_artifact(name):
    """The compiled kernel, compiling it if the protocol-circuits build has not."""
    path = KERNELS_DIR / "target" / f"{name}.json"
    if path.exists():
        return path
    if not (KERNELS_DIR / "Nargo.toml").exists():
        raise SystemExit(
            f"{path} is missing and {KERNELS_DIR}/Nargo.toml does not exist; run "
            "noir-protocol-circuits/bootstrap.sh generate_variants (or the full build) first"
        )
    run([NARGO, "compile", "--package", name, *NARGO_FLAGS], cwd=KERNELS_DIR)
    return path


def chonk_vk(artifact_path, kind, out_dir):
    """The Chonk VK bytes of a circuit: the ones the protocol-circuits build embedded, else computed now."""
    embedded = load_json(artifact_path).get("verificationKey", {}).get("bytes")
    if embedded:
        return bytes.fromhex(embedded)
    out_dir.mkdir(parents=True, exist_ok=True)
    run([BB, "write_vk", "--scheme", "chonk", "--circuit_kind", CIRCUIT_KIND_FLAG[kind], "-b", artifact_path, "-o", out_dir])
    return (out_dir / "vk").read_bytes()


def vk_fields(vk_bytes):
    """A serialized Mega VK is its field elements back to back, 32 bytes each."""
    if len(vk_bytes) % 32 != 0:
        raise SystemExit(f"VK of {len(vk_bytes)} bytes is not a whole number of field elements")
    return ["0x" + vk_bytes[i : i + 32].hex() for i in range(0, len(vk_bytes), 32)]


def execute(artifact_path, inputs, work, name, witness=True):
    """Executes a circuit on ABI-encoded inputs; returns its ABI-encoded return value and witness path."""
    prover_file = work / f"{name}.inputs.json"
    dump_json(prover_file, inputs)
    cmd = [NOIR_EXECUTE, "execute", "-a", artifact_path, "-p", prover_file, "--overwrite-return"]
    if witness:
        cmd += ["-o", work, "-w", name]
    run(cmd)
    ret = load_json(prover_file).get("return")
    return ret, (work / f"{name}.gz" if witness else None)


def inner_proof(work, corrupt):
    """An UltraHonk ZK proof of inner_circuit, in the field layout bb_proof_verification expects.

    With `corrupt`, one proof element is altered. ACVM does not check proofs during witness
    generation, so the corruption only surfaces when bb builds the in-app verifier's constraints.
    """
    artifact_path = FLOWS_DIR / "target" / f"{INNER}.json"
    _, witness = execute(artifact_path, {"x": "1", "y": "2"}, work, INNER)
    out = work / "inner-proof"
    out.mkdir(exist_ok=True)
    run([BB, "prove", "--scheme", "ultra_honk", "--write_vk", "--output_format", "json", "-b", artifact_path, "-w", witness, "-o", out])
    vk = load_json(out / "vk.json")
    proof = load_json(out / "proof.json")["proof"]
    if corrupt:
        proof[0] = hex(int(proof[0], 16) ^ 1)
    return {
        "inner_verification_key": vk["vk"],
        "inner_key_hash": vk["hash"],
        "inner_proof": proof,
        "inner_public_inputs": load_json(out / "public_inputs.json")["public_inputs"],
    }


def msgpack_str(s):
    b = s.encode()
    if len(b) < 32:
        return bytes([0xA0 | len(b)]) + b
    return b"\xd9" + bytes([len(b)]) + b


def msgpack_bin(b):
    return b"\xc6" + len(b).to_bytes(4, "big") + b


def msgpack_steps(steps):
    """The ivc-inputs.msgpack layout bb reads: an array of PrivateExecutionStepRaw maps."""
    out = bytearray([0x90 | len(steps)])
    for step in steps:
        out += bytes([0x85])
        out += msgpack_str("bytecode") + msgpack_bin(step["bytecode"])
        out += msgpack_str("witness") + msgpack_bin(step["witness"])
        out += msgpack_str("vk") + msgpack_bin(step["vk"])
        out += msgpack_str("functionName") + msgpack_str(step["functionName"])
        out += msgpack_str("kind") + bytes([step["kind"]])
    return bytes(out)


def build_stack(work, corrupt_inner_proof):
    app_artifact = FLOWS_DIR / "target" / f"{APP}.json"
    builder_artifact = FLOWS_DIR / "target" / f"{BUILDER}.json"
    kernels = {name: kernel_artifact(name) for name in (INIT, RESET_TAIL, HIDING)}

    log("computing Chonk VKs")
    vks = {
        APP: chonk_vk(app_artifact, KIND_APP, work / "vk" / APP),
        INIT: chonk_vk(kernels[INIT], KIND_KERNEL, work / "vk" / INIT),
        RESET_TAIL: chonk_vk(kernels[RESET_TAIL], KIND_KERNEL, work / "vk" / RESET_TAIL),
        HIDING: chonk_vk(kernels[HIDING], KIND_HIDING, work / "vk" / HIDING),
    }

    log("proving the inner circuit")
    inner = inner_proof(work, corrupt_inner_proof)

    log("deriving kernel inputs")
    flow, _ = execute(
        builder_artifact,
        {"app_vk": vk_fields(vks[APP]), "init_vk": vk_fields(vks[INIT]), "reset_tail_vk": vk_fields(vks[RESET_TAIL])},
        work,
        BUILDER,
        witness=False,
    )

    log("executing the app and the kernels")
    app_out, app_witness = execute(app_artifact, {"public_inputs": flow["app_public_inputs"], **inner}, work, APP)
    init_out, init_witness = execute(kernels[INIT], {**flow["init"], "app_public_inputs": app_out}, work, INIT)
    reset_tail_out, reset_tail_witness = execute(
        kernels[RESET_TAIL], {**flow["reset_tail"], "previous_kernel_public_inputs": init_out}, work, RESET_TAIL
    )
    _, hiding_witness = execute(
        kernels[HIDING], {**flow["hiding"], "previous_kernel_public_inputs": reset_tail_out}, work, HIDING
    )

    def step(name, artifact_path, witness, kind):
        return {
            "bytecode": base64.b64decode(load_json(artifact_path)["bytecode"]),
            "witness": witness.read_bytes(),
            "vk": vks[name],
            "functionName": name,
            "kind": kind,
        }

    return msgpack_steps(
        [
            step(APP, app_artifact, app_witness, KIND_APP),
            step(INIT, kernels[INIT], init_witness, KIND_KERNEL),
            step(RESET_TAIL, kernels[RESET_TAIL], reset_tail_witness, KIND_KERNEL),
            step(HIDING, kernels[HIDING], hiding_witness, KIND_HIDING),
        ]
    )


def main():
    global VERBOSE
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--work-dir", type=Path, default=Path("target/flow"), help="scratch directory, relative to this test's directory"
    )
    parser.add_argument("--flow-dir", type=Path, help="also write the stack as <flow-dir>/%s/ivc-inputs.msgpack" % FLOW_NAME)
    parser.add_argument("--skip-compile", action="store_true", help="reuse the compiled flow circuits in target/")
    parser.add_argument("--stack-only", action="store_true", help="build the stack but do not prove it")
    parser.add_argument(
        "--corrupt-inner-proof",
        action="store_true",
        help="alter the inner proof the app verifies; the flow must then fail to prove or verify",
    )
    parser.add_argument("-v", "--verbose", action="store_true", help="show the output of every command")
    args = parser.parse_args()
    VERBOSE = args.verbose

    for tool in (NARGO, NOIR_EXECUTE, BB):
        if not tool.exists():
            raise SystemExit(f"{tool} not found; build noir and barretenberg first")

    if not args.skip_compile:
        # The flow crates are members of the protocol-circuits workspace (nargo resolves the topmost
        # manifest) and nargo writes into that workspace's target/, so move each artifact here.
        log("compiling the flow circuits")
        (FLOWS_DIR / "target").mkdir(exist_ok=True)
        for pkg in (INNER, APP, BUILDER):
            run([NARGO, "compile", "--package", pkg, *NARGO_FLAGS], cwd=KERNELS_DIR)
            shutil.move(KERNELS_DIR / "target" / f"{pkg}.json", FLOWS_DIR / "target" / f"{pkg}.json")

    work = args.work_dir if args.work_dir.is_absolute() else FLOWS_DIR / args.work_dir
    shutil.rmtree(work, ignore_errors=True)
    work.mkdir(parents=True)

    stack = build_stack(work, args.corrupt_inner_proof)
    stack_path = work / "ivc-inputs.msgpack"
    stack_path.write_bytes(stack)
    log(f"wrote {stack_path} ({len(stack)} bytes)")
    if args.flow_dir:
        flow_dir = args.flow_dir / FLOW_NAME
        flow_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy(stack_path, flow_dir / "ivc-inputs.msgpack")
        log(f"wrote {flow_dir / 'ivc-inputs.msgpack'}")
    if args.stack_only:
        return

    proof_dir = work / "proof"
    proof_dir.mkdir()
    try:
        log("proving the stack with Chonk")
        run([BB, "prove", "--scheme", "chonk", "--ivc_inputs_path", stack_path, "--write_vk", "-o", proof_dir])
        log("verifying the Chonk proof")
        run([BB, "verify", "--scheme", "chonk", "-p", proof_dir / "proof", "-k", proof_dir / "vk"])
    except SystemExit as failure:
        if args.corrupt_inner_proof:
            log(f"PASS: the flow with a corrupted inner proof was rejected ({failure})")
            return
        raise
    if args.corrupt_inner_proof:
        raise SystemExit("FAIL: the flow with a corrupted inner proof proved and verified")
    log("PASS: real-kernel Chonk flow with an in-app UltraHonk verifier proves and verifies")


if __name__ == "__main__":
    main()
