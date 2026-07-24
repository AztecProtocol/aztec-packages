import { TestExecutorMetrics } from './test_executor_metrics.js';

describe('TestExecutorMetrics', () => {
  it('surfaces the tx-level totalInstructionsExecuted reported by the simulator', () => {
    const metrics = new TestExecutorMetrics();
    const txLabel = 'MyContract/my_fn';

    metrics.startRecordingTxSimulation(txLabel);
    metrics.stopRecordingTxSimulation(
      txLabel,
      /*gasUsed=*/ undefined,
      /*revertedCode=*/ undefined,
      /*totalInstructionsExecuted=*/ 4242,
    );

    // The instruction count must appear in the github-action-benchmark JSON uploaded to the dashboard.
    const json: Array<{ name: string; value: number; unit: string }> = JSON.parse(
      metrics.toGithubActionBenchmarkJSON(),
    );
    const entry = json.find(e => e.name === `${txLabel}/totalInstructionsExecuted`);
    expect(entry).toEqual({ name: `${txLabel}/totalInstructionsExecuted`, value: 4242, unit: '#instructions' });

    // ...and in the human-readable summary.
    expect(metrics.toPrettyString()).toContain('Total instructions executed: `4,242`');
  });

  it('defaults totalInstructionsExecuted to 0 when the simulator reports none', () => {
    const metrics = new TestExecutorMetrics();
    const txLabel = 'MyContract/empty';

    metrics.startRecordingTxSimulation(txLabel);
    metrics.stopRecordingTxSimulation(txLabel);

    const json: Array<{ name: string; value: number; unit: string }> = JSON.parse(
      metrics.toGithubActionBenchmarkJSON(),
    );
    const entry = json.find(e => e.name === `${txLabel}/totalInstructionsExecuted`);
    expect(entry?.value).toBe(0);
  });
});
