#!/bin/bash
ip=$(aws ec2 describe-instances \
  --region $1-1 \
  --filters "Name=tag:Name,Values=aztec-node-*" \
  --query "Reservations[].Instances[0].PublicIpAddress" \
  --output text)
cmd=$2
printf '\033]2;%s\033\\' "$1 - $2"

case "$cmd" in
  tail) ssh_cmd='journalctl -u aztec -f -o cat --since "$(systemctl show -p ActiveEnterTimestamp aztec.service | sed s/ActiveEnterTimestamp=//)"'
    ;;
  upgrade) ssh_cmd=".aztec/bin/aztec-up -v $3 && sudo systemctl restart aztec"
    ;;
  ip) echo $ip; exit ;;
esac

set -x
ssh ubuntu@$ip "$ssh_cmd"
