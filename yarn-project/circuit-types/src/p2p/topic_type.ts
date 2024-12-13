import { P2PClientType } from './client_type.js';

/** Create Topic String
 *
 * The topic channel identifier
 * @param topicType
 * @returns
 */
export function createTopicString(topicType: TopicType) {
  return '/aztec/' + topicType + '/0.1.0';
}

/**
 *
 */
export enum TopicType {
  tx = 'tx',
  block_proposal = 'block_proposal',
  block_attestation = 'block_attestation',
  epoch_proof_quote = 'epoch_proof_quote',
}

export function getTopicTypeForClientType(clientType: P2PClientType) {
  if (clientType === P2PClientType.Full) {
    return Object.values(TopicType);
  }
  return [TopicType.tx, TopicType.epoch_proof_quote];
}

/**
 * Convert the topic string into a set of labels
 *
 * In the form:
 * {
 *  "/aztec/tx/0.1.0": "tx",
 *  ...
 * }
 */
export function metricsTopicStrToLabels() {
  const topicStrToLabel = new Map<string, string>();
  for (const topic in TopicType) {
    topicStrToLabel.set(createTopicString(TopicType[topic as keyof typeof TopicType]), topic);
  }

  return topicStrToLabel;
}
