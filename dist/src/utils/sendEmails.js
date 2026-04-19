"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmail = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const resend_1 = require("resend");
const getFromEmail = () => process.env.EMAIL_FROM || process.env.EMAIL_USER || "no-reply@keeto.app";
const getResendClient = () => {
    if (!process.env.RESEND_API_KEY)
        return null;
    return new resend_1.Resend(process.env.RESEND_API_KEY);
};
const getSmtpTransporter = () => {
    const SMTP_USER = process.env.SMTP_USER || process.env.EMAIL_USER;
    const SMTP_PASS = process.env.SMTP_PASS || process.env.EMAIL_PASS;
    if (!SMTP_USER || !SMTP_PASS) {
        console.log("❌ SMTP not configured");
        return null;
    }
    return nodemailer_1.default.createTransport({
        service: "gmail",
        auth: {
            user: SMTP_USER,
            pass: SMTP_PASS,
        },
    });
};
const sendEmail = async ({ to, subject, html, }) => {
    console.log("📧 Sending email to:", to);
    const resend = getResendClient();
    // ===== Resend =====
    if (resend) {
        try {
            await resend.emails.send({
                from: getFromEmail(),
                to,
                subject,
                html,
            });
            console.log("✅ Email sent via Resend");
            return;
        }
        catch (err) {
            console.log("❌ Resend error:", err);
        }
    }
    // ===== SMTP (Gmail) =====
    const transporter = getSmtpTransporter();
    if (transporter) {
        try {
            await transporter.sendMail({
                from: getFromEmail(),
                to,
                subject,
                html,
            });
            console.log("✅ Email sent via SMTP");
            return;
        }
        catch (err) {
            console.log("❌ SMTP error:", err);
        }
    }
    console.log("⚠️ No email provider configured. Email not sent.");
};
exports.sendEmail = sendEmail;
