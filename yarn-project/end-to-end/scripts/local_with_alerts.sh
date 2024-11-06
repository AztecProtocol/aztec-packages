#!/bin/bash
LOG_LEVEL=${LOG_LEVEL:-verbose} DEBUG_COLORS=1 NODE_NO_WARNINGS=1 node --experimental-vm-modules ../node_modules/.bin/jest "$1" && \
LOG_LEVEL=${LOG_LEVEL:-verbose} DEBUG_COLORS=1 NODE_NO_WARNINGS=1 node --experimental-vm-modules ../node_modules/.bin/jest alert_checker --testTimeout=300000 --forceExit