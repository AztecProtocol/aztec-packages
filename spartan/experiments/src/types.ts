
/**
 * Trace returned from Tempo
 */
export interface Trace {
    traceID: string;
    rootServiceName: string;
    rootTraceName: string;
    startTimeUnixNano: number;
    durationMs: number;
    spanSet: any;
    spanSets: any[];
}

/**
 * A simple struct to hold timing stats
 */
export interface TimingStats {
    avg: number;
    min: number;
    max: number;
    count: number
}

/**
 * A struct to hold metrics about the block production process
 */
export interface BlockProposalMetrics {
    blockProductionTime: TimingStats;
    timeToReachAttestors: TimingStats;
    timeToReachValidatorSet: TimingStats;
    timeToReachSequencer: TimingStats;
}

export enum BlockProductionPhase {
    BUILD_BLOCK = "Sequencer.buildBlockAndAttemptToPublish",
    PROCESS_BLOCK = "Libp2pService.processBlockFromPeer",
    PROCESS_ATTESTATION = "Libp2pService.processAttestationFromPeer"
}