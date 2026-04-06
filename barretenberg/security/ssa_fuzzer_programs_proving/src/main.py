#!/usr/bin/env python3

import redis
import time
import os
import logging
import traceback
from prover import persist_failure_artifacts, prove
from fuzzer_output_types import NoirProgramData

logging.basicConfig(
    level=logging.WARNING, format="%(asctime)s - %(levelname)s - %(message)s"
)
redis_client = redis.Redis(
    host=os.getenv("REDIS_HOST", "localhost"), port=os.getenv("REDIS_PORT", 6379), db=0
)


def main():
    while True:
        raw_program_data = redis_client.rpop("fuzzer_output")
        if raw_program_data is None:
            time.sleep(1)
            continue

        program_data = None
        try:
            program_data = NoirProgramData.from_json(raw_program_data)
            prove(program_data)
        except Exception:
            failure_dir = persist_failure_artifacts(
                test_id=(
                    program_data.test_id
                    if program_data is not None
                    else "parse_or_runtime_failure"
                ),
                error_message=traceback.format_exc(),
                raw_payload=raw_program_data,
                noir_data=program_data,
            )
            logging.exception(
                "failed to process popped redis payload; saved artifacts to %s",
                failure_dir,
            )


if __name__ == "__main__":
    main()
