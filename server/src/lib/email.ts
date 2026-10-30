import { Resend } from 'resend';
import { env } from '../env.ts';
import { logger } from '../logger.ts';

// Routes call sendEmail() and never know HOW the email goes out.
// One "sender" is picked at startup, by environment:
//   test                   -> memory  (nothing leaves the process)
//   RESEND_API_KEY set     -> resend  (real email)
//   dev, no key            -> console (printed to the terminal)

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
};

type EmailSender = (message: EmailMessage) => Promise<void>;

// Test inbox: tests read codes from here instead of a real mailbox.
// Emptied before each test (src/test/setup.ts).
export const sentEmails: EmailMessage[] = [];

const memorySender: EmailSender = async (message) => {
  sentEmails.push(message);
};

// DEV ONLY: prints the email, including any code in it. Breaks our
// "never log secrets" rule on purpose so you can test without an email
// account. env.ts refuses to start production without RESEND_API_KEY,
// so this can never run there.
const consoleSender: EmailSender = async (message) => {
  logger.info({ email: message }, 'email NOT sent (no RESEND_API_KEY)');
};

function resendSender(apiKey: string): EmailSender {
  const resend = new Resend(apiKey);

  return async (message) => {
    // Resend doesn't throw on failure — it returns { error }. Turn that
    // into a throw so callers can't silently ignore a failed send.
    const { error } = await resend.emails.send({
      from: env.EMAIL_FROM,
      ...message,
    });
    if (error) {
      throw new Error(`Resend failed: ${error.name}: ${error.message}`);
    }
  };
}

function pickSender(): EmailSender {
  if (env.NODE_ENV === 'test') return memorySender;
  if (env.RESEND_API_KEY) return resendSender(env.RESEND_API_KEY);
  return consoleSender;
}

export const sendEmail: EmailSender = pickSender();
