import { type TelemetryClient, type TelemetryClientConfig, initTelemetryClient } from '@aztec/telemetry-client';

import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { InboxBotMetrics } from './inbox_bot_metrics.js';

/** One metric as it arrived at the collector, flattened out of the OTLP resource/scope envelope. */
interface ExportedMetric {
  name: string;
  unit?: string;
  /** OTLP data shape: `sum` for counters, `histogram` for histograms, `gauge` for observable gauges. */
  kind: string;
  dataPoints: { attributes: Record<string, string | number | boolean> }[];
}

/** Collector stub that accepts OTLP/HTTP metric exports and keeps what the exporter sent it. */
class CollectorStub {
  private readonly server: Server;
  private readonly payloads: unknown[] = [];

  private constructor(server: Server) {
    this.server = server;
  }

  public static start(): Promise<CollectorStub> {
    return new Promise(resolve => {
      const stub = new CollectorStub(
        createServer((req, res) => {
          const chunks: Buffer[] = [];
          req.on('data', chunk => chunks.push(chunk as Buffer));
          req.on('end', () => {
            stub.record(Buffer.concat(chunks).toString('utf8'));
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end('{}');
          });
        }),
      );
      stub.server.listen(0, '127.0.0.1', () => resolve(stub));
    });
  }

  public get url(): URL {
    return new URL(`http://127.0.0.1:${(this.server.address() as AddressInfo).port}/v1/metrics`);
  }

  public stop(): Promise<void> {
    return new Promise(resolve => this.server.close(() => resolve()));
  }

  /** Every metric the exporter delivered, flattened out of the OTLP envelope. */
  public metrics(): ExportedMetric[] {
    const exported: ExportedMetric[] = [];
    for (const payload of this.payloads as any[]) {
      for (const resource of payload.resourceMetrics ?? []) {
        for (const scope of resource.scopeMetrics ?? []) {
          for (const metric of scope.metrics ?? []) {
            const kind = ['sum', 'histogram', 'gauge', 'exponentialHistogram'].find(key => key in metric) ?? 'unknown';
            exported.push({
              name: metric.name,
              unit: metric.unit,
              kind,
              dataPoints: (metric[kind]?.dataPoints ?? []).map((point: any) => ({
                attributes: Object.fromEntries(
                  (point.attributes ?? []).map((attribute: any) => [
                    attribute.key,
                    attribute.value?.stringValue ??
                      attribute.value?.intValue ??
                      attribute.value?.doubleValue ??
                      attribute.value?.boolValue,
                  ]),
                ),
              })),
            });
          }
        }
      }
    }
    return exported;
  }

  private record(body: string): void {
    try {
      this.payloads.push(JSON.parse(body));
    } catch {
      // A body that is not the JSON the OTLP/HTTP exporter sends fails the assertions rather than this handler.
      this.payloads.push({});
    }
  }
}

function collectorConfig(url: URL): TelemetryClientConfig {
  return {
    metricsCollectorUrl: url,
    publicIncludeMetrics: [],
    publicMetricsOptOut: true,
    publicMetricsCollectFrom: [],
    otelCollectIntervalMs: 60_000,
    otelExportTimeoutMs: 10_000,
    otelExcludeMetrics: [],
    otelIncludeMetrics: [],
    otelMinTraceDurationMs: 0,
    otelBspMaxQueueSize: 128,
    otelBspMaxExportBatchSize: 32,
    otelBspScheduleDelayMs: 100,
  };
}

