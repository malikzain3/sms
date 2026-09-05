import React, { useState, useEffect, useMemo } from "react";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "../../firebaseConfig";

const todayStr = () => new Date().toISOString().split("T")[0];

// Same grading scale used in TeacherExaminationDashboard.jsx — duplicated
// here (not imported) to keep this component self-contained and avoid a
// cross-folder (User -> Teacher) import. Logic is unchanged.
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

const STATUS_STYLES = {
  Pass: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Fail: "bg-rose-50 text-rose-700 border-rose-200",
};

// Standard 4.0-scale conversion for the letter grades already produced by
// gradeFor() above. This is a display-only computation (no new Firestore
// field, no new grading policy) — it just expresses the same real grades
// on a second, commonly-used scale.
const GPA_POINTS = {
  "A+": 4.0,
  A: 4.0,
  "B+": 3.5,
  B: 3.0,
  "C+": 2.5,
  C: 2.0,
  F: 0.0,
};

const formatExamDate = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

// "YYYY-MM" sort/filter key + a "Month YYYY" display label, both derived
// straight from the real examDate string already stored on the
// examinations doc — no new field, just a client-side grouping of it.
const periodKeyFor = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const periodLabelFor = (key) => {
  const [year, month] = key.split("-");
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long" });
};

/* ---------------------------------------------------------------------
 * PHASE 4: small shared UI helpers — loading skeletons + an error
 * banner reused across every Firestore-backed section below. Pure
 * presentation only, no data logic, so they stay colocated here rather
 * than duplicated per-section.
 * ------------------------------------------------------------------- */
const ErrorBanner = ({ message, compact }) => (
  <div
    className={`flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 font-semibold ${
      compact ? "p-2.5 text-[11px]" : "p-3 text-xs"
    }`}
  >
    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
    {message}
  </div>
);

const MetricsGridSkeleton = ({ count = 4 }) => (
  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
    {Array.from({ length: count }).map((_, i) => (
      <div
        key={i}
        className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-2 animate-pulse"
      >
        <div className="h-2 w-16 bg-slate-200 rounded" />
        <div className="h-6 w-12 bg-slate-200 rounded" />
        <div className="h-2 w-20 bg-slate-200 rounded" />
      </div>
    ))}
  </div>
);

