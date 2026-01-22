import { P2PClientType } from './client_type.js';

/**
 * Creates the topic channel identifier string from a given topic type
 */
export function createTopicString(topicType: TopicType, protocolVersion: string) {
  return `/aztec/${TopicType[topicType]}/${protocolVersion}`;
}

/** Extracts the topic type from a topic string */
export function getTopicFromString(topicStr: string): TopicType | undefined {
  const parts = topicStr.split('/');
  if (parts.length < 4 || parts[1] !== 'aztec') {
    return undefined;
  }
  const topic = parts[2];
  if (Object.values(TopicType).includes(topic as TopicType)) {
    return topic as TopicType;
  }
  return undefined;
}

export enum TopicType {
  tx = 'tx',
  block_proposal = 'block_proposal',
  checkpoint_proposal = 'checkpoint_proposal',
  checkpoint_attestation = 'checkpoint_attestation',
}

export function getTopicTypeForClientType(clientType: P2PClientType) {
  if (clientType === P2PClientType.Full) {
    return [TopicType.tx, TopicType.block_proposal, TopicType.checkpoint_proposal, TopicType.checkpoint_attestation];
  } else if (clientType === P2PClientType.Prover) {
    return [TopicType.tx, TopicType.block_proposal, TopicType.checkpoint_proposal];
  } else {
    const _: never = clientType;
    return [TopicType.tx];
  }
}

export function getTopicsForClientAndConfig(clientType: P2PClientType, disableTransactions: boolean) {
  const topics = getTopicTypeForClientType(clientType);
  if (disableTransactions) {
    return topics.filter(topic => topic !== TopicType.tx);
  }
  return topics;
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
