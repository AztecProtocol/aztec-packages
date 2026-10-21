#!/usr/bin/env bash
# Runs an Aztec local network of a release, for validating docs against it, without touching any
# other run on the host: ports are claimed in the shared registry ~/.agents/ports.md, the network
# runs in its own process group with its own data directory, and stop kills only that group.
#
#   local_network.sh start <version> <state-dir>
#   local_network.sh stop <state-dir>
#
# CLI_HOME is the HOME the release CLI was installed into; the network runs with it, so nothing is
# written under the real home. start waits up to READY_TIMEOUT seconds (default 600) for the node to
# report <version>, then writes <state-dir>/network.env (AZTEC_NODE_URL, ETHEREUM_HOST, the ports)
# for later commands to source; the log is <state-dir>/network.log.
set -euo pipefail

registry=$HOME/.agents/ports.md
lock=$registry.lock

function die { echo "local_network: $*" >&2; exit 1; }

# The registry's lock protocol: an exclusively created lock file, taken over when older than 15 s,
# far longer than any holder keeps it, so a crashed run cannot block the host.
function with_registry {
  local _
  mkdir -p "$(dirname "$registry")"
  for _ in $(seq 100); do
    if (set -o noclobber; : >"$lock") 2>/dev/null; then
      [ -f "$registry" ] || printf '%s\n' '# Ports registry — who is RUNNING what, where (atomic-locked)' \
        '| port | service | owner (run) | worktree | pid-hint | claimed |' '|---|---|---|---|---|---|' >"$registry"
      local rc=0
      "$@" || rc=$?
      rm -f "$lock"
      return "$rc"
    fi
    perl -e 'exit((time - (stat shift)[9]) > 15 ? 0 : 1)' "$lock" 2>/dev/null && rm -f "$lock"
    sleep 0.1
  done
  die "$registry stayed locked ($lock)"
}

# Free loopback ports below the ephemeral range (an outgoing connection can take an ephemeral port
# between the probe and the bind), absent from the registry, each probed by binding it.
function pick_ports {
  local floor
  floor=$(awk '{print $1}' /proc/sys/net/ipv4/ip_local_port_range 2>/dev/null || echo 32768)
  REGISTERED=$(awk -F'|' 'NR > 3 {gsub(/ /, "", $2); print $2}' "$registry" 2>/dev/null || true) perl -MIO::Socket::INET -e '
    my ($n, $hi) = @ARGV;
    my %taken = map { $_ => 1 } grep { /^\d+$/ } split /\n/, $ENV{REGISTERED};
    my @held;
    for (1 .. 512) {
      last if @held == $n;
      my $p = 10000 + int(rand($hi - 10000));
      next if $taken{$p}++;
      my $s = IO::Socket::INET->new(LocalAddr => "127.0.0.1", LocalPort => $p, Listen => 1) or next;
      push @held, [$p, $s];
    }
    die "no free ports\n" unless @held == $n;
    print join(" ", map { $_->[0] } @held), "\n";
  ' "$1" "$((floor - 512))"
}

function claim_rows {
  local run=$1 pid=$2; shift 2
  local now port svc
  for port in "$@"; do
    awk -F'|' -v p="$port" 'NR > 3 {gsub(/ /, "", $2); if ($2 == p) found = 1} END {exit !found}' "$registry" && return 3
  done
  now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  for svc in node admin anvil; do
    printf '| %s | release-docs-%s | %s | %s | %s | %s |\n' "$1" "$svc" "$run" "$PWD" "$pid" "$now" >>"$registry"
    shift
  done
}

function repoint_rows {
  local run=$1 pid=$2 tmp
  tmp=$(mktemp)
  awk -F'|' -v r=" $run " -v p=" $pid " 'BEGIN {OFS = "|"} $4 == r {$6 = p} {print}' "$registry" >"$tmp"
  cat "$tmp" >"$registry"
  rm -f "$tmp"
}

function release_rows {
  local run=$1 tmp
  tmp=$(mktemp)
  grep -vF "| $run |" "$registry" >"$tmp" || true
  cat "$tmp" >"$registry"
  rm -f "$tmp"
}

function group_alive { kill -0 -- "-$1" 2>/dev/null; }
function started_at { LC_ALL=C TZ=UTC ps -o lstart= -p "$1" 2>/dev/null || true; }

