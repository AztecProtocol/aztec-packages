## Blob Sink

A HTTP api that losely emulates the https://ethereum.github.io/beacon-APIs/?urls.primaryName=dev#/Beacon/getBlobSidecars API.
We do not support all of the possible values of block_id, namely `genesis`, `head`, `finalized`. As we are not using any of these values in our
blobs integration.

## When is this used?

This service will run alongside end to end tests to capture the blob transactions that are sent alongside a `propose` transaction.

### Why?

Once we make the transition to blob transactions, we will need to be able to query for blobs. One way to do this is to run an entire L1 execution layer and consensus layer pair alongside all of our e2e tests and inside the sandbox. But this is a bit much, so instead the blob sink can be used to store and request blobs, without needing to run an entire consensus layer pair client.

### Other Usecases

Blobs are only held in the L1 consensus layer for a period of ~3 weeks, the blob sink can be used to store blobs for longer.

### How?

The blob sink is a simple HTTP server that can be run alongside the e2e tests. It will store the blobs in a local file system and provide an API to query for them.

### Configurations

If no blob sink url or consensus host url is provided:
A local version of the blob sink will be used. This stores blobs in a local file system.

Blob sink url is provided:
If requesting from the blob sink, we send the blockHash

Consensus host url is provided:
If requesting from the beacon node, we send the slot number
