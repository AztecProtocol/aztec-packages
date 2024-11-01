// The goal in this file is to call the current tempo logs collector

import { BlockProductionPhase, TimingStats } from "./types";

const TEMPO_ENDPOINT = 'http://localhost:3100';

async function queryTempo(query: string) {
    const params = new URLSearchParams({
        q: query,
        limit: "1000",
        spss: "100",
        start: "1730285636",
        end: "1730289236"
    });
    const response = await fetch(`${TEMPO_ENDPOINT}/api/search?${params}`);

    if (!response.ok) {
        console.error(`Failed to fetch logs: ${response.statusText}`);
        return;
    }

    const data = await response.json();
    return data;
}


// The block production starts at Sequencer.builcBlockAndAttemptToPublish
// It then makes it to the other nodes under Libp2pService.processBlockFromPeer
// The block attestations are then responded through Libp2pService.processAttestationFromPeer

// An attestation has made it's way back to the sequencer if the trace creator is the same node as the sequencer

// From this we should be able to measure the average time it takes for a peer to receive a block and produce an attestation,
// and how long it takes for the attestation to be returned to the sequencer
async function processBlockProductions(data: any) {

    const buildBlockSpans = data.traces.filter((trace: any) => trace.rootTraceName === BlockProductionPhase.BUILD_BLOCK);
    const processBlockSpans = data.traces.filter((trace: any) => trace.rootTraceName === BlockProductionPhase.PROCESS_BLOCK);
    const processAttestationSpans = data.traces.filter((trace: any) => trace.rootTraceName === BlockProductionPhase.PROCESS_ATTESTATION);

    console.log(processAttestationSpans[0]);

    // The start time of a span is .startTimeUnixNano
    // The total duration of the work is durationMs

    // From this we should be able to print the time it takes for information to propagate from the sequencer to the other nodes

}

/**
 * Calculate the average, min, max, and count from a list of times
 */
function calculateTimingStats(times: number[]): TimingStats {
    if (times.length === 0) return { avg: 0, min: 0, max: 0, count: 0 };
    return {
        avg: times.reduce((a, b) => a + b, 0) / times.length,
        min: Math.min(...times),
        max: Math.max(...times),
        count: times.length
    };
}

async function main() {
    // Quickly get output
    // const query = `{span.aztec.block.archive="0x0b048a2be15b46e64a74b673e4d1918768ee0d7017ec20f5d4d6ead8c40c8364"}`;

    const queryForAllBlockArchives = `{span.aztec.block.archive=~".+"} | label_values(span.aztec.block.archive)`;

    try {
        const data = await queryTempo(queryForAllBlockArchives);
        console.log(data);

        // processBlockProductions(data);
    } catch (error) {
        console.error(`Failed to fetch logs: ${error}`);
    }
}
main();
