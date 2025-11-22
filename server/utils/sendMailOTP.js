import nodemailer from "nodemailer";

export const sendEmail = async ({ from, to, subject, html, attachments }) => {
  const transporter = nodemailer.createTransport({
    service: "gmail", // your existing setup
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const mailOptions = {
    from: from || `"RAG" <${process.env.MAIL_USER}>`,
    to: to || "",
    subject: subject || "",
    html: html || "",
    attachments: attachments || [],
  };

  await transporter.sendMail(mailOptions);
};

// Specialized function for OTP
export const sendOtpEmail = async (email, otp) => {
  await sendEmail({
    to: email,
    subject: "Verify your email - RAG",
    html: `
  <!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <style>
      body, html {
        margin: 0;
        padding: 0;
        width: 100% !important;
        background-color: #f4f5f7;
        font-family: "Inter", "Segoe UI", Roboto, Arial, sans-serif;
        color: #1f2937;
      }

      .container {
        max-width: 640px;
        margin: 40px auto;
        background: #ffffff;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.05);
      }

      .header {
        padding: 28px 32px;
        border-bottom: 1px solid #e5e7eb;
      }

      .brand {
        font-weight: 700;
        font-size: 20px;
        color: #111827;
        letter-spacing: 0.3px;
      }

      .content {
        padding: 32px;
        text-align: left;
      }

      .content h1 {
        font-size: 22px;
        margin: 0 0 10px 0;
        color: #111827;
        font-weight: 600;
      }

      .content p {
        color: #4b5563;
        font-size: 15px;
        line-height: 1.6;
        margin: 0 0 20px 0;
      }

      .otp {
        display: inline-block;
        font-weight: 700;
        font-size: 26px;
        letter-spacing: 6px;
        padding: 12px 22px;
        border-radius: 8px;
        background: #e0f2fe; /* soft blue for clarity */
        color: #0369a1; /* stronger accent for visibility */
        margin: 10px 0 25px 0;
      }

      .cta {
        display: inline-block;
        background: #2563eb; /* primary blue button */
        color: #ffffff;
        padding: 12px 24px;
        border-radius: 8px;
        font-weight: 600;
        font-size: 15px;
        text-decoration: none;
        transition: background 0.3s;
      }

      .cta:hover {
        background: #1d4ed8; /* hover shade for better feedback */
      }

      .footer {
        padding: 20px 32px;
        background: #f9fafb;
        border-top: 1px solid #e5e7eb;
        color: #6b7280;
        font-size: 13px;
        text-align: left;
      }

      @media (max-width: 480px) {
        .header,
        .content,
        .footer {
          padding: 20px;
        }

        .brand {
          font-size: 18px;
        }

        .content h1 {
          font-size: 20px;
        }

        .otp {
          font-size: 22px;
          padding: 10px 18px;
          letter-spacing: 4px;
        }
      }
    </style>
  </head>

  <body>
    <div class="container">
      <div class="header">
        <div class="brand">RAG</div>
      </div>

      <div class="content">
        <h1>Hello!</h1>
        <p>Use the OTP below to complete your verification:</p>
        <div class="otp">${otp}</div>
      </div>

      <div class="footer">
        If you did not request this OTP, please ignore this email.
      </div>
    </div>
  </body>
</html>

  `,
  });
};
