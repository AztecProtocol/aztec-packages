FROM ghcr.io/paradigmxyz/reth:v1.6.0

# Run in the context of the docker-compose file ..
COPY ./entrypoints/eth-execution.sh /eth-execution.sh

ENTRYPOINT ["./eth-execution.sh"]
