cd $(dirname $0)

rm -f /dev/shm/shm_*

while true; do
  echo '../../ci3/dump_fail "timeout 5s ./build/bin/ipc_tests --gtest_filter=ShmTest.SingleClientSmallRingHighVolume | tail" >/dev/null'
done | parallel -j${1:-128} --halt now,fail=1
