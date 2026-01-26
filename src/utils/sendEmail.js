// import nodemailer from 'nodemailer';

// const sendEmail = async (options) => {
//     const transporter = nodemailer.createTransport({
//         // Use environment variables for service/host/port/auth
//         // For MVP, if using Gmail, you might need 'less secure apps' or App Password if 2FA is on.
//         // Or use a service like SendGrid, Mailgun, etc.
//         // Here we assume basic SMTP or Gmail service for dev.
//         service: process.env.EMAIL_SERVICE, // e.g., 'gmail'
//         auth: {
//             user: process.env.EMAIL_USERNAME,
//             pass: process.env.EMAIL_PASSWORD,
//         },
//         // If using custom SMTP
//         // host: process.env.EMAIL_HOST,
//         // port: process.env.EMAIL_PORT,
//         // secure: false, 
//     });

//     const message = {
//         from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
//         to: options.email,
//         subject: options.subject,
//         text: options.message,
//         html: options.html,
//     };

//     await transporter.sendMail(message);
// };

// export default sendEmail;

import nodemailer from 'nodemailer';

const sendEmail = async (options) => {
    try {
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT,
            secure: true, // Port 465 ke liye true, 587 ke liye false
            auth: {
                user: process.env.SMTP_USER, // "resend"
                pass: process.env.SMTP_PASS, // API Key
            },
        });

        const message = {
            from: process.env.EMAIL_FROM, // e.g. onboarding@resend.dev
            to: options.email,
            subject: options.subject,
            text: options.message,
            html: options.html, // Aapka fancy template yahan aayega
        };

        const info = await transporter.sendMail(message);
        console.log("Message sent: %s", info.messageId);
        
    } catch (error) {
        console.error("Email sending failed:", error);
        throw new Error('Email could not be sent');
    }
};

export default sendEmail;
