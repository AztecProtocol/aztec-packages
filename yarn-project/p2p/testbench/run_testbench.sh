## Test bench
# Run the testbench and pipe the output into a file
# Usage: ./run_testbench.sh "configfile" "outputfile" "<optional logfile>"

set -ex

REPO=$(git rev-parse --show-toplevel)

configfile=$1
outputfile=$2
logfile=${3:-"testbench_$(date +%s)_$RANDOM.log"}

# Compile
$REPO/yarn-project/bootstrap.sh compile p2p

# Run the testbench through jest
# LOG_JSON=1 LOG_LEVEL="debug; trace: .*gossipsub" node $REPO/yarn-project/p2p/dest/testbench/testbench.js $configfile 2>&1 | tee $logfile
LOG_JSON=1 LOG_LEVEL="debug" node $REPO/yarn-project/p2p/dest/testbench/testbench.js $configfile 2>&1 | tee $logfile

# Parse the log file, outputting propagation times
node $REPO/yarn-project/p2p/dest/testbench/parse_log_file.js $logfile $outputfile
