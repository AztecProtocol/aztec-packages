# Aztec Node - Docker Compose Reference

## Files:
`.env-baseconfig-val`   - defines the common vars for deploying a validating (sequencing) node

`.env-example-val0`     - defines the instance-specific vars for deploying a single validating node e.g. private keys

`docker-compose-val.yaml` - reference docker compose file for validating node with dynamic vars

`launch-validators.sh` - basic script to launch as many discrete validators as desired, with discrete data volumes and container names using Docker Compose

## How to deploy:

Two options:

A - Use the env files and docker-compose yaml as a reference to build your own implementation

B - Using `launch-validators.sh`

## Using launch-validators.sh

### How it works:

- Automatically detects all .env-val* files in the directory
- Creates unique container names and project names for each validator
- Uses the validator number from the env filename to create distinct services
- Maintains separate volumes for each validator instance

### How to use:

Follow the steps below to launch as many validators as you desire.


1. Copy `.env-example-val0` to `.env-val0` and fill in the vars as necessary. 
2. Repeat `1` for the number of validators you want to run, incrementing the file name e.g. `.env-val1`, `.env-val2` etc.
3. Check over `.env-baseconfig-val` and familiarise yourself with its contents. It is preconfigured for the testnet and ready to go.
4. Launch your validators with `./launch-validators.sh start`
5. Check your validator state with `docker compose -f docker-compose-val.yaml ps`
6. Check your validator logs with `docker logs -f aztec-val-[0,1,2,3...]-aztec-1`
7. Restart your validators with `./launch-validators.sh restart`
8. Stop your validators with `./launch-validators.sh stop`


Housekeeping

If you want to clean house before an upgrade you can list out your volumes with `docker volume ls` and remove them with `docker volume rm <VOLUME NAME>`