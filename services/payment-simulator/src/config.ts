// All the configuration of the service, read once from environment variables when it starts.
// Every variable has a default so "pnpm start" works locally without any setup.

export type Outcome = 'APPROVED' | 'DECLINED';

export interface AppConfig {
  port: number;
  webhookUrl: string;
  webhookSecret: string;
  paymentDelayMs: number;
  defaultOutcome: Outcome;
  duplicateWebhooks: boolean;
  webhookMaxAttempts: number;
  webhookRetryDelayMs: number;
}

// Name under which the config object is registered in Nest (see app.module.ts). Classes ask
// for it with @Inject(APP_CONFIG), and tests can replace it with their own values.
export const APP_CONFIG = 'APP_CONFIG';

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: readInteger(env, 'PORT', 3001, 0),
    webhookUrl: env.WEBHOOK_URL || 'http://localhost:8080/api/v1/webhooks/payments',
    webhookSecret: env.WEBHOOK_SECRET || 'local-dev-webhook-secret',
    paymentDelayMs: readInteger(env, 'PAYMENT_DELAY_MS', 2000, 0),
    defaultOutcome: readOutcome(env),
    duplicateWebhooks: readBoolean(env, 'DUPLICATE_WEBHOOKS', false),
    webhookMaxAttempts: readInteger(env, 'WEBHOOK_MAX_ATTEMPTS', 3, 1),
    webhookRetryDelayMs: readInteger(env, 'WEBHOOK_RETRY_DELAY_MS', 1000, 0),
  };
}

// A wrong value stops the service at start-up with a clear message. That is better than
// starting with a silent fallback and discovering the typo later.
function readInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  defaultValue: number,
  minimum: number,
): number {
  const raw = env[name];
  if (raw === undefined || raw === '') {
    return defaultValue;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${name} must be an integer >= ${minimum}, got "${raw}"`);
  }
  return value;
}

function readBoolean(env: NodeJS.ProcessEnv, name: string, defaultValue: boolean): boolean {
  const raw = env[name];
  if (raw === undefined || raw === '') {
    return defaultValue;
  }
  if (raw !== 'true' && raw !== 'false') {
    throw new Error(`${name} must be "true" or "false", got "${raw}"`);
  }
  return raw === 'true';
}

function readOutcome(env: NodeJS.ProcessEnv): Outcome {
  const raw = env.DEFAULT_OUTCOME;
  if (raw === undefined || raw === '') {
    return 'APPROVED';
  }
  if (raw !== 'APPROVED' && raw !== 'DECLINED') {
    throw new Error(`DEFAULT_OUTCOME must be "APPROVED" or "DECLINED", got "${raw}"`);
  }
  return raw;
}
