const generateBaseTemplate = (
  title,
  name,
  messageLine1,
  messageLine2,
  otp,
  footerNote,
) => {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #0f0d0d;
            color: #ffffff;
            margin: 0;
            padding: 20px;
        }
        .container {
            max-width: 500px;
            margin: 0 auto;
            background: #1a1a1a;
            border: 1px solid #363A42;
            border-radius: 8px;
            overflow: hidden;
            text-align: center;
        }
        .header {
            background: #0f0d0d;
            padding: 20px;
            border-bottom: 1px solid #363A42;
        }
        .header h1 {
            color: #D78001;
            font-size: 24px;
            margin: 0;
        }
        .content {
            padding: 30px 20px;
        }
        .greeting {
            font-size: 18px;
            color: #e0e0e0;
            margin-bottom: 10px;
        }
        .message {
            color: #ccc;
            font-size: 16px;
            margin-bottom: 20px;
            line-height: 1.5;
        }
        .otp {
            display: inline-block;
            background: #0f0d0d;
            border: 1px solid #D78001;
            color: #FEC36D;
            font-size: 32px;
            font-weight: bold;
            letter-spacing: 5px;
            padding: 15px 30px;
            border-radius: 8px;
            margin: 20px 0;
        }
        .footer {
            padding: 20px;
            font-size: 12px;
            color: #666;
            border-top: 1px solid #363A42;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${title}</h1>
        </div>
        <div class="content">
            <p class="greeting">Hi ${name},</p>
            <p class="message">
                ${messageLine1}<br>
                ${messageLine2}
            </p>
            <div class="otp">${otp}</div>
            <p style="font-size: 14px; color: #888; margin-top: 20px;">
                ${footerNote}
            </p>
        </div>
        <div class="footer">
            &copy; 2025 Respond Pilot Pro. All rights reserved.
        </div>
    </div>
</body>
</html>`;
};

export const verifyEmailTemplate = (name, otp) => {
  return generateBaseTemplate(
    "Verify Your Email",
    name,
    "Welcome to the future of automated engagement.",
    "Please use the code below to verify your account.",
    otp,
    "If you didn't request this, you can safely ignore this email.",
  );
};

export const resetPasswordTemplate = (name, otp) => {
  return generateBaseTemplate(
    "Reset Your Password",
    name,
    "We received a request to reset your password.",
    "Use the code below to reset it.",
    otp,
    "If you did not request a password reset, please ignore this email or contact support if you are concerned.",
  );
};