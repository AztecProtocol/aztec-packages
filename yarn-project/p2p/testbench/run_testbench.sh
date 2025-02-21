## Test bench
# Run the testbench and pipe the output into a file
# Usage: ./run_testbench.sh "outputfile" "<optional logfile>"

REPO=$(git rev-parse --show-toplevel)

outputfile=$1
logfile=${2:-"testbench_$(date +%s)_$RANDOM.log"}

# Compile
$REPO/yarn-project/bootstrap.sh compile p2p

# Run the testbench through jest
LOG_LEVEL="debug; trace: .*gossipsub" yarn test testbench.test.ts 2>&1 | tee $logfile

# Parse the log file, outputting propagation times
node $REPO/yarn-project/p2p/dest/testbench/parse_log_file.js $logfile $outputfile
