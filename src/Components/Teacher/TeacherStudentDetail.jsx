import React, { useContext, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  doc,
  onSnapshot,
  collection,
  query,
  orderBy,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { TeacherPortalContext } from "../../Pages/TeacherPortal";
import ScholasticAnalytics from "../User/ScholasticAnalytics";
import {
  ChevronLeft,
  Plus,
  Pencil,
  Trash2,
  Check,
  X as XIcon,
  ShieldAlert,
  BookMarked,
} from "lucide-react";

const statusStyles = {
  Paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Partial: "bg-amber-50 text-amber-700 border-amber-200",
  Advance: "bg-emerald-50 text-emerald-700 border-emerald-200", // shown as Paid per teacher-portal scope
  Unpaid: "bg-rose-50 text-rose-700 border-rose-200",
};

const formatAdmissionDate = (value) => {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
};

const TeacherStudentDetail = () => {
  const { classId, studentId } = useParams();
  const navigate = useNavigate();
  const { teacher, teacherAccess } = useContext(TeacherPortalContext);
  const [student, setStudent] = useState(null);
  const [activeTab, setActiveTab] = useState("info");

  // Phase 2: same access gate as TeacherClassDetail — a teacher may only
  // view a student whose class they're the class teacher of, or a class
  // they teach a subject in per teacher.timetableMatrix.
  const isClassTeacher = !!teacherAccess?.isClassTeacherOf(classId);
  const accessibleSubjects = teacherAccess?.getSubjectsFor(classId) || [];
  const hasAccess = !!teacherAccess?.hasAccessToClass(classId);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "students", studentId), (snap) => {
      if (snap.exists()) setStudent({ id: snap.id, ...snap.data() });
    });
    return () => unsub();
  }, [studentId]);

  // ---- Attendance rate — real data, same subcollection the admin/student
  // views read, so it's always in sync with what's actually recorded. ----
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "students", studentId, "attendance"),
      (snap) => setAttendanceRecords(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    );
    return () => unsub();
  }, [studentId]);

  const totalMarkedDays = attendanceRecords.length;
  const presentDays = attendanceRecords.filter((r) => r.status === "Present").length;
  const attendancePercent =
    totalMarkedDays > 0 ? ((presentDays / totalMarkedDays) * 100).toFixed(1) : null;

  // ---- Scholastic remarks — teacher-editable CRUD, since there's no
  // exams module yet. Lives at students/{id}/teacherRemarks. ----
  const [remarks, setRemarks] = useState([]);
  const [newRemark, setNewRemark] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, "students", studentId, "teacherRemarks"),
      orderBy("createdAt", "desc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      setRemarks(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [studentId]);

  const handleAddRemark = async () => {
    if (!newRemark.trim() || !teacher?.id) return;
    setSaving(true);
    try {
      await addDoc(collection(db, "students", studentId, "teacherRemarks"), {
        text: newRemark.trim(),
        teacherId: teacher.id,
        teacherName: teacher.name,
        createdAt: serverTimestamp(),
      });
      setNewRemark("");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async (remarkId) => {
    if (!editingText.trim()) return;
    await updateDoc(doc(db, "students", studentId, "teacherRemarks", remarkId), {
      text: editingText.trim(),
      editedAt: serverTimestamp(),
    });
    setEditingId(null);
  };

  const handleDeleteRemark = async (remarkId) => {
    await deleteDoc(doc(db, "students", studentId, "teacherRemarks", remarkId));
  };

  // Phase 2: block access before showing any student data if this
  // teacher has neither class-teacher nor subject/timetable access to
  // the class in the URL. Wait for teacherAccess to load first so we
  // don't flash this while the teacher doc is still resolving.
  if (teacherAccess?.loaded && !hasAccess) {
    return (
      <div className="space-y-5 w-full text-xs text-slate-700 animate-fadeIn">
        <button
          onClick={() => navigate("/teacher/classes")}
          className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-800"
        >
          <ChevronLeft className="w-4 h-4" /> Back to My Classes
        </button>
        <div className="p-8 text-center bg-white rounded-2xl border border-dashed border-slate-200">
          <ShieldAlert className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-bold text-slate-600">
            You don't have access to this student.
          </p>
          <p className="text-xs text-slate-400 mt-1">
            You're only able to view students in classes you teach.
          </p>
        </div>
      </div>
    );
  }

  if (!student) {
    return <p className="text-xs text-slate-400">Loading student...</p>;
  }

  return (
    <div className="space-y-5 w-full text-xs text-slate-700 animate-fadeIn">
      <button
        onClick={() => navigate(`/teacher/classes/${classId}`)}
        className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-800"
      >
        <ChevronLeft className="w-4 h-4 cursor-pointer" /> Back to Class Roster
      </button>

      {!isClassTeacher && (
        <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs  text-amber-700 font-semibold flex items-start gap-2">
          <BookMarked className="w-4 h-4 shrink-0 mt-0.5" />
          Subject-only access
          {accessibleSubjects.length > 0
            ? ` (${accessibleSubjects.join(", ")})`
            : ""}
         
        </div>
      )}

      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 bg-slate-50 p-5 rounded-2xl border border-slate-100">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{student.name}</h2>
          <p className="text-indigo-600 font-bold mt-0.5">
            Roll ID: #{student.rollNumber} —{" "}
            <span className="text-slate-400 font-normal">
              {student.className}
              {student.section ? ` - ${student.section}` : ""}
            </span>
          </p>
        </div>
        <span
          className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider border w-fit ${
            statusStyles[student.feeStatus] || statusStyles.Unpaid
          }`}
        >
          Fees: {student.feeStatus === "Advance" ? "Paid" : student.feeStatus || "Unpaid"}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-100 gap-6 pb-1 overflow-x-auto">
        {[
          { id: "info", label: "Student & Guardian Info" },
          { id: "analytics", label: "Scholastic Analytics" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`pb-3 font-bold transition-all relative whitespace-nowrap ${
              activeTab === tab.id
                ? "text-indigo-600 font-black"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 inset-x-0 h-0.5 bg-indigo-600 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* TAB: STUDENT & GUARDIAN INFO */}
      {activeTab === "info" && (
        <div className="bg-white border border-slate-100 rounded-2xl p-6 space-y-5 shadow-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Father / Guardian Name" value={student.fatherName} />
            <Field label="Contact Number" value={student.contact} mono />
            <Field label="Email Address" value={student.email} mono />
            <Field label="B-Form / CNIC" value={student.cnic} mono bold />
            <Field label="Roll Number" value={student.rollNumber} mono />
            <Field
              label="Grade / Class Section"
              value={`${student.className || "Unassigned"}${
                student.section ? ` - ${student.section}` : ""
              }`}
              bold
            />
            <Field label="Enrollment Status" value={student.status || "Active"} bold />
            <Field
              label="Admission Date"
              value={formatAdmissionDate(student.admissionDate)}
              mono
            />
            <Field label="Gender" value={student.gender || "Not Specified"} bold />
            <Field label="Residential Address" value={student.address} span2 />
          </div>
        </div>
      )}

      {/* TAB: SCHOLASTIC ANALYTICS — editable by teacher */}
      {activeTab === "analytics" && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-100 rounded-2xl p-6 space-y-4 shadow-xs">
            <h3 className="font-bold text-slate-900 text-sm">Attendance Record Rate</h3>
            {attendancePercent !== null ? (
              <div>
                <span className="text-2xl font-black font-mono text-slate-800">
                  {attendancePercent}%
                </span>
                <span className="text-[10px] text-slate-400 font-semibold block mt-1">
                  {presentDays} present / {totalMarkedDays} marked days — auto-calculated
                  from real attendance, not editable here.
                </span>
              </div>
            ) : (
              <span className="text-sm font-bold text-slate-400 italic">
                No attendance records yet
              </span>
            )}
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl p-6 space-y-4 shadow-xs">
            <h3 className="font-bold text-slate-900 text-sm">
              Teacher Remarks & Performance Notes
            </h3>
            <p className="text-[10px] text-slate-400">
              Add, edit, or remove notes on this student's performance and
              conduct. Visible to you and school admin.
            </p>

            <div className="flex gap-2">
              <input
                type="text"
                value={newRemark}
                onChange={(e) => setNewRemark(e.target.value)}
                placeholder="e.g. Excellent participation in class discussions"
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-indigo-500 transition"
              />
              <button
                onClick={handleAddRemark}
                disabled={saving || !newRemark.trim()}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold disabled:opacity-50 transition shrink-0"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>

            <div className="space-y-2">
              {remarks.length === 0 && (
                <p className="text-slate-400 italic text-center py-6">
                  No remarks added yet.
                </p>
              )}
              {remarks.map((r) => (
                <div
                  key={r.id}
                  className="p-3 bg-slate-50 rounded-xl border border-slate-100"
                >
                  {editingId === r.id ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
                        autoFocus
                      />
                      <button
                        onClick={() => handleSaveEdit(r.id)}
                        className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200"
                      >
                        <XIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-slate-700">{r.text}</p>
                        <p className="text-[9px] text-slate-400 font-semibold mt-1">
                          — {r.teacherName || "Teacher"}
                        </p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => {
                            setEditingId(r.id);
                            setEditingText(r.text);
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-indigo-600"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteRemark(r.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <ScholasticAnalytics
            student={student}
            studentData={student}
            studentId={student.id}
            schoolId={student.schoolId || teacher?.schoolId}
            isClassTeacher={isClassTeacher}
            allowedSubjects={accessibleSubjects}
          />
        </div>
      )}

      {/* TAB: MY TIMETABLE — this is the teacher's OWN weekly timetable
          (same doc as TeacherDetailView's Timetable tab, keyed by teacher.id),
          not the class timetable. Editing here updates the same Firestore
          doc the admin's TeacherDetailView reads, so both stay in sync
          automatically — no separate sync logic needed. */}
      {activeTab === "timetable" && teacher?.id && (
        <div className="space-y-3">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex justify-between items-center">
            <span className="text-slate-500 font-bold">
              Your Weekly Teaching Schedule
            </span>
            <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-md font-mono font-black">
              SYNCED WITH YOUR TEACHER PROFILE
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

const Field = ({ label, value, mono, bold, span2 }) => (
  <div className={`p-3 bg-slate-50 rounded-xl ${span2 ? "sm:col-span-2" : ""}`}>
    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
      {label}
    </span>
    <span
      className={`text-slate-900 mt-1 block ${mono ? "font-mono" : ""} ${
        bold ? "font-bold" : ""
      }`}
    >
      {value || "—"}
    </span>
  </div>
);

export default TeacherStudentDetail;