// Smoke test that the inbox bot's instruments reach a configured collector, over the real OpenTelemetry client and
// OTLP/HTTP exporter rather than the in-memory recording meter the other suites use. It is what backs the metric
// names and units documented in bot/README.md.
describe('InboxBotMetrics collector export', () => {
  let collector: CollectorStub;
  let client: TelemetryClient;
  let exported: ExportedMetric[];

  beforeAll(async () => {
    collector = await CollectorStub.start();
    client = await initTelemetryClient(collectorConfig(collector.url));

    const metrics = new InboxBotMetrics(client, 'checkpointed', 'proven');
    metrics.start(() =>
      Promise.resolve({
        pending: [
          { scenario: 'normal', count: 3, oldestAgeSeconds: 12.5 },
          { scenario: 'saturation', count: 0, oldestAgeSeconds: 0 },
        ],
        saturation: {
          enabled: true,
          lastSuccessTimestampSeconds: 1_700_000_000,
          nextDueTimestampSeconds: 1_700_086_400,
        },
      }),
    );

    metrics.recordMessageMilestone({ scenario: 'normal', mode: 'public' }, 'included', 'same_block');
    metrics.recordMessageMilestone({ scenario: 'normal', mode: 'private' }, 'completed');
    metrics.recordStage('l1_mined_to_included', { scenario: 'normal', mode: 'public' }, 2.5);
    metrics.recordStage('l1_submission_to_mined', { scenario: 'saturation' }, 12);
    metrics.recordSimulation('not_ready', { scenario: 'normal', mode: 'public' });
    metrics.recordPublicExecution('success', 'normal');
    metrics.recordPredictionMismatch('normal');
    metrics.recordCheck('bucket_rollover', 'passed');
    metrics.recordFailure('timeout');
    metrics.recordL1Batch('success', 'saturation', { messageCount: 257, gasUsed: 21_000_000n });
    metrics.recordSaturationRun('success');

    // Collection is pulled by the flush rather than waited for on the export interval.
    await client.flush();
    exported = collector.metrics();
    metrics.stop();
  });

  afterAll(async () => {
    await client.stop();
    await collector.stop();
  });

  it('delivers every inbox instrument to the collector with its unit and shape', () => {
    const byName = new Map(exported.map(metric => [metric.name, metric]));

    expect([...byName.keys()].filter(name => name.startsWith('aztec.bot.inbox')).sort()).toEqual([
      'aztec.bot.inbox.check_count',
      'aztec.bot.inbox.failure_count',
      'aztec.bot.inbox.l1_batch_count',
      'aztec.bot.inbox.l1_batch_size',
      'aztec.bot.inbox.l1_gas_used',
      'aztec.bot.inbox.message_count',
      'aztec.bot.inbox.oldest_pending_age',
      'aztec.bot.inbox.pending_count',
      'aztec.bot.inbox.prediction_mismatch_count',
      'aztec.bot.inbox.public_execution_count',
      'aztec.bot.inbox.saturation_enabled',
      'aztec.bot.inbox.saturation_last_success_timestamp',
      'aztec.bot.inbox.saturation_next_due_timestamp',
      'aztec.bot.inbox.saturation_run_count',
      'aztec.bot.inbox.simulation_count',
      'aztec.bot.inbox.stage_duration',
    ]);

    expect(byName.get('aztec.bot.inbox.message_count')).toMatchObject({ kind: 'sum', unit: 'messages' });
    expect(byName.get('aztec.bot.inbox.stage_duration')).toMatchObject({ kind: 'histogram', unit: 's' });
    expect(byName.get('aztec.bot.inbox.l1_gas_used')).toMatchObject({ kind: 'histogram', unit: 'gas' });
    expect(byName.get('aztec.bot.inbox.pending_count')).toMatchObject({ kind: 'gauge', unit: 'messages' });
    expect(byName.get('aztec.bot.inbox.saturation_enabled')).toMatchObject({ kind: 'gauge', unit: '1' });
  });

  it('delivers the gauges the bot only reports on collection', () => {
    const pending = exported.find(metric => metric.name === 'aztec.bot.inbox.pending_count');

    expect(pending!.dataPoints.map(point => point.attributes['aztec.bot.inbox.scenario']).sort()).toEqual([
      'normal',
      'saturation',
    ]);
  });

  it('labels the exported series with bounded attribute values only', () => {
    const inbox = exported.filter(metric => metric.name.startsWith('aztec.bot.inbox'));
    const values = inbox.flatMap(metric => metric.dataPoints.flatMap(point => Object.values(point.attributes)));

    expect(values.length).toBeGreaterThan(0);
    for (const value of values) {
      expect(typeof value).toEqual('string');
      expect(value as string).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });
});
