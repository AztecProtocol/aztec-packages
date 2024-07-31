# NOTE: intended to be ran from one's external computer, connecting to mainframe
# the benchmark runs with headless capture and then we copy the trace file and run tracy profiler
USER=adam
BOX=$USER-box
ssh $BOX "
	cd ~/sources/tracy/capture/build ;
	./tracy-capture -a 127.0.0.1 -f -o trace & ;
	sleep 0.1 ;
	cd ~/aztec-packages/barretenberg/cpp/build-tracy ;
	./bin/client_ivc_bench --benchmark_filter='ClientIVCBench/Full/6$'
"
scp $BOX:/mnt/user-data/$USER/sources/tracy/capture/build/trace .
~/sources/tracy/profiler/build/tracy-profiler trace