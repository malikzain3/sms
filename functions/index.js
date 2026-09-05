const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");

initializeApp();
const adminAuth = getAuth();
const adminDb = getFirestore();

exports.deleteTeacherAuthAccount = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication is required.");
  }

  const { teacherId } = request.data || {};
  if (typeof teacherId !== "string" || !teacherId.trim()) {
    throw new HttpsError(
      "invalid-argument",
      "A non-empty teacherId is required.",
    );
  }

  const callerSnapshot = await adminDb
    .collection("users")
    .doc(request.auth.uid)
    .get();
  if (!callerSnapshot.exists) {
    throw new HttpsError("permission-denied", "Caller profile was not found.");
  }

  const callerData = callerSnapshot.data();
  const isSchoolAdmin = ["schooladmin", "school_admin", "schoolAdmin"].includes(
    callerData.role,
  );
  if (!isSchoolAdmin || !callerData.schoolId) {
    throw new HttpsError("permission-denied", "School administrator access is required.");
  }

  const teacherSnapshot = await adminDb
    .collection("teachers")
    .doc(teacherId.trim())
    .get();
  if (!teacherSnapshot.exists) {
    throw new HttpsError("not-found", "Teacher was not found.");
  }

  const teacherData = teacherSnapshot.data();
  if (teacherData.schoolId !== callerData.schoolId) {
    throw new HttpsError("permission-denied", "Teacher belongs to another school.");
  }
  if (!teacherData.authUid) {
    throw new HttpsError(
      "failed-precondition",
      "Teacher does not have a linked Auth account.",
    );
  }

  const authUid = teacherData.authUid;
  try {
    await adminAuth.deleteUser(authUid);
  } catch (error) {
    if (error.code !== "auth/user-not-found") {
      console.error("Error deleting teacher Auth account:", error);
      throw new HttpsError("internal", "Unable to delete the teacher Auth account.");
    }
  }

  await adminDb.collection("users").doc(authUid).delete();

  return { success: true };
});
