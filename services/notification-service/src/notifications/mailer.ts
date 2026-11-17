import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { APP_CONFIG, type AppConfig } from '../config';
import type { Email } from './email-templates';

// How long the SMTP server may take to accept the connection or to answer a command. Without
// a limit, a server that accepts the connection and then says nothing would keep a message
// "in progress" for minutes (the defaults of nodemailer).
const SMTP_TIMEOUT_MS = 10_000;

// A thin wrapper around nodemailer: the rest of the code only knows "send(to, email)", and the
// tests replace this class with a fake that records what would have been sent.
@Injectable()
export class Mailer implements OnApplicationShutdown {
  private readonly transport: Transporter;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    // No user, no password and no TLS: in development the SMTP server is Mailpit, a fake mail
    // server that accepts every email and shows it in a web page instead of delivering it.
    // A real provider would need "auth" and TLS here.
    // Nothing connects at this point: the connection is opened when the first email is sent.
    this.transport = createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: false,
      ignoreTLS: true,
      connectionTimeout: SMTP_TIMEOUT_MS,
      greetingTimeout: SMTP_TIMEOUT_MS,
      socketTimeout: SMTP_TIMEOUT_MS,
    });
  }

  // Resolves when the SMTP server has accepted the email; throws when it could not be handed
  // over (server down, timeout, address rejected).
  async send(to: string, email: Email): Promise<void> {
    await this.transport.sendMail({
      from: this.config.mailFrom,
      to,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
  }

  onApplicationShutdown(): void {
    this.transport.close();
  }
}
