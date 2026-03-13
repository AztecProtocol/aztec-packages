#!/usr/bin/env python3

import logging
import os
import time
import uuid

import redis
from fuzzer_output_types import NoirProgramData
from prover import prove

DEFAULT_BB_EXECUTABLE_PATH = (
    "/home/sarkoxed/.secret/aztec-packages/barretenberg/cpp/build-coverage/bin/bb"
)
DEFAULT_BB_COVERAGE_DIR = (
    "/home/sarkoxed/.secret/aztec-packages/barretenberg/cpp/build-coverage/profiles"
)

logging.basicConfig(
    level=logging.WARNING, format="%(asctime)s - %(levelname)s - %(message)s"
)
redis_client = redis.Redis(
    host=os.getenv("REDIS_HOST", "localhost"), port=os.getenv("REDIS_PORT", 6379), db=0
)


def configure_coverage_environment() -> None:
    os.environ.setdefault("BB_EXECUTABLE_PATH", DEFAULT_BB_EXECUTABLE_PATH)
    coverage_dir = os.getenv("BB_COVERAGE_DIR", DEFAULT_BB_COVERAGE_DIR)
    os.makedirs(coverage_dir, exist_ok=True)
    os.environ["BB_COVERAGE_DIR"] = coverage_dir


def make_coverage_run_id(test_id: str) -> str:
    safe_test_id = "".join(
        char if char.isalnum() or char in ("-", "_", ".") else "_"
        for char in (test_id or "unknown_test")
    )
    return f"{uuid.uuid4().hex}_{safe_test_id or 'unknown_test'}"


def main():
    configure_coverage_environment()

    while True:
        program_data = redis_client.rpop("fuzzer_output")
        if program_data is None:
            time.sleep(1)
            continue

        program_data = NoirProgramData.from_json(program_data)
        os.environ["BB_COVERAGE_RUN_ID"] = make_coverage_run_id(program_data.test_id)
        prove(program_data)


if __name__ == "__main__":
    main()
