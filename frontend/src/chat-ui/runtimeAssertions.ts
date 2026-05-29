import type { ChatRealtimeDiagnostic } from './types.js';

const sensitiveDiagnosticPatterns = [
  /accessToken/i,
  /Authorization/i,
  /CHAT_INTERNAL_AUTH_SECRET/i,
  /bearer\s+[A-Za-z0-9._~+/=-]+/i,
  /"authorization"\s*:/i,
] as const;

export const assertNoTokenDiagnostics = (value: unknown): void => {
  const serialized = JSON.stringify(value);

  for (const pattern of sensitiveDiagnosticPatterns) {
    if (pattern.test(serialized)) {
      throw new Error(`Diagnostic payload contains sensitive token material: ${pattern.source}`);
    }
  }
};

export const assertSingleEventSource = (
  diagnostics: readonly ChatRealtimeDiagnostic[],
): void => {
  const maxActiveEventSourceCount = diagnostics.reduce(
    (maxCount, diagnostic) => Math.max(maxCount, diagnostic.activeEventSourceCount ?? 0),
    0,
  );

  if (maxActiveEventSourceCount > 1) {
    throw new Error(`Expected at most one active EventSource, received ${maxActiveEventSourceCount}`);
  }
};

export const assertNoLeakMarkers = (diagnostics: readonly ChatRealtimeDiagnostic[]): void => {
  const hasLeakMarker = diagnostics.some(
    (diagnostic) =>
      diagnostic.duplicateConnectionPreventionCount !== undefined &&
      diagnostic.duplicateConnectionPreventionCount > 0,
  );

  if (hasLeakMarker) {
    throw new Error('Expected no duplicate EventSource leak markers in diagnostics');
  }
};

export const assertRuntimeDiagnosticsSafe = (
  diagnostics: readonly ChatRealtimeDiagnostic[],
): void => {
  assertSingleEventSource(diagnostics);
  assertNoLeakMarkers(diagnostics);
  assertNoTokenDiagnostics(diagnostics);
};
