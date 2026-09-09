import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "../../firebaseConfig";
import Header from "./Header";
import { X } from "lucide-react";
import PageLoader from "./PageLoader";
import UpgradeModal from "./UpgradeModal";

const todayDate = () => {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60 * 1000).toISOString().slice(0, 10);
};

const Students = () => {
  const [studentsList, setStudentsList] = useState([]);
  const [classesList, setClassesList] = useState([]);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStudentId, setEditingStudentId] = useState(null); // null = adding
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [schoolPlan, setSchoolPlan] = useState("free");
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);

  const emptyForm = {
    studentName: "",
    fatherName: "",
    gender: "",
    contact: "",
    email: "",
    cnic: "",
    address: "",
    rollNumber: "",
    monthlyFee: "",
    admissionDate: todayDate(),
    grade: "",
    classId: "",
    feeStatus: "Unpaid",
  };
  const [form, setForm] = useState(emptyForm);

  const session = JSON.parse(localStorage.getItem("schoolix_session"));
  const currentSchoolId = session?.schoolId || "default_school";

  useEffect(() => {
    setLoading(true);
    const q = query(
      collection(db, "students"),
      where("schoolId", "==", currentSchoolId),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = [];
        snapshot.forEach((doc) => {
          docs.push({ id: doc.id, ...doc.data() });
        });
        setStudentsList(docs);
        setLoading(false);
      },
      (error) => {
        console.error(error);
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [currentSchoolId]);

  useEffect(() => {
    const qClasses = query(
      collection(db, "classes"),
      where("schoolId", "==", currentSchoolId),
    );
    const unsubscribe = onSnapshot(qClasses, (snapshot) => {
      const docs = [];
      snapshot.forEach((doc) => docs.push({ id: doc.id, ...doc.data() }));
      setClassesList(docs);
    });
    return () => unsubscribe();
  }, [currentSchoolId]);

  // Keep the school's plan reactive — reading straight from Firestore
  // (not localStorage) so an upgrade to Pro lifts the enrollment cap
  // immediately without requiring the admin to log out/in.
  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, "schools", currentSchoolId),
      (snap) => {
        const data = snap.data();
        setSchoolPlan(data?.selectedPlan || data?.plan || "free");
      },
      (error) => {
        console.error("Failed to read school plan:", error);
      },
    );
    return () => unsubscribe();
  }, [currentSchoolId]);

  const normalize = (str) =>
    (str || "").toString().toLowerCase().replace(/\s+/g, "");
  const filteredStudents = studentsList.filter((s) => {
    const q = normalize(searchTerm);
    if (!q) return true;
    return (
      normalize(s.name).includes(q) ||
      normalize(s.rollNumber).includes(q) ||
      normalize(s.fatherName).includes(q) ||
      normalize(s.contact).includes(q) ||
      normalize(s.email).includes(q) ||
      normalize(s.cnic).includes(q) ||
      normalize(s.className).includes(q) ||
      normalize(s.section).includes(q) ||
      normalize(s.feeStatus).includes(q) ||
      normalize(s.address).includes(q) ||
      normalize(s.gender).includes(q)
    );
  });

  const openAddModal = () => {
    setEditingStudentId(null);
    setForm(emptyForm);
    setFormError("");
    setIsModalOpen(true);
  };

  const openEditModal = (stu) => {
    setEditingStudentId(stu.id);
    setForm({
      studentName: stu.name || "",
      fatherName: stu.fatherName || "",
      gender: stu.gender || "",
      contact: stu.contact || "",
      email: stu.email || "",
      cnic: stu.cnic || "",
      address: stu.address || "",
      rollNumber: stu.rollNumber || "",
      monthlyFee:
        stu.monthlyFee != null && stu.monthlyFee !== ""
          ? String(stu.monthlyFee)
          : "",
      admissionDate: stu.admissionDate || todayDate(),
      grade: stu.className || "",
      classId: stu.classId || "",
      feeStatus: stu.feeStatus || "Unpaid",
    });
    setFormError("");
    setIsModalOpen(true);
  };

  const handleFieldChange = (field, value) => {
    setForm((prev) => {
      if (field === "grade") {
        const gradeClasses = classesList.filter(
          (classItem) => classItem.className === value,
        );
        const hasSections = gradeClasses.some((classItem) =>
          String(classItem.section || "").trim(),
        );
        return {
          ...prev,
          grade: value,
          classId: hasSections ? "" : gradeClasses[0]?.id || "",
        };
      }
      return { ...prev, [field]: value };
    });
  };

  const registeredClasses = classesList.filter(
    (classItem) => !classItem.status || classItem.status === "Active",
  );
  const gradeOptions = Array.from(
    new Set(
      registeredClasses.map((classItem) => classItem.className).filter(Boolean),
    ),
  ).sort((first, second) =>
    first.localeCompare(second, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );
  const sectionsForGrade = registeredClasses.filter(
    (classItem) => classItem.className === form.grade,
  );
  const hasRegisteredSections = sectionsForGrade.some((classItem) =>
    String(classItem.section || "").trim(),
  );

  const FREE_PLAN_STUDENT_LIMIT = 100;
  const FREE_PLAN_WARNING_THRESHOLD = 80;
  const limitReached =
    schoolPlan === "free" && studentsList.length >= FREE_PLAN_STUDENT_LIMIT;
  const nearLimit =
    schoolPlan === "free" &&
    studentsList.length >= FREE_PLAN_WARNING_THRESHOLD;

  const handleDeleteStudent = async (student) => {
    if (!window.confirm("Are you sure you want to remove this student?"))
      return;
    try {
      const studentId = typeof student === "object" ? student.id : student;
      const targetClassId =
        typeof student === "object" ? student.classId : null;

      await deleteDoc(doc(db, "students", studentId));

      if (targetClassId) {
        const remainingSnap = await getDocs(
          query(
            collection(db, "students"),
            where("classId", "==", targetClassId),
          ),
        );
        await updateDoc(doc(db, "classes", targetClassId), {
          studentsCount: remainingSnap.size,
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveStudent = async (e) => {
    e.preventDefault();
    setFormError("");
    const { studentName, grade, classId, email, cnic, gender } = form;
    if (!studentName.trim()) {
      setFormError("Student Name is required.");
      return;
    }
    if (!grade) {
      setFormError("Please select a grade.");
      return;
    }
    if (!classId) {
      setFormError("Please select a class or section.");
      return;
    }
    if (!gender) {
      setFormError("Please select a gender.");
      return;
    }

    // Enforce the Free Plan's 100-student cap for new enrollments only —
    // edits to existing students never add to the count, so they're exempt.
    if (
      !editingStudentId &&
      schoolPlan === "free" &&
      studentsList.length >= FREE_PLAN_STUDENT_LIMIT
    ) {
      setFormError(
        "Student limit reached! Your school is currently on the Free Plan (Max 100 students). Please upgrade to Pro for unlimited student enrollments.",
      );
      return;
    }

    setSaving(true);
    try {
      if (email.trim()) {
        const emailSnap = await getDocs(
          query(
            collection(db, "students"),
            where("email", "==", email.trim()),
            where("schoolId", "==", currentSchoolId),
          ),
        );
        if (emailSnap.docs.some((d) => d.id !== editingStudentId)) {
          setFormError(
            "This email address is already used by another student.",
          );
          return;
        }
      }

      if (cnic.trim()) {
        const cnicSnap = await getDocs(
          query(
            collection(db, "students"),
            where("cnic", "==", cnic.trim()),
            where("schoolId", "==", currentSchoolId),
          ),
        );
        if (cnicSnap.docs.some((d) => d.id !== editingStudentId)) {
          setFormError("This CNIC is already registered to another student.");
          return;
        }
      }

      const selectedClass = classesList.find((c) => c.id === classId);
      let rollNumber = form.rollNumber;

      if (!editingStudentId) {
        const classStudentsSnap = await getDocs(
          query(
            collection(db, "students"),
            where("schoolId", "==", currentSchoolId),
            where("classId", "==", classId),
          ),
        );
        rollNumber = String(classStudentsSnap.size + 1);
      }

      const payload = {
        name: form.studentName,
        fatherName: form.fatherName,
        gender: form.gender,
        contact: form.contact,
        email: form.email,
        cnic: form.cnic,
        address: form.address,
        rollNumber,
        monthlyFee: Number(form.monthlyFee || 0),
        admissionDate: form.admissionDate || todayDate(),
        feeStatus: form.feeStatus,
        classId,
        className: selectedClass?.className || "Unassigned",
        section: selectedClass?.section || "A",
        level: selectedClass?.level || "",
      };

      if (editingStudentId) {
        await updateDoc(doc(db, "students", editingStudentId), payload);
      } else {
        await addDoc(collection(db, "students"), {
          ...payload,
          schoolId: currentSchoolId,
          status: "Active",
          addedOn: new Date().toISOString(),
        });
      }

      // Recalculate student count for the target class
      if (classId) {
        const classStudentsSnap = await getDocs(
          query(collection(db, "students"), where("classId", "==", classId)),
        );
        await updateDoc(doc(db, "classes", classId), {
          studentsCount: classStudentsSnap.size,
        });
      }
      setForm(emptyForm);
      setEditingStudentId(null);
      setIsModalOpen(false);
    } catch (err) {
      console.error(err);
      setFormError("Something went wrong while saving. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageLoader label="Loading students profiles..." />;

  return (
    <div className="space-y-6 text-xs text-slate-700">
      <Header />
      <div className="p-6 bg-white border border-slate-100 rounded-2xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-md sm:text-lg font-bold text-slate-900 tracking-tight">
              Student Enrollment Registry
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Manage institutional learners assigned to this workspace location.
            </p>
          </div>
          <button
            onClick={openAddModal}
            className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition cursor-pointer shrink-0 text-[14px]"
          >
            + Enroll Student
          </button>
        </div>

        <div className="w-full">
          <div className="relative w-full">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search students..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 xl:py-2.5 pl-9 text-xs text-slate-700 placeholder-slate-400 shadow-xs transition focus:border-indigo-300 focus:bg-white focus:outline-none"
            />
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="6" />
              <path d="M16 16L21 21" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        {studentsList.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-slate-200 text-slate-400 italic rounded-2xl">
            No students found under this active branch registry.
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-slate-200 text-slate-400 italic rounded-2xl">
            No students match your search.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-4">
            {filteredStudents.map((student) => (
              <div
                key={student.id}
                className="p-5 bg-white border border-slate-100 hover:border-indigo-500 hover:bg-slate-50/50 rounded-2xl shadow-2xs hover:shadow-xs flex flex-col justify-between md:flex-row md:items-center min-h-fit md:h-auto transition duration-200 cursor-pointer group relative"
                onClick={() => navigate(`/school/students/${student.id}`)}
              >
                <div className="min-w-0 ">
                  <div className="flex gap-1 items-center">
                    <h4 className="font-bold text-slate-800 truncate group-hover:text-indigo-600 text-lg">
                      {student.name}
                    </h4>
                    <span
                      className={`px-2.5 py-0.5 rounded-full font-bold text-[14px] shrink-0 ${
                        student.feeStatus === "Paid"
                          ? "bg-emerald-50 text-emerald-600"
                          : student.feeStatus === "Partial"
                            ? "bg-orange-50 text-orange-600"
                            : student.feeStatus === "Advance"
                              ? "bg-indigo-50 text-indigo-600"
                              : "bg-amber-50 text-amber-600"
                      }`}
                    >
                      {student.feeStatus || "Unpaid"}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full font-bold text-[14px] shrink-0 ${
                        student.gender === "Male"
                          ? "bg-emerald-50 text-emerald-600"
                          : student.gender === "Female"
                            ? "bg-orange-50 text-orange-600"
                            : student.gender === "Other"
                              ? "bg-indigo-50 text-indigo-600"
                              : "bg-amber-50 text-amber-600"
                      }`}
                    >
                      {student.gender || "Not Specified"}
                    </span>
                  </div>
                  <p className="text-[14px] text-slate-400 mt-0.5">
                    Roll:{" "}
                    <span className="font-mono">{student.rollNumber}</span>
                    {" | "}{" "}
                    <span className="font-bold">
                      {student.className || "Unassigned"}
                      {student.section ? ` - ${student.section}` : ""}{" "}
                    </span>
                  </p>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[14px] text-slate-400">
                    <span>
                      Father Name:{" "}
                      <span className="text-slate-500 font-medium group-hover:text-indigo-600">
                        {student.fatherName || "—"}
                      </span>
                    </span>
                    <span>
                      Email:{" "}
                      <span className="text-slate-500 font-medium group-hover:text-indigo-600">
                        {student.email || "—"}
                      </span>
                    </span>
                    <span>
                      CNIC:{" "}
                      <span className="text-slate-500 font-medium group-hover:text-indigo-600">
                        {student.cnic || "—"}
                      </span>
                    </span>
                    {student.address && (
                      <span
                        className=" max-w-100 truncate"
                        title={student.address}
                      >
                        Address:{" "}
                        <span className="text-slate-500 font-medium group-hover:text-indigo-600">
                          {student.address}
                        </span>
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditModal(student);
                    }}
                    className="text-xs bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-indigo-600 font-semibold px-4 py-2 rounded-xl transition-all duration-200 shadow-2xs active:scale-95"
                  >
                    Update
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteStudent(student);
                    }}
                    className="text-xs bg-slate-100 text-rose-600 hover:bg-rose-100 hover:text-rose-700 font-semibold px-4 py-2 rounded-xl transition-all duration-200 shadow-2xs active:scale-95"
                  >
                    Delete
                  </button>
                  {/* <button
                      onClick={() => setSelectedStudent(student)}
                      className="text-[10px] bg-indigo-50 text-indigo-600 hover:bg-indigo-100 font-bold px-2.5 py-1 rounded-md transition"
                    >
                      View →
                    </button> */}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* MODAL */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs"
              onClick={() => setIsModalOpen(false)}
            />
            <div className="bg-white rounded-2xl border border-slate-100 w-full max-w-md p-6 relative z-60 space-y-4 max-h-[85vh] overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-slate-200 [&::-webkit-scrollbar-thumb]:rounded-full [scrollbar-thin]">
              <div className="flex justify-between items-center">
                <h3 className="font-black text-slate-900 text-xl">
                  {editingStudentId ? "Update Student" : "Enroll New Student"}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 font-bold text-xs p-1 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <form onSubmit={handleSaveStudent} className="space-y-3">
                {!editingStudentId && nearLimit && (
                  <div
                    className={`rounded-xl border px-3 py-2.5 text-[13px] font-semibold ${
                      limitReached
                        ? "border-amber-300 bg-amber-50 text-amber-700"
                        : "border-sky-200 bg-sky-50 text-sky-700"
                    }`}
                  >
                    <p>
                      {limitReached
                        ? "⚠️ Student limit reached! Your school is currently on the Free Plan (Max 100 students). Please upgrade to Pro for unlimited student enrollments."
                        : `You're approaching the Free Plan limit (${studentsList.length}/100 students). Upgrade to Pro for unlimited enrollments.`}
                    </p>
                    <button
                      type="button"
                      onClick={() => setIsUpgradeModalOpen(true)}
                      className={`mt-2 rounded-lg px-3 py-1.5 text-xs font-bold text-white transition ${
                        limitReached
                          ? "bg-amber-600 hover:bg-amber-700"
                          : "bg-sky-600 hover:bg-sky-700"
                      }`}
                    >
                      Upgrade to Pro
                    </button>
                  </div>
                )}                <div>
                  <label className="text-[13px] font-bold text-slate-400 uppercase">
                    Student Full Name
                  </label>
                  <input
                    type="text"
                    placeholder="Ali Ahmed"
                    value={form.studentName}
                    onChange={(e) =>
                      handleFieldChange("studentName", e.target.value)
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 mt-1 focus:outline-hidden text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="text-[13px] font-bold text-slate-400 uppercase">
                    Father Name
                  </label>
                  <input
                    type="text"
                    value={form.fatherName}
                    onChange={(e) =>
                      handleFieldChange("fatherName", e.target.value)
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 mt-1 focus:outline-hidden text-[15px]"
                  />
                </div>
                <div>
                  <div>
                    <label className="text-[13px] font-bold text-slate-400 uppercase">
                      Contact Number
                    </label>
                    <input
                      type="text"
                      value={form.contact}
                      onChange={(e) =>
                        handleFieldChange("contact", e.target.value)
                      }
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 mt-1 focus:outline-hidden text-[15px]"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[13px] font-bold text-slate-400 uppercase">
                      Monthly Fee (Rs.)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={form.monthlyFee}
                      onChange={(e) =>
                        handleFieldChange("monthlyFee", e.target.value)
                      }
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 mt-1 focus:outline-hidden text-[15px]"
                      placeholder="15000"
                    />
                  </div>
                  <div>
                    <label className="text-[13px] font-bold text-slate-400 uppercase">
                      Fee Status
                    </label>
                    <select
                      value={form.feeStatus}
                      onChange={(e) =>
                        handleFieldChange("feeStatus", e.target.value)
                      }
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 mt-1 focus:outline-hidden text-[15px] font-semibold"
                    >
                      <option value="Unpaid">⚠️ Unpaid</option>
                      <option value="Partial">🟠 Partial</option>
                      <option value="Paid">✅ Paid</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[13px] font-bold text-slate-400 uppercase">
                    Admission Date
                  </label>
                  <input
                    type="date"
                    value={form.admissionDate}
                    onChange={(e) =>
                      handleFieldChange("admissionDate", e.target.value)
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 mt-1 focus:outline-hidden text-[15px]"
                    required
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[13px] font-bold text-slate-400 uppercase">
                      Grade
                    </label>
                    <select
                      value={form.grade}
                      onChange={(e) =>
                        handleFieldChange("grade", e.target.value)
                      }
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 mt-1 focus:outline-hidden text-sm"
                      required
                    >
                      <option value="">Select grade</option>
                      {gradeOptions.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[13px] font-bold text-slate-400 uppercase">
                      Class / Section
                    </label>
                    <select
                      value={form.classId}
                      onChange={(e) =>
                        handleFieldChange("classId", e.target.value)
                      }
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 mt-1 focus:outline-hidden text-[15px]"
                      required
                      disabled={!form.grade}
                    >
                      <option value="">
                        {form.grade ? "Select section" : "Select grade first"}
                      </option>
                      {hasRegisteredSections ? (
                        sectionsForGrade
                          .filter((classItem) =>
                            String(classItem.section || "").trim(),
                          )
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              Section {c.section}
                            </option>
                          ))
                      ) : (
                        <option value={sectionsForGrade[0]?.id || ""}>
                          No Section (Default A)
                        </option>
                      )}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[13px] font-bold text-slate-400 uppercase">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => handleFieldChange("email", e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 mt-1 focus:outline-hidden text-[15px]"
                  />
                </div>
                <div>
                  <div>
                    <label className="text-[13px] font-bold text-slate-400 uppercase">
                      B-Form / CNIC
                    </label>
                    <input
                      type="text"
                      value={form.cnic}
                      onChange={(e) =>
                        handleFieldChange("cnic", e.target.value)
                      }
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 mt-1 focus:outline-hidden text-[15px]"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[13px] font-bold text-slate-400 uppercase">
                      Gender
                    </label>
                    <select
                      value={form.gender}
                      onChange={(e) =>
                        handleFieldChange("gender", e.target.value)
                      }
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 mt-1 focus:outline-hidden text-[15px] font-semibold"
                      required
                    >
                        <option value="">Select gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[13px] font-bold text-slate-400 uppercase">
                    Home Address
                  </label>
                  <textarea
                    rows="2"
                    value={form.address}
                    onChange={(e) =>
                      handleFieldChange("address", e.target.value)
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 mt-1 focus:outline-hidden resize-none text-[15px]"
                  />
                </div>

                {formError && (
                  <p className="text-red-500 font-semibold text-[11px]">
                    {formError}
                  </p>
                )}

                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="w-1/2 py-2 bg-slate-100 text-slate-600 font-bold rounded-xl cursor-pointer hover:bg-slate-200 transition-all text-[15px]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving || (!editingStudentId && limitReached)}
                    className="w-1/2 py-2 bg-indigo-600 text-white font-bold rounded-xl cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:bg-indigo-700 transition-all text-[15px]"
                  >
                    {saving
                      ? "Saving..."
                      : editingStudentId
                        ? "Save Changes"
                        : "Enroll"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      <UpgradeModal
        isOpen={isUpgradeModalOpen}
        onClose={() => setIsUpgradeModalOpen(false)}
        schoolId={currentSchoolId}
      />
    </div>
  );
};

export default Students;