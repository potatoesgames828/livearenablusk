import { Injectable } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from './env';
import { Infra } from './infra';

/**
 * Envio de e-mails. Sem SMTP configurado, as mensagens são guardadas em uma
 * "caixa de saída de desenvolvimento" no Redis (visível apenas em dev/test),
 * permitindo testar recuperação de senha sem provedor externo.
 */
@Injectable()
export class Mailer {
  private transport: Transporter | null = null;

  constructor(private readonly infra: Infra) {
    const url = env().SMTP_URL;
    if (url) this.transport = nodemailer.createTransport(url);
  }

  async send(to: string, subject: string, text: string): Promise<void> {
    if (this.transport) {
      await this.transport.sendMail({ from: env().MAIL_FROM, to, subject, text });
      return;
    }
    if (env().NODE_ENV === 'production') {
      this.infra.logger.error({ subject }, 'SMTP_URL não configurado em produção — e-mail não enviado');
      return;
    }
    await this.infra.redis.lpush('la:dev:outbox', JSON.stringify({ to, subject, text, at: Date.now() }));
    await this.infra.redis.ltrim('la:dev:outbox', 0, 49);
    this.infra.logger.info({ to: to.replace(/(.).+(@.+)/, '$1***$2'), subject }, 'e-mail guardado na caixa de saída de desenvolvimento');
  }
}
