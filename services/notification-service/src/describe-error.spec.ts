import { describeError } from './describe-error';

describe('describeError', () => {
  it('uses the message of an Error', () => {
    expect(describeError(new Error('The client is offline'))).toBe('The client is offline');
  });

  it('uses the code when the message is empty', () => {
    const error = Object.assign(new Error(''), { code: 'ECONNREFUSED' });

    expect(describeError(error)).toBe('ECONNREFUSED');
  });

  it('uses the first inner error of an AggregateError', () => {
    const error = new AggregateError([
      new Error('connect ECONNREFUSED ::1:1025'),
      new Error('connect ECONNREFUSED 127.0.0.1:1025'),
    ]);

    expect(describeError(error)).toBe('connect ECONNREFUSED ::1:1025');
  });

  it('turns anything else into text', () => {
    expect(describeError('boom')).toBe('boom');
  });
});
