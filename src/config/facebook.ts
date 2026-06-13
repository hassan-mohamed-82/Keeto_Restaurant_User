import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { users } from "../models/schema";
import { db } from "../models/connection";
import { eq, or } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

dotenv.config();

export const verifyFacebookToken = async (req: Request, res: Response) => {
  const { token } = req.body; // ده الـ Access Token اللي جاي من الفرونت إند

  try {
    // 🌐 بنكلم Graph API عشان نتأكد من التوكن ونجيب بيانات اليوزر
    const fbResponse = await fetch(
      `https://graph.facebook.com/me?fields=id,name,email,picture&access_token=${token}`
    );
    
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
    const existingUsers = await db
      .select()
      .from(users)
      .where(or(eq(users.facebookId, facebookId), eq(users.email, email)))
      .limit(1);

    let user = existingUsers[0];

    if (!user) {
      // ➕ Signup (new user)
      const newId = uuidv4();
      await db.insert(users).values({
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
        status:"active",
        createdAt: new Date() 
      };
    } else {
      // 👤 Login (existing user)
      // لو المستخدم مسجل قبل كده بالإيميل (سواء عادي أو بجوجل) ومفيش facebookId نخزنهوله
      if (!user.facebookId) {
        await db.update(users).set({ facebookId }).where(eq(users.id, user.id));
        user.facebookId = facebookId;
      }
    }

    // 🔑 Generate JWT
    const authToken = jwt.sign({ id: user.id }, process.env.JWT_SECRET!, {
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
  } catch (error) {
    console.error("Facebook login error:", error);
    res.status(500).json({ success: false, message: "Internal server error during Facebook login" });
  }
};