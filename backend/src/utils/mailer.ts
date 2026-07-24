import nodemailer from 'nodemailer';

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env['SMTP_HOST'],
      port: Number(process.env['SMTP_PORT']) || 465,
      secure: Number(process.env['SMTP_PORT']) === 465,
      auth: {
        type: 'LOGIN',
        user: process.env['SMTP_USER'],
        pass: process.env['SMTP_PASS'],
      },
      tls: {
        rejectUnauthorized: false,
      },
    });
  }
  return transporter;
}

export async function sendMail(options: { to: string; subject: string; html: string }) {
  const from = process.env['SMTP_FROM'] || process.env['SMTP_USER'];
  await getTransporter().sendMail({
    from,
    to: options.to,
    subject: options.subject,
    html: options.html,
  });
}
