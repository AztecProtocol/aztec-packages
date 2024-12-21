export enum PeerErrorSeverity {
  /**
   * Not malicious action, but it must not be tolerated
   * ~2 occurrences will get the peer banned
   */
  LowToleranceError = 'LowToleranceError',
  /**
   * Negative action that can be tolerated only sometimes
   * ~10 occurrences will get the peer banned
   */
  MidToleranceError = 'MidToleranceError',
  /**
   * Some error that can be tolerated multiple times
   * ~50 occurrences will get the peer banned
   */
  HighToleranceError = 'HighToleranceError',
}
