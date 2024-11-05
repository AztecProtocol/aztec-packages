
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
COMMAND=${3:-./bin/$BENCHMARK --benchmark_filter=fold_k/17}

# Can also set PRESET=tracy-gates env variable
PRESET=${PRESET:-tracy-time}

wait # TODO(AD) hack - not sure why needed
! [ -d ~/tracy ] && git clone https://github.com/wolfpld/tracy ~/tracy
cd ~/tracy
git checkout 075395620a504c0cdcaf9bab3d196db16a043de7 # release 0.11.0
cmake -B profiler/build -S profiler -DCMAKE_BUILD_TYPE=Release
cmake --build profiler/build --parallel
cd -

ssh $BOX "
	set -eux ;
	cd ~/aztec-packages/barretenberg/cpp/ ;
	cmake --preset $PRESET && cmake --build --preset $PRESET --target $BENCHMARK ;
" &
wait
if [ ! -d build-$PRESET/bin ]; then
  echo build-$PRESET/bin;
  mkdir -p build-$PRESET/bin;
fi
scp $BOX:/mnt/user-data/$USER/aztec-packages/barretenberg/cpp/build-$PRESET/bin/$BENCHMARK build-$PRESET/bin/. ;
! [ -d ~/tracy ] && git clone https://github.com/wolfpld/tracy ~/tracy ;
cd ~/tracy/capture ;
	git checkout 075395620a504c0cdcaf9bab3d196db16a043de7 ;
mkdir -p build && cd build && cmake .. && make -j ;

./tracy-capture -a 127.0.0.1 -f -o ../trace-$BENCHMARK &
sleep 0.1 ;
cd ~/aztec-packages/barretenberg/cpp/build-$PRESET/
$COMMAND ;

~/tracy/profiler/build/tracy-profiler ~/tracy/capture/trace-$BENCHMARK
