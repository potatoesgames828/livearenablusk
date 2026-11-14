/**
 * OpenTelemetry opcional: ativado somente quando OTEL_EXPORTER_OTLP_ENDPOINT
 * estiver definido. Assim o desenvolvimento local não depende de coletor.
 */
let started = false;

export async function initTracing(serviceName: string): Promise<void> {
  if (started || !process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return;
  started = true;
  const [{ NodeSDK }, { OTLPTraceExporter }, { HttpInstrumentation }, { resourceFromAttributes }, sc] = await Promise.all([
    import('@opentelemetry/sdk-node'),
    import('@opentelemetry/exporter-trace-otlp-http'),
    import('@opentelemetry/instrumentation-http'),
    import('@opentelemetry/resources'),
    import('@opentelemetry/semantic-conventions'),
  ]);
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({ [sc.ATTR_SERVICE_NAME]: serviceName }),
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [new HttpInstrumentation()],
  });
  sdk.start();
  process.once('SIGTERM', () => {
    void sdk.shutdown();
  });
}
