import React, { useContext, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  collection,
  collectionGroup,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
  writeBatch,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { TeacherPortalContext } from "../../Pages/TeacherPortal";
import {
  ChevronLeft,
  AlertTriangle,
  Send,
  CheckCircle2,
  Search,
  ShieldAlert,
  BookMarked,
} from "lucide-react";

const todayStr = () => new Date().toISOString().split("T")[0];

const TeacherClassDetail = () => {
  const { classId } = useParams(); // <-- real URL param, this is the "professional routing" piece
  const navigate = useNavigate();
  const { teacher, teacherAccess } = useContext(TeacherPortalContext);

  // Phase 2: access gate. A teacher may only open a class that's either
  // their homeroom (class-teacher) or one they actually teach a subject
  // in, per teacher.timetableMatrix. Everyone else is blocked here,
  // regardless of what classId they type in the URL.
  const isClassTeacher = !!teacherAccess?.isClassTeacherOf(classId);
  const accessibleSubjects = teacherAccess?.getSubjectsFor(classId) || [];
  const hasAccess = !!teacherAccess?.hasAccessToClass(classId);
  const canManageAttendance = isClassTeacher;

  const [classInfo, setClassInfo] = useState(null);
  const [students, setStudents] = useState([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [statusMap, setStatusMap] = useState({}); // studentId -> "Present"|"Absent"|"Leave" (draft, pre-submit only)
  const [submitting, setSubmitting] = useState(false);

  // ---- Date scope: which day's attendance are we looking at ----
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const isToday = selectedDate === todayStr();

  // ---- Existing saved records for the selected date (from Firestore,
  // not local draft state) — this is what determines "already submitted" ----
  const [savedRecords, setSavedRecords] = useState({}); // studentId -> record
  const [indexError, setIndexError] = useState(null);
  const alreadySubmitted = Object.keys(savedRecords).length > 0;

  const filteredStudents = useMemo(() => {
    const search = studentSearch.trim().toLowerCase();
    if (!search) return students;
    return students.filter((student) =>
      [student.name, student.rollNumber, student.studentId]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search)),
    );
  }, [students, studentSearch]);

  // ---- Correction request UI state ----
  const [requestingFor, setRequestingFor] = useState(null); // studentId currently choosing a correction
  const [requestedStatus, setRequestedStatus] = useState("Present");
  const [requestNote, setRequestNote] = useState("");
  const [sendingRequest, setSendingRequest] = useState(false);
  const [sentRequestIds, setSentRequestIds] = useState({}); // studentId -> true, this session

  useEffect(() => {
    const load = async () => {
      const snap = await getDoc(doc(db, "classes", classId));
      if (snap.exists()) setClassInfo({ id: snap.id, ...snap.data() });
    };
    load();
  }, [classId]);

  useEffect(() => {
    const q = query(collection(db, "students"), where("classId", "==", classId));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setStudents(list);
      setStatusMap((prev) => {
        const next = { ...prev };
        list.forEach((s) => {
          if (!next[s.id]) next[s.id] = "Present";
        });
        return next;
      });
    });
    return () => unsub();
  }, [classId]);

  // Live-load whatever's actually saved in Firestore for this class + the
  // selected date. This is the single source of truth for "submitted or
  // not" and for what the calendar shows on past dates.
  useEffect(() => {
    setIndexError(null);
    const q = query(
      collectionGroup(db, "attendance"),
      where("classId", "==", classId),
      where("date", "==", selectedDate),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const map = {};
        snap.forEach((d) => {
          const studentId = d.ref.parent.parent.id;
          map[studentId] = { id: d.id, ...d.data() };
        });
        setSavedRecords(map);
      },
      (err) => {
        console.error("Class attendance query failed:", err);
        setIndexError(err.message);
      },
    );
    return () => unsub();
  }, [classId, selectedDate]);

  const handleSubmitAttendance = async () => {
    if (
      !teacher?.id ||
      !canManageAttendance ||
      students.length === 0 ||
      alreadySubmitted
    )
      return;
    setSubmitting(true);
    try {
      const batch = writeBatch(db);
      students.forEach((s) => {
        const ref = doc(db, "students", s.id, "attendance", selectedDate);
        batch.set(ref, {
          date: selectedDate,
          status: statusMap[s.id] || "Present",
          classId,
          schoolId: teacher.schoolId,
          markedBy: teacher.id,
          createdAt: new Date().toISOString(),
        });
      });
      await batch.commit();
    } finally {
      setSubmitting(false);
    }
  };

  // Once a day is submitted, a teacher can no longer silently overwrite it.
  // Pressing a status instead opens a small correction-request panel that
  // goes to admin — who has the override tool already built in Attendance.jsx.
  const openCorrectionRequest = (studentId, currentStatus) => {
    setRequestingFor(studentId);
    setRequestedStatus(currentStatus === "Present" ? "Absent" : "Present");
    setRequestNote("");
  };

  const handleSendCorrectionRequest = async (student) => {
    if (!teacher?.id || !canManageAttendance) return;
    setSendingRequest(true);
    try {
      await addDoc(collection(db, "attendanceCorrectionRequests"), {
        schoolId: teacher.schoolId,
        classId,
        studentId: student.id,
        studentName: student.name,
        date: selectedDate,
        currentStatus: savedRecords[student.id]?.status || "Present",
        requestedStatus,
        note: requestNote.trim(),
        requestedByTeacherId: teacher.id,
        requestedByTeacherName: teacher.name,
        status: "pending",
        createdAt: serverTimestamp(),
      });
      setSentRequestIds((prev) => ({ ...prev, [student.id]: true }));
      setRequestingFor(null);
    } finally {
      setSendingRequest(false);
    }
  };

  // Phase 2: block teachers who have neither class-teacher nor
  // subject/timetable access to this class. classInfo has to have
  // resolved first so we don't flash this before the real check settles.
  if (classInfo && !hasAccess) {
    return (
      <div className="space-y-6 text-sm">
        <button
          onClick={() => navigate("/teacher/classes")}
          className="flex items-center gap-1 text-sm font-bold text-slate-500 hover:text-slate-800"
        >
          <ChevronLeft className="w-4 h-4" /> Back to My Classes
        </button>
        <div className="p-8 text-center bg-white rounded-2xl border border-dashed border-slate-200">
          <ShieldAlert className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-bold text-slate-600">
            You don't have access to this class.
          </p>
          <p className="text-xs text-slate-400 mt-1">
            You're only able to view classes you're the class teacher of, or
            classes you teach a subject in.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-sm">
      <button
        onClick={() => navigate("/teacher/classes")}
        className="flex items-center gap-1 text-sm font-bold text-slate-500 hover:text-slate-800"
      >
        <ChevronLeft className="w-4 h-4" /> Back to My Classes
      </button>

      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-950">
            Grade {classInfo?.gradeLevel} {classInfo?.section ? `— ${classInfo.section}` : ""}
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            {students.length} students ·{" "}
            {!isClassTeacher
              ? "Subject-only access — read only."
              : isToday
                ? "Mark today's attendance below."
                : "Viewing a past date — read only."}
          </p>
        </div>
        {isClassTeacher && (
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            max={todayStr()}
            className="w-full sm:w-auto bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold focus:outline-none focus:border-indigo-500 transition"
          />
        )}
      </div>

      {!isClassTeacher && (
        <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-[11px] text-amber-700 font-semibold flex items-start gap-2">
          <BookMarked className="w-4 h-4 shrink-0 mt-0.5" />
          You have subject-only access to this class
          {accessibleSubjects.length > 0
            ? ` (${accessibleSubjects.join(", ")})`
            : ""}
          . Attendance is managed by the class teacher.
        </div>
      )}

      {isClassTeacher && indexError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-[11px] text-red-700 font-semibold flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          Records aren't loading — Firestore needs a composite index
          (classId + date) for this query. Check the browser console for a
          "create index" link.
        </div>
      )}

      {isClassTeacher && isToday && alreadySubmitted && (
        <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-[11px] text-emerald-700 font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          Today's attendance is already submitted and locked. Spotted a
          mistake? Use "Request Correction" next to that student — the admin
          reviews and applies it.
        </div>
      )}

      <div className="bg-white border border-slate-100 rounded-2xl shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/40">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={studentSearch}
              onChange={(event) => setStudentSearch(event.target.value)}
              placeholder="Search students by name, roll number, or ID..."
              aria-label="Search students"
              className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm font-semibold text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>
        </div>

        <div className="p-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
          {filteredStudents.map((s) => {
            const saved = savedRecords[s.id];
            const displayStatus = isToday
              ? saved?.status || statusMap[s.id]
              : saved?.status;
            // Locked whenever there's a persisted record for this date —
            // true for any past date, and true for today once submitted.
            const locked = !!saved;

            return (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/teacher/classes/${classId}/students/${s.id}`)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    navigate(`/teacher/classes/${classId}/students/${s.id}`);
                  }
                }}
                className="p-5 rounded-2xl border border-slate-100 bg-slate-50/40 hover:bg-white hover:border-indigo-200 hover:shadow-md hover:-translate-y-0.5 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-200"
              >
                <div className="flex items-center justify-between gap-3">
                  <Link
                    to={`/teacher/classes/${classId}/students/${s.id}`}
                    onClick={(event) => event.stopPropagation()}
                    className="text-sm font-bold text-slate-900 hover:text-indigo-600"
                  >
                    {s.name}
                    <span className="block text-xs font-normal text-slate-400 mt-1">
                      Roll #{s.rollNumber}
                    </span>
                  </Link>

                  {canManageAttendance && !locked ? (
                    <div className="flex gap-1.5">
                      {["Present", "Absent", "Leave"].map((st) => (
                        <button
                          key={st}
                          onClick={(event) => {
                            event.stopPropagation();
                            setStatusMap((prev) => ({ ...prev, [s.id]: st }));
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                            statusMap[s.id] === st
                              ? st === "Present"
                                ? "bg-emerald-600 text-white border-emerald-600"
                                : st === "Absent"
                                  ? "bg-red-500 text-white border-red-500"
                                  : "bg-amber-500 text-white border-amber-500"
                              : "bg-slate-50 text-slate-500 border-slate-200"
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-black px-3 py-1.5 rounded-full uppercase ${
                          displayStatus === "Present"
                            ? "bg-emerald-50 text-emerald-700"
                            : displayStatus === "Absent"
                              ? "bg-red-50 text-red-600"
                              : displayStatus === "Leave"
                                ? "bg-amber-50 text-amber-700"
                                : "bg-slate-100 text-slate-400"
                        }`}
                      >
                        {displayStatus || "Not marked"}
                      </span>
                      {/* Correction requests, like attendance marking, are
                          restricted to the actual class teacher. */}
                      {canManageAttendance &&
                        locked &&
                        isToday &&
                        (sentRequestIds[s.id] ? (
                          <span className="text-[9px] font-bold text-indigo-500 uppercase">
                            Request Sent
                          </span>
                        ) : (
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              openCorrectionRequest(s.id, displayStatus);
                            }}
                            className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 uppercase underline decoration-dotted"
                          >
                            Request Correction
                          </button>
                        ))}
                    </div>
                  )}
                </div>

                {/* Inline correction request panel */}
                {canManageAttendance && requestingFor === s.id && (
                  <div
                    className="mt-4 p-4 bg-indigo-50/60 border border-indigo-100 rounded-xl space-y-2"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <p className="text-xs font-bold text-indigo-700 uppercase tracking-wider">
                      Request correction for {s.name}
                    </p>
                    <div className="flex gap-1.5">
                      {["Present", "Absent", "Leave"].map((st) => (
                        <button
                          key={st}
                          onClick={() => setRequestedStatus(st)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                            requestedStatus === st
                              ? "bg-indigo-600 text-white border-indigo-600"
                              : "bg-white text-slate-500 border-slate-200"
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={requestNote}
                      onChange={(e) => setRequestNote(e.target.value)}
                      placeholder="Optional note for admin (e.g. marked wrong by mistake)"
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                    />
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setRequestingFor(null)}
                        className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSendCorrectionRequest(s)}
                        disabled={sendingRequest}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold disabled:opacity-50"
                      >
                        <Send className="w-3 h-3" />
                        {sendingRequest ? "Sending..." : "Send to Admin"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {filteredStudents.length === 0 && (
            <p className="p-8 text-center text-slate-400 italic text-sm xl:col-span-2">
              {students.length === 0
                ? "No students in this class."
                : "No students match your search."}
            </p>
          )}
        </div>

        {canManageAttendance && isToday && !alreadySubmitted && (
          <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end">
            <button
              onClick={handleSubmitAttendance}
              disabled={submitting || students.length === 0}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Submit Today's Attendance"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
  

export default TeacherClassDetail;