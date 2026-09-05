import React, { useContext, useEffect, useMemo, useState } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../firebaseConfig";
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

  const [selectedClass, setSelectedClass] = useState("");
  const [selectedSection, setSelectedSection] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedExamId, setSelectedExamId] = useState("");

  const [analyticsStudent, setAnalyticsStudent] = useState(null);

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
        savedAt: existing?.updatedAt || null,
      };
    });
    setRows(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, selectedExamId, JSON.stringify(existingResults)]);

  const [savingId, setSavingId] = useState(null);
  const [submittingExam, setSubmittingExam] = useState(false);
  const [rowErrors, setRowErrors] = useState({});

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
                <a
                  href={selectedExam.paperLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-xs font-bold transition"
                >
                  <FileText className="w-4 h-4" /> Question Paper{" "}
                  <ExternalLink className="w-3 h-3" />
                </a>
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

export default TeacherExaminationDashboard;
