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
        /* Base Reset */
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #0f0d0d; /* Project Background */
            color: #ffffff;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        
        .email-container {
            max-width: 600px;
            width: 100%;
            background: #1a1a1a;
            border: 1px solid #363A42;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
        }
        
        /* Header Section */
        .header {
            background: #0f0d0d;
            padding: 40px 30px;
            text-align: center;
            border-bottom: 1px solid #363A42;
        }
        
        .logo-text {
            font-size: 24px;
            font-weight: 800;
            color: white;
            letter-spacing: 1px;
            margin-bottom: 10px;
        }
        
        .header h1 {
            background: linear-gradient(to right, #FEC36D, #D78001);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            font-size: 28px;
            font-weight: 700;
            margin-top: 10px;
        }

        /* Icon Animation */
        .icon-circle {
            width: 70px;
            height: 70px;
            background: rgba(215, 128, 1, 0.1); /* Orange Tint */
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 15px;
            border: 1px solid #D78001;
        }
        
        .icon-circle svg {
            width: 35px;
            height: 35px;
            fill: #FEC36D;
        }

        /* Content Section */
        .content {
            padding: 40px 30px;
            text-align: center;
        }
        
        .greeting {
            font-size: 20px;
            color: #e0e0e0;
            margin-bottom: 15px;
        }
        
        .message {
            color: #aab2c7; /* Light Gray text from your theme */
            font-size: 16px;
            line-height: 1.6;
            margin-bottom: 30px;
        }
        
        /* OTP Box */
        .otp-box {
            background: #0f0d0d;
            border: 1px solid #D78001; /* Orange Border */
            border-radius: 12px;
            padding: 30px 20px;
            margin: 25px 0;
            position: relative;
        }
        
        .otp-label {
            color: #FEC36D;
            font-size: 13px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            margin-bottom: 20px;
        }
        
        .otp-digits {
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 20px;
        }
        
        .digit {
         width:100%;
            text-align: center;
            font-size: 32px;
            font-weight: 700;
            color: white;
            font-family: 'Courier New', monospace;
        }
        
        /* Timer Pill */
        .timer-box {
            display: inline-block;
            background: rgba(255, 255, 255, 0.05);
            padding: 8px 16px;
            border-radius: 20px;
            color: #aab2c7;
            font-size: 13px;
            border: 1px solid #363A42;
        }

        /* Footer */
        .footer {
            background: #0f0d0d;
            padding: 25px;
            text-align: center;
            border-top: 1px solid #363A42;
            font-size: 12px;
            color: #666;
        }
        
        .social-links {
            margin-top: 10px;
        }
        
        .footer a {
            color: #D78001;
            text-decoration: none;
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">
            <img src="/uploads/logo.webp" alt="respond_pilot_pro" class="logo-text" />
            <h1>${title}</h1>
        </div>
        
        <div class="content">
            <p class="greeting">Hello, <strong>${name}</strong> 👋</p>
            
            <p class="message">
                ${messageLine1} <br>
                ${messageLine2}
            </p>
            
            <div class="otp-box">
                    <div class="otp-label" style="text-align: center;">Verification Code</div>
                    <div class="otp-digits" style="color: #ffffff; display: flex; width: 100%; justify-content: center; text-align: center; margin: 0px auto;">
                        <div class="digit">${otp[0]}</div>
                        <div class="digit">${otp[1]}</div>
                        <div class="digit">${otp[2]}</div>
                        <div class="digit">${otp[3]}</div>
                        <div class="digit">${otp[4]}</div>
                        <div class="digit">${otp[5]}</div>
                    </div>
                    <div class="timer-box" style="text-align: center;">
                        Valid for 10 minutes
                    </div>
            </div>
            
            <p style="color: #ffffff90; font-size: 14px; margin-top: 35px;">
                ${footerNote || "If you didn't request this, you can safely ignore this email."}
            </p>
        </div>
        
        <div class="footer">
            &copy; 2025 Respond Pilot Pro. All rights reserved.<br>
            <a href="#">Privacy Policy</a> • <a href="#">Terms of Service</a>
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