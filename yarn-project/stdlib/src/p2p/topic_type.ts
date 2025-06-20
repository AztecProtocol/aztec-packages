import { P2PClientType } from './client_type.js';

/** Create Topic String
 *
 * The topic channel identifier
 * @param topicType
 * @returns
 */
export function createTopicString(topicType: TopicType, protocolVersion: string) {
  return `/aztec/${TopicType[topicType]}/${protocolVersion}`;
}

/**
 *
 */
export enum TopicType {
  tx = 'tx',
  block_proposal = 'block_proposal',
  block_attestation = 'block_attestation',
}

export function getTopicTypeForClientType(clientType: P2PClientType) {
  if (clientType === P2PClientType.Full) {
    return Object.values(TopicType);
  } else if (clientType === P2PClientType.Prover) {
    return [TopicType.tx, TopicType.block_proposal];
  }
  return [TopicType.tx];
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
export function metricsTopicStrToLabels(protocolVersion: string) {
  const topicStrToLabel = new Map<string, string>();
  for (const topic in TopicType) {
    topicStrToLabel.set(createTopicString(TopicType[topic as keyof typeof TopicType], protocolVersion), topic);
  }

  return topicStrToLabel;
}
