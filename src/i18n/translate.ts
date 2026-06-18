function resolveKey(messages: Record<string, unknown>, key: string): string | undefined {
  const parts = key.split('.');
  let cur: unknown = messages;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

/** Resolve dot-notation key with optional `{param}` interpolation. */
export function translate(
  messages: Record<string, unknown>,
  key: string,
  params?: Record<string, string | number>,
  fallbackMessages?: Record<string, unknown>,
): string {
  let value =
    resolveKey(messages, key) ??
    (fallbackMessages ? resolveKey(fallbackMessages, key) : undefined) ??
    key;

  if (params) {
    for (const [paramKey, paramValue] of Object.entries(params)) {
      value = value.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramValue));
    }
  }
  return value;
}
