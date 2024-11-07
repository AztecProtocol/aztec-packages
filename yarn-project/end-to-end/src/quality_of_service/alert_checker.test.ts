import { type DebugLogger, createDebugLogger } from '@aztec/aztec.js';
import { fileURLToPath } from '@aztec/foundation/url';

import { Octokit } from '@octokit/rest';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { dirname, join } from 'path';

const GRAFANA_ENDPOINT = 'http://localhost:3000/api/datasources/proxy/uid/prometheus/api/v1/query';
interface AlertConfig {
  alert: string;
  expr: string;
  for: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
}
// Define __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load YAML configuration
function loadAlertsConfig(filePath: string): AlertConfig[] {
  const fileContents = fs.readFileSync(join(__dirname, filePath), 'utf8');
  const data = yaml.load(fileContents) as { alerts: AlertConfig[] };
  return data.alerts;
}

// Function to query Grafana based on an expression
async function queryGrafana(expr: string): Promise<number> {
  // Create base64 encoded credentials for basic auth
  const credentials = Buffer.from('admin:admin').toString('base64');

  const response = await fetch(`${GRAFANA_ENDPOINT}?query=${encodeURIComponent(expr)}`, {
    headers: {
      Authorization: `Basic ${credentials}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch data from Grafana: ${response.statusText}`);
  }

  const data = await response.json();
  const result = data.data.result;
  return result.length > 0 ? parseFloat(result[0].value[1]) : 0;
}

// Function to check alerts based on expressions
async function checkAlerts(alerts: AlertConfig[], logger: DebugLogger) {
  let commentMessage = '';
  let alertTriggered = false;

  for (const alert of alerts) {
    logger.info(`Checking alert: ${JSON.stringify(alert)}`);

    const metricValue = await queryGrafana(alert.expr);
    logger.info(`Metric value: ${metricValue}`);
    if (metricValue > 0) {
      // Adjust condition as needed
      const message = `Alert ${alert.alert} triggered! Value: ${metricValue}`;
      logger.error(message);

      commentMessage += message + '\n\n';
      alertTriggered = true;
    } else {
      logger.info(`Alert ${alert.alert} passed.`);
    }
  }

  // If any alerts have been triggered
  // We post a comment on the PR and fail the test
  if (alertTriggered) {
    await postCommentOnPR(commentMessage, logger);

    throw new Error('Test failed due to triggered alert');
  }
}

// Function to post a comment on the PR
async function postCommentOnPR(message: string, logger: DebugLogger) {
  const { AZTEC_BOT_GITHUB_TOKEN, PULL_REQUEST } = process.env;
  if (!AZTEC_BOT_GITHUB_TOKEN || !PULL_REQUEST) {
    logger.error('Missing required GitHub environment variables, cannot post comment');
    return;
  }
  const token = AZTEC_BOT_GITHUB_TOKEN;
  const prNumber = parseInt(PULL_REQUEST, 10);
  if (isNaN(prNumber)) {
    logger.error('Missing required GitHub environment variables.');
    return;
  }

  const octokit = new Octokit({ auth: token });

  await octokit.issues.createComment({
    owner: 'AztecProtocol',
    repo: 'aztec-packages',
    /* eslint-disable-next-line camelcase */
    issue_number: prNumber,
    body: message,
  });
}

// Main function to run tests
async function runAlertChecker(logger: DebugLogger) {
  const alerts = loadAlertsConfig('alerts.yaml');
  try {
    await checkAlerts(alerts, logger);
    logger.info('All alerts passed.');
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1); // Exit with error code
  }
}

// Running as a jest test to use existing end to end test framework
describe('Alert Checker', () => {
  const logger = createDebugLogger('aztec:alert-checker');
  it('should check alerts', async () => {
    await runAlertChecker(logger);
  });
});
