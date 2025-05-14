#!/bin/bash
set -euo pipefail

cd $(dirname $0)

region=$1-1
ip=$(aws ec2 describe-instances \
  --region $region \
  --filters "Name=tag:Name,Values=aztec-node-*" \
  --query "Reservations[].Instances[0].PublicIpAddress" \
  --output text)
cmd=${2:-}

source ~/alpha-testnet-validators/${region}.sh

case "$cmd" in
  deploy)
    ./deploy.sh
    exit
    ;;
  tail)
    printf '\033]2;%s\033\\' "$region - $cmd"
    ssh_cmd='journalctl -u aztec -f -o cat --since "$(systemctl show -p ActiveEnterTimestamp aztec.service | sed s/ActiveEnterTimestamp=//)"'
    ;;
  upgrade)
    scp ~/alpha-testnet-validators/${region}.sh ubuntu@$ip:env.sh
    scp -p aztec.service.sh ubuntu@$ip:aztec.service.sh
    ssh_cmd="sudo ./aztec.service.sh"
    ;;
  ip)
    echo $ip;
    exit
    ;;
  txs)
    ssh_cmd="curl -s -XPOST localhost:8080 -d'{\"method\": \"node_getPendingTxCount\"}' | jq .result"
    ;;
  in_set)
    result=$(cast call 0x8d1cc702453fa889f137dbd5734cdb7ee96b6ba0 "getInfo(address)" $COINBASE --rpc-url https://json-rpc.1idfjag395jr5mwkdusah7mhr.blockchainnodeengine.com\?key\=$API_KEY 2>/dev/null)
    [ "${result: -1}" -eq 1 ] && echo "yep!" || echo "nope!"
    exit
    ;;
  *)
    shift
    ssh_cmd="$@"
    ;;
esac

[ "${VERBOSE:-0}" -eq 1 ] && set -x
[ "${INSPECT:-0}" -eq 1 ] && fwd="-L9229:localhost:9229"
ssh ubuntu@$ip ${fwd:-} "$ssh_cmd"
