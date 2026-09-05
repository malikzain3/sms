export const sendTeacherCredentialsWebhook = async ({ schoolName, schoolEmail, teacherName, teacherEmail, tempPassword }) => {
  const WEBHOOK_URL = import.meta.env.VITE_N8N_TEACHER_CREDENTIALS_WEBHOOK_URL;
  if (!WEBHOOK_URL || !teacherEmail) return;

  try {
    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schoolName: schoolName || "School Admin",
        schoolEmail: schoolEmail || "",
        teacherName,
        teacherEmail,
        tempPassword,
        loginUrl: window.location.origin + "/login"
      }),
    });
  } catch (err) {
    console.error("Credentials Webhook Error:", err);
  }
};