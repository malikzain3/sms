import React, { useState, useEffect } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  getDocs,
} from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { useParams, useNavigate } from "react-router-dom";
import TimetableGrid from "./TimetableGrid";
import {
  GraduationCap,
  Calendar,
  Users,
  BookOpen,
  CalendarClock,
  DoorClosed,
  Pencil,
  ArrowLeft,
  Trash,
  RefreshCw,
  X,
  Search,
} from "lucide-react";
import PageLoader from "./PageLoader";
import UpgradeModal from "./UpgradeModal";

const MIN_COURSES = 3;
const MAX_COURSES = 8;

const emptyStudentForm = {
  studentName: "",
  gender: "",
  fatherName: "",
  contact: "",
  email: "",
  cnic: "",
  address: "",
  rollNumber: "",
  monthlyFee: "",
  feeStatus: "Unpaid",
};
const normalizeRoll = (val) => {
  const trimmed = (val || "").trim();
  if (trimmed === "") return "";
  const num = Number(trimmed);
  return !isNaN(num) ? String(num) : trimmed.toLowerCase();
};

const ClassDetailView = () => {
  const { classId } = useParams();
  const navigate = useNavigate();
  const onBack = () => navigate("/school/classes");

  // ---- Resolve the class itself from the URL ----
  const [classData, setClassData] = useState(null);
  const [loadingClass, setLoadingClass] = useState(true);

  useEffect(() => {
    if (!classId) return;
    setLoadingClass(true);
    const unsubscribe = onSnapshot(
      doc(db, "classes", classId),
      (snap) => {
        setClassData(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        setLoadingClass(false);
      },
      (error) => {
        console.error(error);
        setClassData(null);
        setLoadingClass(false);
      },
    );
    return () => unsubscribe();
  }, [classId]);

  // Roster tab is shown first by default
  const [activeTab, setActiveTab] = useState("students");
  const [students, setStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(true);

  // ---- Student modal (handles both Add and Update) ----
  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false);
  const [editingStudentId, setEditingStudentId] = useState(null);
  const [studentForm, setStudentForm] = useState(emptyStudentForm);
  const [studentFormError, setStudentFormError] = useState("");
  const [studentSearch, setStudentSearch] = useState("");

  // ---- Class edit modal ----
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFormError, setEditFormError] = useState("");
  const [editClassName, setEditClassName] = useState("");
  const [editSection, setEditSection] = useState("");
  const [editLevel, setEditLevel] = useState("");
  const [editRoomNumber, setEditRoomNumber] = useState("");
  const [editAcademicYear, setEditAcademicYear] = useState("");
  const [editTeacherMode, setEditTeacherMode] = useState("single");
  const [editTeacherSingle, setEditTeacherSingle] = useState("");
  const [editTeachersMulti, setEditTeachersMulti] = useState([""]);
  const [editCourses, setEditCourses] = useState(["", "", ""]);
  const [loading, setLoading] = useState(false);
  const [teachersList, setTeachersList] = useState([]);
  const [allClasses, setAllClasses] = useState([]);
  const [schoolPlan, setSchoolPlan] = useState("free");
  const [totalSchoolStudentCount, setTotalSchoolStudentCount] = useState(0);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);

  const classTeacher =
    Array.isArray(classData?.teachers) && classData.teachers.length > 0
      ? classData.teachers[0]
      : "Unassigned";
  const coursesList = Array.isArray(classData?.courses)
    ? classData.courses
    : [];
  useEffect(() => {
    if (!classData?.schoolId) return;
    const q = query(
      collection(db, "teachers"),
      where("schoolId", "==", classData.schoolId),
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = [];
      snapshot.forEach((doc) => {
        docs.push({ id: doc.id, ...doc.data() });
      });
      setTeachersList(docs);
    });
    return () => unsubscribe();
  }, [classData?.schoolId]);

  useEffect(() => {
    if (!classData?.schoolId) return;
    const q = query(
      collection(db, "classes"),
      where("schoolId", "==", classData.schoolId),
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = [];
      snapshot.forEach((doc) => {
        docs.push({ id: doc.id, ...doc.data() });
      });
      setAllClasses(docs);
    });
    return () => unsubscribe();
  }, [classData?.schoolId]);

  // Live plan + school-wide student count, read straight from Firestore so
  // an upgrade to Pro lifts the enrollment cap immediately (per Phase 2
  // decision to keep reading selectedPlan from the school doc, not
  // localStorage). The cap applies school-wide, not per-class, so this
  // counts every student under the school — not just this class's roster.
  useEffect(() => {
    if (!classData?.schoolId) return;
    const unsubscribe = onSnapshot(
      doc(db, "schools", classData.schoolId),
      (snap) => {
        const data = snap.data();
        setSchoolPlan(data?.selectedPlan || data?.plan || "free");
      },
      (error) => {
        console.error("Failed to read school plan:", error);
      },
    );
    return () => unsubscribe();
  }, [classData?.schoolId]);

  useEffect(() => {
    if (!classData?.schoolId) return;
    const q = query(
      collection(db, "students"),
      where("schoolId", "==", classData.schoolId),
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTotalSchoolStudentCount(snapshot.size);
    });
    return () => unsubscribe();
  }, [classData?.schoolId]);

  const requiredScheduleType =
    editTeacherMode === "single" ? "class" : "period";

  const assignedTeacherNames = new Set(
    allClasses
      .filter((c) => c.id !== classData?.id)
      .flatMap((c) => (Array.isArray(c.teachers) ? c.teachers : [])),
  );

  const currentClassTeachers = new Set(
    Array.isArray(classData?.teachers) ? classData.teachers : [],
  );

  const availableTeachers = teachersList.filter((t) => {
    if (t.scheduleType !== requiredScheduleType) return false;
    const isAssignedToThisClass =
      currentClassTeachers.has(t.name) || currentClassTeachers.has(t.id);
    const isAssignedToOtherClass =
      assignedTeacherNames.has(t.name) || assignedTeacherNames.has(t.id);

    return isAssignedToThisClass || !isAssignedToOtherClass;
  });
  const normalize = (str) =>
    (str || "").toString().toLowerCase().replace(/\s+/g, "");
  const filteredStudents = students.filter((s) => {
    const q = normalize(studentSearch);
    if (!q) return true;
    return (
      normalize(s.name).includes(q) ||
      normalize(s.rollNumber).includes(q) ||
      normalize(s.fatherName).includes(q) ||
      normalize(s.contact).includes(q) ||
      normalize(s.email).includes(q) ||
      normalize(s.cnic).includes(q) ||
      normalize(s.gender).includes(q) ||
      normalize(s.feeStatus).includes(q) ||
      normalize(s.studentId).includes(q) ||
      normalize(s.admissionDate).includes(q) ||
      normalize(s.dateOfBirth).includes(q)
    );
  });

  // Live Sync Students allocated to this Class
  useEffect(() => {
    if (!classData?.id) return;
    const q = query(
      collection(db, "students"),
      where("classId", "==", classData.id),
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const studentList = [];
      snapshot.forEach((doc) => {
        studentList.push({ id: doc.id, ...doc.data() });
      });
      setStudents(studentList);
      setLoadingStudents(false);

      // Keep student numbers synchronized automatically
      if (studentList.length !== classData.studentsCount) {
        updateDoc(doc(db, "classes", classData.id), {
          studentsCount: studentList.length,
        });
      }
    });

    return () => unsubscribe();
  }, [classData?.id, classData?.studentsCount]);

  // ---------------- Student: Add / Update ----------------
  const openAddStudentModal = () => {
    setEditingStudentId(null);
    setStudentForm({
      ...emptyStudentForm,
      rollNumber: String(students.length + 1),
    });
    setStudentFormError("");
    setIsStudentModalOpen(true);
  };

  const openEditStudentModal = (stu) => {
    setEditingStudentId(stu.id);
    setStudentForm({
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
      feeStatus: stu.feeStatus || "Unpaid",
    });
    setStudentFormError("");
    setIsStudentModalOpen(true);
  };

  const handleStudentFieldChange = (field, value) => {
    setStudentForm((prev) => ({ ...prev, [field]: value }));
  };

  const FREE_PLAN_STUDENT_LIMIT = 100;
  const FREE_PLAN_WARNING_THRESHOLD = 80;
  const classLimitReached =
    schoolPlan === "free" &&
    totalSchoolStudentCount >= FREE_PLAN_STUDENT_LIMIT;
  const classNearLimit =
    schoolPlan === "free" &&
    totalSchoolStudentCount >= FREE_PLAN_WARNING_THRESHOLD;

  const handleSaveStudent = async (e) => {
    e.preventDefault();
    setStudentFormError("");
    setLoading(true);

    try {
      const { studentName, rollNumber, email, cnic, gender } = studentForm;
      if (!studentName || !rollNumber || !gender) return;

      // Enforce the Free Plan's 100-student cap (school-wide) for new
      // enrollments only — editing an existing student never adds to the
      // count, so it stays exempt.
      if (
        !editingStudentId &&
        schoolPlan === "free" &&
        totalSchoolStudentCount >= FREE_PLAN_STUDENT_LIMIT
      ) {
        setStudentFormError(
          "Student limit reached! Your school is currently on the Free Plan (Max 100 students). Please upgrade to Pro for unlimited student enrollments.",
        );
        return;
      }

      const rollTaken = students.some(
        (s) =>
          s.id !== editingStudentId &&
          s.classId === classData.id &&
          normalizeRoll(s.rollNumber) === normalizeRoll(rollNumber),
      );

      if (rollTaken) {
        setStudentFormError("This roll number is already used in this class.");
        return;
      }

      if (email.trim()) {
        const emailSnap = await getDocs(
          query(
            collection(db, "students"),
            where("email", "==", email.trim()),
            where("schoolId", "==", classData.schoolId),
          ),
        );
        if (emailSnap.docs.some((d) => d.id !== editingStudentId)) {
          setStudentFormError(
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
            where("schoolId", "==", classData.schoolId),
          ),
        );
        if (cnicSnap.docs.some((d) => d.id !== editingStudentId)) {
          setStudentFormError(
            "This CNIC is already registered to another student.",
          );
          return;
        }
      }

      const payload = {
        name: studentForm.studentName.trim(),
        fatherName: studentForm.fatherName.trim(),
        gender: studentForm.gender,
        contact: studentForm.contact.trim(),
        email: studentForm.email.trim(),
        cnic: studentForm.cnic.trim(),
        address: studentForm.address.trim(),
        rollNumber: studentForm.rollNumber.trim(),
        monthlyFee: Number(studentForm.monthlyFee || 0),
        feeStatus: studentForm.feeStatus,
      };

      if (editingStudentId) {
        await updateDoc(doc(db, "students", editingStudentId), payload);
      } else {
        const session = JSON.parse(
          localStorage.getItem("schoolix_session") || "{}",
        );
        const currentSchoolId =
          session?.schoolId || classData?.schoolId || "default_school";

        await addDoc(collection(db, "students"), {
          ...payload,
          schoolId: currentSchoolId,
          classId: classData.id,
          className: classData.className,
          section: classData.section,
          level: classData.level,
          status: "Active",
          addedOn: new Date().toISOString(),
        });
      }
      setStudentForm(emptyStudentForm);
      setEditingStudentId(null);
      setIsStudentModalOpen(false);
    } catch (err) {
      console.error("Error saving student profile record:", err);
      setStudentFormError(
        "Something went wrong while saving. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteStudent = async (studentId) => {
    if (!window.confirm("Are you sure you want to unenroll this student?"))
      return;
    try {
      await deleteDoc(doc(db, "students", studentId));
    } catch (err) {
      console.error("Error deleting student profile document:", err);
    }
  };

  // ---------------- Class: Edit ----------------
  const openEditClassModal = () => {
    setEditFormError("");
    setEditClassName(classData.className || "");
    setEditSection(classData.section || "");
    setEditLevel(classData.level || "");
    setEditRoomNumber(classData.roomNumber || "");
    setEditAcademicYear(classData.academicYear || "");
    setEditTeacherMode(classData.teacherMode || "single");
    setEditTeacherSingle(classData.teachers?.[0] || "");
    setEditCourses(coursesList.length > 0 ? coursesList : ["", "", ""]);
    setIsEditModalOpen(true);
  };

  // const handleEditAddTeacher = () => {
  //   if (editTeachersMulti.length >= 8) return;
  //   setEditTeachersMulti([...editTeachersMulti, ""]);
  // };

  // const handleEditRemoveTeacher = (index) => {
  //   if (editTeachersMulti.length <= 1) return;
  //   setEditTeachersMulti(editTeachersMulti.filter((_, i) => i !== index));
  // };

  // const handleEditTeacherChange = (index, value) => {
  //   const updated = [...editTeachersMulti];
  //   updated[index] = value;
  //   setEditTeachersMulti(updated);
  // };

  const handleEditAddCourse = () => {
    if (editCourses.length >= MAX_COURSES) return;
    setEditCourses([...editCourses, ""]);
  };

  const handleEditRemoveCourse = (index) => {
    if (editCourses.length <= MIN_COURSES) return;
    setEditCourses(editCourses.filter((_, i) => i !== index));
  };

  const handleEditCourseChange = (index, value) => {
    const updated = [...editCourses];
    updated[index] = value;
    setEditCourses(updated);
  };

  const handleSaveClassEdit = async (e) => {
    e.preventDefault();
    setEditFormError("");
    setLoading(true);

    try {
      if (!editClassName || !editSection || !editLevel) {
        setEditFormError("Class name, section, and level are required.");
        return;
      }

      const cleanedCourses = editCourses.map((c) => c.trim()).filter(Boolean);
      if (
        cleanedCourses.length < MIN_COURSES ||
        cleanedCourses.length > MAX_COURSES
      ) {
        setEditFormError(
          `Please provide between ${MIN_COURSES} and ${MAX_COURSES} courses.`,
        );
        setLoading(false);
        return;
      }

      const lowerCourses = cleanedCourses.map((c) => c.toLowerCase());
      if (new Set(lowerCourses).size !== lowerCourses.length) {
        setEditFormError("You've entered the same course more than once.");
        setLoading(false);
        return;
      }

      const otherClassesSnap = await getDocs(
        query(
          collection(db, "classes"),
          where("schoolId", "==", classData.schoolId),
        ),
      );
      const duplicateClass = otherClassesSnap.docs.some(
        (d) =>
          d.id !== classData.id &&
          d.data().className?.trim().toLowerCase() ===
            editClassName.trim().toLowerCase() &&
          d.data().section?.trim().toLowerCase() ===
            editSection.trim().toLowerCase(),
      );
      if (duplicateClass) {
        setEditFormError("Another class already uses this name and section.");
        return;
      }

      if (editRoomNumber.trim()) {
        const roomTaken = otherClassesSnap.docs.some(
          (d) =>
            d.id !== classData.id &&
            d.data().roomNumber?.trim().toLowerCase() ===
              editRoomNumber.trim().toLowerCase(),
        );
        if (roomTaken) {
          setEditFormError(
            "This room number is already assigned to another class.",
          );
          return;
        }
      }

      if (!editTeacherSingle) {
        setEditFormError("Please select a class teacher.");
        return;
      }
      const teacherTakenElsewhere = otherClassesSnap.docs.some(
        (d) =>
          d.id !== classData.id &&
          Array.isArray(d.data().teachers) &&
          d.data().teachers.includes(editTeacherSingle),
      );
      if (teacherTakenElsewhere) {
        setEditFormError(
          "This teacher is already assigned to a different class.",
        );
        return;
      }
      const teachers = [editTeacherSingle];

      await updateDoc(doc(db, "classes", classData.id), {
        className: editClassName,
        section: editSection,
        level: editLevel,
        roomNumber: editRoomNumber || null,
        academicYear: editAcademicYear || null,
        teacherMode: editTeacherMode,
        teachers,
        courses: cleanedCourses,
      });
      // Batch update all enrolled students with the updated Class Name / Section / Level
      const studentsToUpdateSnap = await getDocs(
        query(collection(db, "students"), where("classId", "==", classData.id)),
      );

      const updatePromises = studentsToUpdateSnap.docs.map((studentDoc) =>
        updateDoc(doc(db, "students", studentDoc.id), {
          className: editClassName,
          section: editSection,
          level: editLevel,
        }),
      );

      await Promise.all(updatePromises);
      setIsEditModalOpen(false);
    } catch (err) {
      console.error(err);
      setEditFormError(
        "Something went wrong while saving changes. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <PageLoader label="Loading faculty profiles..." />;

  if (!classData) {
    return (
      <div className="p-6 text-center text-sm text-slate-400 italic">
        This class doesn't exist or was deleted.
        <button
          onClick={onBack}
          className="block mx-auto mt-3 text-indigo-600 font-bold cursor-pointer not-italic"
        >
          ← Back to Classes
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-6 w-full relative">
      {/* Upper Layout Controls Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center  gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="group inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-linear-to-r from-slate-50 via-white to-slate-100 px-3.5 py-2 text-sm font-bold text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-200 hover:bg-gradient-to-r hover:from-indigo-50 hover:to-white hover:text-indigo-700 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-200"
          >
            <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
            <span>Back</span>
          </button>
          <div>
            <h2 className="text-base sm:text-lg xl:text-lg font-black text-slate-900 tracking-tight">
              {classData.className}{" "}
              <span className="text-slate-300 font-medium">/</span> Section{" "}
              {classData.section.toUpperCase()}
            </h2>
            <div className="flex items-center flex-wrap gap-1.5 sm:gap-2 mt-0.5 sm:mt-1">
              <span className="text-xs xl:text-sm text-slate-400">
                Class Teacher:
              </span>
              <span className="text-xs xl:text-sm font-bold text-indigo-600">
                {classTeacher}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-bold text-[10px] xl:text-xs uppercase tracking-wide">
                {(classData.teacherMode || "single") === "multi"
                  ? "Multi-teacher"
                  : "Single-teacher"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 xl:gap-3 self-start sm:self-auto">
          {/* Dynamic Tab Switcher Layout */}
          <div className="flex w-full justify-center sm:w-auto bg-slate-100 p-0.5 xl:p-1 rounded-lg xl:rounded-xl">
            <button
              onClick={() => setActiveTab("students")}
              className={`flex flex-1 sm:flex-initial sm:justify-start justify-center items-center gap-1 px-2.5 py-1.5 xl:px-3.5 xl:py-2 text-xs xl:text-md font-bold rounded-md xl:rounded-lg transition ${
                activeTab === "students"
                  ? "bg-white text-indigo-600 shadow-xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Users className="w-3 h-3 xl:w-3 xl:h-3" />{" "}
              <span>Class Data</span> ({students.length})
            </button>
            <button
              onClick={() => setActiveTab("timetable")}
              className={`flex flex-1 justify-center items-center gap-1 px-2.5 py-1.5 xl:px-3.5 xl:py-2 text-xs xl:text-md font-bold rounded-md xl:rounded-lg transition ${
                activeTab === "timetable"
                  ? "bg-white text-indigo-600 shadow-xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <CalendarClock className="w-3 h-3 xl:w-3 xl:h-3" />{" "}
              <span>Timetable</span>
            </button>
          </div>

          {/* Edit Class Button */}
          <button
            onClick={openEditClassModal}
            className="flex items-center gap-1.5 px-3 py-1.5 xl:px-4 xl:py-2 bg-white border border-slate-200 hover:border-indigo-300 hover:text-indigo-600 text-slate-600 font-bold rounded-lg xl:rounded-xl transition text-xs xl:text-md shrink-0 cursor-pointer shadow-2sm"
          >
            <Pencil className="w-3 h-3 xl:w-3 xl:h-3" /> Edit Class
          </button>
        </div>
      </div>

      {/* ==================== CLASS OVERVIEW PANEL ==================== */}
      <div className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-4 space-y-3">
        {/* Top Row: Full-width balanced Grid (4 Equal Cards) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {/* Card 1: Level */}
          <div className="bg-white border border-slate-200/70 rounded-xl p-2.5 flex items-center space-x-2.5 shadow-2sm">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg shrink-0">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider truncate">
                Class Level
              </p>
              <p className="text-md font-bold text-slate-800 truncate">
                {classData.level ? classData.level.toUpperCase() : "N/A"}
              </p>
            </div>
          </div>

          {/* Card 2: Room */}
          <div className="bg-white border border-slate-200/70 rounded-xl p-2.5 flex items-center space-x-2.5 shadow-2sm">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg shrink-0 relative">
              <DoorClosed className="w-5 h-5" />
              <span
                className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${classData.roomNumber ? "bg-emerald-500 animate-pulse" : "bg-amber-400"}`}
              ></span>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider truncate">
                Room Number
              </p>
              <p className="text-md font-bold text-slate-800 truncate">
                {classData.roomNumber || "Unassigned"}
              </p>
            </div>
          </div>

          {/* Card 3: Academic Year */}
          <div className="bg-white border border-slate-200/70 rounded-xl p-2.5 flex items-center space-x-2.5 shadow-2sm">
            <div className="p-2 bg-sky-50 text-sky-600 rounded-lg shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider truncate">
                Academic Year
              </p>
              <p className="text-md font-bold text-slate-800 truncate">
                {classData.academicYear || "Not Set"}
              </p>
            </div>
          </div>

          {/* Card 4: Total Students */}
          <div className="bg-white border border-slate-200/70 rounded-xl p-2.5 flex items-center space-x-2.5 shadow-2sm">
            <div className="p-2 bg-purple-50 text-purple-600 rounded-lg shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider truncate">
                Students
              </p>
              <p className="text-md font-bold text-slate-800 truncate">
                {students.length}
              </p>
            </div>
          </div>
        </div>

        {/* Bottom Row: Courses Strip (Spans full width) */}
        <div className="bg-white border border-slate-200/70 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-start gap-4 shadow-2sm">
          <div className="flex items-center gap-2 shrink-0">
            <div className="p-1.5 bg-slate-100 text-slate-600 rounded-md">
              <BookOpen className="w-5 h-5" />
            </div>
            <span className="text-[14px] font-bold text-slate-700 uppercase tracking-wider">
              Assigned Courses
            </span>
            <span className="text-[14px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold">
              {coursesList.length}
            </span>
          </div>

          {/* Courses List  */}
          <div className="flex flex-wrap items-start gap-1.5 sm:justify-end">
            {coursesList.length > 0 ? (
              coursesList.map((course, idx) => (
                <span
                  key={idx}
                  className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200/80 text-slate-700 font-bold text-[12px] hover:border-indigo-200 hover:bg-indigo-50/50 hover:text-indigo-600 transition-colors"
                >
                  {course.toUpperCase()}
                </span>
              ))
            ) : (
              <span className="text-[14px] text-slate-400 italic">
                No courses added yet
              </span>
            )}
          </div>
        </div>
      </div>

      {/* WORKSPACE SCREENS DISPLAY WINDOW */}

      {activeTab === "students" ? (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide">
                Allocated Students
              </h3>
              <p className="text-[14px] text-slate-400">
                Manage and look at student profile details connected to this
                class context.
              </p>
            </div>
            <button
              onClick={openAddStudentModal}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-sm shrink-0"
            >
              + Add New Student
            </button>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              placeholder="Search students by name, roll number, contact..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none"
            />
          </div>

          {/* Roster Card-List Layout */}
          <div className="w-full">
            {loadingStudents ? (
              <div className="text-sm text-slate-400 text-center py-8 border border-slate-50 rounded-2xl">
                Fetching records data maps...
              </div>
            ) : students.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-slate-200 text-slate-400 text-sm rounded-xl italic">
                No students allocated inside this cluster index yet. Click Add
                New Student above.
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-slate-200 text-slate-400 text-sm rounded-xl italic">
                No students match your search.
              </div>
            ) : (
              <div className="space-y-1.5 xl:space-y-2">
                {filteredStudents.map((stu) => (
                  <div
                    key={stu.id}
                    className="border border-slate-200/80 rounded-xl p-2.5 xl:p-3 bg-white hover:border-indigo-200 hover:shadow-xs transition"
                  >
                    {/* Top Row: Name, Status & Action Icons */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono font-bold text-indigo-600 text-xs xl:text-sm shrink-0">
                          {stu.rollNumber}
                        </span>
                        <span className="text-slate-900 font-bold truncate text-xs xl:text-sm">
                          {stu.name?.toUpperCase() || "UNNAMED STUDENT"}
                        </span>

                        {/* Fee Status Badge */}
                        <span
                          className={`px-2 py-0.5 rounded-md font-bold text-[10px] xl:text-[11px] shrink-0 uppercase tracking-wide ${
                            stu.feeStatus === "Paid"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                              : stu.feeStatus === "Partial"
                                ? "bg-orange-50 text-orange-700 border border-orange-200/60"
                                : "bg-amber-50 text-amber-700 border border-amber-200/60"
                          }`}
                        >
                          {stu.feeStatus || "Not Specified"}
                        </span>

                        {/* Gender Badge */}
                        <span
                          className={`px-2 py-0.5 rounded-md font-bold text-[10px] xl:text-[11px] shrink-0 uppercase tracking-wide ${
                            stu.gender === "Male"
                              ? "bg-indigo-50 text-indigo-700 border border-indigo-200/60"
                              : stu.gender === "Female"
                                ? "bg-pink-50 text-pink-700 border border-pink-200/60"
                                : "bg-amber-50 text-amber-700 border border-amber-200/60"
                          }`}
                        >
                          {stu.gender}
                        </span>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => openEditStudentModal(stu)}
                          className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition"
                          title="Edit Student"
                        >
                          <RefreshCw className="h-3.5 w-3.5 xl:h-4 xl:w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteStudent(stu.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition"
                          title="Delete Student"
                        >
                          <Trash className="h-3.5 w-3.5 xl:h-4 xl:w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Bottom Row: Metadata (Labels vs Values contrast) */}
                    <div className="mt-1 text-[11px] xl:text-xs text-slate-400 flex flex-wrap gap-x-3 gap-y-1 pt-1 border-t border-slate-100">
                      <span>
                        Father:{" "}
                        <span className="text-slate-800 font-semibold">
                          {stu.fatherName || "—"}
                        </span>
                      </span>
                      <span>
                        Contact:{" "}
                        <span className="text-slate-800 font-semibold">
                          {stu.contact || "—"}
                        </span>
                      </span>
                      <span>
                        Email:{" "}
                        <span className="text-slate-800 font-semibold">
                          {stu.email || "—"}
                        </span>
                      </span>
                      <span>
                        CNIC:{" "}
                        <span className="text-slate-800 font-semibold">
                          {stu.cnic || "—"}
                        </span>
                      </span>
                      {stu.address && (
                        <span className="max-w-xs truncate" title={stu.address}>
                          Address:{" "}
                          <span className="text-slate-800 font-semibold">
                            {stu.address}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* CLEAN REUSED REUSABLE TIMETABLE GRID  */
        <div className="border border-slate-100 rounded-2xl p-4 bg-white shadow-sm">
          {/* Passing targeted identity configuration cleanly down to your existing functional layout */}
          <TimetableGrid
            currentId={classData.id}
            type="class"
            linkedTeachers={teachersList}
          />
        </div>
      )}

      {/* STUDENT ADD / UPDATE MODAL OVERLAY LAYOUT  */}
      {isStudentModalOpen && (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setIsStudentModalOpen(false)}
          />

          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-sm xl:max-w-md p-4 xl:p-5 relative z-110 max-h-[85vh] overflow-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {/* Header */}
            <div className="flex justify-between items-start pb-2 xl:pb-2.5 border-b border-slate-100 mb-3">
              <div>
                <h3 className="text-base xl:text-lg font-black text-slate-900">
                  {editingStudentId ? "Update Student" : "Enroll New Student"}
                </h3>
                <p className="text-xs text-slate-400">
                  {editingStudentId ? "Edit" : "Add"} info fields inside Class{" "}
                  {classData.className} — Section {classData.section}.
                </p>
              </div>
              <button
                onClick={() => setIsStudentModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm p-1 transition-all cursor-pointer"
              >
                <X className="w-4 h-4 xl:w-5 xl:h-5" />
              </button>
            </div>

            <form
              onSubmit={handleSaveStudent}
              className="space-y-2 xl:space-y-2.5"
            >
              {!editingStudentId && classNearLimit && (
                <div
                  className={`rounded-lg xl:rounded-xl border px-3 py-2.5 text-xs xl:text-[13px] font-semibold ${
                    classLimitReached
                      ? "border-amber-300 bg-amber-50 text-amber-700"
                      : "border-sky-200 bg-sky-50 text-sky-700"
                  }`}
                >
                  <p>
                    {classLimitReached
                      ? "⚠️ Student limit reached! Your school is currently on the Free Plan (Max 100 students). Please upgrade to Pro for unlimited student enrollments."
                      : `You're approaching the Free Plan limit (${totalSchoolStudentCount}/100 students). Upgrade to Pro for unlimited enrollments.`}
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsUpgradeModalOpen(true)}
                    className={`mt-2 rounded-lg px-3 py-1.5 text-xs font-bold text-white transition ${
                      classLimitReached
                        ? "bg-amber-600 hover:bg-amber-700"
                        : "bg-sky-600 hover:bg-sky-700"
                    }`}
                  >
                    Upgrade to Pro
                  </button>
                </div>
              )}              {/* Student Name & Father Name Grid */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] xl:text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Student Full Name
                  </label>
                  <input
                    type="text"
                    placeholder="Muhammad Ali"
                    value={studentForm.studentName}
                    onChange={(e) =>
                      handleStudentFieldChange("studentName", e.target.value)
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg xl:rounded-xl p-2 mt-0.5 text-xs xl:text-sm focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="text-[10px] xl:text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Father Name
                  </label>
                  <input
                    type="text"
                    placeholder="Tariq Mahmood"
                    value={studentForm.fatherName}
                    onChange={(e) =>
                      handleStudentFieldChange("fatherName", e.target.value)
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg xl:rounded-xl p-2 mt-0.5 text-xs xl:text-sm focus:outline-none"
                    required
                  />
                </div>
              </div>

              {/* Roll Number & Contact */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] xl:text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Roll Number
                  </label>
                  <input
                    type="text"
                    placeholder="Auto-generated"
                    value={studentForm.rollNumber}
                    readOnly
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg xl:rounded-xl p-2 mt-0.5 text-xs xl:text-sm focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="text-[10px] xl:text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Contact Number
                  </label>
                  <input
                    type="text"
                    placeholder="0300-XXXXXXX"
                    value={studentForm.contact}
                    onChange={(e) =>
                      handleStudentFieldChange("contact", e.target.value)
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg xl:rounded-xl p-2 mt-0.5 text-xs xl:text-sm focus:outline-none"
                    required
                  />
                </div>
              </div>

              {/* Email & B-Form / CNIC Grid */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] xl:text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Email Address
                  </label>
                  <input
                    type="email"
                    placeholder="student@example.com"
                    value={studentForm.email}
                    onChange={(e) =>
                      handleStudentFieldChange("email", e.target.value)
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg xl:rounded-xl p-2 mt-0.5 text-xs xl:text-sm focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] xl:text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    B-Form / CNIC
                  </label>
                  <input
                    type="text"
                    placeholder="37405-XXXXXXX-X"
                    value={studentForm.cnic}
                    onChange={(e) =>
                      handleStudentFieldChange("cnic", e.target.value)
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg xl:rounded-xl p-2 mt-0.5 text-xs xl:text-sm focus:outline-none"
                    required
                  />
                </div>
              </div>

              {/* Gender & Monthly Fees Status */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] xl:text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Gender
                  </label>
                  <select
                    value={studentForm.gender}
                    onChange={(e) =>
                      handleStudentFieldChange("gender", e.target.value)
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg xl:rounded-xl p-2 mt-0.5 text-xs xl:text-sm focus:outline-none font-semibold"
                    required
                  >
                    <option value="">Select gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] xl:text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Monthly Fees Status
                  </label>
                  <select
                    value={studentForm.feeStatus}
                    onChange={(e) =>
                      handleStudentFieldChange("feeStatus", e.target.value)
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg xl:rounded-xl p-2 mt-0.5 text-xs xl:text-sm focus:outline-none font-semibold"
                  >
                    <option value="Unpaid">⚠️ Unpaid</option>
                    <option value="Partial">🟠 Partial</option>
                    <option value="Paid">✅ Paid</option>
                  </select>
                </div>
              </div>

              {/* Address */}
              <div>
                <label className="text-[10px] xl:text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Residential Home Address
                </label>
                <textarea
                  rows="2"
                  placeholder="Street details location..."
                  value={studentForm.address}
                  onChange={(e) =>
                    handleStudentFieldChange("address", e.target.value)
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg xl:rounded-xl p-2 mt-0.5 text-xs xl:text-sm focus:outline-none resize-none"
                  required
                />
              </div>

              {studentFormError && (
                <p className="text-red-500 font-semibold text-xs">
                  {studentFormError}
                </p>
              )}

              {/* Action Buttons */}
              <div className="pt-2 border-t border-slate-100 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsStudentModalOpen(false)}
                  className="w-1/2 py-2 bg-slate-100 text-slate-600 font-bold rounded-lg xl:rounded-xl text-xs xl:text-sm cursor-pointer transition-colors hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || (!editingStudentId && classLimitReached)}
                  className="w-1/2 py-2 bg-indigo-600 text-white font-bold rounded-lg xl:rounded-xl text-xs xl:text-sm shadow-xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors hover:bg-indigo-700"
                >
                  {loading
                    ? "Saving..."
                    : editingStudentId
                      ? "Update Student"
                      : "Enroll Student"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== CLASS EDIT MODAL ==================== */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setIsEditModalOpen(false)}
          />

          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-sm xl:max-w-md p-4 xl:p-5 relative z-110 max-h-[85vh] overflow-auto no-scrollbar">
            {/* Header */}
            <div className="flex justify-between items-start pb-2 xl:pb-2.5 border-b border-slate-100 mb-3">
              <div>
                <h3 className="text-base xl:text-lg font-black text-slate-900">
                  Edit Class
                </h3>
                <p className="text-xs text-slate-400">
                  Update details for this class.
                </p>
              </div>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold p-1 cursor-pointer transition-colors"
              >
                <X className="w-4 h-4 xl:w-5 xl:h-5" />
              </button>
            </div>

            <form
              onSubmit={handleSaveClassEdit}
              className="space-y-2.5 xl:space-y-3"
            >
              {/* Grade Select */}
              <div>
                <label className="text-[10px] xl:text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Class Identification / Section
                </label>
                <select
                  value={editClassName}
                  onChange={(e) => setEditClassName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg xl:rounded-xl p-2 mt-0.5 text-xs xl:text-sm focus:outline-none"
                  required
                >
                  <option value="">Select grade</option>
                  {[
                    "Nursery",
                    "KG",
                    "Grade 1",
                    "Grade 2",
                    "Grade 3",
                    "Grade 4",
                    "Grade 5",
                    "Grade 6",
                    "Grade 7",
                    "Grade 8",
                    "Grade 9",
                    "Grade 10",
                    "Grade 11",
                    "Grade 12",
                  ].map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>

              {/* Section & Level */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[10px] xl:text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Section
                  </label>
                  <input
                    type="text"
                    value={editSection}
                    onChange={(e) => setEditSection(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg xl:rounded-xl p-2 mt-0.5 focus:outline-none text-xs xl:text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="text-[10px] xl:text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Level
                  </label>
                  <select
                    value={editLevel}
                    onChange={(e) => setEditLevel(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg xl:rounded-xl p-2 mt-0.5 focus:outline-none text-xs xl:text-sm"
                    required
                  >
                    <option value="">Select level</option>
                    <option value="primary">Primary</option>
                    <option value="middle">Middle</option>
                    <option value="upper">Upper</option>
                  </select>
                </div>
              </div>

              {/* Teaching System Toggle Buttons */}
              <div>
                <label className="text-[10px] xl:text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Teaching System
                </label>
                <div className="flex gap-2 mt-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setEditTeacherMode("single");
                      setEditTeacherSingle("");
                    }}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                      editTeacherMode === "single"
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-slate-50 text-slate-500 border-slate-200"
                    }`}
                  >
                    Single Teacher
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditTeacherMode("multi");
                      setEditTeacherSingle("");
                    }}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                      editTeacherMode === "multi"
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-slate-50 text-slate-500 border-slate-200"
                    }`}
                  >
                    Multiple Teachers
                  </button>
                </div>
              </div>

              {/* Class Teacher Select */}
              <div>
                <label className="text-[10px] xl:text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Class Teacher
                </label>
                <select
                  value={editTeacherSingle}
                  onChange={(e) => setEditTeacherSingle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg xl:rounded-xl p-2 mt-0.5 focus:outline-none font-semibold text-xs xl:text-sm"
                  required
                >
                  <option value="">
                    {availableTeachers.length === 0
                      ? "No available teachers for this mode"
                      : "Select a teacher"}
                  </option>
                  {availableTeachers.map((t) => (
                    <option key={t.id} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] xl:text-[11px] text-slate-400 mt-0.5">
                  {editTeacherMode === "single"
                    ? "Only class-based teachers not already assigned are shown."
                    : "Only period-based teachers not already assigned are shown."}
                </p>
              </div>

              {/* Room & Academic Year */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[10px] xl:text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Room Number{" "}
                    <span className="normal-case text-slate-300">(opt)</span>
                  </label>
                  <input
                    type="text"
                    value={editRoomNumber}
                    onChange={(e) => setEditRoomNumber(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg xl:rounded-xl p-2 mt-0.5 focus:outline-none text-xs xl:text-sm"
                  />
                </div>
                <div>
                  <label className="text-[10px] xl:text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Academic Year{" "}
                    <span className="normal-case text-slate-300">(opt)</span>
                  </label>
                  <input
                    type="text"
                    value={editAcademicYear}
                    onChange={(e) => setEditAcademicYear(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg xl:rounded-xl p-2 mt-0.5 focus:outline-none text-xs xl:text-sm"
                  />
                </div>
              </div>

              {/* Courses Section */}
              <div className="space-y-1.5">
                <label className="text-[10px] xl:text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Courses ({MIN_COURSES}–{MAX_COURSES} required)
                </label>
                {editCourses.map((course, index) => (
                  <div key={index} className="flex gap-1.5">
                    <input
                      type="text"
                      placeholder={`Course ${index + 1}`}
                      value={course}
                      onChange={(e) =>
                        handleEditCourseChange(index, e.target.value)
                      }
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg xl:rounded-xl p-2 text-xs xl:text-sm focus:outline-none"
                    />
                    {editCourses.length > MIN_COURSES && (
                      <button
                        type="button"
                        onClick={() => handleEditRemoveCourse(index)}
                        className="px-2.5 bg-slate-100 text-slate-500 rounded-lg font-bold cursor-pointer hover:bg-slate-200 transition"
                      >
                        −
                      </button>
                    )}
                  </div>
                ))}
                {editCourses.length < MAX_COURSES && (
                  <button
                    type="button"
                    onClick={handleEditAddCourse}
                    className="text-indigo-600 font-bold cursor-pointer text-xs pt-0.5"
                  >
                    + Add another course
                  </button>
                )}
              </div>

              {editFormError && (
                <p className="text-red-500 font-semibold text-xs">
                  {editFormError}
                </p>
              )}

              {/* Action Buttons */}
              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="w-1/2 py-2 bg-slate-100 text-slate-600 text-xs xl:text-sm font-bold rounded-lg xl:rounded-xl cursor-pointer transition-all hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-1/2 py-2 bg-indigo-600 text-white text-xs xl:text-sm font-bold rounded-lg xl:rounded-xl cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:bg-indigo-700"
                >
                  {loading ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <UpgradeModal
        isOpen={isUpgradeModalOpen}
        onClose={() => setIsUpgradeModalOpen(false)}
        schoolId={classData?.schoolId}
        schoolName={classData?.schoolName}
      />
    </div>
  );
};

export default ClassDetailView;