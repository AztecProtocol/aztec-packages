#!/usr/bin/env bash

# NOTE: intended to be ran from one's external computer, connecting to Aztec mainframe
# IF ON YOUR LOCAL COMPUTER USE NORMAL INTERACTIVE TRACY WORKFLOW
# the benchmark runs with headless capture and then we copy the trace file and run tracy profiler
# This is thus only really useful internally at Aztec, sorry external folks. It can be easily tweaked
# however for any SSH setup, especially an ubuntu one.
# on local machine run:
# export USER=...
# export PRESET=...tracy for memory or tracy-gates for circuit gates...
# ssh $USER-box "cat ~/aztec-packages/barretenberg/cpp/scripts/benchmark_tracy.sh" | bash /dev/stdin $USER
set -eu
BENCHMARK=${1:-protogalaxy_bench}
COMMAND=${2:-./bin/$BENCHMARK --benchmark_filter=fold_k/15}

PRESET=${PRESET:-tracy-time-instrumented}

cd ~/aztec-packages/barretenberg/cpp/
cmake -DCMAKE_MESSAGE_LOG_LEVEL=Warning --preset $PRESET
cmake --build --preset $PRESET --target $BENCHMARK

source scripts/_benchmark_remote_lock.sh

scp $BB_SSH_KEY build-$PRESET/bin/$BENCHMARK $BB_SSH_INSTANCE:$BB_SSH_CPP_PATH/build-$PRESET/bin

ssh $BB_SSH_KEY $BB_SSH_INSTANCE "
	set -eux ;
	! [ -d ~/tracy ] && git clone https://github.com/wolfpld/tracy ~/tracy ;
	cd ~/tracy/capture ;
        git checkout 075395620a504c0cdcaf9bab3d196db16a043de7 ;
	sudo apt-get install -y libdbus-1-dev libdbus-glib-1-dev ;
	mkdir -p build && cd build && cmake -DCMAKE_MESSAGE_LOG_LEVEL=Warning .. && make -j ;
	# ./tracy-capture -a 127.0.0.1 -f -o trace-$BENCHMARK & ;
	# sleep 0.1 ;
	cd ~/aztec3-packages/barretenberg/cpp/build-$PRESET/ ;
	$COMMAND ;
" &
