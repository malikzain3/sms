/**
 * SchoolExaminationDashboard.jsx
 * -------------------------------------------------------------------------
 * Intended location: src/Components/User/SchoolExaminationDashboard.jsx
 *
 * SCOPE: School examination dashboard with multi-tenant schoolId isolation,
 * dynamic class/section/subject/teacher loading, 5-stage workflow,
 * submission progress tracking, question paper links, submission deadlines,
 * and direct integration with ScholasticAnalytics.jsx.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../firebaseConfig";
import {
  Plus,
  Search,
  SlidersHorizontal,
  X,
  Pencil,
  Trash2,
  Lock,
  LockOpen,
  CheckCircle2,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  FileSpreadsheet,
  GraduationCap,
  ExternalLink,
  Clock,
  Send,
  Eye,
  BarChart2,
  FileText,
  Calendar,
  RotateCcw,
} from "lucide-react";
import Header from "./Header";

/* -------------------------------------------------------------------------
 * Constants & Metadata
 * ---------------------------------------------------------------------- */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - 3 + i);

const STATUS_META = {
  draft: {
    label: "Draft",
    badge: "bg-slate-100 text-slate-600 border-slate-200",
    dot: "bg-slate-400",
  },
  published: {
    label: "Published",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
  },
  submitted: {
    label: "Teacher Submission",
    badge: "bg-blue-50 text-blue-700 border-blue-200",
    dot: "bg-blue-500",
  },
  under_review: {
    label: "Under Review",
    badge: "bg-purple-50 text-purple-700 border-purple-200",
    dot: "bg-purple-500",
  },
  locked: {
    label: "Completed",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
  },
};

const PAGE_SIZE = 8;

const emptyForm = {
  name: "",
  className: "",
  section: "",
  subject: "",
  assignedTeacherId: "",
  examDate: new Date().toISOString().split("T")[0],
  submissionDeadline: "",
  paperLink: "",
  month: new Date().getMonth() + 1,
  year: CURRENT_YEAR,
  totalMarks: 100,
};

/* -------------------------------------------------------------------------
 * Root component
 * ---------------------------------------------------------------------- */

