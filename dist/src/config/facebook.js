"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyFacebookToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const dotenv_1 = __importDefault(require("dotenv"));
const schema_1 = require("../models/schema");
const connection_1 = require("../models/connection");
const drizzle_orm_1 = require("drizzle-orm");
const uuid_1 = require("uuid");
dotenv_1.default.config();
const verifyFacebookToken = async (req, res) => {
    const { token } = req.body; // ده الـ Access Token اللي جاي من الفرونت إند
    try {
        // 🌐 بنكلم Graph API عشان نتأكد من التوكن ونجيب بيانات اليوزر
        const fbResponse = await fetch(`https://graph.facebook.com/me?fields=id,name,email,picture&access_token=${token}`);
        const payload = await fbResponse.json();
        // لو التوكن غلط أو منتهي، فيسبوك هيرجع error
        if (payload.error) {
            return res
                .status(400)
                .json({ success: false, message: "Invalid Facebook token", error: payload.error.message });
        }
        const facebookId = payload.id;
        const name = payload.name || "Unknown User";
        // ⚠️ خلي بالك: فيسبوك أحياناً مابيرجعش إيميل (لو اليوزر مسجل برقم تليفون أو لاغي صلاحية الإيميل)
        // فهنحتاج نعمل fallback عشان الـ email عندك notNull() و unique()
        const email = payload.email || `${facebookId}@facebook-placeholder.com`;
        // 🔍 check if user exists by facebookId OR email
        const existingUsers = await connection_1.db
            .select()
            .from(schema_1.users)
            .where((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.users.facebookId, facebookId), (0, drizzle_orm_1.eq)(schema_1.users.email, email)))
            .limit(1);
        let user = existingUsers[0];
        if (!user) {
            // ➕ Signup (new user)
            const newId = (0, uuid_1.v4)();
            await connection_1.db.insert(schema_1.users).values({
                id: newId,
                facebookId,
                email,
                name,
                isVerified: true, // بنعتبره موثق لأنه جاي من فيسبوك
            });
            // بنعمل Object لليوزر عشان نستخدمه في الـ JWT تحت
            user = {
                id: newId,
                name,
                email,
                facebookId,
                googleId: null,
                phone: null,
                photo: null,
                fcmToken: null,
                password: null,
                isVerified: true,
                status: "active",
                createdAt: new Date()
            };
        }
        else {
            // 👤 Login (existing user)
            // لو المستخدم مسجل قبل كده بالإيميل (سواء عادي أو بجوجل) ومفيش facebookId نخزنهوله
            if (!user.facebookId) {
                await connection_1.db.update(schema_1.users).set({ facebookId }).where((0, drizzle_orm_1.eq)(schema_1.users.id, user.id));
                user.facebookId = facebookId;
            }
        }
        // 🔑 Generate JWT
        const authToken = jsonwebtoken_1.default.sign({ id: user.id }, process.env.JWT_SECRET, {
            expiresIn: "7d",
        });
        return res.json({
            success: true,
            token: authToken,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
            },
        });
    }
    catch (error) {
        console.error("Facebook login error:", error);
        res.status(500).json({ success: false, message: "Internal server error during Facebook login" });
    }
};
exports.verifyFacebookToken = verifyFacebookToken;
