FORCE_COLOR=1 LOG_LEVEL="debug; trace: .*gossipsub" yarn test port_change.test.ts -- --configFile=$1 2>&1
