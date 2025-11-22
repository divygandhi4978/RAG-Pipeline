// utils/mailer.js
import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

export const sendMail = async ({ to, subject, text, attachments = [] }) => {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  const mail = {
    from: process.env.FROM_EMAIL || process.env.SMTP_USER,
    to,
    subject,
    text,
    attachments
  };

  const info = await transporter.sendMail(mail);
  console.log("Mail sent:", info.messageId);
  return info;
};
