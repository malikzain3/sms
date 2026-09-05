import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  doc,
  updateDoc,
  writeBatch,
  onSnapshot,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { db } from "../../firebaseConfig";
import TeacherTimetableTab from "./TeacherTimetableTab";
import TeacherHRCredentials from "./TeacherHRCredentials";
import TeacherSalaryLedger from "./TeacherSalaryLedger";
import TeacherAttendanceTab from "./TeacherAttendanceTab";
import PageLoader from "./PageLoader"
import PhotoUploadBox from "./PhotoUploadBox";
import { convertFileToBase64Doc } from "../../utils/docUpload";
import { ArrowLeft, FileText } from "lucide-react";
import { cleanPhotoUrl } from "../../utils/imageUpload";

const TeacherDetailView = () => {
  const { teacherId, tab } = useParams();
  const navigate = useNavigate();
  const onBack = () => navigate("/school/teachers");

  const validTabs = ["timetable", "hr", "payroll", "attendance"];
  const activeTab = validTabs.includes(tab) ? tab : "timetable";
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // ---- Classes this teacher is assigned to teach ----
  // Same convention as TeacherHome/TeacherClasses: classes.teachers stores
  // teacher NAMES (existing schema), matched by array-contains.
  const [assignedClasses, setAssignedClasses] = useState([]);

  // The URL owns which teacher we're viewing — fetch it directly by id.
  const [liveTeacher, setLiveTeacher] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    const unsub = onSnapshot(doc(db, "teachers", teacherId), (snap) => {
      setLiveTeacher(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      setLoading(false);
    });
    return () => unsub();
  }, [teacherId]);
  const data = liveTeacher;

  // Live-fetch classes assigned to this teacher, keyed off name + schoolId.
  useEffect(() => {
    if (!data?.schoolId || !data?.name) return;
    const q = query(
      collection(db, "classes"),
      where("schoolId", "==", data.schoolId),
      where("teachers", "array-contains", data.name),
    );
    const unsub = onSnapshot(q, (snap) => {
      setAssignedClasses(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.schoolId, data?.name]);

  // ---- Edit Modal State ----
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editName, setEditName] = useState(data?.name || "");
  const [editDesignation, setEditDesignation] = useState(
    data?.designation || "",
  );
  const [editDepartment, setEditDepartment] = useState(data?.department || "");
  const [editPrimarySubject, setEditPrimarySubject] = useState(
    data?.primarySubject || "",
  );
  const [editEmail, setEditEmail] = useState(data?.email || "");
  const [editPhone, setEditPhone] = useState(data?.phone || "");
  const [editCnic, setEditCnic] = useState(data?.cnic || "");
  const [editCnicError, setEditCnicError] = useState("");
  const [editGender, setEditGender] = useState(data?.gender || "Male");
  const [editDob, setEditDob] = useState(data?.dob || "");
  const [editJoiningDate, setEditJoiningDate] = useState(
    data?.joiningDate || "",
  );
  const [editScheduleType, setEditScheduleType] = useState(
    data?.scheduleType || "period",
  );
  const [editEducation, setEditEducation] = useState(data?.education || "");
  const [editAddress, setEditAddress] = useState(data?.address || "");
  const [editCvUrl, setEditCvUrl] = useState(data?.cvUrl || "");
  const [editCvFileName, setEditCvFileName] = useState(data?.cvFileName || "CV Document");
  const [editStatus, setEditStatus] = useState(data?.status || "Active");
  const [editPhotoUrl, setEditPhotoUrl] = useState(
    cleanPhotoUrl(data?.photoUrl) || "",
  );
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const openEditModal = () => {
    setEditName(data.name || "");
    setEditDesignation(data.designation || "");
    setEditDepartment(data.department || "");
    setEditPrimarySubject(data.primarySubject || "");
    setEditEmail(data.email || "");
    setEditPhone(data.phone || "");
    setEditCnic(data.cnic || "");
    setEditCnicError("");
    setEditGender(data.gender || "Male");
    setEditDob(data.dob || "");
    setEditJoiningDate(data.joiningDate || "");
    setEditScheduleType(data.scheduleType || "period");
    setEditEducation(data.education || "");
    setEditAddress(data.address || "");
    setEditCvUrl(data.cvUrl || "");
    setEditCvFileName(data.cvFileName || "CV Document");
    setEditStatus(data.status || "Active");
    setEditPhotoUrl(cleanPhotoUrl(data.photoUrl) || "");
    setIsEditModalOpen(true);
  };

  const handleUpdateTeacher = async (e) => {
    e.preventDefault();
    if (!editName || !editDesignation || !editDepartment) return;
    if (!editCnic.trim()) {
      setEditCnicError("CNIC is required.");
      return;
    }

    setIsSavingEdit(true);
    setEditCnicError("");

    try {
      // Enforce CNIC uniqueness (excluding this teacher's own doc)
      if (editCnic.trim() !== data.cnic) {
        const cnicCheck = query(
          collection(db, "teachers"),
          where("schoolId", "==", data.schoolId),
          where("cnic", "==", editCnic.trim()),
        );
        const existing = await getDocs(cnicCheck);
        const conflict = existing.docs.some((d) => d.id !== data.id);
        if (conflict) {
          setEditCnicError("Another teacher already uses this CNIC.");
          setIsSavingEdit(false);
          return;
        }
      }

      const updates = {
        name: editName,
        designation: editDesignation,
        department: editDepartment,
        primarySubject: editPrimarySubject || "General",
        coreSubjects: (editPrimarySubject || "General")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        email: editEmail || "info@school.edu",
        phone: editPhone || "—",
        cnic: editCnic.trim(),
        gender: editGender,
        dob: editDob || null,
        joiningDate: editJoiningDate || data.joiningDate || "",
        scheduleType: editScheduleType,
        education: editEducation || "Masters in Education",
        address: editAddress || "Not Provided",
        cvUrl: editCvUrl || "",
        cvFileName: editCvFileName || "CV Document",
        status: editStatus,
      };

      updates.photoUrl = editPhotoUrl.trim();

      await updateDoc(doc(db, "teachers", data.id), updates);

      setIsEditModalOpen(false);
    } catch (err) {
      console.error("Error updating teacher profile:", err);
      setEditCnicError("Something went wrong while saving. Please try again.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteTeacher = async () => {
    setIsDeleting(true);
    try {
      if (!data.schoolId) {
        throw new Error("Teacher is missing a schoolId.");
      }

      // Reuse the existing portal-disable fields before removing the profile.
      const disableBatch = writeBatch(db);
      if (data.authUid) {
        disableBatch.update(doc(db, "users", data.authUid), {
          status: "inactive",
        });
      }
      disableBatch.update(doc(db, "teachers", data.id), {
        portalStatus: "inactive",
      });
      await disableBatch.commit();

      const classesQuery = query(
        collection(db, "classes"),
        where("schoolId", "==", data.schoolId),
      );
      const classesSnapshot = await getDocs(classesQuery);
      const cleanupBatch = writeBatch(db);

      classesSnapshot.forEach((classDoc) => {
        const classData = classDoc.data();
        const timetableMatrix = Array.isArray(classData.timetableMatrix)
          ? classData.timetableMatrix
          : [];
        const cleanedMatrix = timetableMatrix.filter(
          (entry) =>
            entry.teacherId !== data.id && entry.teacherName !== data.name,
        );
        const teachers = Array.isArray(classData.teachers)
          ? classData.teachers
          : [];
        const cleanedTeachers = teachers.filter(
          (teacherName) => teacherName !== data.name,
        );

        if (
          cleanedMatrix.length !== timetableMatrix.length ||
          cleanedTeachers.length !== teachers.length
        ) {
          cleanupBatch.update(doc(db, "classes", classDoc.id), {
            ...(cleanedMatrix.length !== timetableMatrix.length
              ? { timetableMatrix: cleanedMatrix }
              : {}),
            ...(cleanedTeachers.length !== teachers.length
              ? { teachers: cleanedTeachers }
              : {}),
          });
        }
      });

      // Deleting the teacher document also removes its timetableMatrix.
      cleanupBatch.delete(doc(db, "teachers", data.id));
      await cleanupBatch.commit();
      onBack();
    } catch (err) {
      console.error("Error deleting teacher:", err);
      setIsDeleting(false);
    }
  };

  if (loading) return <PageLoader label="Loading faculty profiles..." />;

  if (!data) {
    return (
      <div className="w-full py-24 flex flex-col items-center justify-center gap-3 text-slate-400 text-xs font-bold">
        <span>Teacher not found.</span>
        <button
          onClick={onBack}
          className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/80 rounded-xl transition font-bold text-xs shadow-2xs"
        >
          ← Back to Teachers
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full animate-fadeIn text-xs text-slate-700">
      {/* Upper Navigation Card */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50 p-5 rounded-2xl border border-slate-100">
        <div className="flex items-center gap-5 flex-wrap sm:flex-nowrap">
          {/* Back Button */}
          <button
            onClick={onBack}
            aria-label="Back to teachers"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-600 shadow-2xs transition-all duration-200 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600 active:scale-95 shrink-0"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back</span>
          </button>

          {/* Vertical Divider for wide screens */}
          <div className="hidden sm:block w-px h-8 bg-slate-200/80 shrink-0" />

          {/* Profile Content Wrapper */}
          <div className="flex items-center gap-4 flex-1 min-w-70">
            {/* Avatar Container */}
            {cleanPhotoUrl(data.photoUrl) ? (
              <img
                src={cleanPhotoUrl(data.photoUrl)}
                alt={data.name}
                className="w-14 h-14 rounded-2xl object-cover ring-4 ring-slate-50 border border-slate-200/60 shrink-0 shadow-xs"
              />
            ) : (
              <div className="w-14 h-14 rounded-2xl bg-linear-to-br from-indigo-50 to-indigo-100/80 text-indigo-600 font-black flex items-center justify-center text-base ring-4 ring-slate-50 border border-indigo-100 shrink-0 shadow-xs tracking-wide">
                {data.name
                  ?.split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()}
              </div>
            )}

            {/* Information Column */}
            <div className="space-y-1 flex-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-lg font-black text-slate-900 tracking-tight leading-tight">
                  {data.name}
                </h2>
                <span
                  className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider border shadow-3xs ${
                    data.status === "Active"
                      ? "bg-emerald-50/80 text-emerald-700 border-emerald-200/50"
                      : "bg-amber-50/80 text-amber-700 border-amber-200/50"
                  }`}
                >
                  {data.status}
                </span>
              </div>

              <p className="text-sm font-bold text-indigo-600 flex items-center gap-2 flex-wrap leading-none">
                <span>{data.designation}</span>
                <span className="text-slate-300 font-light select-none">•</span>
                <span className="text-slate-400 font-medium ">
                  Department of {data.department}
                </span>
              </p>

              {/* Assigned Classes */}
              <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                {assignedClasses.length > 0 ? (
                  assignedClasses.map((c) => (
                    <span
                      key={c.id}
                      className="text-[12px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200"
                    >
                      {c.className}
                      {c.section ? ` — ${c.section}` : ""}
                    </span>
                  ))
                ) : (
                  <span className="text-[14px] font-semibold text-slate-300 italic">
                    Not assigned to any class yet
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Delete Teacher Control */}
        <div className="flex items-center gap-2">
          {confirmingDelete ? (
            <>
              <span className="text-[15px] text-rose-600 font-bold hidden sm:inline">
                Delete permanently?
              </span>
              <button
                onClick={handleDeleteTeacher}
                disabled={isDeleting}
                className="px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl transition font-bold shadow-xs text-[14px] disabled:opacity-50"
              >
                {isDeleting ? "Deleting..." : "Yes, Delete"}
              </button>
              <button
                onClick={() => setConfirmingDelete(false)}
                disabled={isDeleting}
                className="px-3 py-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition font-bold shadow-xs text-slate-600 text-[14px]"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={openEditModal}
                className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 rounded-xl transition font-bold shadow-xs text-indigo-600 text-[13px]"
              >
                Edit Teacher
              </button>
              <button
                onClick={() => setConfirmingDelete(true)}
                className="px-3 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-100 rounded-xl transition font-bold shadow-xs text-rose-600 text-[13px]"
              >
                Delete Teacher
              </button>
            </>
          )}
        </div>
      </div>

      {/* Profile Sections Control Tabs Menu */}
      <div className="flex border-b border-slate-100 gap-4 overflow-x-auto pb-1 text-xs font-bold text-slate-700">
        {[
          { id: "timetable", label: "Timetable" },
          { id: "hr", label: "HR Credentials" },
          { id: "payroll", label: "Salary Ledger" },
          { id: "attendance", label: "Attendance" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() =>
              navigate(`/school/teachers/${teacherId}/${t.id}`, {
                replace: true,
              })
            }
            className={`px-1 pb-3 text-xs font-bold transition-all whitespace-nowrap relative ${
              activeTab === t.id
                ? "text-indigo-600 font-black"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            {t.label}
            {activeTab === t.id && (
              <div className="absolute bottom-0 inset-x-0 h-0.5 bg-indigo-600 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Dynamic Tab Panel Display Window */}
      <div className="w-full">
        {/* TAB 1: TIMETABLE SCREEN MAP */}
        {activeTab === "timetable" && (
          <TeacherTimetableTab teacherId={data.id} teacherData={data} />
        )}

        {/* TAB 2: HR CREDENTIALS BLOCK */}
        {activeTab === "hr" && (
          <TeacherHRCredentials teacherId={data.id} teacherData={data} />
        )}

        {activeTab === "payroll" && (
          <TeacherSalaryLedger teacherId={data.id} teacherData={data} />
        )}

        {/* TAB 4: SYSTEM ATTENDANCE TRACKER */}
        {activeTab === "attendance" && (
          <TeacherAttendanceTab teacherId={data.id} teacherData={data} />
        )}
      </div>

      {/* Edit Teacher Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs"
            onClick={() => setIsEditModalOpen(false)}
          />
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-lg p-6 relative z-60 max-h-[90vh] overflow-y-auto scrollbar-none">
            <div className="flex justify-between items-start pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-xl font-black text-slate-900">
                  Edit Faculty Record
                </h3>
                <p className="text-[14px] text-slate-400">
                  Update {data.name}'s profile information.
                </p>
              </div>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xs p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>
            <form
              onSubmit={handleUpdateTeacher}
              className="space-y-3.5 text-xs text-slate-700"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[13px] font-bold text-slate-400 uppercase tracking-wider">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-hidden mt-1 font-semibold"
                    required
                  />
                </div>
                <div>
                  <label className="text-[13px] font-bold text-slate-400 uppercase tracking-wider">
                    Designation / Role
                  </label>
                  <input
                    type="text"
                    value={editDesignation}
                    onChange={(e) => setEditDesignation(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-hidden mt-1 font-semibold"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[13px] font-bold text-slate-400 uppercase tracking-wider">
                    Department
                  </label>
                  <input
                    type="text"
                    value={editDepartment}
                    onChange={(e) => setEditDepartment(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-hidden mt-1"
                    required
                  />
                </div>
                <div>
                  <label className="text-[13px] font-bold text-slate-400 uppercase tracking-wider">
                    Primary Core Subject
                  </label>
                  <input
                    type="text"
                    value={editPrimarySubject}
                    onChange={(e) => setEditPrimarySubject(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-hidden mt-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[13px] font-bold text-slate-400 uppercase tracking-wider">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-hidden mt-1 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[13px] font-bold text-slate-400 uppercase tracking-wider">
                    Contact Number
                  </label>
                  <input
                    type="text"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-hidden mt-1 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[13px] font-bold text-slate-400 uppercase tracking-wider">
                    CNIC
                  </label>
                  <input
                    type="text"
                    value={editCnic}
                    onChange={(e) => {
                      setEditCnic(e.target.value);
                      setEditCnicError("");
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-hidden mt-1 font-mono"
                    required
                  />
                  {editCnicError && (
                    <p className="text-[10px] text-rose-600 font-bold mt-1">
                      {editCnicError}
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-[13px] font-bold text-slate-400 uppercase tracking-wider">
                    Gender
                  </label>
                  <select
                    value={editGender}
                    onChange={(e) => setEditGender(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-hidden mt-1 font-semibold"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[13px] font-bold text-slate-400 uppercase tracking-wider">
                    Date of Birth
                  </label>
                  <input
                    type="date"
                    value={editDob}
                    onChange={(e) => setEditDob(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-hidden mt-1 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[13px] font-bold text-slate-400 uppercase tracking-wider">
                    Date of Joining
                  </label>
                  <input
                    type="date"
                    value={editJoiningDate}
                    onChange={(e) => setEditJoiningDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-hidden mt-1 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[13px] font-bold text-slate-400 uppercase tracking-wider">
                    Education
                  </label>
                  <input
                    type="text"
                    value={editEducation}
                    onChange={(e) => setEditEducation(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-hidden mt-1 font-semibold"
                  />
                </div>
                <div>
                  <label className="text-[13px] font-bold text-slate-400 uppercase tracking-wider">
                    Schedule Type
                  </label>
                  <select
                    value={editScheduleType}
                    onChange={(e) => setEditScheduleType(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-hidden mt-1 font-semibold"
                  >
                    <option value="period">Period-based</option>
                    <option value="class">Class-based</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[13px] font-bold text-slate-400 uppercase tracking-wider">
                    Status
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-hidden mt-1 font-semibold"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
                <div>
                  <label className="text-[13px] font-bold text-slate-400 uppercase tracking-wider">
                    Address
                  </label>
                  <input
                    type="text"
                    value={editAddress}
                    onChange={(e) => setEditAddress(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-hidden mt-1"
                  />
                </div>
              </div>

              <div>
                <label className="text-[13px] font-bold text-slate-400 uppercase tracking-wider">
                  CV / Resume
                </label>
                <div className="mt-2">
                  <input
                    type="file"
                    accept=".pdf,image/png,image/jpeg,image/jpg"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const dataUrl = await convertFileToBase64Doc(file);
                        setEditCvUrl(dataUrl);
                        setEditCvFileName(file.name || "CV Document");
                      } catch (err) {
                        setEditCvFileName("");
                        console.error(err);
                      }
                    }}
                    className="block w-full text-[12px] text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-indigo-600 file:px-3 file:py-2 file:text-xs file:font-bold file:text-white hover:file:bg-indigo-700"
                  />
                </div>
                {editCvUrl && (
                  <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-2.5 py-2">
                    <div className="min-w-0 flex items-center gap-2 text-[11px] text-indigo-700">
                      <FileText className="h-4 w-4 shrink-0" />
                      <span className="truncate font-bold">{editCvFileName || "CV Document"}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setEditCvUrl("");
                        setEditCvFileName("CV Document");
                      }}
                      className="text-[10px] font-bold text-rose-600 hover:text-rose-700"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>

              <PhotoUploadBox value={editPhotoUrl} onChange={setEditPhotoUrl} />

              <div className="pt-4 border-t border-slate-100 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="w-1/2 py-2.5 bg-slate-100 text-slate-600 font-bold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="w-1/2 py-2.5 bg-indigo-600 text-white font-bold rounded-xl shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSavingEdit ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherDetailView;