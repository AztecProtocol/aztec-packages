#!/bin/bash

NODE_NO_WARNINGS=1 strace -f -tt -T \
  -e trace=execve \
  -o /dev/stderr \
  -s 4096 \
  node --experimental-vm-modules ../node_modules/.bin/jest --testTimeout=1500000 --forceExit \
    src/test/bb_prover_full_rollup.test.ts \
    2> >(./process_trace.sh) \
    1>/dev/null
