import nodemailer from 'nodemailer';

const sendEmail = async (options) => {
    const transporter = nodemailer.createTransport({
        // Use environment variables for service/host/port/auth
        // For MVP, if using Gmail, you might need 'less secure apps' or App Password if 2FA is on.
        // Or use a service like SendGrid, Mailgun, etc.
        // Here we assume basic SMTP or Gmail service for dev.
        service: process.env.EMAIL_SERVICE, // e.g., 'gmail'
        auth: {
            user: process.env.EMAIL_USERNAME,
            pass: process.env.EMAIL_PASSWORD,
        },
        // If using custom SMTP
        // host: process.env.EMAIL_HOST,
        // port: process.env.EMAIL_PORT,
        // secure: false, 
    });

    const message = {
        from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
        to: options.email,
        subject: options.subject,
        text: options.message,
        html: options.html,
    };

    await transporter.sendMail(message);
};

export default sendEmail;
