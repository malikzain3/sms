// src/utils/secondaryAuth.js
//
// PROBLEM: createUserWithEmailAndPassword() signs YOU in as the new user.
// If admin runs this on the main `auth` instance while adding a teacher,
// the admin gets logged out and logged in as the teacher instead.
//
// FIX (no Cloud Functions needed — works on the free Spark plan):
// Spin up a second, temporary Firebase App instance that shares the same
// project but has its own isolated Auth session. Create the teacher's
// account there, grab the uid, sign that instance out, then delete it.
// The admin's real `auth` session (from firebaseConfig.js) is never touched.

import { initializeApp, deleteApp } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";

// Same config your main app uses — pulled from the same env vars.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/**
 * Generates a random temporary password like "Tc-8f2k9d1a".
 * Teacher is expected to change it on first login.
 */
export function generateTempPassword() {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "Tc-";
  for (let i = 0; i < 8; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

/**
 * Creates a Firebase Auth account + matching `users/{uid}` doc for a
 * teacher, WITHOUT logging the current admin out.
 *
 * @param {Object} params
 * @param {string} params.email
 * @param {string} params.schoolId
 * @param {string} params.teacherId  - id of the teachers/{teacherId} doc
 * @returns {Promise<{ uid: string, tempPassword: string }>}
 */
export async function createTeacherAccount({ email, schoolId, teacherId }) {
  if (!email || !schoolId || !teacherId) {
    throw new Error(
      "createTeacherAccount requires email, schoolId, and teacherId.",
    );
  }

  const tempPassword = generateTempPassword();

  // Unique app name per call so repeated calls in the same session don't clash.
  const secondaryApp = initializeApp(
    firebaseConfig,
    `secondary-${Date.now()}`,
  );
  const secondaryAuth = getAuth(secondaryApp);

  try {
    const cred = await createUserWithEmailAndPassword(
      secondaryAuth,
      email,
      tempPassword,
    );
    const uid = cred.user.uid;

    // Sign the temp session out before writing Firestore docs — the write
    // itself uses the main `db` instance (already authenticated as admin),
    // so this ordering just keeps things tidy.
    await signOut(secondaryAuth);

    // Uniform with how schooladmin/superadmin already work: a `users/{uid}`
    // doc drives Login.jsx's role check. Teacher login reuses the exact
    // same flow, just with role: "teacher".
    await setDoc(doc(db, "users", uid), {
      role: "teacher",
      schoolId,
      teacherId,
      status: "active", // admin can flip to "inactive" later to revoke portal access
      email,
      mustChangePassword: true,
      createdAt: new Date().toISOString(),
    });

    // Link back from the teacher doc so TeacherDetailView can show
    // "Portal account: yes/no" and display credentials info.
    await setDoc(
      doc(db, "teachers", teacherId),
      {
        authUid: uid,
        portalEmail: email,
        portalStatus: "active",
        portalCreatedAt: new Date().toISOString(),
      },
      { merge: true },
    );

    return { uid, tempPassword };
  } finally {
    // Always clean up the temporary app instance, success or failure.
    await deleteApp(secondaryApp);
  }
}