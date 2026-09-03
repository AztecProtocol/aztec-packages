#!/usr/bin/env python3

import json
import re
import sys
from pathlib import Path


def natural_sort_key(value: str) -> list[tuple[int, object]]:
    return [
        (1, int(part)) if part.isdigit() else (0, part.lower())
        for part in re.split(r"(\d+)", value)
    ]


def submission_label(function_name: str) -> str:
    suffix = function_name.removeprefix("gasReportSubmit")
    return re.sub(
        r"(?<=[a-z])(?=[A-Z])|(?<=\D)(?=\d)|(?<=\d)(?=\D)", " ", suffix
    )


def render(input_path: Path, output_path: Path) -> None:
    report = json.loads(input_path.read_text())
    submissions = []

    for contract in report:
        for signature, gas in contract.get("functions", {}).items():
            function_name = signature.partition("(")[0]
            submissions.append((function_name, gas["mean"]))

    submissions.sort(key=lambda submission: natural_sort_key(submission[0]))

    lines = [
        "# Partial Epoch Proof Gas Report",
        "",
        "| Proof submission | Gas |",
        "|---|---:|",
    ]
    lines.extend(
        f"| {submission_label(function_name)} | {gas:,} |"
        for function_name, gas in submissions
    )
    lines.extend(
        [
            "",
            "_Uses the mock epoch proof verifier; real ZK verification and top-level transaction calldata gas are not included._",
            "",
        ]
    )

    output_path.write_text("\n".join(lines))


if __name__ == "__main__":
    render(Path(sys.argv[1]), Path(sys.argv[2]))
