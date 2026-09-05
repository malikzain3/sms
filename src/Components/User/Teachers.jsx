import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  onSnapshot,
  addDoc,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { createTeacherAccount } from "../../utils/secondaryAuth";
import { convertFileToBase64Doc } from "../../utils/docUpload";
import TeacherCard from "./TeacherCard";
import Header from "./Header";
import { KeyRound, Copy, Check, Upload, X } from "lucide-react";
import PageLoader from "./PageLoader";
import PhotoUploadBox from "./PhotoUploadBox";
import { useSchool } from "../../context/SchoolContext";

const DocumentUploadBox = ({
  value,
  fileName,
  onChange,
  onFileNameChange,
  label = "CV / Resume",
}) => {
  const inputRef = React.useRef(null);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [error, setError] = React.useState("");

  const processFile = async (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      setError("Please choose a PNG, JPG, or PDF file.");
      return;
    }

    setError("");
    setIsProcessing(true);
    try {
      const dataUrl = await convertFileToBase64Doc(file);
      onChange(dataUrl);
      if (onFileNameChange) onFileNameChange(file.name || "CV Document");
    } catch (err) {
      setError(err.message || "Couldn't process this file.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div>
      <label className="text-[13px] font-bold text-slate-400 uppercase tracking-wider">
        {label}
      </label>

      <div
        onClick={() => !isProcessing && inputRef.current?.click()}
        className={`mt-1 flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed p-2.5 transition-colors ${
          isProcessing
            ? "border-indigo-300 bg-indigo-50/70"
            : "border-slate-200 bg-slate-50 hover:border-indigo-300"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,image/png,image/jpeg,image/jpg"
          className="hidden"
          onChange={(e) => processFile(e.target.files?.[0])}
        />

        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
          {isProcessing ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          ) : (
            <Upload className="h-5 w-5" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold text-slate-700">
            {isProcessing
              ? "Processing..."
              : value
                ? fileName || "CV uploaded"
                : "Choose CV / Resume file"}
          </p>
          <p className="text-[11px] text-slate-400">PDF, PNG, or JPG</p>
        </div>

        {value && !isProcessing && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
              if (onFileNameChange) onFileNameChange("");
            }}
            className="shrink-0 rounded-lg border border-slate-200 bg-white p-1.5 text-rose-500 transition hover:text-rose-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {error && (
        <p className="mt-1 text-[10px] font-bold text-rose-600">{error}</p>
      )}
    </div>
  );
};

const Teachers = () => {
  const [teachersList, setTeachersList] = useState([]);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm] = useState("");
  const { schoolName, schoolEmail } = useSchool();

  // Get active school context ID from storage
  const session = JSON.parse(localStorage.getItem("schoolix_session"));
  const schoolId = session?.schoolId || "default_school";

  // Form Entry States
  const [name, setName] = useState("");
  const [designation, setDesignation] = useState("");
  const [department, setDepartment] = useState("");
  const [primarySubject, setPrimarySubject] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [education, setEducation] = useState("");
  const [address, setAddress] = useState("");
  const [cvUrl, setCvUrl] = useState("");
  const [cvFileName, setCvFileName] = useState("");
  const [dailySalary, setDailySalary] = useState("1000");
  const [monthlySalary, setMonthlySalary] = useState("30000");
  const [yearlySalary] = useState("360000");
  const [cnic, setCnic] = useState("");
  const [cnicError, setCnicError] = useState("");
  const [gender, setGender] = useState("Male");
  const [dob, setDob] = useState("");
  const [joiningDate, setJoiningDate] = useState("");
  const [scheduleType, setScheduleType] = useState("period");
  const [photoUrl, setPhotoUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  // ---- Portal account creation (auto-runs right after teacher is saved) ----
  const [generatedCreds, setGeneratedCreds] = useState(null); // {email, tempPassword}
  const [accountWarning, setAccountWarning] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, "teachers"),
      where("schoolId", "==", schoolId),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = [];
        snapshot.forEach((doc) => {
          docs.push({ id: doc.id, ...doc.data() });
        });
        setTeachersList(docs);
        setLoading(false);
      },
      (error) => {
        console.error("Firebase scoped read error: ", error);
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [schoolId]);
  const normalize = (str) =>
    (str || "").toString().toLowerCase().replace(/\s+/g, "");
  const filteredTeachers = teachersList.filter((t) => {
    const q = normalize(searchTerm);
    if (!q) return true;
    return (
      normalize(t.name).includes(q) ||
      normalize(t.designation).includes(q) ||
      normalize(t.department).includes(q) ||
      normalize(t.primarySubject).includes(q) ||
      normalize(t.phone).includes(q) ||
      normalize(t.cnic).includes(q)
    );
  });
  const handleRegisterTeacher = async (e) => {
    e.preventDefault();
    if (!name || !designation || !department) return;

    if (!cnic.trim()) {
      setCnicError("CNIC is required.");
      return;
    }

    setIsUploading(true);
    setCnicError("");

    try {
      // 1. Enforce CNIC uniqueness within this school
      const cnicCheck = query(
        collection(db, "teachers"),
        where("schoolId", "==", schoolId),
        where("cnic", "==", cnic.trim()),
      );
      const existing = await getDocs(cnicCheck);
      if (!existing.empty) {
        setCnicError("A teacher with this CNIC already exists.");
        setIsUploading(false);
        return;
      }

      // 2. Create the base document first (need an id for storage paths)
      const docRef = await addDoc(collection(db, "teachers"), {
        schoolId,
        name,
        designation,
        department,
        primarySubject: primarySubject || "General",
        coreSubjects: (primarySubject || "General")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        email: email || "info@school.edu",
        phone: phone || "—",
        status: "Active",
        cnic: cnic.trim(),
        gender,
        dob: dob || null,
        joiningDate: joiningDate || new Date().toISOString().split("T")[0],
        scheduleType,
        education: education || "Masters in Education",
        registerDate: new Date().toISOString().split("T")[0],
        address: address || "Not Provided",
        cvUrl: cvUrl || "",
        cvFileName: cvFileName || "CV Document",
        photoUrl: photoUrl.trim(),
        salary: {
          daily: dailySalary,
          monthly: monthlySalary,
          yearly: yearlySalary,
        },
        timetableDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        timetableSlots: [
          "08:30 - 09:45",
          "09:45 - 11:00",
          "11:00 - 11:15",
          "11:15 - 12:30",
          "12:30 - 13:45",
        ],
        timetableMatrix: [],
      });

      // 3. Auto-create the portal login right away — this is the point the
      //    user asked about: account creation happens automatically here,
      //    not as a separate manual step later.
      const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
      if (emailIsValid) {
        try {
          const { tempPassword } = await createTeacherAccount({
            email: email.trim(),
            schoolId,
            teacherId: docRef.id,
          });
          setGeneratedCreds({ email: email.trim(), tempPassword });

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
                teacherName: name,
                teacherEmail: email.trim(),
                tempPassword,
                loginUrl: "https://app.schoolix.tech/login",
              }),
            }).catch((err) => console.error("Webhook trigger error:", err));
          }
        } catch (accErr) {
          console.error("Error auto-creating portal account:", accErr);
          setAccountWarning(
            accErr.code === "auth/email-already-in-use"
              ? "Teacher saved, but that email is already used by another account. Create the portal login manually from their profile with a different email."
              : "Teacher saved, but the portal account couldn't be created automatically. You can create it from their profile page.",
          );
        }
      } else {
        setAccountWarning(
          "Teacher saved without a portal login — add a valid email address on their profile to create one.",
        );
      }

      // Clear form
      setName("");
      setDesignation("");
      setDepartment("");
      setPrimarySubject("");
      setEmail("");
      setPhone("");
      setEducation("");
      setAddress("");
      setCvUrl("");
      setCvFileName("");
      setCnic("");
      setGender("Male");
      setDob("");
      setJoiningDate("");
      setScheduleType("period");
      setPhotoUrl("");
      setIsModalOpen(false);
    } catch (err) {
      console.error("Error creating teacher profile document:", err);
      setCnicError("Something went wrong while saving. Please try again.");
    } finally {
      setIsUploading(false);
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

  if (loading) return <PageLoader label="Loading faculty profiles..." />;

  return (
    <div className="space-y-6">
      <Header />
      <div className="p-6 bg-white border border-slate-100 rounded-2xl space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-start gap-4 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-md sm:text-lg font-bold text-slate-900 tracking-tight">
              Faculty Management Directory
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Click on any faculty profile to manage or inspect their active
              operational timetable.
            </p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer shrink-0"
          >
            + Add New Teacher
          </button>
        </div>

        {teachersList.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-slate-200 text-slate-400 text-xs rounded-2xl italic">
            No faculty profiles registered for this school yet. Click "+ Add New
            Teacher" above to populate.
          </div>
        ) : filteredTeachers.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-slate-200 text-slate-400 text-xs rounded-2xl italic">
            No teachers match your search.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTeachers.map((teacher) => (
              <TeacherCard
                key={teacher.id}
                teacher={teacher}
                onClick={() => navigate(`/school/teachers/${teacher.id}`)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs"
            onClick={() => setIsModalOpen(false)}
          />
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-lg p-6 relative z-60 max-h-[90vh] overflow-y-auto scrollbar-none">
            <div className="flex justify-between items-start pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  Add New Faculty Record
                </h3>
                <p className="text-xs text-slate-400">
                  Fill in information fields to setup a new instructor profile.
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>
            <form
              onSubmit={handleRegisterTeacher}
              className="space-y-5 text-xs text-slate-700"
            >
              {/* ---------- Personal Details ---------- */}
              <div className="space-y-3.5">
                <p className="text-[11px] font-black text-indigo-500 uppercase tracking-widest">
                  Personal Details
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Teacher Full Name
                    </label>
                    <input
                      type="text"
                      placeholder="Zain ul abdin"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 mt-1.5 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300 transition"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Designation / Role
                    </label>
                    <input
                      type="text"
                      placeholder="Senior Instructor"
                      value={designation}
                      onChange={(e) => setDesignation(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 mt-1.5 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300 transition"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      CNIC
                    </label>
                    <input
                      type="text"
                      placeholder="XXXXX-XXXXXXX-X"
                      value={cnic}
                      onChange={(e) => {
                        setCnic(e.target.value);
                        setCnicError("");
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 mt-1.5 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300 transition"
                      required
                    />
                    {cnicError && (
                      <p className="text-sm text-rose-600 font-bold mt-1">
                        {cnicError}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Gender
                    </label>
                    <select
                      value={gender}
                      onChange={(e) => setGender(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 mt-1.5 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300 transition"
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Date of Birth
                    </label>
                    <input
                      type="date"
                      value={dob}
                      onChange={(e) => setDob(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 mt-1.5 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300 transition"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Address
                    </label>
                    <input
                      type="text"
                      placeholder="Street, City"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 mt-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300 transition"
                    />
                  </div>
                </div>
              </div>

              {/* ---------- Contact & Login ---------- */}
              <div className="space-y-3.5 pt-5 border-t border-slate-100">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Email Address{" "}
                      <span className="text-[10px] text-indigo-500 normal-case font-medium">
                        (used to auto-create their portal login)
                      </span>
                    </label>
                    <input
                      type="email"
                      placeholder="instructor@school.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 mt-1.5 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300 transition"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Contact Number
                    </label>
                    <input
                      type="text"
                      placeholder="0300-XXXXXXX"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 mt-1.5 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300 transition"
                    />
                  </div>
                </div>
              </div>

              {/* ---------- Employment Details ---------- */}
              <div className="space-y-4 pt-5 border-t border-slate-100">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Department
                    </label>
                    <input
                      type="text"
                      placeholder="Science, Arts..."
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 mt-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300 transition"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Primary Core Subject
                    </label>
                    <input
                      type="text"
                      placeholder="Physics, English..."
                      value={primarySubject}
                      onChange={(e) => setPrimarySubject(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 mt-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300 transition"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Education
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. MSc Physics"
                      value={education}
                      onChange={(e) => setEducation(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 mt-1.5 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300 transition"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Date of Joining
                    </label>
                    <input
                      type="date"
                      value={joiningDate}
                      onChange={(e) => setJoiningDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 mt-1.5 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300 transition"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Base Salary / Month
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={monthlySalary}
                      onChange={(e) => setMonthlySalary(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 mt-1.5 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300 transition"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Rate / Day or Period
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={dailySalary}
                      onChange={(e) => setDailySalary(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 mt-1.5 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300 transition"
                    />
                  </div>
                </div>

                {/* Schedule Type - Full Width */}
                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Schedule Type
                  </label>
                  <select
                    value={scheduleType}
                    onChange={(e) => setScheduleType(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 mt-1.5 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300 transition"
                  >
                    <option value="period">Period-based</option>
                    <option value="class">Class-based</option>
                  </select>
                </div>
              </div>

              {/* ---------- CV / Resume ---------- */}
              <div className="pt-5 border-t border-slate-100">
                <DocumentUploadBox
                  value={cvUrl}
                  fileName={cvFileName}
                  onChange={setCvUrl}
                  onFileNameChange={setCvFileName}
                  label="CV / Resume"
                />
              </div>

              {/* ---------- Photo ---------- */}
              <div className="pt-5 border-t border-slate-100">
                <PhotoUploadBox value={photoUrl} onChange={setPhotoUrl} />
              </div>

              {/* ---------- Actions ---------- */}
              <div className="pt-4 border-t border-slate-100 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="w-1/2 py-2.5 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploading}
                  className="w-1/2 py-2.5 bg-indigo-600 text-white font-bold rounded-xl shadow-sm hover:bg-indigo-700 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isUploading ? "Saving..." : "Create Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Portal account warning (shown when auto-creation was skipped or failed) */}
      {accountWarning && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm bg-amber-50 border border-amber-200 rounded-2xl p-4 shadow-lg">
          <p className="text-[11px] text-amber-800 font-semibold">
            {accountWarning}
          </p>
          <button
            onClick={() => setAccountWarning("")}
            className="mt-2 text-[10px] font-bold text-amber-700 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Credentials modal — shown once right after a portal account is auto-created */}
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
                Teacher Added — Portal Account Created
              </h3>
            </div>
            <p className="text-[11px] text-slate-400 mb-4">
              Send these credentials to the teacher. This password won't be
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
    </div>
  );
};

export default Teachers;
