
# NOTE: intended to be ran from one's external computer, connecting to Aztec mainframe
# IF ON YOUR LOCAL COMPUTER USE NORMAL INTERACTIVE TRACY WORKFLOW
# the benchmark runs with headless capture and then we copy the trace file and run tracy profiler
# This is thus only really useful internally at Aztec, sorry external folks. It can be easily tweaked
# however for any SSH setup, especially an ubuntu one.
# on local machine run:
# export USER=...
# export PRESET=...tracy for memory or tracy-gates for circuit gates...
# ssh $USER-box "cat ~/aztec-packages/barretenberg/cpp/scripts/profile_tracy_capture_mainframe_view_local.sh" | bash /dev/stdin $USER
set -eux
USER=${1:-$USER}
BOX=$USER-box
TARGET=${2:-client_ivc_bench}
COMMAND=${3:-./bin/$TARGET --benchmark_filter=ClientIVCBench/Full/6"\$"}
HARDWARE_CONCURRENCY=${HARDWARE_CONCURRENCY:-16}
# Can also set PRESET=tracy-gates env variable
PRESET=${PRESET:-tracy-memory}

# Check if cmake exists
cmake --version

ssh $BOX "
	set -eux ;
	! [ -d ~/tracy ] && git clone https://github.com/wolfpld/tracy ~/tracy ;
	cd ~/tracy/capture ;
        git checkout 075395620a504c0cdcaf9bab3d196db16a043de7 ;
	sudo apt-get install -y libdbus-1-dev libdbus-glib-1-dev libtbb-dev libfreetype-dev ;
	mkdir -p build && cd build && cmake -DCMAKE_MESSAGE_LOG_LEVEL=Warning .. && make -j ;
	cd ~/aztec-packages/barretenberg/cpp/ ;
	cmake -DCMAKE_MESSAGE_LOG_LEVEL=Warning --preset $PRESET && cmake --build --preset $PRESET --target $TARGET ;
	cd ~/tracy/capture/build ;
	./tracy-capture -a 127.0.0.1 -f -o trace-$TARGET & ;
	sleep 0.1 ;
	cd ~/aztec-packages/barretenberg/cpp/build-$PRESET ;
	ninja $TARGET ;
	export HARDWARE_CONCURRENCY=$HARDWARE_CONCURRENCY ;
	$COMMAND ;
" &

wait # TODO(AD) hack - not sure why needed
! [ -d ~/tracy ] && git clone https://github.com/wolfpld/tracy ~/tracy
cd ~/tracy
git checkout 075395620a504c0cdcaf9bab3d196db16a043de7 # release 0.11.0
cmake -DCMAKE_MESSAGE_LOG_LEVEL=Warning -B profiler/build -S profiler -DCMAKE_BUILD_TYPE=Release
cmake --build profiler/build --parallel
scp $BOX:/mnt/user-data/$USER/tracy/capture/build/trace-$TARGET .
~/tracy/profiler/build/tracy-profiler trace-$TARGET
