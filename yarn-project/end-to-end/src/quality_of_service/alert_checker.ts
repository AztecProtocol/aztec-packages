import { type DebugLogger } from '@aztec/aztec.js';
import { fileURLToPath } from '@aztec/foundation/url';

import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { dirname, join } from 'path';

export interface AlertConfig {
  alert: string;
  expr: string;
  for: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
}

export interface AlertCheckerConfig {
  grafanaEndpoint: string;
  grafanaCredentials: string;
}

const DEFAULT_CONFIG: AlertCheckerConfig = {
  grafanaEndpoint: 'http://localhost:3000/api/datasources/proxy/uid/prometheus/api/v1/query',
  grafanaCredentials: 'admin:admin',
};

export class AlertChecker {
  private config: AlertCheckerConfig;
  private logger: DebugLogger;

  constructor(logger: DebugLogger, config: Partial<AlertCheckerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
  }

  private loadAlertsConfig(filePath: string): AlertConfig[] {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const fileContents = fs.readFileSync(join(__dirname, filePath), 'utf8');
    const data = yaml.load(fileContents) as { alerts: AlertConfig[] };
    return data.alerts;
  }

  private async queryGrafana(expr: string): Promise<number> {
    const credentials = Buffer.from(this.config.grafanaCredentials).toString('base64');

    const response = await fetch(`${this.config.grafanaEndpoint}?query=${encodeURIComponent(expr)}`, {
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

  private async checkAlerts(alerts: AlertConfig[]): Promise<void> {
    let alertTriggered = false;

    for (const alert of alerts) {
      this.logger.info(`Checking alert: ${JSON.stringify(alert)}`);

      const metricValue = await this.queryGrafana(alert.expr);
      this.logger.info(`Metric value: ${metricValue}`);
      if (metricValue > 0) {
        this.logger.error(`Alert ${alert.alert} triggered! Value: ${metricValue}`);
        alertTriggered = true;
      } else {
        this.logger.info(`Alert ${alert.alert} passed.`);
      }
    }

    if (alertTriggered) {
      throw new Error('Test failed due to triggered alert');
    }
  }

  public async runAlertCheck(alerts: AlertConfig[]): Promise<void> {
    try {
      await this.checkAlerts(alerts);
      this.logger.info('All alerts passed.');
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  public async runAlertCheckFromFilePath(filePath: string): Promise<void> {
    const alerts = this.loadAlertsConfig(filePath);
    await this.checkAlerts(alerts);
  }
}
