import type { Logger } from '@aztec/foundation/log';

import type { PrometheusClient } from '../../quality_of_service/prometheus_client.js';

/** Runs a PromQL query and returns each series as a label-record plus value. Returns [] on error. */
async function queryVector(
  prometheus: PrometheusClient,
  query: string,
  logger: Logger,
): Promise<{ labels: Record<string, string>; value: number }[]> {
  try {
    const resp = await prometheus.queryRaw(query);
    if (resp.status !== 'success' || resp.data.resultType !== 'vector') {
      logger.warn(`Unexpected Prometheus response for query`, { query, resp });
      return [];
    }
    return resp.data.result.map(({ metric, value }) => ({
      labels: (metric ?? {}) as Record<string, string>,
      value: parseFloat(value[1]),
    }));
  } catch (err) {
    logger.warn(`Failed to run Prometheus query: ${err}`, { query });
    return [];
  }
}

/** Formats a grouped vector result as a { labelValue: value } record for structured logging. */
function toRecord(series: { labels: Record<string, string>; value: number }[], label: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const { labels, value } of series) {
    out[labels[label] ?? 'unknown'] = Math.round(value * 100) / 100;
  }
  return out;
}

/**
 * Scrapes and logs gossip tx validation timing breakdowns from Prometheus: per-stage validation
 * durations, tx pool serial queue wait/execution times, and chonk (IVC) proof verifier timings.
 * Used by the spartan TPS benchmarks to attribute slow gossip validations to a specific stage.
 */
export async function logGossipTxValidationMetrics(
  prometheus: PrometheusClient,
  namespace: string,
  windowSeconds: number,
  logger: Logger,
): Promise<void> {
  const ns = `k8s_namespace_name="${namespace}"`;
  const window = `[${Math.max(60, Math.ceil(windowSeconds))}s]`;

  const stageQuantile = (perc: string) =>
    `histogram_quantile(${perc}, sum(rate(aztec_p2p_gossip_tx_validation_stage_duration_milliseconds_bucket{${ns}}${window})) by (le, aztec_p2p_tx_validation_stage))`;
  const stageAvg = () =>
    `sum(rate(aztec_p2p_gossip_tx_validation_stage_duration_milliseconds_sum{${ns}}${window})) by (aztec_p2p_tx_validation_stage) / ` +
    `sum(rate(aztec_p2p_gossip_tx_validation_stage_duration_milliseconds_count{${ns}}${window})) by (aztec_p2p_tx_validation_stage)`;
  const validationQuantile = (perc: string) =>
    `histogram_quantile(${perc}, sum(rate(aztec_p2p_gossip_message_validation_duration_milliseconds_bucket{${ns}}${window})) by (le, aztec_gossip_topic_name))`;
  const queueQuantile = (metric: string, perc: string) =>
    `topk(10, histogram_quantile(${perc}, sum(rate(${metric}{${ns}}${window})) by (le, aztec_mempool_operation)))`;
  const ivcQuantile = (metric: string, perc: string) =>
    `histogram_quantile(${perc}, sum(rate(${metric}{${ns}}${window})) by (le))`;

  const stageLabel = 'aztec_p2p_tx_validation_stage';
  const topicLabel = 'aztec_gossip_topic_name';
  const operationLabel = 'aztec_mempool_operation';

  const [stageP50, stageP95, stageAvgs, validationP95, slowCount] = await Promise.all([
    queryVector(prometheus, stageQuantile('0.50'), logger),
    queryVector(prometheus, stageQuantile('0.95'), logger),
    queryVector(prometheus, stageAvg(), logger),
    queryVector(prometheus, validationQuantile('0.95'), logger),
    queryVector(prometheus, `sum(aztec_p2p_gossip_slow_validation_count{${ns}}) by (${topicLabel})`, logger),
  ]);

  logger.info('Gossip tx validation stage timings (ms)', {
    stageP50: toRecord(stageP50, stageLabel),
    stageP95: toRecord(stageP95, stageLabel),
    stageAvg: toRecord(stageAvgs, stageLabel),
    validationP95ByTopic: toRecord(validationP95, topicLabel),
    slowValidationCountByTopic: toRecord(slowCount, topicLabel),
  });

  const [queueWaitP95, queueExecutionP95, queueLengthMax] = await Promise.all([
    queryVector(prometheus, queueQuantile('aztec_mempool_tx_pool_v2_queue_wait_milliseconds_bucket', '0.95'), logger),
    queryVector(
      prometheus,
      queueQuantile('aztec_mempool_tx_pool_v2_queue_execution_milliseconds_bucket', '0.95'),
      logger,
    ),
    queryVector(prometheus, `max(max_over_time(aztec_mempool_tx_pool_v2_queue_length{${ns}}${window}))`, logger),
  ]);

  logger.info('Tx pool serial queue stats (ms)', {
    queueWaitP95: toRecord(queueWaitP95, operationLabel),
    queueExecutionP95: toRecord(queueExecutionP95, operationLabel),
    queueLengthMax: queueLengthMax[0]?.value,
  });

  const [ivcVerifyP95, ivcTotalP95] = await Promise.all([
    queryVector(prometheus, ivcQuantile('aztec_ivc_verifier_time_milliseconds_bucket', '0.95'), logger),
    queryVector(prometheus, ivcQuantile('aztec_ivc_verifier_total_time_milliseconds_bucket', '0.95'), logger),
  ]);

  // A large gap between total (queue + verify) and verify indicates a pile-up in the verifier queue.
  logger.info('Chonk (IVC) proof verifier timings (ms)', {
    verifyP95: ivcVerifyP95[0]?.value,
    totalP95: ivcTotalP95[0]?.value,
  });
}
