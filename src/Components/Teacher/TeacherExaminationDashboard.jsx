import React, {
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { convertFileToBase64Doc, openDocumentInNewTab } from "../../utils/docUpload";
import { TeacherPortalContext } from "../../Pages/TeacherPortal";
import {
  GraduationCap,
  Layers,
  BookOpenText,
  ClipboardList,
  CheckCircle2,
  AlertTriangle,
  Save,
  Loader2,
  Users,
  Calendar,
  Clock,
  ExternalLink,
  FileText,
  Send,
  BarChart2,
  X,
  Bell,
  History,
  PencilLine,
  Plus,
  Paperclip,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import ScholasticAnalytics from "../User/ScholasticAnalytics";

/* -------------------------------------------------------------------------
 * Constants & Helpers
 * ---------------------------------------------------------------------- */

const ATTENDANCE_OPTIONS = ["Present", "Absent", "Leave"];
const PASS_THRESHOLD = 40; // percent

const gradeFor = (percent) => {
  if (percent >= 90) return "A+";
  if (percent >= 80) return "A";
  if (percent >= 70) return "B+";
  if (percent >= 60) return "B";
  if (percent >= 50) return "C+";
  if (percent >= 40) return "C";
  return "F";
};

const GRADE_STYLES = {
  "A+": "bg-emerald-50 text-emerald-700 border-emerald-200",
  A: "bg-emerald-50 text-emerald-700 border-emerald-200",
  "B+": "bg-indigo-50 text-indigo-700 border-indigo-200",
  B: "bg-indigo-50 text-indigo-700 border-indigo-200",
  "C+": "bg-amber-50 text-amber-700 border-amber-200",
  C: "bg-amber-50 text-amber-700 border-amber-200",
  F: "bg-rose-50 text-rose-700 border-rose-200",
};

const STATUS_BADGES = {
  published: {
    label: "Published (Open for Entry)",
    style: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  submitted: {
    label: "Submitted to School",
    style: "bg-blue-50 text-blue-700 border-blue-200",
  },
  under_review: {
    label: "Under Review",
    style: "bg-purple-50 text-purple-700 border-purple-200",
  },
  locked: {
    label: "Completed",
    style: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
};

const resolveAssignedClasses = (teacher) => {
  if (Array.isArray(teacher?.assignedClasses)) return teacher.assignedClasses;
  if (Array.isArray(teacher?.classes)) return teacher.classes;
  return [];
};



const TeacherExaminationDashboard = () => {
  const { session, teacher, school } = useContext(TeacherPortalContext) || {};
  const schoolId = session?.schoolId || teacher?.schoolId || school?.id;
  const teacherId = teacher?.id || session?.teacherId;

  // Dynamic state from Firestore
  const [dbClasses, setDbClasses] = useState([]);
  const assignedClasses = useMemo(
    () => resolveAssignedClasses(teacher),
    [teacher],
  );

  // Live Timetable read for this teacher — used to strictly scope the
  // "Create Class Test" modal to only the Classes/Sections/Subjects this
  // teacher actually has periods for, rather than every class in the
  // school. TimetableGrid.jsx writes className/section/subject onto every
  // relational entry in a teacher's own `timetableMatrix`, whether the
  // teacher is a class-based/auto-linked homeroom teacher or has a
  // period-based schedule across multiple classes — so reading straight
  // from that array covers both cases without special-casing them.
  const [teacherTimetableDoc, setTeacherTimetableDoc] = useState(null);
  useEffect(() => {
    if (!teacherId) {
      setTeacherTimetableDoc(null);
      return;
    }
    const unsub = onSnapshot(
      doc(db, "teachers", teacherId),
      (snap) => setTeacherTimetableDoc(snap.exists() ? snap.data() : null),
      () => setTeacherTimetableDoc(null),
    );
    return () => unsub();
  }, [teacherId]);

  const timetableScopedClasses = useMemo(() => {
    const matrix = Array.isArray(teacherTimetableDoc?.timetableMatrix)
      ? teacherTimetableDoc.timetableMatrix
      : [];
    const byKey = new Map();
    matrix.forEach((entry) => {
      if (!entry?.className || !entry?.subject) return;
      const key = `${entry.className}::${entry.section || ""}`;
      if (!byKey.has(key)) {
        byKey.set(key, {
          className: entry.className,
          section: entry.section || "",
          subjects: new Set(),
        });
      }
      byKey.get(key).subjects.add(entry.subject);
    });
    return Array.from(byKey.values()).map((c) => ({
      className: c.className,
      section: c.section,
      subjects: Array.from(c.subjects).sort(),
    }));
  }, [teacherTimetableDoc]);

  const [selectedClass, setSelectedClass] = useState("");
  const [selectedSection, setSelectedSection] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedExamId, setSelectedExamId] = useState("");

  const [analyticsStudent, setAnalyticsStudent] = useState(null);

  // "action" = Pending Gradebook dashboard, "entry" = the class/section/subject
  // driven mark-entry flow that already existed, "all" = filterable history
  // (All Examinations) and is the default landing tab.
  const [activeTab, setActiveTab] = useState("all");
  const [classTestModalOpen, setClassTestModalOpen] = useState(false);

  // Holds an examId we want auto-selected once the (class/section/subject
  // scoped) `exams` listener below returns it — used by "jump to this exam"
  // actions from the Action Required cards and after creating a class test.
  const pendingJumpIdRef = useRef(null);

  const jumpToExam = (exam) => {
    pendingJumpIdRef.current = exam.id;
    setSelectedClass(exam.className);
    setSelectedSection(exam.section);
    setSelectedSubject(exam.subject);
    setActiveTab("entry");
  };

  /* -----------------------------------------------------------------------
   * All examinations assigned to (or created by) this teacher, school-wide.
   * Not scoped to the class/section/subject selectors below — this powers
   * the Action Required cards and the All Exams history tab, both of which
   * need to surface exams the teacher hasn't drilled into yet.
   * -------------------------------------------------------------------- */
  const [myExams, setMyExams] = useState([]);
  const [myExamsLoading, setMyExamsLoading] = useState(true);

  useEffect(() => {
    if (!schoolId || !teacherId) {
      setMyExams([]);
      setMyExamsLoading(false);
      return;
    }
    setMyExamsLoading(true);
    const q = query(
      collection(db, "examinations"),
      where("schoolId", "==", schoolId),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((e) => {
            const assignedId = e.assignedTeacherId || e.teacherId;
            return assignedId === teacherId;
          });
        rows.sort(
          (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0),
        );
        setMyExams(rows);
        setMyExamsLoading(false);
      },
      () => setMyExamsLoading(false),
    );
    return () => unsub();
  }, [schoolId, teacherId]);

  // Newly assigned, still open for entry — the whole point is the teacher
  // shouldn't need to touch a single filter to see these.
  const actionRequiredExams = useMemo(
    () => myExams.filter((e) => e.status === "published"),
    [myExams],
  );

  const [historyStatusFilter, setHistoryStatusFilter] = useState("");
  const historyExams = useMemo(() => {
    const base = myExams.filter((e) =>
      ["submitted", "under_review", "locked"].includes(e.status),
    );
    if (!historyStatusFilter) return base;
    return base.filter((e) => e.status === historyStatusFilter);
  }, [myExams, historyStatusFilter]);

  useEffect(() => {
    if (!schoolId) return;
    const q = query(
      collection(db, "classes"),
      where("schoolId", "==", schoolId),
    );
    const unsub = onSnapshot(q, (snap) => {
      setDbClasses(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [schoolId]);

  
  const classOptions = useMemo(() => {
    if (assignedClasses.length > 0) {
      return Array.from(
        new Set(assignedClasses.map((c) => c.className)),
      ).filter(Boolean);
    }
    const set = new Set();
    dbClasses.forEach((c) => {
      const name = c.className || c.name;
      if (name) set.add(name);
    });
    return Array.from(set).sort();
  }, [assignedClasses, dbClasses]);

  const sectionOptions = useMemo(() => {
    if (!selectedClass) return [];
    if (assignedClasses.length > 0) {
      return Array.from(
        new Set(
          assignedClasses
            .filter((c) => c.className === selectedClass)
            .map((c) => c.section),
        ),
      ).filter(Boolean);
    }
    const set = new Set();
    dbClasses
      .filter((c) => (c.className || c.name) === selectedClass)
      .forEach((c) => c.section && set.add(c.section));
    return Array.from(set).sort();
  }, [assignedClasses, dbClasses, selectedClass]);

  const subjectOptions = useMemo(() => {
    if (!selectedClass || !selectedSection) return [];
    if (assignedClasses.length > 0) {
      const match = assignedClasses.find(
        (c) => c.className === selectedClass && c.section === selectedSection,
      );
      if (match?.subjects?.length) return match.subjects;
    }
    const set = new Set();
    dbClasses
      .filter(
        (c) =>
          (c.className || c.name) === selectedClass &&
          c.section === selectedSection,
      )
      .forEach((c) => {
        const courses = Array.isArray(c.courses)
          ? c.courses
          : Array.isArray(c.subjects)
            ? c.subjects
            : [];
        courses.forEach((sub) => sub && set.add(sub));
      });
    return Array.from(set).sort();
  }, [assignedClasses, dbClasses, selectedClass, selectedSection]);

  const resetBelow = (level) => {
    if (level <= 1) setSelectedSection("");
    if (level <= 2) setSelectedSubject("");
    if (level <= 3) setSelectedExamId("");
  };

  const resetSelections = () => {
    setSelectedClass("");
    setSelectedSection("");
    setSelectedSubject("");
    setSelectedExamId("");
  };

 
  const [exams, setExams] = useState([]);
  const [examsLoading, setExamsLoading] = useState(false);

  useEffect(() => {
    setSelectedExamId("");
    if (!schoolId || !selectedClass || !selectedSection || !selectedSubject || !teacherId) {
      setExams([]);
      return;
    }
    setExamsLoading(true);

    const q = query(
      collection(db, "examinations"),
      where("schoolId", "==", schoolId),
      where("className", "==", selectedClass),
      where("section", "==", selectedSection),
      where("subject", "==", selectedSubject),
      where("status", "in", ["published", "submitted", "under_review", "locked"]),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((e) => {
            const assignedId = e.assignedTeacherId || e.teacherId;
            return assignedId === teacherId;
          });

        rows.sort(
          (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0),
        );
        setExams(rows);
        setExamsLoading(false);

        // If we navigated here via "Enter Marks" from an Action Required
        // card or a freshly created class test, auto-select that exam as
        // soon as it shows up in this scoped listener.
        if (
          pendingJumpIdRef.current &&
          rows.some((r) => r.id === pendingJumpIdRef.current)
        ) {
          setSelectedExamId(pendingJumpIdRef.current);
          pendingJumpIdRef.current = null;
        }
      },
      () => setExamsLoading(false),
    );

    return () => unsub();
  }, [schoolId, selectedClass, selectedSection, selectedSubject, teacherId]);

  const selectedExam = exams.find((e) => e.id === selectedExamId) || null;
  const hasExams = exams.length > 0;
  const showNoExaminationFound =
    !!selectedSubject && !examsLoading && !hasExams;
  const examOptions = exams.map((e) => {
    const displayStatus =
      e.status === "locked"
        ? "Completed"
        : e.status === "under_review"
          ? "Under Review"
          : e.status;
    return {
      label: `${e.name}${e.status !== "published" ? ` (${displayStatus})` : ""}`,
      value: e.id,
    };
  });

  // Deadline & Lock checks
  const isPastDeadline = useMemo(() => {
    if (!selectedExam?.submissionDeadline) return false;
    return new Date() > new Date(selectedExam.submissionDeadline);
  }, [selectedExam?.submissionDeadline]);

  const isExamLocked = useMemo(() => {
    if (!selectedExam) return false;
    return (
      selectedExam.status === "locked" ||
      selectedExam.status === "submitted" ||
      selectedExam.status === "under_review" ||
      isPastDeadline
    );
  }, [selectedExam, isPastDeadline]);

  
  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(false);

  useEffect(() => {
    if (!schoolId || !selectedClass || !selectedSection) {
      setStudents([]);
      return;
    }
    setStudentsLoading(true);
    const q = query(
      collection(db, "students"),
      where("schoolId", "==", schoolId),
      where("className", "==", selectedClass),
      where("section", "==", selectedSection),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        rows.sort((a, b) => (a.rollNumber || 0) - (b.rollNumber || 0));
        setStudents(rows);
        setStudentsLoading(false);
      },
      () => setStudentsLoading(false),
    );
    return () => unsub();
  }, [schoolId, selectedClass, selectedSection]);

 
  const [existingResults, setExistingResults] = useState({});
  useEffect(() => {
    if (!schoolId || !selectedExamId) {
      setExistingResults({});
      return;
    }
    const q = query(
      collection(db, "examResults"),
      where("schoolId", "==", schoolId),
      where("examId", "==", selectedExamId),
    );
    const unsub = onSnapshot(q, (snap) => {
      const map = {};
      snap.docs.forEach((d) => {
        const data = d.data();
        map[data.studentId] = data;
      });
      setExistingResults(map);
    });
    return () => unsub();
  }, [schoolId, selectedExamId]);

 
  const [rows, setRows] = useState({});
  useEffect(() => {
    const next = {};
    students.forEach((s) => {
      const existing = existingResults[s.id];
      next[s.id] = {
        attendance: existing?.attendance || "Present",
        obtainedMarks: existing?.obtainedMarks ?? "",
        remarks: existing?.remarks || "",
        answerSheetUrl: existing?.answerSheetUrl || "",
        savedAt: existing?.updatedAt || null,
      };
    });
    setRows(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, selectedExamId, JSON.stringify(existingResults)]);

  const [savingId, setSavingId] = useState(null);
  const [submittingExam, setSubmittingExam] = useState(false);
  const [rowErrors, setRowErrors] = useState({});
  const [uploadingSheetId, setUploadingSheetId] = useState(null);

  // Optional answer-script upload per student row. Converted entirely on
  // the client into a Base64 data URL and saved straight onto the
  // examResults document (`answerSheetUrl`) — no Firebase Storage upload,
  // so no CORS/rules/billing dependency. `convertFileToBase64Doc` handles
  // the PDF/PNG/JPG type check, image compression, and size validation.
  const handleAnswerSheetUpload = async (student, file) => {
    if (!file || !selectedExamId) return;
    setUploadingSheetId(student.id);
    try {
      const dataUrl = await convertFileToBase64Doc(file);
      updateRow(student.id, { answerSheetUrl: dataUrl });
    } catch (err) {
      console.error("Answer sheet upload error:", err);
      setRowErrors((p) => ({
        ...p,
        [student.id]: err.message || "Answer sheet upload failed.",
      }));
    } finally {
      setUploadingSheetId(null);
    }
  };

  const totalMarks = Number(selectedExam?.totalMarks) || 0;

  const computeRow = (row) => {
    const isAbsent = row.attendance === "Absent";
    const obtained = isAbsent ? 0 : Number(row.obtainedMarks) || 0;
    const percent = totalMarks > 0 ? (obtained / totalMarks) * 100 : 0;
    const grade = gradeFor(percent);
    const passFail = isAbsent
      ? "Fail"
      : percent >= PASS_THRESHOLD
        ? "Pass"
        : "Fail";
    return { obtained, percent, grade, passFail };
  };

  const updateRow = (studentId, patch) => {
    setRows((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], ...patch },
    }));
    setRowErrors((prev) => ({ ...prev, [studentId]: "" }));
  };

  const handleSaveRow = async (student) => {
    if (isExamLocked) return;
    const row = rows[student.id];
    if (!row) return;

    if (row.attendance !== "Absent") {
      const obtained = Number(row.obtainedMarks);
      if (row.obtainedMarks === "" || Number.isNaN(obtained) || obtained < 0) {
        setRowErrors((p) => ({ ...p, [student.id]: "Enter valid marks." }));
        return;
      }
      if (obtained > totalMarks) {
        setRowErrors((p) => ({
          ...p,
          [student.id]: `Marks cannot exceed ${totalMarks}.`,
        }));
        return;
      }
    }

    setSavingId(student.id);
    const { obtained, percent, grade, passFail } = computeRow(row);

    const payload = {
      examId: selectedExamId,
      schoolId,
      teacherId,
      studentId: student.id,
      studentName: student.name || "",
      rollNumber: student.rollNumber || "",
      className: selectedClass,
      section: selectedSection,
      subject: selectedSubject,
      attendance: row.attendance,
      obtainedMarks: obtained,
      totalMarks,
      percentage: Number(percent.toFixed(1)),
      grade,
      status: passFail,
      remarks: row.remarks || "",
      answerSheetUrl: row.answerSheetUrl || "",
      updatedAt: serverTimestamp(),
    };

    try {
      // 1. Primary examResults document
      await setDoc(
        doc(db, "examResults", `${selectedExamId}_${student.id}`),
        payload,
        {
          merge: true,
        },
      );

      // 2. Mirrored under student subcollection for ScholasticAnalytics compatibility
      await setDoc(
        doc(db, "students", student.id, "examResults", selectedExamId),
        payload,
        { merge: true },
      );

      updateRow(student.id, { savedAt: { seconds: Date.now() / 1000 } });
    } catch (err) {
      console.error("Save exam result error:", err);
      setRowErrors((p) => ({ ...p, [student.id]: "Save failed. Try again." }));
    } finally {
      setSavingId(null);
    }
  };

 
  const handleSubmitAllResults = async () => {
    if (!selectedExamId || isExamLocked) return;

    setSubmittingExam(true);
    try {
      // 1. Auto-save any modified unsaved student rows first
      for (const student of students) {
        await handleSaveRow(student);
      }

      // 2. Update Examination status to 'submitted'
      await updateDoc(doc(db, "examinations", selectedExamId), {
        status: "submitted",
        submittedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("Submit results error:", err);
    } finally {
      setSubmittingExam(false);
    }
  };

  return (
    <div className="w-full max-w-full mx-auto px-4 sm:px-2 py-4 sm:py-2 space-y-6 text-slate-800 animate-fadeIn">
      {/* ---------------- Header ---------------- */}
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
          <span className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/20">
            <GraduationCap className="w-4 h-4 sm:w-5 sm:h-5" />
          </span>
          Teacher Examination Portal
        </h1>
        <p className="text-xs text-slate-400 font-medium mt-1">
          Select class, section, and subject to record examination marks and
          submit for school review.
        </p>
      </div>

      {/* ---------------- Tabs + Class Test action ---------------- */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-fit">
          <TabButton
            active={activeTab === "all"}
            onClick={() => setActiveTab("all")}
            icon={<History className="w-3.5 h-3.5" />}
            label="All Examinations"
          />f
          <TabButton
            active={activeTab === "action"}
            onClick={() => setActiveTab("action")}
            icon={<Bell className="w-3.5 h-3.5" />}
            label="Pending Gradebook"
            count={actionRequiredExams.length}
          />
          <TabButton
            active={activeTab === "entry"}
            onClick={() => setActiveTab("entry")}
            icon={<PencilLine className="w-3.5 h-3.5" />}
            label="Marks Entry & Evaluation"
          />
          
        </div>

        <button
          onClick={() => setClassTestModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-500/20 transition w-fit"
        >
          <Plus className="w-4 h-4" /> New Class Test
        </button>
      </div>

      {/* ---------------- Action Required ---------------- */}
      {activeTab === "action" && (
        <ActionRequiredPanel
          loading={myExamsLoading}
          exams={actionRequiredExams}
          onOpen={jumpToExam}
        />
      )}

      {/* ---------------- All Exams (History) ---------------- */}
      {activeTab === "all" && (
        <AllExamsPanel
          loading={myExamsLoading}
          exams={historyExams}
          statusFilter={historyStatusFilter}
          onStatusFilterChange={setHistoryStatusFilter}
          onOpen={jumpToExam}
        />
      )}

      {/* ---------------- Enter Marks (existing selector-driven flow) ---------------- */}
      {activeTab === "entry" && (
        <>
      {/* ---------------- Step Selectors ---------------- */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Picker
            icon={<Layers className="w-3.5 h-3.5" />}
            label="Class"
            value={selectedClass}
            onChange={(v) => {
              setSelectedClass(v);
              resetBelow(1);
            }}
            options={classOptions}
            disabled={isExamLocked}
          />
          <Picker
            icon={<Layers className="w-3.5 h-3.5" />}
            label="Section"
            value={selectedSection}
            onChange={(v) => {
              setSelectedSection(v);
              resetBelow(2);
            }}
            options={sectionOptions}
            disabled={!selectedClass || isExamLocked}
          />
          <Picker
            icon={<BookOpenText className="w-3.5 h-3.5" />}
            label="Subject"
            value={selectedSubject}
            onChange={(v) => {
              setSelectedSubject(v);
              resetBelow(3);
            }}
            options={subjectOptions}
            disabled={!selectedSection || isExamLocked}
          />
          <Picker
            icon={<ClipboardList className="w-3.5 h-3.5" />}
            label="Examination"
            value={selectedExamId}
            onChange={setSelectedExamId}
            options={examOptions}
            disabled={!selectedSubject || showNoExaminationFound || isExamLocked}
            loading={examsLoading}
          />
        </div>
        {(selectedClass || selectedSection || selectedSubject || selectedExamId) && (
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={resetSelections}
              className="border-0 bg-transparent p-0 text-[11px] font-bold text-rose-500 hover:text-rose-600 transition cursor-pointer"
            >
              Clear all filters
            </button>
          </div>
        )}
      </div>

      {/* ---------------- Content Area ---------------- */}
      {!selectedExamId && !showNoExaminationFound ? (
        <div className="bg-white border border-slate-100 rounded-2xl p-14 text-center shadow-xs">
          <ClipboardList className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-700">
            Select an examination to begin
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Complete the class, section, subject, and examination selections
            above.
          </p>
        </div>
      ) : showNoExaminationFound ? (
        <div className="bg-white border border-slate-100 rounded-2xl p-14 text-center shadow-xs">
          <ClipboardList className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-700">
            No Examination Found
          </p>
          <p className="text-xs text-slate-400 mt-1">
            There are no published examinations available for the selected
            Class, Section and Subject.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-xs overflow-hidden space-y-4">
          {/* Examination Details Header Banner */}
          <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-slate-900 text-base">
                  {selectedExam.name}
                </h3>
                {selectedExam.status && (
                  <span
                    className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase border ${
                      STATUS_BADGES[selectedExam.status]?.style ||
                      "bg-slate-100"
                    }`}
                  >
                    {STATUS_BADGES[selectedExam.status]?.label ||
                      selectedExam.status}
                  </span>
                )}
              </div>
              {/* new one  */}

              <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-500 mt-1.5">
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-indigo-500" />{" "}
                  {students.length} Enrolled Students
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-emerald-500" /> Date:{" "}
                  {selectedExam.examDate || "N/A"}
                </span>
                {selectedExam.submissionDeadline && (
                  <span
                    className={`flex items-center gap-1 ${isPastDeadline ? "text-rose-600 font-bold" : ""}`}
                  >
                    <Clock className="w-3.5 h-3.5" /> Deadline:{" "}
                    {new Date(selectedExam.submissionDeadline).toLocaleString()}
                  </span>
                )}
                <span>Total Marks: {totalMarks}</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 shrink-0">
              {selectedExam.paperLink && (
                <button
                  type="button"
                  onClick={() => openDocumentInNewTab(selectedExam.paperLink)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-xs font-bold transition"
                >
                  <FileText className="w-4 h-4" /> Question Paper{" "}
                  <ExternalLink className="w-3 h-3" />
                </button>
              )}

              <button
                onClick={handleSubmitAllResults}
                disabled={submittingExam || students.length === 0 || isExamLocked}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-500/20 transition disabled:opacity-40"
              >
                {submittingExam ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {submittingExam
                  ? "Submitting..."
                  : "Submit Results to School"}
              </button>
            </div>
          </div>

          {/* Status Warning Banners */}
          {isPastDeadline && (
            <div className="mx-5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Submission deadline has passed. Marks entry is locked. Contact
              your admin to extend the deadline.
            </div>
          )}

          {selectedExam.status === "submitted" && (
            <div className="mx-5 p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              Results have been submitted to the school administration and are
              pending review.
            </div>
          )}

          {selectedExam.status === "under_review" && (
            <div className="mx-5 p-3 rounded-xl bg-purple-50 border border-purple-200 text-purple-700 text-xs font-bold flex items-center gap-2">
              <Clock className="w-4 h-4 shrink-0" />
              Results are currently under review by the school administration.
            </div>
          )}

          {selectedExam.status === "locked" && (
            <div className="mx-5 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              Examination results have been reviewed and marked as Completed.
              Marks entry is closed.
            </div>
          )}

          {/* Student Marks Table */}
          {studentsLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-600" />
              <p className="text-xs font-semibold text-slate-400">
                Loading student roster...
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 font-bold uppercase text-[9px] border-b border-slate-100">
                    <th className="p-3">Roll #</th>
                    <th className="p-3">Student Name</th>
                    <th className="p-3">Attendance</th>
                    <th className="p-3">Obtained Marks</th>
                    <th className="p-3">Total</th>
                    <th className="p-3">%</th>
                    <th className="p-3">Grade</th>
                    <th className="p-3 min-w-37.5">Remarks</th>
                    <th className="p-3">Answer Sheet</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {students.map((student) => {
                    const row = rows[student.id];
                    if (!row) return null;
                    const isAbsent = row.attendance === "Absent";
                    const { percent, grade, passFail } = computeRow(row);
                    const error = rowErrors[student.id];
                    const isSaving = savingId === student.id;

                    return (
                      <tr
                        key={student.id}
                        className="hover:bg-slate-50/60 transition align-top"
                      >
                        <td className="p-3 font-mono font-bold text-slate-500">
                          {student.rollNumber || "—"}
                        </td>

                        <td className="p-3">
                          <p className="font-bold text-slate-900">
                            {student.name}
                          </p>
                          {error && (
                            <p className="text-[10px] font-bold text-rose-500 mt-0.5 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> {error}
                            </p>
                          )}
                        </td>

                        <td className="p-3">
                          <select
                            value={row.attendance}
                            disabled={isExamLocked}
                            onChange={(e) =>
                              updateRow(student.id, {
                                attendance: e.target.value,
                                obtainedMarks:
                                  e.target.value === "Absent"
                                    ? ""
                                    : row.obtainedMarks,
                              })
                            }
                            className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] font-bold focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                          >
                            {ATTENDANCE_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="p-3">
                          <input
                            type="number"
                            min={0}
                            max={totalMarks}
                            value={isAbsent ? 0 : row.obtainedMarks}
                            disabled={isExamLocked || isAbsent}
                            onChange={(e) =>
                              updateRow(student.id, {
                                obtainedMarks: e.target.value,
                              })
                            }
                            placeholder="—"
                            className="w-20 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] font-bold font-mono focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                          />
                        </td>

                        <td className="p-3 font-mono text-slate-400">
                          {totalMarks}
                        </td>

                        <td className="p-3 font-mono font-bold text-slate-700">
                          {percent.toFixed(1)}%
                        </td>

                        <td className="p-3">
                          <span
                            className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${GRADE_STYLES[grade]}`}
                          >
                            {grade}
                          </span>
                          <span
                            className={`ml-1.5 text-[9px] font-bold uppercase ${
                              passFail === "Pass"
                                ? "text-emerald-500"
                                : "text-rose-500"
                            }`}
                          >
                            {passFail}
                          </span>
                        </td>

                        <td className="p-3">
                          <input
                            type="text"
                            value={row.remarks}
                            disabled={isExamLocked}
                            onChange={(e) =>
                              updateRow(student.id, { remarks: e.target.value })
                            }
                            placeholder="Optional remark"
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                          />
                        </td>

                        <td className="p-3">
                          <label
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition ${
                              isExamLocked
                                ? "opacity-40 cursor-not-allowed border-slate-200 text-slate-400"
                                : "cursor-pointer border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-600 bg-slate-50"
                            }`}
                          >
                            {uploadingSheetId === student.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Paperclip className="w-3.5 h-3.5" />
                            )}
                            {row.answerSheetUrl ? "Replace" : "Attach"}
                            <input
                              type="file"
                              accept="application/pdf,image/png,image/jpeg"
                              disabled={
                                isExamLocked || uploadingSheetId === student.id
                              }
                              onChange={(e) =>
                                handleAnswerSheetUpload(
                                  student,
                                  e.target.files?.[0],
                                )
                              }
                              className="hidden"
                            />
                          </label>
                          {row.answerSheetUrl && (
                            <button
                              type="button"
                              onClick={() =>
                                openDocumentInNewTab(row.answerSheetUrl)
                              }
                              className="block mt-1 text-[9px] font-bold text-indigo-600 hover:text-indigo-800"
                            >
                              View attached
                            </button>
                          )}
                        </td>

                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setAnalyticsStudent(student)}
                              title="View Student Analytics"
                              className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 transition"
                            >
                              <BarChart2 className="w-4 h-4" />
                            </button>

                            <button
                              onClick={() => handleSaveRow(student)}
                              disabled={isExamLocked || isSaving}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold disabled:opacity-40 transition"
                            >
                              {isSaving ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : row.savedAt ? (
                                <CheckCircle2 className="w-3 h-3" />
                              ) : (
                                <Save className="w-3 h-3" />
                              )}
                              {isSaving
                                ? "Saving"
                                : row.savedAt
                                  ? "Saved"
                                  : "Save"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
        </>
      )}

      {/* ---------------- Class Test Creation Modal ---------------- */}
      {classTestModalOpen && (
        <ClassTestModal
          schoolId={schoolId}
          teacherId={teacherId}
          teacherScopedClasses={timetableScopedClasses}
          onClose={() => setClassTestModalOpen(false)}
          onCreated={(exam) => {
            setClassTestModalOpen(false);
            jumpToExam(exam);
          }}
        />
      )}

      {/* ---------------- Scholastic Analytics Modal for Teachers ---------------- */}
      {analyticsStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs"
            onClick={() => setAnalyticsStudent(null)}
          />
          <div className="relative bg-white w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl p-6 shadow-2xl space-y-4 border border-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-black text-slate-900 text-base">
                  Scholastic Analytics — {analyticsStudent.name}
                </h3>
                <p className="text-xs text-slate-400">
                  Roll ID: #{analyticsStudent.rollNumber} | Class{" "}
                  {analyticsStudent.className}-{analyticsStudent.section}
                </p>
              </div>
              <button
                onClick={() => setAnalyticsStudent(null)}
                className="p-2 rounded-xl text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* REUSE OF EXISTING SCHOLASTIC ANALYTICS COMPONENT */}
            <ScholasticAnalytics
              student={analyticsStudent}
              studentData={analyticsStudent}
            />
          </div>
        </div>
      )}
    </div>
  );
};

/* -------------------------------------------------------------------------
 * Picker Component
 * ---------------------------------------------------------------------- */

const Picker = ({
  icon,
  label,
  value,
  onChange,
  options,
  disabled,
  loading,
}) => (
  <label className="block">
    <span className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
      {icon} {label}
    </span>
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs sm:text-sm font-bold text-slate-700 focus:outline-none focus:border-indigo-500 transition disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <option value="">{loading ? "Loading..." : "Select..."}</option>
      {options.map((opt) =>
        typeof opt === "object" ? (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ) : (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ),
      )}
    </select>
  </label>
);

/* -------------------------------------------------------------------------
 * Tab Button
 * ---------------------------------------------------------------------- */

const TabButton = ({ active, onClick, icon, label, count }) => (
  <button
    type="button"
    onClick={onClick}
    className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[11px] font-bold transition ${
      active
        ? "bg-white text-indigo-600 shadow-xs"
        : "text-slate-500 hover:text-slate-700"
    }`}
  >
    {icon} {label}
    {typeof count === "number" && count > 0 && (
      <span className="ml-0.5 inline-flex items-center justify-center min-w-4.5 h-4.5 px-1 rounded-full bg-rose-500 text-white text-[9px] font-black">
        {count}
      </span>
    )}
  </button>
);

/* -------------------------------------------------------------------------
 * Action Required Panel — newly assigned, still-open exams surfaced without
 * requiring the teacher to touch a single filter.
 * ---------------------------------------------------------------------- */

const ActionRequiredPanel = ({ loading, exams, onOpen }) => {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 bg-white border border-slate-100 rounded-2xl shadow-xs">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-600" />
        <p className="text-xs font-semibold text-slate-400">
          Checking for newly assigned exams...
        </p>
      </div>
    );
  }

  if (exams.length === 0) {
    return (
      <div className="bg-white border border-slate-100 rounded-2xl p-14 text-center shadow-xs">
        <CheckCircle2 className="w-8 h-8 text-emerald-300 mx-auto mb-3" />
        <p className="text-sm font-bold text-slate-700">All caught up</p>
        <p className="text-xs text-slate-400 mt-1">
          No newly assigned examinations are waiting on you right now.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {exams.map((exam) => {
        const isOverdue =
          exam.submissionDeadline &&
          new Date() > new Date(exam.submissionDeadline);
        return (
          <button
            key={exam.id}
            onClick={() => onOpen(exam)}
            className="text-left bg-amber-50/60 border border-amber-200 rounded-2xl p-4 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition group"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-200">
                <Bell className="w-3 h-3" /> Action Required
              </span>
              {isOverdue && (
                <span className="text-[9px] font-black uppercase text-rose-600">
                  Overdue
                </span>
              )}
            </div>
            <h4 className="font-black text-slate-900 text-sm mt-2 group-hover:text-indigo-600 transition">
              {exam.name}
            </h4>
            <p className="text-[11px] font-semibold text-slate-500 mt-1">
              {exam.className} - {exam.section} · {exam.subject}
            </p>
            <div className="flex items-center justify-between mt-3 text-[10px] font-bold text-slate-400">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" /> {exam.examDate || "N/A"}
              </span>
              {exam.submissionDeadline && (
                <span
                  className={`flex items-center gap-1 ${isOverdue ? "text-rose-500" : ""}`}
                >
                  <Clock className="w-3 h-3" />{" "}
                  {new Date(exam.submissionDeadline).toLocaleDateString()}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
};

/* -------------------------------------------------------------------------
 * All Exams (History) Panel — filterable by status.
 * ---------------------------------------------------------------------- */

const HISTORY_STATUS_OPTIONS = [
  { value: "submitted", label: "Submitted" },
  { value: "under_review", label: "Under Review" },
  { value: "locked", label: "Completed" },
];

const AllExamsPanel = ({
  loading,
  exams,
  statusFilter,
  onStatusFilterChange,
  onOpen,
}) => (
  <div className="bg-white border border-slate-100 rounded-2xl shadow-xs">
    <div className="flex items-center justify-between p-4 border-b border-slate-100">
      <h3 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
        <History className="w-3.5 h-3.5 text-indigo-500" /> Exam History
      </h3>
      <select
        value={statusFilter}
        onChange={(e) => onStatusFilterChange(e.target.value)}
        className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-slate-700 focus:outline-none focus:border-indigo-500"
      >
        <option value="">All Statuses</option>
        {HISTORY_STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>

    {loading ? (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-600" />
      </div>
    ) : exams.length === 0 ? (
      <div className="p-14 text-center">
        <ClipboardList className="w-8 h-8 text-slate-300 mx-auto mb-3" />
        <p className="text-sm font-bold text-slate-700">
          No exams in this history yet
        </p>
        <p className="text-xs text-slate-400 mt-1">
          Submitted, under-review, and completed exams will show up here.
        </p>
      </div>
    ) : (
      <div className="divide-y divide-slate-100">
        {exams.map((exam) => (
          <button
            key={exam.id}
            onClick={() => onOpen(exam)}
            className="w-full text-left p-4 flex items-center justify-between gap-3 hover:bg-slate-50/60 transition"
          >
            <div>
              <p className="font-bold text-slate-900 text-xs">{exam.name}</p>
              <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                {exam.className} - {exam.section} · {exam.subject} ·{" "}
                {exam.examDate || "N/A"}
              </p>
            </div>
            <span
              className={`shrink-0 text-[9px] font-black px-2.5 py-1 rounded-full uppercase border ${
                STATUS_BADGES[exam.status]?.style || "bg-slate-100"
              }`}
            >
              {STATUS_BADGES[exam.status]?.label || exam.status}
            </span>
          </button>
        ))}
      </div>
    )}
  </div>
);

/* -------------------------------------------------------------------------
 * Class Test Modal — teacher-initiated quick tests. These skip the
 * admin draft/publish step entirely: they're created already "published"
 * (open for entry) and assigned to the creating teacher, then flow through
 * the exact same examinations/examResults collections as school-created
 * exams, so they automatically show up in the School Examination Dashboard's
 * history too.
 * ---------------------------------------------------------------------- */

const ClassTestModal = ({
  schoolId,
  teacherId,
  teacherScopedClasses,
  onClose,
  onCreated,
}) => {
  const [form, setForm] = useState({
    name: "",
    className: "",
    section: "",
    subject: "",
    examDate: new Date().toISOString().split("T")[0],
    totalMarks: 20,
    paperLink: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Question paper attachment — client-side Base64 conversion, no
  // Firebase Storage involved. See docUpload.js.
  const [paperFileName, setPaperFileName] = useState("");
  const [paperProcessing, setPaperProcessing] = useState(false);
  const [paperError, setPaperError] = useState("");

  const handlePaperFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPaperError("");
    setPaperProcessing(true);
    try {
      const dataUrl = await convertFileToBase64Doc(file);
      setForm((f) => ({ ...f, paperLink: dataUrl }));
      setPaperFileName(file.name);
    } catch (err) {
      setPaperError(err.message || "Couldn't process that file.");
    } finally {
      setPaperProcessing(false);
    }
  };

  // Strictly scoped to this teacher's own Timetable entries — no fallback
  // to the full school class list, so a teacher can only ever create a
  // class test against a class/section/subject they actually teach.
  const hasTimetableData = teacherScopedClasses.length > 0;

  const classOptions = useMemo(
    () =>
      Array.from(
        new Set(teacherScopedClasses.map((c) => c.className)),
      ).filter(Boolean),
    [teacherScopedClasses],
  );

  const sectionOptions = useMemo(() => {
    if (!form.className) return [];
    return Array.from(
      new Set(
        teacherScopedClasses
          .filter((c) => c.className === form.className)
          .map((c) => c.section),
      ),
    ).filter(Boolean);
  }, [teacherScopedClasses, form.className]);

  const subjectOptions = useMemo(() => {
    if (!form.className || !form.section) return [];
    const match = teacherScopedClasses.find(
      (c) => c.className === form.className && c.section === form.section,
    );
    return match?.subjects || [];
  }, [teacherScopedClasses, form.className, form.section]);

  const setField = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const isValid =
    form.name.trim() &&
    form.className &&
    form.section &&
    form.subject &&
    Number(form.totalMarks) > 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isValid || !schoolId || !teacherId || paperProcessing) return;
    setSaving(true);
    setError("");
    try {
      const examDate = form.examDate || new Date().toISOString().split("T")[0];
      const dateObj = new Date(examDate);
      const payload = {
        name: form.name.trim(),
        className: form.className,
        section: form.section,
        subject: form.subject,
        examDate,
        submissionDeadline: "",
        paperLink: form.paperLink || "",
        totalMarks: Number(form.totalMarks),
        month: dateObj.getMonth() + 1,
        year: dateObj.getFullYear(),
        schoolId,
        assignedTeacherId: teacherId,
        examType: "class_test",
        // Teacher-initiated distinction, so SchoolExaminationDashboard.jsx
        // can badge these apart from school-scheduled examinations.
        creationType: "teacher_initiated",
        isTeacherCreated: true,
        // Class tests skip the admin draft step — they're immediately
        // open for the creating teacher to enter marks against.
        status: "published",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      const docRef = await addDoc(collection(db, "examinations"), payload);
      onCreated({ id: docRef.id, ...payload });
    } catch (err) {
      console.error("Create class test error:", err);
      setError("Could not create the class test. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs"
        onClick={onClose}
      />
      <form
        onSubmit={handleSubmit}
        className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="font-black text-slate-900 text-sm flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-indigo-500" /> New Class Test
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {hasTimetableData ? (
            <p className="text-[11px] text-slate-400 font-medium">
              Quick topic/class tests go straight to "open for entry" — no
              admin approval needed to start recording marks. Only classes,
              sections, and subjects from your own Timetable are shown
              below.
            </p>
          ) : (
            <p className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              No classes found in your Timetable yet. Ask your school admin
              to assign your periods before creating a class test.
            </p>
          )}

          <label className="block">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">
              Test Title
            </span>
            <input
              value={form.name}
              onChange={setField("name")}
              placeholder="e.g. Chapter 4 Pop Quiz"
              disabled={!hasTimetableData}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <Picker
              icon={<Layers className="w-3.5 h-3.5" />}
              label="Class"
              value={form.className}
              onChange={(v) =>
                setForm((f) => ({
                  ...f,
                  className: v,
                  section: "",
                  subject: "",
                }))
              }
              options={classOptions}
              disabled={!hasTimetableData}
            />
            <Picker
              icon={<Layers className="w-3.5 h-3.5" />}
              label="Section"
              value={form.section}
              onChange={(v) =>
                setForm((f) => ({ ...f, section: v, subject: "" }))
              }
              options={sectionOptions}
              disabled={!hasTimetableData || !form.className}
            />
          </div>

          <Picker
            icon={<BookOpenText className="w-3.5 h-3.5" />}
            label="Subject"
            value={form.subject}
            onChange={(v) => setForm((f) => ({ ...f, subject: v }))}
            options={subjectOptions}
            disabled={!hasTimetableData || !form.section}
          />

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">
                Test Date
              </span>
              <input
                type="date"
                value={form.examDate}
                onChange={setField("examDate")}
                disabled={!hasTimetableData}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">
                Total Marks
              </span>
              <input
                type="number"
                min={1}
                value={form.totalMarks}
                onChange={setField("totalMarks")}
                disabled={!hasTimetableData}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">
              Question Paper (optional)
            </span>
            <span
              className={`flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl border border-dashed transition ${
                !hasTimetableData || paperProcessing
                  ? "border-slate-200 bg-slate-50 text-slate-400 cursor-wait"
                  : "border-slate-300 bg-slate-50 text-slate-500 hover:border-indigo-400 hover:text-indigo-600 cursor-pointer"
              }`}
            >
              {paperProcessing ? (
                <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
              ) : (
                <UploadCloud className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className="text-[11px] font-semibold truncate">
                {paperProcessing
                  ? "Processing..."
                  : paperFileName || "Attach PDF or PNG/JPG..."}
              </span>
              <input
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                onChange={handlePaperFileChange}
                disabled={!hasTimetableData || paperProcessing}
                className="hidden"
              />
            </span>
            {paperError && (
              <p className="text-[10px] text-rose-500 font-bold mt-1">
                {paperError}
              </p>
            )}
          </label>

          {error && (
            <p className="text-[11px] font-bold text-rose-500 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-5 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!isValid || saving || paperProcessing || !hasTimetableData}
            className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 shadow-md shadow-indigo-500/20 transition"
          >
            {saving ? "Creating..." : "Create & Enter Marks"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default TeacherExaminationDashboard;