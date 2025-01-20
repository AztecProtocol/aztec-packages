FROM ghcr.io/paradigmxyz/reth:v1.0.8

# Run in the context of the docker-compose file ..
COPY ./eth-execution.sh ./eth-execution.sh

ENTRYPOINT ["/eth-execution.sh"]
