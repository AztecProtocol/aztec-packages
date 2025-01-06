#!/bin/bash

PATTERN=${1:-browser}

# Start the server in the background
yarn webpack serve &
SERVER_PID=$!

# Wait for the server to be available
until curl -s http://localhost:8080 >/dev/null; do
    echo "Waiting for the server to start..."
    sleep 1
done

# Run Jest tests with NODE_NO_WARNINGS
NODE_NO_WARNINGS=1 node --experimental-vm-modules ../node_modules/.bin/jest --passWithNoTests $PATTERN

# Kill the server after tests complete
kill $SERVER_PID
echo "Server shut down."
