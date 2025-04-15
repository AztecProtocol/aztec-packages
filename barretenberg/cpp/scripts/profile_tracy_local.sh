# Collect a profile completely locally, i.e., without using any remote machine for building or capturing.

set -eux
USER=${1:-$USER}
BOX=$USER-box
BENCHMARK=${2:-client_ivc_bench}
COMMAND=${3:-./bin/$BENCHMARK --benchmark_filter=ClientIVCBench/Full/6}
HARDWARE_CONCURRENCY=${HARDWARE_CONCURRENCY:-16}
PRESET=${PRESET:-tracy-time-sampled}

! [ -d ~/tracy ] && git clone https://github.com/wolfpld/tracy ~/tracy
cd ~/tracy
git checkout 075395620a504c0cdcaf9bab3d196db16a043de7 # release 0.11.0
cmake -B profiler/build -S profiler -DCMAKE_BUILD_TYPE=Release
cmake --build profiler/build --parallel

cd ~/aztec-packages/barretenberg/cpp/
cmake --preset $PRESET -DCMAKE_MESSAGE_LOG_LEVEL=Warning && cmake --build --preset $PRESET --target $BENCHMARK

! [ -d ~/tracy ] && git clone https://github.com/wolfpld/tracy ~/tracy
cd ~/tracy/capture
git checkout 075395620a504c0cdcaf9bab3d196db16a043de7
mkdir -p build && cd build && cmake .. -DCMAKE_MESSAGE_LOG_LEVEL=Warning && make -j

./tracy-capture -a 127.0.0.1 -f -o ../trace-$BENCHMARK &
sleep 0.1
cd ~/aztec-packages/barretenberg/cpp/build-$PRESET/

# Run the COMMAND with sudo if PRESET is 'tracy-time-sampled'
if [ "$PRESET" = "tracy-time-sampled" ]; then
    sudo HARDWARE_CONCURRENCY=$HARDWARE_CONCURRENCY $COMMAND
else
    HARDWARE_CONCURRENCY=$HARDWARE_CONCURRENCY $COMMAND
fi

~/tracy/profiler/build/tracy-profiler ~/tracy/capture/trace-$BENCHMARK
