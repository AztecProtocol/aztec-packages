export type PromteheusClientOptions = {
  server: URL;
};

export class PrometheusClient {
  constructor(
    private config: PromteheusClientOptions,
    private httpClient: typeof fetch = fetch,
  ) {}

  public async querySingleValue(query: string, time = new Date()): Promise<number> {
    const resp = await this.queryRaw(query, time);
    if (resp.status === 'success') {
      if (resp.data.resultType === 'vector') {
        if (resp.data.result.length === 0) {
          return 0;
        }
        const [_, value] = resp.data.result[0].value;
        return parseFloat(value);
      }
    }

    throw new TypeError('Unsupported response body', { cause: JSON.stringify(resp) });
  }

  public queryRaw(query: string, time = new Date()): Promise<PrometheusResponse> {
    const searchParams = new URLSearchParams();
    searchParams.set('query', query);
    searchParams.set('time', String(Math.trunc(time.getTime() / 1000)));
    searchParams.set('limit', '10');

    return this.callPrometheus('query', searchParams);
  }

  public queryRangeRaw(
    query: string,
    step: PrometheusDuration,
    start: Date,
    end = new Date(),
  ): Promise<PrometheusResponse> {
    const searchParams = new URLSearchParams();
    searchParams.set('query', query);
    searchParams.set('step', step);
    searchParams.set('start', String(Math.trunc(start.getTime() / 1000)));
    searchParams.set('end', String(Math.trunc(end.getTime() / 1000)));
    searchParams.set('limit', '10');

    return this.callPrometheus('query_range', searchParams);
  }

  private async callPrometheus(api: string, searchParams: URLSearchParams): Promise<PrometheusResponse> {
    const url = new URL('api/v1/' + api, this.config.server);
    for (const [name, value] of searchParams) {
      url.searchParams.append(name, value);
    }

    const resp = await this.httpClient(url, { method: 'GET' });
    if (!resp.ok || resp.status !== 200) {
      throw new Error('Invalid HTTP response from Prometheus', {
        cause: {
          url,
          status: resp.status,
          statusText: resp.statusText,
        },
      });
    }

    const body = await resp.json();
    if ('status' in body && (body.status === 'error' || body.status === 'success')) {
      return body;
    }

    throw new Error('Invalid response from Prometheus', {
      cause: {
        url,
        body,
      },
    });
  }
}

export type PrometheusDuration = `${number}s` | `${number}m` | `${number}h`;

export type PrometheusData =
  | {
      resultType: 'vector';
      result: Array<{
        metric: unknown;
        value: [unixTimestamp: number, value: string];
      }>;
    }
  | {
      resultType: 'matrix';
      result: Array<{
        metric: unknown;
        values: [unixTimestamp: number, value: string];
      }>;
    }
  | {
      resultType: 'scalar' | 'string';
      result: unknown;
    };

export type PrometheusResponse =
  | {
      status: 'error';
      errorType: string;
      error: string;
    }
  | {
      status: 'success';
      data: PrometheusData;
    };
