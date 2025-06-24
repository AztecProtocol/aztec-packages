
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

# Checkout tracy 0.11.1, build the headless capture tool and then capture a trace
ssh $BOX "
	set -eux ;
	! [ -d ~/tracy ] && git clone https://github.com/wolfpld/tracy ~/tracy --depth 1 ;
	cd ~/tracy/capture ;
	git fetch origin 5d542dc09f3d9378d005092a4ad446bd405f819a ;
  git checkout 5d542dc09f3d9378d005092a4ad446bd405f819a ;
	mkdir -p build && cd build && cmake -DNO_FILESELECTOR=ON -DCMAKE_MESSAGE_LOG_LEVEL=Warning .. && make -j ;
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
# If on ubuntu will need to build tracy checked out at 0.11.1 and comment this out
# If on windows can use windows tracy build
brew install tracy
wait # TODO(AD) hack - not sure why needed
scp $BOX:/mnt/user-data/$USER/tracy/capture/build/trace-$TARGET .
tracy trace-$TARGET