// Lightweight inline SVG line chart — no charting library. Plots real
// percentage-per-exam points (already sorted chronologically) on a
// fixed 0-100 vertical scale so scores stay visually comparable.
const PerformanceTrendChart = ({ points }) => {
  const width = 700;
  const height = 180;
  const padX = 36;
  const padY = 20;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const xFor = (i) =>
    points.length === 1
      ? padX + innerW / 2
      : padX + (i / (points.length - 1)) * innerW;
  const yFor = (pct) => padY + innerH - (Math.min(100, Math.max(0, pct)) / 100) * innerH;

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(p.percentage)}`)
    .join(" ");

  const gridLines = [0, 25, 50, 75, 100];

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full min-w-105"
        role="img"
        aria-label="Performance trend across exams"
      >
        {gridLines.map((g) => (
          <g key={g}>
            <line
              x1={padX}
              x2={width - padX}
              y1={yFor(g)}
              y2={yFor(g)}
              stroke="#f1f5f9"
              strokeWidth="1"
            />
            <text x={4} y={yFor(g) + 3} fontSize="9" fill="#94a3b8" fontWeight="700">
              {g}
            </text>
          </g>
        ))}

        <path d={linePath} fill="none" stroke="#4f46e5" strokeWidth="2" />

        {points.map((p, i) => (
          <g key={p.id}>
            <circle
              cx={xFor(i)}
              cy={yFor(p.percentage)}
              r="3.5"
              fill={p.percentage >= 50 ? "#4f46e5" : "#e11d48"}
              stroke="#fff"
              strokeWidth="1.5"
            />
            <title>
              {`${p.subject} — ${p.examName} (${p.dateLabel}): ${p.percentage}%`}
            </title>
          </g>
        ))}
      </svg>

      {/* Compact legend row under the chart — real dates, oldest to newest */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 px-1">
        {points.map((p) => (
          <span key={p.id} className="text-[9px] text-slate-400 font-semibold">
            {p.dateLabel}: <span className="text-slate-600 font-bold">{p.percentage}%</span>
          </span>
        ))}
      </div>
    </div>
  );
};

const ScholasticAnalytics = ({
  student,
  studentData,
  studentId,
  schoolId,
  isClassTeacher = true,
  allowedSubjects = [],
}) => {
  // Accept either a full student object (preferred) or fall back to
  // studentData for callers that still pass it separately. Either way we
  // need the real student object (id + schoolId), not just an id string.
  const stu = student && typeof student === "object" ? student : studentData;
  const effectiveStudentId = studentId || stu?.id;
  const effectiveSchoolId = schoolId || stu?.schoolId;

  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [selectedDate, setSelectedDate] = useState(todayStr());

  // PHASE 4: per-listener loading/error state — each Firestore section
  // tracks its own fetch status so a slow/broken listener never blocks
  // or blanks out the others.
  const [attendanceLoading, setAttendanceLoading] = useState(true);
  const [attendanceError, setAttendanceError] = useState(null);

  // Real-time listener for student attendance records
  useEffect(() => {
    if (!effectiveStudentId) {
      setAttendanceLoading(false);
      return;
    }
    setAttendanceLoading(true);
    setAttendanceError(null);
    const unsub = onSnapshot(
      collection(db, "students", effectiveStudentId, "attendance"),
      (snap) => {
        setAttendanceRecords(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setAttendanceLoading(false);
      },
      (err) => {
        console.error("Attendance listener failed:", err);
        setAttendanceError("Couldn't load attendance records.");
        setAttendanceLoading(false);
      }
    );
    return () => unsub();
  }, [effectiveStudentId]);

  // Attendance metrics calculations
  const totalDays = attendanceRecords.length;
  const presentCount = attendanceRecords.filter((r) => r.status === "Present").length;
  const absentCount = attendanceRecords.filter((r) => r.status === "Absent").length;
  const leaveCount = attendanceRecords.filter((r) => r.status === "Leave").length;
  const attendanceRate = totalDays > 0 ? ((presentCount / totalDays) * 100).toFixed(1) : "0.0";

  // Selected date lookup
  const recordForSelectedDate = attendanceRecords.find((r) => r.date === selectedDate);

  // Status badges mapping
  const statusStyles = {
    Present: "bg-emerald-100 text-emerald-800 border-emerald-300",
    Absent: "bg-rose-100 text-rose-800 border-rose-300",
    Leave: "bg-amber-100 text-amber-800 border-amber-300",
  };

  /* -------------------------------------------------------------------
   * REAL DATA: Examination results — reads the same flat `examResults`
   * collection the Teacher/School Examination Dashboards write to
   * (examResults/{examId}_{studentId}), scoped by schoolId + studentId.
   * ----------------------------------------------------------------- */
  const [examResults, setExamResults] = useState([]);
  const [examResultsLoading, setExamResultsLoading] = useState(true);
  const [examResultsError, setExamResultsError] = useState(null);
  useEffect(() => {
    if (!effectiveStudentId || !effectiveSchoolId) {
      setExamResults([]);
      setExamResultsLoading(false);
      return;
    }
    setExamResultsLoading(true);
    setExamResultsError(null);
    // schoolId isolation: every result read is scoped to THIS school AND
    // this student — a teacher/admin session for one school can never
    // pull another school's examResults docs through this query.
    const q = query(
      collection(db, "examResults"),
      where("schoolId", "==", effectiveSchoolId),
      where("studentId", "==", effectiveStudentId)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setExamResults(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setExamResultsLoading(false);
      },
      (err) => {
        console.error("Exam results listener failed:", err);
        setExamResultsError("Couldn't load examination results.");
        setExamResultsLoading(false);
      }
    );
    return () => unsub();
  }, [effectiveStudentId, effectiveSchoolId]);

  /* -------------------------------------------------------------------
   * REAL DATA: Examinations — used only to resolve an exam's display
   * name for each result row (examResults doesn't store the exam name).
   * ----------------------------------------------------------------- */
  const [examsById, setExamsById] = useState({});
  const [examsLoading, setExamsLoading] = useState(true);
  const [examsError, setExamsError] = useState(null);
  useEffect(() => {
    if (!effectiveSchoolId) {
      setExamsById({});
      setExamsLoading(false);
      return;
    }
    setExamsLoading(true);
    setExamsError(null);
    // schoolId isolation: only this school's examinations are ever
    // fetched, so exam names/dates can't leak across schools.
    const q = query(
      collection(db, "examinations"),
      where("schoolId", "==", effectiveSchoolId)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const map = {};
        snap.docs.forEach((d) => {
          map[d.id] = { id: d.id, ...d.data() };
        });
        setExamsById(map);
        setExamsLoading(false);
      },
      (err) => {
        console.error("Examinations listener failed:", err);
        setExamsError("Couldn't load examination details.");
        setExamsLoading(false);
      }
    );
    return () => unsub();
  }, [effectiveSchoolId]);

  // Subject teachers only see results for the subjects assigned to them;
  // class teachers retain the complete academic view for the student.
  const visibleExamResults = useMemo(() => {
    if (isClassTeacher) return examResults;

    const subjects = new Set(
      allowedSubjects.map((subject) => String(subject).trim().toLowerCase()),
    );
    return examResults.filter((result) => {
      const resultSubject = String(
        result.subject || examsById[result.examId]?.subject || "",
      )
        .trim()
        .toLowerCase();
      return subjects.has(resultSubject);
    });
  }, [allowedSubjects, examResults, examsById, isClassTeacher]);

  /* -------------------------------------------------------------------
   * REAL DATA: Teachers — used only to resolve the marking teacher's
   * name for each result row (examResults stores teacherId, not name).
   * ----------------------------------------------------------------- */
  const [teachersById, setTeachersById] = useState({});
  const [teachersLoading, setTeachersLoading] = useState(true);
  const [teachersError, setTeachersError] = useState(null);
  useEffect(() => {
    if (!effectiveSchoolId) {
      setTeachersById({});
      setTeachersLoading(false);
      return;
    }
    setTeachersLoading(true);
    setTeachersError(null);
    // schoolId isolation: teacher name lookups never cross school
    // boundaries, since this query is scoped to stu.schoolId.
    const q = query(
      collection(db, "teachers"),
      where("schoolId", "==", effectiveSchoolId)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const map = {};
        snap.docs.forEach((d) => {
          map[d.id] = { id: d.id, ...d.data() };
        });
        setTeachersById(map);
        setTeachersLoading(false);
      },
      (err) => {
        console.error("Teachers listener failed:", err);
        // Non-critical: table still renders with teacherId fallback, so
        // this doesn't need a blocking error banner — just stop loading.
        setTeachersError("Couldn't resolve teacher names.");
        setTeachersLoading(false);
      }
    );
    return () => unsub();
  }, [effectiveSchoolId]);

  /* -------------------------------------------------------------------
   * REAL DATA: Faculty remarks — reuses the existing teacherRemarks
   * subcollection (students/{id}/teacherRemarks) already written to by
   * TeacherStudentDetail.jsx. Same source, no new structure.
   * ----------------------------------------------------------------- */
  const [remarks, setRemarks] = useState([]);
  const [remarksLoading, setRemarksLoading] = useState(true);
  const [remarksError, setRemarksError] = useState(null);
  useEffect(() => {
    if (!effectiveStudentId) {
      setRemarks([]);
      setRemarksLoading(false);
      return;
    }
    setRemarksLoading(true);
    setRemarksError(null);
    const q = query(
      collection(db, "students", effectiveStudentId, "teacherRemarks"),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setRemarks(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setRemarksLoading(false);
      },
      (err) => {
        console.error("Teacher remarks listener failed:", err);
        setRemarksError("Couldn't load faculty remarks.");
        setRemarksLoading(false);
      }
    );
    return () => unsub();
  }, [effectiveStudentId]);

  // Sorted (most recent first) results for the course table
  const sortedResults = useMemo(() => {
    return [...visibleExamResults].sort(
      (a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0)
    );
  }, [visibleExamResults]);

  /* -------------------------------------------------------------------
   * Term/date filter — built entirely from the real examDate values on
   * this student's own results (via examsById), not a new field. "All
   * Terms" shows everything; otherwise only results whose exam falls in
   * the selected month/year are used for the table and the metrics
   * below it.
   * ----------------------------------------------------------------- */
  const availablePeriods = useMemo(() => {
    const keys = new Set();
    visibleExamResults.forEach((r) => {
      const examDate = examsById[r.examId]?.examDate;
      const key = periodKeyFor(examDate);
      if (key) keys.add(key);
    });
    return Array.from(keys)
      .sort()
      .reverse()
      .map((key) => ({ key, label: periodLabelFor(key) }));
  }, [visibleExamResults, examsById]);

  const [selectedPeriod, setSelectedPeriod] = useState("all");

  // Reset back to "All Terms" if the currently selected period no longer
  // exists in the data (e.g. switching between students).
  useEffect(() => {
    if (
      selectedPeriod !== "all" &&
      !availablePeriods.some((p) => p.key === selectedPeriod)
    ) {
      setSelectedPeriod("all");
    }
  }, [availablePeriods, selectedPeriod]);

  const periodFilteredResults = useMemo(() => {
    if (selectedPeriod === "all") return sortedResults;
    return sortedResults.filter(
      (r) => periodKeyFor(examsById[r.examId]?.examDate) === selectedPeriod
    );
  }, [sortedResults, examsById, selectedPeriod]);

  // Academic standing metrics — computed entirely from real examResults
  // (filtered to the selected term, if any), nothing hardcoded/simulated.
  const totalExams = periodFilteredResults.length;
  const avgPercentage =
    totalExams > 0
      ? (
          periodFilteredResults.reduce(
            (sum, r) => sum + (Number(r.percentage) || 0),
            0
          ) / totalExams
        ).toFixed(1)
      : null;
  const passCount = periodFilteredResults.filter((r) => r.status === "Pass").length;
  const passRate =
    totalExams > 0 ? Math.round((passCount / totalExams) * 100) : null;
  const overallGrade =
    avgPercentage !== null ? gradeFor(Number(avgPercentage)) : null;

  // Overall GPA — average of each real result's own grade-point value
  // (not derived from the averaged percentage), on the standard 4.0
  // scale defined in GPA_POINTS above.
  const gradedResults = periodFilteredResults.filter((r) => GPA_POINTS[r.grade] !== undefined);
  const overallGPA =
    gradedResults.length > 0
      ? (
          gradedResults.reduce((sum, r) => sum + GPA_POINTS[r.grade], 0) /
          gradedResults.length
        ).toFixed(2)
      : null;

  /* -------------------------------------------------------------------
   * PHASE 4: PERFORMANCE TRENDS — built entirely from the real
   * examResults + examinations data already loaded above (respects the
   * current term filter). No new fields, no simulated points: any
   * result without a resolvable examDate or a numeric percentage
   * (e.g. an absent entry) is simply left out of the trend line.
   * ----------------------------------------------------------------- */
  const trendPoints = useMemo(() => {
    return periodFilteredResults
      .map((r) => {
        const exam = examsById[r.examId];
        const examDate = exam?.examDate;
        const d = examDate ? new Date(examDate) : null;
        const hasDate = d && !Number.isNaN(d.getTime());
        const hasPercent =
          r.attendance !== "Absent" &&
          r.percentage !== undefined &&
          r.percentage !== null &&
          !Number.isNaN(Number(r.percentage));
        if (!hasDate || !hasPercent) return null;
        return {
          id: r.id,
          date: d,
          dateLabel: formatExamDate(examDate),
          percentage: Number(r.percentage),
          subject: r.subject || "—",
          examName: exam?.name || "Examination",
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.date - b.date);
  }, [periodFilteredResults, examsById]);

  // Trend delta — real comparison of the two most recent plotted exams,
  // nothing simulated. Null when there isn't enough data for a delta.
  const trendDelta =
    trendPoints.length >= 2
      ? Number(
          (
            trendPoints[trendPoints.length - 1].percentage -
            trendPoints[trendPoints.length - 2].percentage
          ).toFixed(1)
        )
      : null;

  /* -------------------------------------------------------------------
   * PHASE 4: ACADEMIC CONCERNS — derived only from real, already-loaded
   * data (failed exams, low overall percentage, weak attendance). No
   * concern is hardcoded per-student; the list is empty when nothing
   * in the real data crosses these thresholds.
   * ----------------------------------------------------------------- */
  const LOW_PERCENT_THRESHOLD = 50;
  const LOW_ATTENDANCE_THRESHOLD = 75;

  const academicConcerns = useMemo(() => {
    const concerns = [];

    const failedExams = periodFilteredResults.filter(
      (r) => r.attendance !== "Absent" && r.status === "Fail"
    );
    failedExams.forEach((r) => {
      const exam = examsById[r.examId];
      concerns.push({
        id: `fail-${r.id}`,
        level: "high",
        text: `Failed ${r.subject || "exam"} — ${exam?.name || "Examination"}${
          r.percentage !== undefined && r.percentage !== null
            ? ` (${r.percentage}%)`
            : ""
        }`,
      });
    });

    if (avgPercentage !== null && Number(avgPercentage) < LOW_PERCENT_THRESHOLD) {
      concerns.push({
        id: "low-average",
        level: "high",
        text: `Overall average of ${avgPercentage}% is below the ${LOW_PERCENT_THRESHOLD}% benchmark.`,
      });
    }

    if (
      totalDays > 0 &&
      Number(attendanceRate) < LOW_ATTENDANCE_THRESHOLD
    ) {
      concerns.push({
        id: "low-attendance",
        level: "medium",
        text: `Attendance is ${attendanceRate}%, below the ${LOW_ATTENDANCE_THRESHOLD}% benchmark.`,
      });
    }

    return concerns;
  }, [periodFilteredResults, examsById, avgPercentage, totalDays, attendanceRate]);

  return (
    <div className="space-y-6 w-full text-slate-700">
      
      {/* SECTION 1: REAL-TIME ATTENDANCE ANALYTICS */}
      <section className="bg-white border border-slate-100 rounded-2xl p-6 space-y-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              Real-time Attendance Analytics
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Live updates synced directly from class registry records.
            </p>
          </div>

          {/* Past Date Inspector */}
          <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
            <span className="text-[10px] font-bold text-slate-500 uppercase px-1">
              Inspect Date:
            </span>
            <input
              type="date"
              value={selectedDate}
              max={todayStr()}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-semibold focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {attendanceError && <ErrorBanner message={attendanceError} />}

        {attendanceLoading ? (
          <MetricsGridSkeleton count={4} />
        ) : (
          <>
            {/* Live Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-indigo-50/40 border border-indigo-100/60 rounded-xl">
                <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider block">
                  Overall Rate
                </span>
                <p className="text-2xl font-black text-indigo-900 mt-1">{attendanceRate}%</p>
                <span className="text-[9px] text-indigo-400 font-semibold block mt-0.5">
                  {presentCount} of {totalDays} sessions
                </span>
              </div>

              <div className="p-4 bg-emerald-50/40 border border-emerald-100/60 rounded-xl">
                <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">
                  Present Days
                </span>
                <p className="text-2xl font-black text-emerald-900 mt-1">{presentCount}</p>
                <span className="text-[9px] text-emerald-500 font-semibold block mt-0.5">
                  Attended
                </span>
              </div>

              <div className="p-4 bg-rose-50/40 border border-rose-100/60 rounded-xl">
                <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider block">
                  Absences
                </span>
                <p className="text-2xl font-black text-rose-900 mt-1">{absentCount}</p>
                <span className="text-[9px] text-rose-500 font-semibold block mt-0.5">
                  Unexcused
                </span>
              </div>

              <div className="p-4 bg-amber-50/40 border border-amber-100/60 rounded-xl">
                <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider block">
                  On Leave
                </span>
                <p className="text-2xl font-black text-amber-900 mt-1">{leaveCount}</p>
                <span className="text-[9px] text-amber-500 font-semibold block mt-0.5">
                  Approved
                </span>
              </div>
            </div>

            {/* Historical Date Inspector Display Card */}
            <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                  Selected Registry Log ({selectedDate})
                </span>
                <p className="text-xs font-semibold text-slate-700 mt-0.5">
                  {recordForSelectedDate
                    ? `Marked by: ${recordForSelectedDate.markedBy || "System Admin"}`
                    : "No registry record was logged for this date."}
                </p>
              </div>

              <div>
                {recordForSelectedDate ? (
                  <span
                    className={`text-[11px] font-black px-3 py-1 rounded-full border uppercase tracking-wider ${
                      statusStyles[recordForSelectedDate.status] || "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {recordForSelectedDate.status}
                  </span>
                ) : (
                  <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-slate-200 text-slate-500 border border-slate-300 uppercase tracking-wider">
                    Unmarked
                  </span>
                )}
              </div>
            </div>
          </>
        )}
      </section>

      {/* SECTION 2: ACADEMIC STANDING — real data from examResults */}
      <section className="bg-white border border-slate-100 rounded-2xl p-6 space-y-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 pb-3 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Academic Standing</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Examination results recorded across all subjects.</p>
          </div>
          <div className="flex items-center gap-2">
            {availablePeriods.length > 0 && (
              <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-500 uppercase px-1">
                  Term:
                </span>
                <select
                  value={selectedPeriod}
                  onChange={(e) => setSelectedPeriod(e.target.value)}
                  className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-semibold focus:outline-none focus:border-indigo-500"
                >
                  <option value="all">All Terms</option>
                  {availablePeriods.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-2.5 py-1 rounded-md uppercase whitespace-nowrap">
              {totalExams} {totalExams === 1 ? "Exam" : "Exams"} Recorded
            </span>
          </div>
        </div>

        {(examResultsError || examsError) && (
          <ErrorBanner message={examResultsError || examsError} />
        )}

        {examResultsLoading || examsLoading ? (
          <MetricsGridSkeleton count={4} />
        ) : (
        <>
        {/* High-level Academic Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Average Score</span>
            <span className="text-2xl font-black text-indigo-600 font-mono mt-1 block">
              {avgPercentage !== null ? `${avgPercentage}%` : "—"}
            </span>
            <span className="text-[9px] text-slate-400 font-semibold block mt-0.5">
              {totalExams > 0 ? `Across ${totalExams} recorded exam${totalExams === 1 ? "" : "s"}` : "No exams recorded yet"}
            </span>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Overall Grade</span>
            <span className="text-2xl font-black text-slate-800 font-mono mt-1 block">
              {overallGrade || "—"}
            </span>
            <span className="text-[9px] text-slate-400 font-semibold block mt-0.5">
              Based on average score
            </span>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">GPA (4.0 scale)</span>
            <span className="text-2xl font-black text-slate-800 font-mono mt-1 block">
              {overallGPA !== null ? overallGPA : "—"}
            </span>
            <span className="text-[9px] text-slate-400 font-semibold block mt-0.5">
              {gradedResults.length > 0
                ? `Averaged across ${gradedResults.length} graded exam${gradedResults.length === 1 ? "" : "s"}`
                : "No graded exams yet"}
            </span>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Pass Rate</span>
            <span className="text-2xl font-black text-slate-800 font-mono mt-1 block">
              {passRate !== null ? `${passRate}%` : "—"}
            </span>
            <span className="text-[9px] text-slate-400 font-semibold block mt-0.5">
              {totalExams > 0 ? `${passCount} of ${totalExams} passed` : "No exams recorded yet"}
            </span>
          </div>
        </div>

        {/* Real Exam Results Table */}
        <div className="w-full border border-slate-100 rounded-xl overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-400 font-bold uppercase text-[9px] border-b border-slate-100">
                <th className="p-3">Course / Subject</th>
                <th className="p-3">Examination</th>
                <th className="p-3">Exam Date</th>
                <th className="p-3">Teacher</th>
                <th className="p-3 text-right">Obtained</th>
                <th className="p-3 text-right">Total</th>
                <th className="p-3 text-right">Percentage</th>
                <th className="p-3 text-center">Grade</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {periodFilteredResults.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-6 text-center text-slate-400 italic">
                    {selectedPeriod === "all"
                      ? "No examination results recorded yet."
                      : "No examination results recorded for this term."}
                  </td>
                </tr>
              )}
              {periodFilteredResults.map((r) => {
                const exam = examsById[r.examId];
                const teacherName = teachersById[r.teacherId]?.name;
                const isAbsent = r.attendance === "Absent";
                return (
                  <tr key={r.id}>
                    <td className="p-3 font-bold text-slate-900">{r.subject || "—"}</td>
                    <td className="p-3">{exam?.name || "Examination"}</td>
                    <td className="p-3 font-mono text-slate-500">
                      {formatExamDate(exam?.examDate)}
                    </td>
                    <td className="p-3">{teacherName || "—"}</td>
                    <td className="p-3 font-mono text-right">
                      {isAbsent ? "Absent" : r.obtainedMarks ?? "—"}
                    </td>
                    <td className="p-3 font-mono text-right">
                      {r.totalMarks ?? exam?.totalMarks ?? "—"}
                    </td>
                    <td className="p-3 font-mono text-right">
                      {isAbsent
                        ? "—"
                        : r.percentage !== undefined && r.percentage !== null
                          ? `${r.percentage}%`
                          : "—"}
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`font-black text-[10px] px-2 py-0.5 rounded-md border ${
                          GRADE_STYLES[r.grade] || "bg-slate-50 text-slate-600 border-slate-200"
                        }`}
                      >
                        {r.grade || "—"}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`font-black text-[10px] px-2 py-0.5 rounded-md border uppercase ${
                          isAbsent
                            ? "bg-slate-50 text-slate-500 border-slate-200"
                            : STATUS_STYLES[r.status] ||
                              "bg-slate-50 text-slate-600 border-slate-200"
                        }`}
                      >
                        {isAbsent ? "Absent" : r.status || "—"}
                      </span>
                    </td>
                    <td className="p-3 text-slate-500 max-w-56 truncate" title={r.remarks || ""}>
                      {r.remarks || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
        )}
      </section>

      {/* SECTION 2B: PERFORMANCE TRENDS — lightweight inline SVG line
          chart built from the same real examResults/examinations data
          above (respects the active term filter). No chart library. */}
      <section className="bg-white border border-slate-100 rounded-2xl p-6 space-y-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 pb-3 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Performance Trend</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Percentage scored across exams over time
              {selectedPeriod !== "all" ? " for the selected term." : "."}
            </p>
          </div>
          {trendDelta !== null && (
            <span
              className={`text-[10px] font-black px-2.5 py-1 rounded-md uppercase whitespace-nowrap border ${
                trendDelta > 0
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : trendDelta < 0
                    ? "bg-rose-50 text-rose-700 border-rose-200"
                    : "bg-slate-50 text-slate-600 border-slate-200"
              }`}
            >
              {trendDelta > 0 ? "▲" : trendDelta < 0 ? "▼" : "—"} {Math.abs(trendDelta)}% vs last exam
            </span>
          )}
        </div>

        {(examResultsError || examsError) && (
          <ErrorBanner message={examResultsError || examsError} />
        )}

        {examResultsLoading || examsLoading ? (
          <div className="h-40 rounded-xl bg-slate-100 animate-pulse" />
        ) : trendPoints.length === 0 ? (
          <p className="p-6 text-center text-slate-400 italic text-xs">
            {selectedPeriod === "all"
              ? "Not enough graded exams yet to plot a trend."
              : "No graded exams in this term to plot a trend."}
          </p>
        ) : (
          <PerformanceTrendChart points={trendPoints} />
        )}
      </section>

      {/* SECTION 3: PERFORMANCE & CONDUCT — real attendance + exam + remarks data */}
      <section className="bg-white border border-slate-100 rounded-2xl p-6 space-y-5 shadow-xs">
        <div className="pb-3 border-b border-slate-100">
          <h3 className="font-bold text-slate-900 text-sm">Performance & Conduct</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">Attendance summary, exam performance, and teacher notes.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Attendance Snapshot Card (real, reuses Section 1 metrics) */}
          <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-3">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Attendance Snapshot</span>
            <div className="flex items-center gap-2">
              <span className="text-lg font-black text-emerald-600">{attendanceRate}%</span>
              <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                {presentCount}/{totalDays} Present
              </span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              {totalDays > 0
                ? `${presentCount} present, ${absentCount} absent, and ${leaveCount} on approved leave out of ${totalDays} recorded day${totalDays === 1 ? "" : "s"}.`
                : "No attendance has been recorded for this student yet."}
            </p>
          </div>

          {/* Exam Performance Progress (real, from examResults) */}
          <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-3">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Average Exam Score</span>
            <div className="flex justify-between items-center text-xs font-bold text-slate-800">
              <span>Overall Performance</span>
              <span className="font-mono text-indigo-600">
                {avgPercentage !== null ? `${avgPercentage}%` : "—"}
              </span>
            </div>
            <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
              <div
                className="bg-indigo-600 h-full rounded-full"
                style={{ width: `${avgPercentage !== null ? Math.min(100, Number(avgPercentage)) : 0}%` }}
              ></div>
            </div>
            <p className="text-[10px] text-slate-400 font-medium">
              {totalExams > 0
                ? `Based on ${totalExams} recorded exam${totalExams === 1 ? "" : "s"}.`
                : "No examination results recorded yet."}
            </p>
          </div>
        </div>

        {/* Academic Concerns — auto-derived from real failed exams, low
            average percentage, and low attendance rate above. Nothing
            here is hardcoded per-student; the panel simply doesn't
            render when no threshold is actually crossed. */}
        {(examResultsLoading || examsLoading || attendanceLoading) ? (
          <div className="h-16 rounded-xl bg-slate-100 animate-pulse" />
        ) : (
          academicConcerns.length > 0 && (
            <div className="p-4 bg-rose-50/40 border border-rose-100/60 rounded-xl space-y-2">
              <span className="text-[10px] text-rose-600 font-bold uppercase tracking-wider block">
                Academic Concerns
              </span>
              <ul className="space-y-1.5">
                {academicConcerns.map((c) => (
                  <li key={c.id} className="flex items-start gap-2 text-xs text-rose-700">
                    <span
                      className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                        c.level === "high" ? "bg-rose-500" : "bg-amber-500"
                      }`}
                    />
                    <span>{c.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )
        )}

        {/* Faculty Remarks — real data from students/{id}/teacherRemarks */}
        <div className="p-4 bg-indigo-50/30 border border-indigo-100/50 rounded-xl space-y-2">
          <span className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider block">Faculty Remarks</span>
          {remarksError ? (
            <ErrorBanner message={remarksError} compact />
          ) : remarksLoading ? (
            <div className="space-y-2">
              <div className="h-3 w-3/4 bg-slate-100 rounded animate-pulse" />
              <div className="h-3 w-1/2 bg-slate-100 rounded animate-pulse" />
            </div>
          ) : remarks.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No remarks recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {remarks.slice(0, 3).map((r) => (
                <div key={r.id}>
                  <p className="text-xs text-slate-700 italic">"{r.text}"</p>
                  <p className="text-[9px] text-slate-400 font-semibold mt-0.5">
                    — {r.teacherName || "Teacher"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

    </div>
  );
};

export default ScholasticAnalytics;