const SchoolExaminationDashboard = () => {
  const navigate = useNavigate();
  const session = JSON.parse(
    localStorage.getItem("schoolix_session") || "null",
  );
  const schoolId = session?.schoolId;

  const [exams, setExams] = useState([]);
  const [classesData, setClassesData] = useState([]);
  const [teachersData, setTeachersData] = useState([]);
  const [studentsData, setStudentsData] = useState([]);
  const [examResultsData, setExamResultsData] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [searchTerm, setSearchTerm] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    className: "",
    section: "",
    subject: "",
    status: "",
    month: "",
    year: "",
  });

  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingExam, setEditingExam] = useState(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [busyId, setBusyId] = useState(null);

  // Student selection state for examination analytics
  const [inspectExam, setInspectExam] = useState(null);

  /* ---- Real-time subscriptions, ALL scoped strictly by schoolId ---- */
  useEffect(() => {
    if (!schoolId) {
      setLoading(false);
      setError("No school context found. Please sign in again.");
      return;
    }
    setLoading(true);

    // 1. Examinations Subscription
    const qExams = query(
      collection(db, "examinations"),
      where("schoolId", "==", schoolId),
    );
    const unsubExams = onSnapshot(
      qExams,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        rows.sort(
          (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0),
        );
        setExams(rows);
        setLoading(false);
      },
      (err) => {
        console.error("examinations onSnapshot error:", err);
        setError("Could not load examinations.");
        setLoading(false);
      },
    );

    // 2. Classes Subscription
    const qClasses = query(
      collection(db, "classes"),
      where("schoolId", "==", schoolId),
    );
    const unsubClasses = onSnapshot(qClasses, (snap) => {
      setClassesData(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    // 3. Teachers Subscription
    const qTeachers = query(
      collection(db, "teachers"),
      where("schoolId", "==", schoolId),
    );
    const unsubTeachers = onSnapshot(qTeachers, (snap) => {
      setTeachersData(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    // 4. Students Subscription
    const qStudents = query(
      collection(db, "students"),
      where("schoolId", "==", schoolId),
    );
    const unsubStudents = onSnapshot(qStudents, (snap) => {
      setStudentsData(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    // 5. Exam Results Subscription (for live progress & submission stats)
    const qResults = query(
      collection(db, "examResults"),
      where("schoolId", "==", schoolId),
    );
    const unsubResults = onSnapshot(qResults, (snap) => {
      setExamResultsData(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubExams();
      unsubClasses();
      unsubTeachers();
      unsubStudents();
      unsubResults();
    };
  }, [schoolId]);

  /* ---- Dynamic options derived from live `classesData` ---- */
  const dynamicOptions = useMemo(() => {
    const classSet = new Set();
    const sectionSet = new Set();
    const subjectSet = new Set();

    classesData.forEach((c) => {
      const className = c.className || c.name;
      if (className) classSet.add(className);
      if (c.section) sectionSet.add(c.section);

      const courses = Array.isArray(c.courses)
        ? c.courses
        : Array.isArray(c.subjects)
          ? c.subjects
          : [];
      courses.forEach((sub) => sub && subjectSet.add(sub));
    });

    return {
      classes: Array.from(classSet).sort(),
      sections: Array.from(sectionSet).sort(),
      subjects: Array.from(subjectSet).sort(),
    };
  }, [classesData]);

  /* ---- Search + filter pipeline ---- */
  const filteredExams = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return exams.filter((e) => {
      if (filters.className && e.className !== filters.className) return false;
      if (filters.section && e.section !== filters.section) return false;
      if (filters.subject && e.subject !== filters.subject) return false;
      if (filters.status && e.status !== filters.status) return false;
      if (filters.month && String(e.month) !== String(filters.month))
        return false;
      if (filters.year && String(e.year) !== String(filters.year)) return false;
      if (!term) return true;
      return (
        e.name?.toLowerCase().includes(term) ||
        e.subject?.toLowerCase().includes(term) ||
        e.className?.toLowerCase().includes(term)
      );
    });
  }, [exams, filters, searchTerm]);

  /* ---- Pagination ---- */
  const totalPages = Math.max(1, Math.ceil(filteredExams.length / PAGE_SIZE));
  const pagedExams = filteredExams.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  useEffect(() => {
    setPage(1);
  }, [searchTerm, filters]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  /* ---- Statistics Section Calculations ---- */
  const stats = useMemo(() => {
    const total = exams.length;
    const draft = exams.filter((e) => e.status === "draft").length;
    const published = exams.filter((e) => e.status === "published").length;
    const underReview = exams.filter(
      (e) => e.status === "submitted" || e.status === "under_review",
    ).length;
    const completed = exams.filter((e) => e.status === "locked").length;

    // Teacher Submission Progress across published/submitted/review/completed exams
    const activeExams = exams.filter((e) => e.status !== "draft");
    let totalRequiredSubmissions = 0;
    let totalEnteredSubmissions = 0;

    activeExams.forEach((exam) => {
      const classStudentsCount = studentsData.filter(
        (s) => s.className === exam.className && s.section === exam.section,
      ).length;
      const examResultsCount = examResultsData.filter(
        (r) => r.examId === exam.id,
      ).length;

      totalRequiredSubmissions += classStudentsCount;
      totalEnteredSubmissions += Math.min(examResultsCount, classStudentsCount);
    });

    const progressPercent =
      totalRequiredSubmissions > 0
        ? Math.round((totalEnteredSubmissions / totalRequiredSubmissions) * 100)
        : 0;

    return {
      total,
      draft,
      published,
      underReview,
      completed,
      submissionProgress: activeExams.length > 0 ? `${progressPercent}%` : "0%",
    };
  }, [exams, studentsData, examResultsData]);

  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const clearFilters = () =>
    setFilters({
      className: "",
      section: "",
      subject: "",
      status: "",
      month: "",
      year: "",
    });

  /* ---- CRUD & Workflow Handlers ---- */
  const openCreateModal = () => {
    setEditingExam(null);
    setModalOpen(true);
  };

  const openEditModal = (exam) => {
    setEditingExam(exam);
    setModalOpen(true);
  };

  const handleSaveExam = async (formData) => {
    if (!schoolId) return;
    setSaving(true);
    try {
      if (editingExam) {
        await updateDoc(doc(db, "examinations", editingExam.id), {
          ...formData,
          schoolId,
          updatedAt: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, "examinations"), {
          ...formData,
          schoolId,
          status: "draft",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      setModalOpen(false);
      setEditingExam(null);
    } catch (err) {
      console.error("Save examination error:", err);
      setError("Could not save the examination. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleSetStatus = async (exam, status) => {
    setBusyId(exam.id);
    try {
      const updatePayload = {
        status,
        updatedAt: serverTimestamp(),
      };
      await updateDoc(doc(db, "examinations", exam.id), updatePayload);
    } catch (err) {
      console.error("Status update error:", err);
      setError("Could not update examination status.");
    } finally {
      setBusyId(null);
    }
  };

  const handleReturnToTeacher = async (exam) => {
    setBusyId(exam.id);
    try {
      await updateDoc(doc(db, "examinations", exam.id), {
        status: "published",
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("Return to teacher error:", err);
      setError("Could not return the examination to the teacher.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, "examinations", deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      console.error("Delete examination error:", err);
      setError("Could not delete the examination.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    //  <div className="w-full max-w-full px-2 sm:px-4 py-4 sm:py-6 space-y-6 sm:space-y-8 text-slate-800 animate-fadeIn">
    //     <div className="w-full flex-1 overflow-x-hidden">
    //       <Header />
    //     </div>
    <div className="space-y-6 w-full animate-fadeIn">
      <Header onSearch={setSearchTerm} searchPlaceholder="Search examinations, subjects, or classes..." />
      {/* ---------------- Page Header ---------------- */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <span className="w-7 h-7 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/20">
              <GraduationCap className="w-3.5 h-3.5" />
            </span>
            School Examinations Control
          </h2>
          <p className="text-xs text-slate-400 font-medium mt-1">
            Create, publish, track submission progress, and complete examination
            results.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-500/20 transition hover:-translate-y-0.5 shrink-0"
        >
          <Plus className="w-4 h-4" /> Create Examination
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* ---------------- Statistics Cards Section ---------------- */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          label="Total Examinations"
          value={stats.total}
          icon={<ClipboardList className="w-4 h-4" />}
          tone="indigo"
        />
        <StatCard
          label="Draft Exams"
          value={stats.draft}
          icon={<FileSpreadsheet className="w-4 h-4" />}
          tone="slate"
        />
        <StatCard
          label="Published Exams"
          value={stats.published}
          icon={<CheckCircle2 className="w-4 h-4" />}
          tone="emerald"
        />
        <StatCard
          label="Under Review Exams"
          value={stats.underReview}
          icon={<Send className="w-4 h-4" />}
          tone="blue"
        />
        <StatCard
          label="Completed Exams"
          value={stats.completed}
          icon={<CheckCircle2 className="w-4 h-4" />}
          tone="purple"
        />
        <StatCard
          label="Submission Progress"
          value={stats.submissionProgress}
          icon={<BarChart2 className="w-4 h-4" />}
          tone="amber"
        />
      </div>

      {/* ---------------- Search + Filters ---------------- */}
      <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by examination name, subject, or class..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs font-semibold focus:outline-none focus:border-indigo-500 transition"
            />
          </div>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border transition shrink-0 ${
              showFilters || activeFilterCount
                ? "bg-indigo-50 border-indigo-200 text-indigo-600"
                : "bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-700"
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="w-4.5 h-4.5 rounded-full bg-indigo-600 text-white text-[9px] font-black flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-3 border-t border-slate-100">
            <FilterSelect
              label="Class"
              value={filters.className}
              onChange={(v) => setFilters((f) => ({ ...f, className: v }))}
              options={dynamicOptions.classes}
            />
            <FilterSelect
              label="Section"
              value={filters.section}
              onChange={(v) => setFilters((f) => ({ ...f, section: v }))}
              options={dynamicOptions.sections}
            />
            <FilterSelect
              label="Subject"
              value={filters.subject}
              onChange={(v) => setFilters((f) => ({ ...f, subject: v }))}
              options={dynamicOptions.subjects}
            />
            <FilterSelect
              label="Status"
              value={filters.status}
              onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
              options={[
                { label: "Draft", value: "draft" },
                { label: "Published", value: "published" },
                { label: "Teacher Submission", value: "submitted" },
                { label: "Under Review", value: "under_review" },
                { label: "Completed", value: "locked" },
              ]}
            />
            <FilterSelect
              label="Month"
              value={filters.month}
              onChange={(v) => setFilters((f) => ({ ...f, month: v }))}
              options={MONTHS.map((m, i) => ({ label: m, value: i + 1 }))}
            />
            <FilterSelect
              label="Year"
              value={filters.year}
              onChange={(v) => setFilters((f) => ({ ...f, year: v }))}
              options={YEARS.map((y) => ({ label: String(y), value: y }))}
            />
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="col-span-2 sm:col-span-3 lg:col-span-6 text-[11px] font-bold text-rose-500 hover:text-rose-600 text-left mt-1"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* ---------------- Examination Table ---------------- */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-xs overflow-hidden">
        {loading ? (
          <LoadingState />
        ) : pagedExams.length === 0 ? (
          <EmptyState
            hasFilters={activeFilterCount > 0 || !!searchTerm}
            onCreate={openCreateModal}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 font-bold uppercase text-[9px] border-b border-slate-100">
                    <th className="p-4">Examination</th>
                    <th className="p-4">Class / Subject</th>
                    <th className="p-4">Exam Date & Deadline</th>
                    <th className="p-4">Paper Link</th>
                    <th className="p-4">Submission Progress</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {pagedExams.map((exam) => (
                    <ExamRow
                      key={exam.id}
                      exam={exam}
                      studentsData={studentsData}
                      examResultsData={examResultsData}
                      teachersData={teachersData}
                      busy={busyId === exam.id}
                      onEdit={() => openEditModal(exam)}
                      onDelete={() => setDeleteTarget(exam)}
                      onPublish={() => handleSetStatus(exam, "published")}
                      onStartReview={() =>
                        handleSetStatus(exam, "under_review")
                      }
                      onLock={() => handleSetStatus(exam, "locked")}
                      onUnlock={() => handleSetStatus(exam, "published")}
                      onRevertToDraft={() => handleSetStatus(exam, "draft")}
                      onReturnToTeacher={() => handleReturnToTeacher(exam)}
                      onInspect={() => setInspectExam(exam)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* ---------------- Pagination ---------------- */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border-t border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Page {page} of {totalPages} · {filteredExams.length}{" "}
                examinations
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-2 rounded-lg border border-slate-200 text-slate-500 disabled:opacity-30 hover:bg-slate-50 transition"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-2 rounded-lg border border-slate-200 text-slate-500 disabled:opacity-30 hover:bg-slate-50 transition"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ---------------- Create / Edit Modal ---------------- */}
      {modalOpen && (
        <ExamFormModal
          initial={editingExam}
          classesData={classesData}
          teachersData={teachersData}
          saving={saving}
          onClose={() => {
            setModalOpen(false);
            setEditingExam(null);
          }}
          onSave={handleSaveExam}
        />
      )}

      {/* ---------------- Delete Confirmation ---------------- */}
      {deleteTarget && (
        <ConfirmDeleteModal
          exam={deleteTarget}
          deleting={deleting}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      )}

      {/* ---------------- Inspection & Scholastic Analytics Modal ---------------- */}
      {inspectExam && (
        <InspectExamModal
          exam={inspectExam}
          studentsData={studentsData}
          examResultsData={examResultsData}
          onClose={() => {
            setInspectExam(null);
          }}
          onSelectStudentForAnalytics={(student) => {
            setInspectExam(null);
            navigate(`/school/students/${student.id}/analytics`);
          }}
        />
      )}
    </div>
  );
};

/* -------------------------------------------------------------------------
 * Stat card
 * ---------------------------------------------------------------------- */

const TONES = {
  indigo: "bg-indigo-50/40 border-indigo-100/60 text-indigo-600",
  emerald: "bg-emerald-50/40 border-emerald-100/60 text-emerald-600",
  blue: "bg-blue-50/40 border-blue-100/60 text-blue-600",
  purple: "bg-purple-50/40 border-purple-100/60 text-purple-600",
  amber: "bg-amber-50/40 border-amber-100/60 text-amber-600",
  slate: "bg-slate-50 border-slate-100 text-slate-500",
};

const StatCard = ({ label, value, icon, tone }) => (
  <div className={`p-4 rounded-2xl border shadow-xs ${TONES[tone]}`}>
    <div className="flex items-center justify-between">
      <span className="text-[10px] font-bold uppercase tracking-wider">
        {label}
      </span>
      <span className="opacity-70">{icon}</span>
    </div>
    <p className="text-xl font-black text-slate-900 mt-2">{value}</p>
  </div>
);

/* -------------------------------------------------------------------------
 * Filter Select Component
 * ---------------------------------------------------------------------- */

const FilterSelect = ({ label, value, onChange, options }) => (
  <label className="block">
    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
      {label}
    </span>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-[11px] font-bold text-slate-700 focus:outline-none focus:border-indigo-500 transition"
    >
      <option value="">All</option>
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
 * Table Row with Dynamic Progress Tracking
 * ---------------------------------------------------------------------- */

const ExamRow = ({
  exam,
  studentsData,
  examResultsData,
  teachersData,
  busy,
  onEdit,
  onDelete,
  onPublish,
  onStartReview,
  onLock,
  onUnlock,
  onReturnToTeacher,
  onInspect,
}) => {
  const meta = STATUS_META[exam.status] || STATUS_META.draft;

  // Compute live submission progress
  const classStudents = useMemo(() => {
    return studentsData.filter(
      (s) => s.className === exam.className && s.section === exam.section,
    );
  }, [studentsData, exam.className, exam.section]);

  const examResults = useMemo(() => {
    return examResultsData.filter((r) => r.examId === exam.id);
  }, [examResultsData, exam.id]);

  const totalCount = classStudents.length;
  const enteredCount = examResults.length;
  const percent =
    totalCount > 0
      ? Math.min(100, Math.round((enteredCount / totalCount) * 100))
      : 0;

  const assignedTeacher = teachersData.find(
    (t) => t.id === exam.assignedTeacherId,
  );

  return (
    <tr className="hover:bg-slate-50/60 transition align-middle">
      <td className="p-4">
        <p className="font-bold text-slate-900">
          {exam.name || "Untitled Examination"}
        </p>
        <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
          Total Marks: {exam.totalMarks} · {MONTHS[(exam.month || 1) - 1]}{" "}
          {exam.year}
        </p>
        {assignedTeacher && (
          <span className="inline-block mt-1 text-[9px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
            Teacher: {assignedTeacher.name}
          </span>
        )}
      </td>

      <td className="p-4">
        <p className="font-bold text-slate-800">
          {exam.className || "—"} {exam.section ? `- ${exam.section}` : ""}
        </p>
        <p className="text-[10px] text-slate-400 font-semibold">
          {exam.subject || "—"}
        </p>
      </td>

      <td className="p-4 text-[11px]">
        <p className="font-semibold text-slate-700 flex items-center gap-1">
          <Calendar className="w-3 h-3 text-indigo-500" />{" "}
          {exam.examDate || "Not set"}
        </p>
        {exam.submissionDeadline ? (
          <p className="text-[10px] text-rose-500 font-bold flex items-center gap-1 mt-0.5">
            <Clock className="w-3 h-3" /> Deadline:{" "}
            {new Date(exam.submissionDeadline).toLocaleDateString()}
          </p>
        ) : (
          <p className="text-[10px] text-slate-400">No deadline set</p>
        )}
      </td>

      <td className="p-4">
        {exam.paperLink ? (
          <a
            href={exam.paperLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition"
          >
            <FileText className="w-3.5 h-3.5" /> Paper{" "}
            <ExternalLink className="w-3 h-3" />
          </a>
        ) : (
          <span className="text-[10px] text-slate-400 font-semibold">
            No link
          </span>
        )}
      </td>

      <td className="p-4 min-w-35">
        <div className="space-y-1">
          <div className="flex justify-between items-center text-[10px] font-bold text-slate-600">
            <span>
              {enteredCount} / {totalCount}
            </span>
            <span>{percent}%</span>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                percent === 100 ? "bg-emerald-500" : "bg-indigo-600"
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </td>

      <td className="p-4">
        <span
          className={`inline-flex items-center gap-1.5 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider border ${meta.badge}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />{" "}
          {meta.label}
        </span>
      </td>

      <td className="p-4">
        <div className="flex items-center justify-end gap-1">
          <ActionBtn title="Inspect Results" tone="indigo" onClick={onInspect}>
            <Eye className="w-3.5 h-3.5" />
          </ActionBtn>

          {exam.status === "draft" && (
            <ActionBtn
              title="Publish Examination"
              tone="emerald"
              busy={busy}
              onClick={onPublish}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
            </ActionBtn>
          )}

          {exam.status === "submitted" && (
            <ActionBtn
              title="Start School Review"
              tone="purple"
              busy={busy}
              onClick={onStartReview}
            >
              <Send className="w-3.5 h-3.5" />
            </ActionBtn>
          )}

          {(exam.status === "submitted" || exam.status === "under_review") && (
            <ActionBtn
              title="Return to Teacher for Edits"
              tone="amber"
              busy={busy}
              onClick={onReturnToTeacher}
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </ActionBtn>
          )}

          {(exam.status === "published" ||
            exam.status === "submitted" ||
            exam.status === "under_review") && (
            <ActionBtn
              title="Mark Completed & Lock"
              tone="amber"
              busy={busy}
              onClick={onLock}
            >
              <Lock className="w-3.5 h-3.5" />
            </ActionBtn>
          )}

          {exam.status === "locked" && (
            <ActionBtn
              title="Reopen Examination"
              tone="amber"
              busy={busy}
              onClick={onUnlock}
            >
              <LockOpen className="w-3.5 h-3.5" />
            </ActionBtn>
          )}

          <ActionBtn
            title="Edit Examination"
            tone="indigo"
            onClick={onEdit}
            disabled={exam.status === "locked"}
          >
            <Pencil className="w-3.5 h-3.5" />
          </ActionBtn>

          <ActionBtn
            title="Delete Examination"
            tone="rose"
            onClick={onDelete}
            disabled={exam.status === "locked"}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </ActionBtn>
        </div>
      </td>
    </tr>
  );
};

const ACTION_TONES = {
  emerald: "text-emerald-600 hover:bg-emerald-50",
  purple: "text-purple-600 hover:bg-purple-50",
  amber: "text-amber-600 hover:bg-amber-50",
  indigo: "text-indigo-600 hover:bg-indigo-50",
  rose: "text-rose-500 hover:bg-rose-50",
};

const ActionBtn = ({ children, title, tone, onClick, busy, disabled }) => (
  <button
    title={title}
    onClick={onClick}
    disabled={busy || disabled}
    className={`p-2 rounded-lg transition disabled:opacity-30 disabled:cursor-not-allowed ${ACTION_TONES[tone]}`}
  >
    {children}
  </button>
);

/* -------------------------------------------------------------------------
 * Loading & Empty States
 * ---------------------------------------------------------------------- */

const LoadingState = () => (
  <div className="flex flex-col items-center justify-center py-20 gap-3">
    <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-600" />
    <p className="text-xs font-semibold text-slate-400">
      Loading examinations data...
    </p>
  </div>
);

const EmptyState = ({ hasFilters, onCreate }) => (
  <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-6">
    <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-500 flex items-center justify-center">
      <ClipboardList className="w-6 h-6" />
    </div>
    <p className="text-sm font-bold text-slate-800">
      {hasFilters
        ? "No examinations match your search filters"
        : "No examinations created yet"}
    </p>
    <p className="text-xs text-slate-400 max-w-xs">
      {hasFilters
        ? "Try clearing or adjusting your search filters."
        : "Create your first examination to enable teachers to enter student marks."}
    </p>
    {!hasFilters && (
      <button
        onClick={onCreate}
        className="mt-2 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-500/20 transition"
      >
        <Plus className="w-4 h-4" /> Create Examination
      </button>
    )}
  </div>
);

/* -------------------------------------------------------------------------
 * Create / Edit Modal (With Dynamic Dropdowns & New Fields)
 * ---------------------------------------------------------------------- */

const ExamFormModal = ({
  initial,
  classesData,
  teachersData,
  saving,
  onClose,
  onSave,
}) => {
  const [form, setForm] = useState(
    initial
      ? {
          name: initial.name || "",
          className: initial.className || "",
          section: initial.section || "",
          subject: initial.subject || "",
          assignedTeacherId: initial.assignedTeacherId || "",
          examDate: initial.examDate || new Date().toISOString().split("T")[0],
          submissionDeadline: initial.submissionDeadline || "",
          paperLink: initial.paperLink || "",
          month: initial.month || new Date().getMonth() + 1,
          year: initial.year || CURRENT_YEAR,
          totalMarks: initial.totalMarks ?? 100,
        }
      : emptyForm,
  );
  const [touched, setTouched] = useState(false);

  // Dynamic Class Options
  const classOptions = useMemo(() => {
    const set = new Set();
    classesData.forEach((c) => {
      const name = c.className || c.name;
      if (name) set.add(name);
    });
    return Array.from(set).sort();
  }, [classesData]);

  // Dynamic Section Options for selected Class
  const sectionOptions = useMemo(() => {
    if (!form.className) return [];
    const set = new Set();
    classesData
      .filter((c) => (c.className || c.name) === form.className)
      .forEach((c) => c.section && set.add(c.section));
    return Array.from(set).sort();
  }, [classesData, form.className]);

  // Dynamic Subject Options for selected Class & Section
  const subjectOptions = useMemo(() => {
    if (!form.className) return [];
    const set = new Set();
    classesData
      .filter(
        (c) =>
          (c.className || c.name) === form.className &&
          (!form.section || c.section === form.section),
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
  }, [classesData, form.className, form.section]);

  const isValid =
    form.name.trim() &&
    form.className.trim() &&
    form.section.trim() &&
    form.subject.trim() &&
    Number(form.totalMarks) > 0;

  const setField = (key) => (e) =>
    setForm((f) => ({
      ...f,
      [key]:
        e.target.type === "number" ? Number(e.target.value) : e.target.value,
    }));

  const handleSubmit = (e) => {
    e.preventDefault();
    setTouched(true);
    if (!isValid) return;
    onSave({
      ...form,
      className: form.className.trim(),
      section: form.section.trim(),
      subject: form.subject.trim(),
      name: form.name.trim(),
      totalMarks: Number(form.totalMarks),
      month: Number(form.month),
      year: Number(form.year),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs"
        onClick={onClose}
      />
      <form
        onSubmit={handleSubmit}
        className="relative bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h3 className="font-black text-slate-900 text-sm">
            {initial ? "Edit Examination" : "Create Examination"}
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
          <FormField label="Examination Title" required>
            <input
              value={form.name}
              onChange={setField("name")}
              placeholder="e.g. Mid Term Examination 2026"
              className="input-base"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Class" required>
              <select
                value={form.className}
                onChange={setField("className")}
                className="input-base"
              >
                <option value="">Select Class...</option>
                {classOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Section" required>
              <select
                value={form.section}
                onChange={setField("section")}
                disabled={!form.className}
                className="input-base disabled:opacity-50"
              >
                <option value="">Select Section...</option>
                {sectionOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Subject" required>
              <select
                value={form.subject}
                onChange={setField("subject")}
                disabled={!form.className}
                className="input-base disabled:opacity-50"
              >
                <option value="">Select Subject...</option>
                {subjectOptions.map((sub) => (
                  <option key={sub} value={sub}>
                    {sub}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Assigned Teacher">
              <select
                value={form.assignedTeacherId}
                onChange={setField("assignedTeacherId")}
                className="input-base"
              >
                <option value="">Select Teacher...</option>
                {teachersData.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Exam Date" required>
              <input
                type="date"
                value={form.examDate}
                onChange={setField("examDate")}
                className="input-base"
              />
            </FormField>

            <FormField label="Submission Deadline">
              <input
                type="datetime-local"
                value={form.submissionDeadline}
                onChange={setField("submissionDeadline")}
                className="input-base"
              />
            </FormField>
          </div>

          <FormField label="Question Paper Link (URL)">
            <input
              type="url"
              value={form.paperLink}
              onChange={setField("paperLink")}
              placeholder="https://drive.google.com/your-paper.pdf"
              className="input-base"
            />
          </FormField>

          <div className="grid grid-cols-3 gap-3">
            <FormField label="Month" required>
              <select
                value={form.month}
                onChange={setField("month")}
                className="input-base"
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Year" required>
              <select
                value={form.year}
                onChange={setField("year")}
                className="input-base"
              >
                {YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Total Marks" required>
              <input
                type="number"
                min={1}
                value={form.totalMarks}
                onChange={setField("totalMarks")}
                className="input-base font-mono"
              />
            </FormField>
          </div>

          {touched && !isValid && (
            <p className="text-[11px] font-bold text-rose-500 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> Fill in all required
              fields (Title, Class, Section, Subject, Total Marks).
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-5 border-t border-slate-100 sticky bottom-0 bg-white">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 shadow-md shadow-indigo-500/20 transition"
          >
            {saving
              ? "Saving..."
              : initial
                ? "Save Changes"
                : "Create Examination"}
          </button>
        </div>

        <style>{`
          .input-base {
            width: 100%;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 0.75rem;
            padding: 0.625rem 0.875rem;
            font-size: 0.75rem;
            font-weight: 600;
            color: #1e293b;
            outline: none;
            transition: border-color 0.15s ease;
          }
          .input-base:focus { border-color: #6366f1; }
        `}</style>
      </form>
    </div>
  );
};

const FormField = ({ label, required, children }) => (
  <label className="block">
    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
      {label} {required && <span className="text-rose-400">*</span>}
    </span>
    {children}
  </label>
);

/* -------------------------------------------------------------------------
 * Delete Confirmation Modal
 * ---------------------------------------------------------------------- */

const ConfirmDeleteModal = ({ exam, deleting, onCancel, onConfirm }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div
      className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs"
      onClick={onCancel}
    />
    <div className="relative bg-white w-full max-w-sm rounded-2xl shadow-2xl border border-slate-100 p-6 text-center space-y-4">
      <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center mx-auto">
        <AlertTriangle className="w-5 h-5" />
      </div>
      <div>
        <h3 className="font-black text-slate-900 text-sm">
          Delete this examination?
        </h3>
        <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
          <span className="font-bold text-slate-600">{exam.name}</span> and any
          entered student marks will be permanently removed.
        </p>
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={onCancel}
          className="flex-1 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 transition"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={deleting}
          className="flex-1 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-rose-500 hover:bg-rose-600 disabled:opacity-50 transition"
        >
          {deleting ? "Deleting..." : "Delete"}
        </button>
      </div>
    </div>
  </div>
);

/* -------------------------------------------------------------------------
 * Inspect Exam Modal & Student Marks Summary
 * ---------------------------------------------------------------------- */

const InspectExamModal = ({
  exam,
  studentsData,
  examResultsData,
  onClose,
  onSelectStudentForAnalytics,
}) => {
  const classStudents = useMemo(() => {
    return studentsData
      .filter(
        (s) => s.className === exam.className && s.section === exam.section,
      )
      .sort((a, b) => (a.rollNumber || 0) - (b.rollNumber || 0));
  }, [studentsData, exam.className, exam.section]);

  const resultMap = useMemo(() => {
    const map = {};
    examResultsData
      .filter((result) => result.examId === exam.id)
      .forEach((result) => {
        map[result.studentId] = result;
      });
    return map;
  }, [examResultsData, exam.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs"
        onClick={onClose}
      />
      <div className="relative bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-black text-slate-900 text-sm">
              {exam.name} — Select Student
            </h3>
            <p className="text-xs text-slate-400">
              Class {exam.className}-{exam.section} · {exam.subject}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-x-auto border border-slate-100 rounded-xl">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-400 font-bold uppercase text-[9px] border-b border-slate-100">
                <th className="p-3">Roll #</th>
                <th className="p-3">Student</th>
                <th className="p-3">Attendance</th>
                <th className="p-3">Obtained Marks</th>
                <th className="p-3">Percentage</th>
                <th className="p-3">Grade</th>
                <th className="p-3 text-right">Analytics</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {classStudents.map((student) => {
                const result = resultMap[student.id];
                return (
                  <tr key={student.id} className="hover:bg-slate-50 transition">
                    <td className="p-3 font-mono font-bold">
                      {student.rollNumber || "—"}
                    </td>
                    <td className="p-3 font-bold text-slate-900">
                      {student.name}
                    </td>
                    <td className="p-3">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100">
                        {result?.attendance || "Not Entered"}
                      </span>
                    </td>
                    <td className="p-3 font-mono font-bold">
                      {result
                        ? `${result.obtainedMarks} / ${exam.totalMarks}`
                        : "—"}
                    </td>
                    <td className="p-3 font-mono">
                      {result?.percentage != null
                        ? `${result.percentage}%`
                        : "—"}
                    </td>
                    <td className="p-3">
                      {result?.grade ? (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {result.grade}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => onSelectStudentForAnalytics(student)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-[10px] font-bold transition"
                      >
                        <BarChart2 className="w-3 h-3" /> Scholastic Analytics
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SchoolExaminationDashboard;
