// The addresses of the running stack, read once from environment variables.
// Every variable has a default that matches `docker compose up` on this machine, so the suite
// runs without any configuration; CI or another environment only overrides what differs.

/** The web app the browser opens. */
export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

/** The store API, called directly by the tests that check data without a browser. */
export const API_URL = process.env.API_URL ?? 'http://localhost:8080';

/** Mailpit, the fake mail server that catches the e-mails sent by the notification service. */
export const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025';

/**
 * The e-mail checks are optional: they only run with E2E_CHECK_EMAIL=true, so the suite also
 * passes against a stack that has no mail server.
 */
export const CHECK_EMAIL = process.env.E2E_CHECK_EMAIL === 'true';
