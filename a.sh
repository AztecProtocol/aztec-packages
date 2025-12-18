gh workflow run test-network-scenarios.yml \
  --repo AztecProtocol/aztec-packages \
  --ref ad/fix-next-net \
  -f ref=ad/fix-next-net \
  -f docker_image=aztecprotocol/aztecdev:latest \
  -f namespace=adam-namespace \
  -f env_file=next-scenario \
