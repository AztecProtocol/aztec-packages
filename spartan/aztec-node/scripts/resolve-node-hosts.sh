#!/usr/bin/env bash
set -eu

# resolves headless service to the backing pods. Useful for the prover nodes to collect txs
node -e '
const dns = require("dns").promises;
const net = require("net");
(async () => {
  const ips = [];
  for (const arg of process.argv.slice(1)) {
    try {
      if (net.isIP(arg) !== 0) {
        ips.push(arg);
      } else {
        ips.push(...await dns.resolve4(arg));
      }
    } catch (err) {}
  }
  console.log(ips.map(ip => `http://${ip}:8080`).join(","))
})()' $@
