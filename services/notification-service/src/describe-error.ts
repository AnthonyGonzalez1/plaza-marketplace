// A short text for a log line or a header, from whatever was thrown.
export function describeError(error: unknown): string {
  // Connecting to "localhost" tries IPv6 and IPv4. When both fail, Node throws an
  // AggregateError with an empty message and the real reasons inside: show the first one
  // ("connect ECONNREFUSED ::1:1025").
  if (error instanceof AggregateError && error.errors.length > 0) {
    return describeError(error.errors[0]);
  }
  if (error instanceof Error) {
    // Some errors come with an empty message and only a code such as ECONNREFUSED.
    const code = 'code' in error ? String(error.code) : '';
    return error.message || code || error.name;
  }
  return String(error);
}
