import React, { useContext, useState, useEffect } from "react";
import { doc, updateDoc } from "firebase/firestore";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";
import { db, auth } from "../../firebaseConfig";
import { TeacherPortalContext } from "../../Pages/TeacherPortal";
import { toast, Toaster } from "react-hot-toast";
import {
  User,
  Phone,
  MapPin,
  Image as ImageIcon,
  Check,
  Save,
  Lock,
} from "lucide-react";

const TeacherSettings = () => {
  const { teacher, school, mustChangePassword } = useContext(
    TeacherPortalContext,
  );

  const [phone, setPhone] = useState(teacher?.phone || "");
  const [address, setAddress] = useState(teacher?.address || "");
  const [photoUrl, setPhotoUrl] = useState(teacher?.photoUrl || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // ---- Change Password ----
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  useEffect(() => {
    if (teacher) {
      setPhone(teacher.phone || "");
      setAddress(teacher.address || "");
      setPhotoUrl(teacher.photoUrl || "");
    }
  }, [teacher]);

  const isProfileChanged =
    phone !== (teacher?.phone || "") ||
    address !== (teacher?.address || "") ||
    photoUrl !== (teacher?.photoUrl || "");

  const isPasswordChanged =
    Boolean(currentPassword.trim()) &&
    Boolean(newPassword.trim()) &&
    Boolean(confirmPassword.trim());

  const handleSave = async (e) => {
    e.preventDefault();
    if (!teacher?.id) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "teachers", teacher.id), {
        phone: phone || "—",
        address: address || "Not Provided",
        photoUrl: photoUrl.trim(),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      toast.error("Error updating profile!");
      console.error("Error updating profile:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordError("");

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError("Please fill in all three fields.");
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirmation don't match.");
      return;
    }
    if (!auth.currentUser?.email) {
      setPasswordError("Your session has expired. Please sign in again.");
      return;
    }

    setChangingPassword(true);
    try {
      // Firebase requires a recent login before allowing a password change —
      // re-authenticate with the current password first.
      const credential = EmailAuthProvider.credential(
        auth.currentUser.email,
        currentPassword,
      );
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, newPassword);

      // Clear the "using a temporary password" nudge, if it was set.
      try {
        await updateDoc(doc(db, "users", auth.currentUser.uid), {
          mustChangePassword: false,
        });
      } catch (flagErr) {
        // Non-fatal — password itself already changed successfully.
        console.error("Error clearing mustChangePassword flag:", flagErr);
      }

      setPasswordChanged(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setPasswordChanged(false), 2500);
    } catch (err) {
      console.error("Error changing password:", err);
      if (
        err.code === "auth/wrong-password" ||
        err.code === "auth/invalid-credential"
      ) {
        setPasswordError("Current password is incorrect.");
      } else if (err.code === "auth/too-many-requests") {
        setPasswordError("Too many attempts. Please try again later.");
      } else if (err.code === "auth/weak-password") {
        setPasswordError("New password is too weak — use at least 6 characters.");
      } else {
        setPasswordError("Something went wrong. Please try again.");
      }
    } finally {
      setChangingPassword(false);
    }
  };

  const initials = (teacher?.name || "T")
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="space-y-6 w-full max-w-full animate-fadeIn text-xs text-slate-700">
      <Toaster position="top-right" reverseOrder={false} />
      <div>
        <h2 className="text-lg font-bold text-slate-950">Settings</h2>
        <p className="text-xs text-slate-400">
          Manage your contact details and photo. Other information is managed by{" "}
          {school?.name || "your school"}'s admin.
        </p>
      </div>

      {/* Profile Card */}
      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs flex items-center gap-4">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={teacher?.name}
            className="w-16 h-16 rounded-2xl object-cover border border-slate-200 shrink-0"
            onError={(e) => {
              e.target.style.display = "none";
            }}
          />
        ) : (
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 font-black text-lg flex items-center justify-center shrink-0">
            {initials}
          </div>
        )}
        <div>
          <h3 className="text-base font-black text-slate-900">
            {teacher?.name}
          </h3>
          <p className="text-indigo-600 font-bold">
            {teacher?.designation}
            <span className="text-slate-400 font-normal">
              {" "}
              · Department of {teacher?.department}
            </span>
          </p>
        </div>
      </div>

      {/* Editable Contact Info */}
      <form
        onSubmit={handleSave}
        className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs space-y-4"
      >
        <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
          <User className="w-4 h-4 text-indigo-600" />
          Editable Contact Info
        </h3>

        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Phone className="w-3 h-3" /> Phone Number
          </label>
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="03xx-xxxxxxx"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 mt-1 font-mono focus:outline-none focus:border-indigo-500 transition"
          />
        </div>

        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <MapPin className="w-3 h-3" /> Address
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 mt-1 focus:outline-none focus:border-indigo-500 transition"
          />
        </div>

        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <ImageIcon className="w-3 h-3" /> Profile Picture (Link)
          </label>
          <input
            type="url"
            value={photoUrl}
            onChange={(e) => setPhotoUrl(e.target.value)}
            placeholder="Paste image link"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 mt-1 text-[11px] font-mono focus:outline-none focus:border-indigo-500 transition"
          />
        </div>

        <button
          type="submit"
          disabled={saving || !isProfileChanged}
          className="flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {saved ? (
            <>
              <Check className="w-3.5 h-3.5" /> Saved
            </>
          ) : (
            <>
              <Save className="w-3.5 h-3.5" />{" "}
              {saving ? "Saving..." : "Save Changes"}
            </>
          )}
        </button>
      </form>

      {/* Change Password */}
      <form
        onSubmit={handleChangePassword}
        className={`bg-white border rounded-2xl p-6 shadow-xs space-y-4 ${
          mustChangePassword
            ? "border-amber-200 ring-1 ring-amber-100"
            : "border-slate-100"
        }`}
      >
        <div>
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <Lock className="w-4 h-4 text-indigo-600" />
            Change Password
          </h3>
          {mustChangePassword && (
            <p className="text-[11px] text-amber-600 font-bold mt-1">
              You're using a temporary password — please set a new one.
            </p>
          )}
        </div>

        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Current Password
          </label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 mt-1 font-mono focus:outline-none focus:border-indigo-500 transition"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              New Password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 mt-1 font-mono focus:outline-none focus:border-indigo-500 transition"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Confirm New Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 mt-1 font-mono focus:outline-none focus:border-indigo-500 transition"
            />
          </div>
        </div>

        {passwordError && (
          <p className="text-[11px] text-rose-600 font-bold">{passwordError}</p>
        )}

        <button
          type="submit"
          disabled={changingPassword || !isPasswordChanged}
          className="flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {passwordChanged ? (
            <>
              <Check className="w-3.5 h-3.5" /> Password Updated
            </>
          ) : (
            <>
              <Lock className="w-3.5 h-3.5" />{" "}
              {changingPassword ? "Updating..." : "Update Password"}
            </>
          )}
        </button>
      </form>

      {/* Read-only HR info */}
      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs space-y-4">
        <h3 className="font-bold text-slate-900 text-sm">
          HR-Managed Information{" "}
          <span className="text-slate-400 font-normal text-[10px]">
            (contact admin to change)
          </span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ReadOnlyField label="Full Name" value={teacher?.name} />
          <ReadOnlyField label="Designation" value={teacher?.designation} />
          <ReadOnlyField label="Department" value={teacher?.department} />
          <ReadOnlyField
            label="Primary Subject"
            value={teacher?.primarySubject}
          />
          <ReadOnlyField label="Email" value={teacher?.email} mono />
          <ReadOnlyField label="CNIC" value={teacher?.cnic} mono />
          <ReadOnlyField
            label="Schedule Type"
            value={
              teacher?.scheduleType === "class" ? "Class-based" : "Period-based"
            }
          />
          <ReadOnlyField label="Status" value={teacher?.status} />
        </div>
      </div>
    </div>
  );
};

const ReadOnlyField = ({ label, value, mono }) => (
  <div className="p-3 bg-slate-50 rounded-xl">
    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
      {label}
    </span>
    <span
      className={`text-slate-700 mt-1 block ${mono ? "font-mono" : "font-bold"}`}
    >
      {value || "—"}
    </span>
  </div>
);

export default TeacherSettings;