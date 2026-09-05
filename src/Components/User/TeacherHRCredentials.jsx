import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { createTeacherAccount } from "../../utils/secondaryAuth";
import { openDocumentInNewTab } from "../../utils/docUpload";
import {
  KeyRound,
  ShieldCheck,
  ShieldOff,
  Copy,
  Check,
  FileText,
} from "lucide-react";
import { useSchool } from "../../context/SchoolContext";

// Same convention as TeacherSalaryLedger: teacherId + teacherData, self-contained.
const TeacherHRCredentials = ({ teacherData }) => {
  const data = teacherData;

  // ---- Portal account creation / access toggle ----
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [generatedCreds, setGeneratedCreds] = useState(null); // {email, tempPassword}
  const [isTogglingAccess, setIsTogglingAccess] = useState(false);
  const [copied, setCopied] = useState(false);
  const { schoolName, schoolEmail } = useSchool();

  // Creates the teacher's login account (client-side, no Cloud Functions —
  // see utils/secondaryAuth.js for why this is safe to run from here).
  const handleCreateAccount = async () => {
    if (!data.email) {
      setAccountError("Add an email address to this teacher first.");
      return;
    }
    setAccountError("");
    setIsCreatingAccount(true);
    try {
      const { uid, tempPassword } = await createTeacherAccount({
        email: data.email,
        schoolId: data.schoolId,
        teacherId: data.id,
      });
      setGeneratedCreds({ email: data.email, tempPassword, uid });
      // Trigger n8n Credentials Webhook
      const CREDENTIALS_WEBHOOK = import.meta.env
        .VITE_N8N_TEACHER_CREDENTIALS_WEBHOOK_URL;
      if (CREDENTIALS_WEBHOOK) {
        fetch(CREDENTIALS_WEBHOOK, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            schoolName: schoolName || "School Admin",
            schoolEmail: schoolEmail || "",
            teacherName: data.name,
            teacherEmail: data.email,
            tempPassword,
            loginUrl: "https://app.schoolix.tech/login",
          }),
        }).catch((err) => console.error("Webhook trigger error:", err));
      }
    } catch (err) {
      console.error("Error creating teacher account:", err);
      setAccountError(
        err.code === "auth/email-already-in-use"
          ? "This email is already used by another account."
          : "Something went wrong creating the account. Try again.",
      );
    } finally {
      setIsCreatingAccount(false);
    }
  };

  // Flips portal access on/off. Reuses the exact same "inactive" check
  // Login.jsx already runs for schooladmin — no new logic needed there.
  const handleTogglePortalAccess = async () => {
    if (!data.authUid) return;
    setIsTogglingAccess(true);
    const newStatus = data.portalStatus === "inactive" ? "active" : "inactive";
    try {
      await updateDoc(doc(db, "users", data.authUid), { status: newStatus });
      await updateDoc(doc(db, "teachers", data.id), {
        portalStatus: newStatus,
      });
    } catch (err) {
      console.error("Error toggling portal access:", err);
    } finally {
      setIsTogglingAccess(false);
    }
  };

  const handleCopyCreds = () => {
    if (!generatedCreds) return;
    navigator.clipboard.writeText(
      `Email: ${generatedCreds.email}\nTemporary Password: ${generatedCreds.tempPassword}`,
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <div className="bg-white border border-slate-100 rounded-2xl p-6 space-y-5 shadow-xs text-[12px]">
        {data.photoUrl && (
          <div className="flex items-center gap-5 p-4 bg-slate-50/80 border border-slate-100 rounded-2xl">
            <img
              src={data.photoUrl}
              alt={data.name}
              className="w-28 h-28 rounded-2xl object-cover border border-white shadow-sm"
            />
            <div className="min-w-0 space-y-1">
              <span className="text-[11px] text-indigo-500 font-black uppercase tracking-wider block">
                Profile Picture
              </span>
              <h3 className="text-xl font-black text-slate-900 truncate">
                {data.name}
              </h3>
              <p className="text-sm font-bold text-slate-500 truncate">
                {data.designation || "Faculty Member"}
              </p>
              <p className="text-[12px] text-slate-400 truncate">
                {data.email || "No email address"}
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-3 bg-slate-50 rounded-xl">
            <span className="text-[12px] text-slate-400 font-mono uppercase tracking-wider block">
              CNIC
            </span>
            <span className="text-slate-900 text-[14px] font-mono  mt-1 block ">
              {data.cnic || "—"}
            </span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl">
            <span className="text-[12px] text-slate-400 font-mono uppercase tracking-wider block">
              Gender
            </span>
            <span className="text-slate-900 text-[14px] font-mono mt-1 block">
              {data.gender || "—"}
            </span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl">
            <span className="text-[12px] text-slate-400 font-mono uppercase tracking-wider block">
              Date of Birth
            </span>
            <span className="text-slate-900 text-[14px] font-mono mt-1 block">
              {data.dob || "—"}
            </span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl">
            <span className="text-[12px] text-slate-400 font-mono  uppercase tracking-wider block">
              Date of Joining
            </span>
            <span className="text-slate-900 font-mono mt-1 block text-[14px]">
              {data.joiningDate || data.registerDate}
            </span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl">
            <span className="text-[12px] text-slate-400 font-mono  uppercase tracking-wider block">
              Contact No.
            </span>
            <span className="text-slate-900 font-mono mt-1 block text-[14px]">
              {data.phone}
            </span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl">
            <span className="text-[12px] text-slate-400 font-mono  uppercase tracking-wider block">
              Academic Degrees / Education
            </span>
            <span className="text-slate-900 font-mono mt-1 block text-[14px]">
              {data.education}
            </span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl">
            <span className="text-[12px] text-slate-400 font-mono  uppercase tracking-wider block">
              Schedule Type
            </span>
            <span className="text-slate-900 font-mono mt-1 block text-[14px] capitalize">
              {data.scheduleType ? `${data.scheduleType}-based` : "—"}
            </span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl">
            <span className="text-[12px] text-slate-400 font-mono  uppercase tracking-wider block">
              Personal Email Profile
            </span>
            <span className="text-slate-900 font-mono mt-1 block text-[14px]">
              {data.email}
            </span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl">
            <span className="text-[12px] text-slate-400 font-mono  uppercase tracking-wider block">
              Residential Address Placement
            </span>
            <span className="text-slate-900 mt-1 block text-[14px]">
              {data.address}
            </span>
          </div>
        </div>

        {data.cvUrl ? (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-indigo-600 shadow-sm">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-black uppercase tracking-wider text-indigo-700">
                    CV / Resume
                  </p>
                  <p className="truncate text-[11px] text-slate-500">
                    {data.cvFileName || "CV Document"}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => openDocumentInNewTab(data.cvUrl)}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-[11px] font-bold text-white transition hover:bg-indigo-700"
              >
                Open CV
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-500">
            No CV file uploaded yet.
          </div>
        )}

        {/* Portal Access */}
        <div className="p-4 border border-slate-100 rounded-xl">
          <span className="text-[12px] text-slate-400 font-black uppercase tracking-wider block mb-3">
            Teacher Portal Access
          </span>

          {!data.authUid ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-slate-500 text-[15 px]">
                No portal login exists for this teacher yet.
              </p>
              <button
                onClick={handleCreateAccount}
                disabled={isCreatingAccount}
                className="shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[12px] font-bold disabled:opacity-50"
              >
                <KeyRound className="w-5 h-5" />
                {isCreatingAccount ? "Creating..." : "Create Portal Account"}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-slate-900 font-mono text-[15px]">
                  {data.portalEmail}
                </p>
                <p
                  className={`text-[13px] font-bold mt-0.5 ${
                    data.portalStatus === "inactive"
                      ? "text-rose-600"
                      : "text-emerald-600"
                  }`}
                >
                  {data.portalStatus === "inactive" ? "Inactive" : "Active"}
                </p>
              </div>
              <button
                onClick={handleTogglePortalAccess}
                disabled={isTogglingAccess}
                className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-[17px] font-bold disabled:opacity-50 ${
                  data.portalStatus === "inactive"
                    ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    : "bg-rose-50 text-rose-700 hover:bg-rose-100"
                }`}
              >
                {data.portalStatus === "inactive" ? (
                  <ShieldCheck className="w-3.5 h-3.5" />
                ) : (
                  <ShieldOff className="w-3.5 h-3.5" />
                )}
                {data.portalStatus === "inactive" ? "Activate" : "Deactivate"}
              </button>
            </div>
          )}
          {accountError && (
            <p className="text-[14px] text-rose-600 font-bold mt-2">
              {accountError}
            </p>
          )}
        </div>
      </div>

      {/* Credentials Modal — shown once right after account creation */}
      {generatedCreds && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs"
            onClick={() => setGeneratedCreds(null)}
          />
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-sm p-6 relative z-60">
            <div className="flex items-center gap-2 mb-1">
              <KeyRound className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-black text-slate-900">
                Portal Account Created
              </h3>
            </div>
            <p className="text-[11px] text-slate-400 mb-4">
              Send these credentials to {data.name}. This password won't be
              shown again — copy it now.
            </p>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 font-mono text-xs">
              <p>
                <span className="text-slate-400">Email: </span>
                <span className="font-bold text-slate-900">
                  {generatedCreds.email}
                </span>
              </p>
              <p>
                <span className="text-slate-400">Password: </span>
                <span className="font-bold text-slate-900">
                  {generatedCreds.tempPassword}
                </span>
              </p>
            </div>

            <button
              onClick={handleCopyCreds}
              className="w-full mt-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              {copied ? "Copied!" : "Copy Credentials"}
            </button>
            <button
              onClick={() => setGeneratedCreds(null)}
              className="w-full mt-2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default TeacherHRCredentials;
