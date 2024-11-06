import * as yaml from "js-yaml";
import * as fs from "fs";
import path, { join, dirname } from "path";
import { fileURLToPath } from "@aztec/foundation/url";
const GRAFANA_ENDPOINT = "http://localhost:3000/api/datasources/proxy/uid/prometheus/api/v1/query"

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
      'Authorization': `Basic ${credentials}`
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch data from Grafana: ${response.statusText}`);
  }

  const data = await response.json();
  const result = data.data.result;
  console.log(data)
  return result.length > 0 ? parseFloat(result[0].value[1]) : 0;
}

// Function to check alerts based on expressions
async function checkAlerts(alerts: AlertConfig[]) {
  for (const alert of alerts) {
    console.log(`Checking alert: ${JSON.stringify(alert)}`);

    const metricValue = await queryGrafana(alert.expr);
    console.log(`Metric value: ${metricValue}`);
    if (metricValue > 0) {  // Adjust condition as needed
      console.log(`Alert ${alert.alert} triggered! Value: ${metricValue}`);
      throw new Error(`Test failed due to triggered alert: ${alert.alert}`);
    } else {
      console.log(`Alert ${alert.alert} passed.`);
    }
  }
}

// Main function to run tests
async function runAlertChecker() {
  const alerts = loadAlertsConfig('alerts.yaml');
  try {
    await checkAlerts(alerts);
    console.log("All alerts passed.");
  } catch (error) {
    console.error(error);
    process.exit(1);  // Exit with error code
  }
}

// Running as a jest test to use existing end to end test framework
describe('Alert Checker', () => {
  it('should check alerts', async () => {
    await runAlertChecker();
  });
});