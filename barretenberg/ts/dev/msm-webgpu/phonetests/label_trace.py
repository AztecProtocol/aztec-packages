#!/usr/bin/env python3
"""
Promote each GPU render-stage slice's driver-attached debug label to its display
name, IN PLACE, on the same hardware-queue track.

Background: a Mali (and similar) GPU driver's perfetto `gpu.renderstages` producer
names every slice by its generic hardware stage ("compute", "vertex", "fragment",
"copy buffer", ...). When the WebGPU app wraps each pass in
`pass.pushDebugGroup(name)` and Chromium/Dawn runs with
`--enable-dawn-features=use_user_defined_labels_in_backend`, Dawn emits
`vkCmdBeginDebugUtilsLabelEXT`, and the driver records that label onto each GPU job
as the `Labels` extra_data field. This script reads that field and makes it the
slice NAME, so the timeline shows your pass names instead of "compute".

This is a faithful 1:1 promotion: each slice keeps its exact timestamp, duration,
and hardware queue. Only the name changes, and only for slices the driver already
labeled. There is no correlation, offset, or guessing — the driver bound each label
to its own GPU job.

Usage:  python3 label_trace.py IN.perfetto OUT.perfetto
Requires: pip install perfetto    (provides perfetto_trace_pb2; protobuf>=4 round-trips faithfully)
"""
import sys, os

def main():
    if len(sys.argv) != 3:
        sys.exit("usage: python3 label_trace.py IN.perfetto OUT.perfetto")
    src, dst = sys.argv[1], sys.argv[2]
    try:
        from perfetto.protos.perfetto.trace.perfetto_trace_pb2 import Trace
    except ImportError:
        sys.exit("missing dependency: pip install perfetto")

    t = Trace()
    t.ParseFromString(open(src, "rb").read())

    # Pass 1: gather interned stage specs (per sequence) and the iids already in use.
    specs = {}          # (seq, iid) -> stage name
    existing = {}       # seq -> set(iid)
    for p in t.packet:
        seq = p.trusted_packet_sequence_id if p.HasField("trusted_packet_sequence_id") else None
        if p.HasField("interned_data") and len(p.interned_data.gpu_specifications):
            for s in p.interned_data.gpu_specifications:
                specs[(seq, s.iid)] = s.name
                existing.setdefault(seq, set()).add(s.iid)

    # Pass 2: which (seq, label) pairs occur on labeled render-stage events?
    labels_by_seq = {}  # seq -> set(label)
    used_stage_id = 0
    for p in t.packet:
        if not p.HasField("gpu_render_stage_event"):
            continue
        e = p.gpu_render_stage_event
        if e.HasField("stage_id") and not e.HasField("stage_iid"):
            used_stage_id += 1
        seq = p.trusted_packet_sequence_id if p.HasField("trusted_packet_sequence_id") else None
        lab = next((x.value for x in e.extra_data if x.name == "Labels" and x.value), None)
        if lab:
            labels_by_seq.setdefault(seq, set()).add(lab)

    if used_stage_id:
        print(f"WARNING: {used_stage_id} events use inline stage_id (not interned stage_iid); "
              "this script only rewrites the interned path. Most modern drivers use stage_iid.")

    if not labels_by_seq:
        print("No labeled render-stage events found. Either the capture window missed the run, "
              "or the app did not emit debug labels (need pushDebugGroup on every pass AND "
              "--enable-dawn-features=use_user_defined_labels_in_backend). Wrote nothing.")
        return

    # Mint a fresh interned stage spec per (seq, label), avoiding iid collisions.
    new_iid = {}
    for seq, labs in labels_by_seq.items():
        used = existing.get(seq, set())
        nxt = 0x6000000000000001
        for lab in sorted(labs):
            while nxt in used:
                nxt += 1
            new_iid[(seq, lab)] = nxt
            used.add(nxt); nxt += 1

    # Define the new specs alongside the existing ones (every interned_data packet that
    # already carries gpu_specifications, so they survive incremental-state resets).
    for p in t.packet:
        seq = p.trusted_packet_sequence_id if p.HasField("trusted_packet_sequence_id") else None
        if p.HasField("interned_data") and len(p.interned_data.gpu_specifications):
            for (s, lab), iid in new_iid.items():
                if s != seq:
                    continue
                spec = p.interned_data.gpu_specifications.add()
                spec.iid = iid
                spec.name = lab

    # Repoint each labeled event's stage to its per-label spec. ts / duration / hw_queue untouched.
    renamed = 0
    dur_by_label = {}
    cnt_by_label = {}
    for p in t.packet:
        if not p.HasField("gpu_render_stage_event"):
            continue
        e = p.gpu_render_stage_event
        seq = p.trusted_packet_sequence_id if p.HasField("trusted_packet_sequence_id") else None
        lab = next((x.value for x in e.extra_data if x.name == "Labels" and x.value), None)
        if lab and (seq, lab) in new_iid:
            e.stage_iid = new_iid[(seq, lab)]
            renamed += 1
            dur_by_label[lab] = dur_by_label.get(lab, 0) + e.duration
            cnt_by_label[lab] = cnt_by_label.get(lab, 0) + 1

    open(dst, "wb").write(t.SerializeToString())
    print(f"renamed {renamed} render-stage slices across {len(new_iid)} distinct labels")
    print(f"wrote {dst} ({os.path.getsize(dst)} B)\n")

    print(f"{'label':32} {'count':>7} {'gpu_ms':>10} {'avg_us':>10}")
    total = sum(dur_by_label.values()) or 1
    for lab in sorted(dur_by_label, key=dur_by_label.get, reverse=True):
        d = dur_by_label[lab]; n = cnt_by_label[lab]
        print(f"{lab:32} {n:>7} {d/1e6:>10.2f} {d/n/1e3:>10.1f}   ({100*d/total:.0f}%)")

if __name__ == "__main__":
    main()
