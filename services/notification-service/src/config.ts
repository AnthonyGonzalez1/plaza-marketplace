// All the configuration of the service, read once from environment variables when it starts.
// Every variable has a default so "pnpm start" works locally without any setup.

export interface AppConfig {
  port: number;
  rabbitmqUrl: string;
  redisUrl: string;
  smtpHost: string;
  smtpPort: number;
  mailFrom: string;
  webBaseUrl: string;
  maxAttempts: number;
  retryDelayMs: number;
}

// Name under which the config object is registered in Nest (see app.module.ts). Classes ask
// for it with @Inject(APP_CONFIG), and tests can replace it with their own values.
export const APP_CONFIG = 'APP_CONFIG';

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: readInteger(env, 'PORT', 3002, 0),
    rabbitmqUrl: readUrl(env, 'RABBITMQ_URL', 'amqp://plaza:plaza@localhost:5672'),
    redisUrl: readUrl(env, 'REDIS_URL', 'redis://localhost:6379'),
    smtpHost: env.SMTP_HOST || 'localhost',
    smtpPort: readInteger(env, 'SMTP_PORT', 1025, 1),
    mailFrom: env.MAIL_FROM || 'Plaza Marketplace <no-reply@plaza.localhost>',
    // Stored without a final "/", so links are built as `${webBaseUrl}/orders/<id>`.
    webBaseUrl: readUrl(env, 'WEB_BASE_URL', 'http://localhost:3000').replace(/\/+$/, ''),
    maxAttempts: readInteger(env, 'MAX_ATTEMPTS', 3, 1),
    // At least 1 ms: with a delay of 0 the "wait" queue of the retries would not wait at all.
    retryDelayMs: readInteger(env, 'RETRY_DELAY_MS', 5000, 1),
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

function readUrl(env: NodeJS.ProcessEnv, name: string, defaultValue: string): string {
  const raw = env[name];
  if (raw === undefined || raw === '') {
    return defaultValue;
  }
  if (!URL.canParse(raw)) {
    // The value is not printed on purpose: these URLs can contain a password.
    throw new Error(`${name} must be a URL such as ${defaultValue}`);
  }
  return raw;
}
