FROM nethermind/nethermind:v1.32.2

# Copy the Nethermind entrypoint script
COPY ./entrypoints/eth-execution-nethermind.sh /eth-execution-nethermind.sh

ENTRYPOINT ["/eth-execution-nethermind.sh"]
