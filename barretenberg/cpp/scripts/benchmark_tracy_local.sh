
# NOTE: intended to be ran from one's external computer, connecting to Aztec mainframe
# IF ON YOUR LOCAL COMPUTER USE NORMAL INTERACTIVE TRACY WORKFLOW
# the benchmark runs with headless capture and then we copy the trace file and run tracy profiler
# This is thus only really useful internally at Aztec, sorry external folks. It can be easily tweaked
# however for any SSH setup, especially an ubuntu one.
# on local machine run:
# export USER=...
# export PRESET=...tracy for memory or tracy-gates for circuit gates...
# ssh $USER-box "cat ~/aztec-packages/barretenberg/cpp/scripts/benchmark_tracy.sh" | bash /dev/stdin $USER
set -eux
USER=${1:-$USER}
BOX=$USER-box
BENCHMARK=${2:-protogalaxy_bench}
COMMAND=${3:-./bin/$BENCHMARK --benchmark_filter=compute_row_evaluations/17}

# Can also set PRESET=tracy-gates env variable
PRESET=${PRESET:-tracy-time}

cd ~/aztec-packages/barretenberg/cpp/
cmake --preset $PRESET && cmake --build --preset $PRESET --target $BENCHMARK
! [ -d ~/tracy ] && git clone https://github.com/wolfpld/tracy ~/tracy
cd ~/tracy/capture
    git checkout 075395620a504c0cdcaf9bab3d196db16a043de7
sudo apt-get install -y libdbus-1-dev libdbus-glib-1-dev libtbb-dev libfreetype-dev
mkdir -p build && cd build && cmake .. && make -j
./tracy-capture -a 127.0.0.1 -f -o trace-$BENCHMARK &
sleep 0.1
cd ~/aztec-packages/barretenberg/cpp/build-$PRESET
ninja $BENCHMARK
sudo $COMMAND