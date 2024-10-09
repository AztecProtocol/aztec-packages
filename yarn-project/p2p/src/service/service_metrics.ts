// Goal
// - Emit something that is the source of a gossip message
// - Measure when we receive a message from a peer
// From this - and from looking at loki, we should be able to determine that amount of
// time that it takes for messages to make their way across the p2p network

// - ReqResp
// - Store the time that it takes to send a message and to receive a response
// - but do not store the undefined messages

export class LibP2PServiceMetrics {}