function cmd_start {
  local version=$1 state=$2 run picked ports attempt pgid deadline info
  [ -n "${CLI_HOME:-}" ] && [ -x "$CLI_HOME/.aztec/current/bin/aztec" ] ||
    die "CLI_HOME must name the HOME the release CLI was installed into ($CLI_HOME/.aztec/current/bin/aztec)"
  mkdir -p "$state"
  state=$(cd "$state" && pwd -P)
  [ ! -f "$state/network.env" ] || die "$state/network.env exists: stop that network first"
  run=release-docs-$version-$$-$RANDOM
  for attempt in 1 2 3 4 5; do
    picked=$(pick_ports 3)
    read -r -a ports <<<"$picked"
    if with_registry claim_rows "$run" "$$" "${ports[@]}"; then break; fi
    [ "$attempt" -lt 5 ] || die "could not claim ports in $registry"
  done
  rm -rf "$state/network-data"
  mkdir -p "$state/network-data"
  : >"$state/network.log"
  # The child becomes a session (and process group) leader; its pid is the group id to stop.
  pgid=$(perl -MPOSIX -e '
    my $log = shift;
    defined(my $pid = fork) or die "fork: $!";
    if ($pid) { print "$pid\n"; exit 0 }
    POSIX::setsid() or die "setsid: $!";
    open STDIN, "<", "/dev/null";
    open STDOUT, ">>", $log or die "$log: $!";
    open STDERR, ">&", \*STDOUT;
    exec @ARGV or die "exec: $!";
  ' "$state/network.log" env -u XDG_CONFIG_HOME -u XDG_DATA_HOME -u XDG_CACHE_HOME -u NARGO_HOME -u AZTEC_HOME \
      HOME="$CLI_HOME" PATH="$CLI_HOME/.aztec/current/bin:$CLI_HOME/.aztec/bin:$PATH" \
      ANVIL_PORT="${ports[2]}" DATA_DIRECTORY="$state/network-data" P2P_ENABLED=false \
      aztec start --local-network --port "${ports[0]}" --admin-port "${ports[1]}")
  with_registry repoint_rows "$run" "$pgid"
  started_at "$pgid" >"$state/network.started"
  cat >"$state/network.env" <<EOF
export AZTEC_NODE_URL=http://127.0.0.1:${ports[0]}
export ETHEREUM_HOST=http://127.0.0.1:${ports[2]}
export ETHEREUM_HOSTS=http://127.0.0.1:${ports[2]}
export LOCAL_NETWORK_ADMIN_PORT=${ports[1]}
export LOCAL_NETWORK_PGID=$pgid
export LOCAL_NETWORK_RUN=$run
EOF
  deadline=$((SECONDS + ${READY_TIMEOUT:-600}))
  while :; do
    info=$(curl -s -m 5 -X POST -H 'Content-Type: application/json' \
      -d '{"jsonrpc":"2.0","id":1,"method":"aztec_getNodeInfo","params":[]}' "http://127.0.0.1:${ports[0]}" |
      jq -r '.result.nodeVersion // empty' 2>/dev/null || true)
    if [ "$info" = "$version" ]; then
      echo "local network $version up: $(head -1 "$state/network.env" | cut -d' ' -f2) (group $pgid); source $state/network.env"
      return 0
    fi
    if [ -n "$info" ] || ! group_alive "$pgid" || [ "$SECONDS" -ge "$deadline" ]; then
      tail -n 40 "$state/network.log" >&2
      cmd_stop "$state" >&2
      [ -z "$info" ] || die "the node reports $info, not $version: the installed CLI is the wrong release"
      die "the local network did not report $version within ${READY_TIMEOUT:-600}s (log above)"
    fi
    sleep 3
  done
}

function cmd_stop {
  local state=$1 pgid run now _
  [ -f "$state/network.env" ] || { echo "no network recorded in $state"; return 0; }
  pgid=$(sed -n 's/^export LOCAL_NETWORK_PGID=//p' "$state/network.env")
  run=$(sed -n 's/^export LOCAL_NETWORK_RUN=//p' "$state/network.env")
  if group_alive "$pgid"; then
    # A live leader with another start time is a recycled pid leading someone else's group. With the
    # leader gone the group is still ours: the kernel reuses no pid while a group holds it as its id.
    now=$(started_at "$pgid")
    if [ -n "$now" ] && [ "$now" != "$(cat "$state/network.started" 2>/dev/null)" ]; then
      echo "local_network: group $pgid now belongs to another process; not signalling it" >&2
    else
      kill -TERM -- "-$pgid" 2>/dev/null || true
      for _ in $(seq 30); do group_alive "$pgid" || break; sleep 1; done
      group_alive "$pgid" && kill -KILL -- "-$pgid" 2>/dev/null || true
    fi
  fi
  with_registry release_rows "$run"
  rm -f "$state/network.env" "$state/network.started"
  echo "local network stopped (group $pgid), ports released"
}

case ${1:-} in
  start) cmd_start "${2:?start needs a version}" "${3:?start needs a state dir}" ;;
  stop) cmd_stop "${2:?stop needs a state dir}" ;;
  *) sed -n '2,/^set -e/p' "$0" | sed '$d; s/^# \{0,1\}//' >&2; exit 2 ;;
esac
