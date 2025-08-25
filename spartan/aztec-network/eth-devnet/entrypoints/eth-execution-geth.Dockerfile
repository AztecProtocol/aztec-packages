FROM ethereum/client-go:v1.15.5

# Run in the context of the docker-compose file ..
COPY ./entrypoints/eth-execution-geth.sh /eth-execution-geth.sh

ENTRYPOINT ["/eth-execution-geth.sh"]
