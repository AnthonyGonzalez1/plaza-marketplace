import { createHmac } from 'node:crypto';
import { sign } from './signature';

describe('sign', () => {
  it('returns the known HMAC-SHA256 of a known message', () => {
    // Public test vector (the HMAC example of Wikipedia).
    const signature = sign('The quick brown fox jumps over the lazy dog', 'key');

    expect(signature).toBe(
      'sha256=f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8',
    );
  });

  it('matches what a receiver computes with node:crypto', () => {
    const body = '{"eventId":"1","status":"APPROVED"}';

    const expected = createHmac('sha256', 'local-dev-webhook-secret').update(body).digest('hex');

    expect(sign(body, 'local-dev-webhook-secret')).toBe(`sha256=${expected}`);
  });

  it('gives a different signature with a different secret', () => {
    const body = '{"status":"APPROVED"}';

    expect(sign(body, 'secret-a')).not.toBe(sign(body, 'secret-b'));
  });

  it('gives a different signature when the body changes', () => {
    expect(sign('{"status":"APPROVED"}', 'secret')).not.toBe(
      sign('{"status":"DECLINED"}', 'secret'),
    );
  });
});
