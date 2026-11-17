import { createHmac } from 'node:crypto';

// HMAC = a hash of the message mixed with a secret that only the sender and the receiver know.
// The receiver computes the same HMAC over the body it received and compares it with the
// header. If they match, the message really comes from someone who has the secret and nobody
// changed it on the way. Without this, anyone who knows the webhook URL could mark an order as
// paid.
export function sign(body: string, secret: string): string {
  const hex = createHmac('sha256', secret).update(body).digest('hex');
  return `sha256=${hex}`;
}
