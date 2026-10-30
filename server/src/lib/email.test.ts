import { describe, expect, it } from 'vitest';
import { sendEmail, sentEmails } from './email.ts';

// In tests, sendEmail is the memory sender: nothing is really sent.
describe('sendEmail (test environment)', () => {
  it('puts the message in the test inbox', async () => {
    const message = { to: 'a@b.com', subject: 'Hi', text: 'Hello' };

    await sendEmail(message);

    expect(sentEmails).toEqual([message]);
  });

  it('starts every test with an empty inbox', () => {
    expect(sentEmails).toEqual([]);
  });
});
