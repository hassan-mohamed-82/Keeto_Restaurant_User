"use strict";
// import admin from "firebase-admin";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.firestore = exports.messaging = void 0;
exports.getMessaging = getMessaging;
exports.getFirestore = getFirestore;
// const serviceAccount = {
//   projectId: process.env.FIREBASE_PROJECT_ID,
//   clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
//   privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
// } as admin.ServiceAccount;
// if (!serviceAccount.privateKey) {
//   throw new Error("Firebase service account is missing in .env");
// }
// if (!admin.apps.length) {
//   admin.initializeApp({
//     credential: admin.credential.cert(serviceAccount),
//   });
// }
// export const messaging: admin.messaging.Messaging = admin.messaging();
// export const firestore = admin.firestore();
// export default admin;
const firebase_admin_1 = __importDefault(require("firebase-admin"));
function buildCredential(envPrefix) {
    const projectId = process.env[`${envPrefix}_PROJECT_ID`];
    const clientEmail = process.env[`${envPrefix}_CLIENT_EMAIL`];
    const privateKey = process.env[`${envPrefix}_PRIVATE_KEY`]?.replace(/\\n/g, "\n");
    if (!projectId || !clientEmail || !privateKey) {
        throw new Error(`Firebase service account env vars are missing for prefix "${envPrefix}" (expected ${envPrefix}_PROJECT_ID, ${envPrefix}_CLIENT_EMAIL, ${envPrefix}_PRIVATE_KEY).`);
    }
    return { projectId, clientEmail, privateKey };
}
function getOrCreateApp(name, envPrefix) {
    const existing = firebase_admin_1.default.apps.find((a) => a?.name === name);
    if (existing)
        return existing;
    return firebase_admin_1.default.initializeApp({ credential: firebase_admin_1.default.credential.cert(buildCredential(envPrefix)) }, name);
}
// Primary project is REQUIRED (this is your original/old Firebase project —
// FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY).
const primaryApp = getOrCreateApp("primary", "FIREBASE");
// Secondary project is OPTIONAL — only initialized if FIREBASE2_PROJECT_ID is
// set, so this doesn't break setups that only ever had one Firebase project.
const secondaryApp = process.env.FIREBASE2_PROJECT_ID
    ? getOrCreateApp("secondary", "FIREBASE2")
    : null;
if (!secondaryApp) {
    console.warn("[Firebase] Secondary project not configured (FIREBASE2_PROJECT_ID missing). " +
        "Notifications for restaurants assigned to the secondary project will fall back to the primary project and likely fail silently (wrong project's tokens).");
}
/**
 * Returns the Messaging instance for the given Firebase project key.
 * Defaults to "primary" when no project is specified or the secondary
 * project isn't configured.
 */
function getMessaging(project = "primary") {
    if (project === "secondary" && secondaryApp) {
        return secondaryApp.messaging();
    }
    return primaryApp.messaging();
}
/**
 * Returns the Firestore instance for the given Firebase project key, if you
 * ever need per-project Firestore access too. Same fallback behavior as
 * getMessaging.
 */
function getFirestore(project = "primary") {
    if (project === "secondary" && secondaryApp) {
        return secondaryApp.firestore();
    }
    return primaryApp.firestore();
}
// Backward-compatible exports — anything that used to import `messaging` /
// `firestore` directly keeps working exactly as before, always pointing at
// the primary project.
exports.messaging = primaryApp.messaging();
exports.firestore = primaryApp.firestore();
exports.default = firebase_admin_1.default;
