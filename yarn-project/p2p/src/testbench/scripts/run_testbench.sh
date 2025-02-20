## Test bench
# Run the testbench and pipe the output into a file
# Usage: ./run_testbench.sh > outputfile

FORCE_COLOR=1 LOG_LEVEL="debug; trace: .*gossipsub" yarn test testbench.test.ts 2>&1
