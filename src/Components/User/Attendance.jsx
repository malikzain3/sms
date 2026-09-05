import React, { useState, useEffect } from "react";
import {
  collection,
  collectionGroup,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  getDocs,
} from "firebase/firestore";
import { db, auth } from "../../firebaseConfig";
import Header from "./Header";
import { TriangleAlert } from "lucide-react";
import PageLoader from "./PageLoader";

const todayStr = () => new Date().toISOString().split("T")[0];

const parentCollectionOf = (docRef) => docRef.parent.parent.parent.id;

const Attendance = () => {
  const session = JSON.parse(localStorage.getItem("schoolix_session"));
  const schoolId = session?.schoolId || "default_school";

  const [tab, setTab] = useState("students");
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [searchTerm, setSearchTerm] = useState("");

  return (
    <div className="space-y-3 sm:space-y-4 xl:space-y-6 w-full px-2 sm:px-0">
      <Header />
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2.5 sm:gap-3">
        <div>
          <h2 className="text-base sm:text-lg xl:text-xl font-bold text-slate-900 tracking-tight">
            Attendance Registry
          </h2>
          <p className="text-[11px] sm:text-xs xl:text-sm text-slate-500 mt-0.5 max-w-xl">
            Student attendance is marked by the Period-1 teacher from the
            portal. Teacher attendance is self check-in/out. Admin can review
            and correct either here.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit shrink-0">
          {[
            { id: "students", label: "Student Attendance" },
            { id: "teachers", label: "Teacher Attendance" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-2.5 sm:px-3.5 xl:px-4 py-1.5 sm:py-2 rounded-lg text-[10px] sm:text-xs font-bold transition whitespace-nowrap ${
                tab === t.id
                  ? "bg-white text-indigo-600 shadow-xs"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "students" ? (
        <StudentAttendanceTab
          schoolId={schoolId}
          selectedDate={selectedDate}
          searchTerm={searchTerm}
        />
      ) : (
        <TeacherAttendanceTab
          schoolId={schoolId}
          selectedDate={selectedDate}
          searchTerm={searchTerm}
        />
      )}
    </div>
  );
};

// ============================================================
// STUDENT ATTENDANCE TAB
// ============================================================
const StudentAttendanceTab = ({ schoolId, selectedDate, searchTerm }) => {
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState("all");
  const [students, setStudents] = useState([]);
  const [recordsByStudent, setRecordsByStudent] = useState({});
  const [saving, setSaving] = useState(null); // studentId currently saving
  const [correctionRequests, setCorrectionRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  // Listen to pending correction requests
  useEffect(() => {
    if (!schoolId) return;
    const q = query(
      collection(db, "attendanceCorrectionRequests"),
      where("schoolId", "==", schoolId),
      where("status", "==", "pending"),
    );
    const unsub = onSnapshot(q, (snap) => {
      setCorrectionRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [schoolId]);

  // Load classes for the picker
  useEffect(() => {
    const q = query(
      collection(db, "classes"),
      where("schoolId", "==", schoolId),
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setClasses(list);
    });
    return () => unsub();
  }, [schoolId]);

  // Load students in the selected class
  useEffect(() => {
    const q =
      selectedClassId === "all"
        ? query(collection(db, "students"), where("schoolId", "==", schoolId))
        : query(
            collection(db, "students"),
            where("classId", "==", selectedClassId),
          );
    const unsub = onSnapshot(q, (snap) => {
      setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, [schoolId, selectedClassId]);

  // Load attendance records for this class + date via collectionGroup
  const [indexError, setIndexError] = useState(null);
  useEffect(() => {
    setIndexError(null);
    const q =
      selectedClassId === "all"
        ? query(
            collectionGroup(db, "attendance"),
            where("schoolId", "==", schoolId),
            where("date", "==", selectedDate),
          )
        : query(
            collectionGroup(db, "attendance"),
            where("classId", "==", selectedClassId),
            where("date", "==", selectedDate),
          );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const map = {};
        snap.forEach((d) => {
          // studentId is the id of the parent doc (students/{studentId}/attendance/{date})
          const studentId = d.ref.parent.parent.id;
          map[studentId] = { id: d.id, ...d.data() };
        });
        setRecordsByStudent(map);
      },
      (err) => {
        // A missing composite index makes this query fail silently to the
        // eye (empty results forever) unless we surface the error — Firestore
        // puts a direct "create this index" link right in err.message.
        console.error("Student attendance collectionGroup query failed:", err);
        setIndexError(err.message);
      },
    );
    return () => unsub();
  }, [schoolId, selectedClassId, selectedDate]);

  const totalStudents = students.length;
  const presentCount = students.filter(
    (s) => recordsByStudent[s.id]?.status === "Present",
  ).length;
  const absentCount = students.filter(
    (s) => recordsByStudent[s.id]?.status === "Absent",
  ).length;
  const leaveCount = students.filter(
    (s) => recordsByStudent[s.id]?.status === "Leave",
  ).length;
  const unmarkedCount = totalStudents - presentCount - absentCount - leaveCount;

  // Admin correction — overwrites/creates the record directly.
  const handleAdminSetStatus = async (
    studentId,
    classId,
    status,
    requestId = null,
  ) => {
    setSaving(studentId);
    try {
      await setDoc(doc(db, "students", studentId, "attendance", selectedDate), {
        date: selectedDate,
        status,
        classId,
        schoolId,
        markedBy: auth.currentUser?.uid || "admin",
        correctedByAdmin: true,
        createdAt: new Date().toISOString(),
      });
      if (requestId) {
        await setDoc(
          doc(db, "attendanceCorrectionRequests", requestId),
          { status: "approved" },
          { merge: true },
        );
      }
    } finally {
      setSaving(null);
    }
  };

  const filteredStudents = students.filter((s) => {
    if (!searchTerm || !searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase().replace(/\s+/g, "");
    return (
      (s.name || "").toLowerCase().replace(/\s+/g, "").includes(q) ||
      (s.rollNumber || "").toString().toLowerCase().includes(q)
    );
  });

  if (loading) return <PageLoader label="Loading profiles..." />;

  return (
    <div className="space-y-3 sm:space-y-4">
      <select
        value={selectedClassId}
        onChange={(e) => setSelectedClassId(e.target.value)}
        className="w-full sm:w-auto bg-white border border-slate-200 rounded-xl px-3 sm:px-3.5 py-1.5 sm:py-2 text-[11px] sm:text-xs font-bold focus:outline-none focus:border-indigo-500"
      >
        <option value="all">All Classes</option>
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.className} {c.section ? `— ${c.section}` : ""}
          </option>
        ))}
        {classes.length === 0 && <option>No classes yet</option>}
      </select>

      {/* Live Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 sm:gap-3 xl:gap-4">
        <StatCard label="Total Strength" value={totalStudents} color="slate" />
        <StatCard label="Present" value={presentCount} color="emerald" />
        <StatCard label="Absent" value={absentCount} color="red" />
        <StatCard label="On Leave" value={leaveCount} color="amber" />
        <StatCard label="Not Marked Yet" value={unmarkedCount} color="indigo" />
      </div>

      {indexError && (
        <div className="p-2.5 sm:p-3 bg-red-50 border border-red-200 rounded-xl text-[10px] sm:text-[11px] text-red-700 font-semibold">
          Unable to load student attendance data. Please check your network
          connection and try again.
        </div>
      )}

      {unmarkedCount === totalStudents && totalStudents > 0 && (
        <div className="p-2.5 sm:p-3 bg-amber-50 border border-amber-100 rounded-xl text-[10px] sm:text-[11px] text-amber-700 font-semibold">
          No teacher has submitted attendance for this class on {selectedDate}{" "}
          yet. You can mark it directly below if needed.
        </div>
      )}

      {/* Roster Table */}
      <div className="w-full bg-white border border-slate-100 rounded-xl sm:rounded-2xl overflow-x-auto shadow-xs">
        <table className="w-full min-w-162.5 text-left text-xs table-auto">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50 text-slate-500 font-bold uppercase tracking-wider text-[9px] sm:text-[10px] xl:text-xs">
              <th className="p-2.5 sm:p-3 xl:p-4 w-2/5">Student Detail</th>
              <th className="p-2.5 sm:p-3 xl:p-4 w-1/5">Roll ID</th>
              <th className="p-2.5 sm:p-3 xl:p-4 text-center w-2/5">
                Status (admin can override)
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {filteredStudents.map((s) => {
              const record = recordsByStudent[s.id];
              const status = record?.status || null;

              // Check if this specific student has a pending request
              const pendingReq = correctionRequests.find(
                (r) => r.studentId === s.id,
              );

              return (
                <tr key={s.id} className="hover:bg-slate-50/50 transition">
                  <td className="p-2.5 sm:p-3 xl:p-4">
                    <p className="font-medium text-xs sm:text-sm text-slate-950">
                      {s.name}
                    </p>

                    {/* Correction by admin tag */}
                    {record?.correctedByAdmin && (
                      <p className="text-[10px] sm:text-[12px] text-indigo-500 font-bold uppercase mt-0.5">
                        Corrected by admin
                      </p>
                    )}

                    {/* 🔥 INLINE SUB-BAR: Pending Request Alert for this Student */}
                    {pendingReq && (
                      <div className="mt-2 p-2.5 sm:p-3 bg-amber-50 border border-amber-200 rounded-lg text-[11px] sm:text-[13px] flex flex-col xs:flex-row items-start xs:items-center justify-between gap-2 sm:gap-3">
                        {/* Left Side: Text Info */}
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-1 font-bold text-amber-800">
                            <TriangleAlert className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                            <span>
                              Request: Set to{" "}
                              <span className="underline">
                                {pendingReq.requestedStatus}
                              </span>
                            </span>
                          </div>
                          <p className="text-slate-500 truncate">
                            By {pendingReq.requestedByTeacherName}: "
                            {pendingReq.note || "No note"}"
                          </p>
                        </div>

                        {/* Right Side: Vertically Centered Button */}
                        <button
                          onClick={() =>
                            handleAdminSetStatus(
                              s.id,
                              s.classId,
                              pendingReq.requestedStatus,
                              pendingReq.id,
                            )
                          }
                          className="shrink-0 px-2.5 sm:px-3 py-1 sm:py-1.5 bg-emerald-600 text-white font-bold rounded text-[11px] sm:text-[13px] hover:bg-emerald-700 transition"
                        >
                          Approve Request
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="p-2.5 sm:p-3 xl:p-4 font-mono font-semibold text-slate-500 text-[13px] sm:text-[15px] xl:text-[16px]">
                    {s.rollNumber}
                  </td>
                  <td className="p-2.5 sm:p-3 xl:p-4">
                    <div className="flex flex-wrap sm:flex-nowrap justify-center gap-1 sm:gap-1.5 xl:gap-2">
                      {["Present", "Absent", "Leave"].map((opt) => (
                        <button
                          key={opt}
                          onClick={() =>
                            handleAdminSetStatus(s.id, s.classId, opt)
                          }
                          disabled={saving === s.id}
                          className={`px-2 py-1 sm:px-2.5 sm:py-1 xl:px-3 xl:py-1.5 rounded-lg text-[10px] sm:text-xs font-bold transition border disabled:opacity-50 ${
                            status === opt
                              ? opt === "Present"
                                ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                                : opt === "Absent"
                                  ? "bg-red-500 text-white border-red-500 shadow-xs"
                                  : "bg-amber-500 text-white border-amber-500 shadow-xs"
                              : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// TEACHER ATTENDANCE TAB
const TeacherAttendanceTab = ({ schoolId, selectedDate, searchTerm }) => {
  const [teachers, setTeachers] = useState([]);
  const [recordsByTeacher, setRecordsByTeacher] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, "teachers"),
      where("schoolId", "==", schoolId),
    );
    const unsub = onSnapshot(q, (snap) => {
      setTeachers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, [schoolId]);

  const [teacherIndexError, setTeacherIndexError] = useState(null);
  useEffect(() => {
    setTeacherIndexError(null);
    const q = query(
      collectionGroup(db, "attendance"),
      where("schoolId", "==", schoolId),
      where("date", "==", selectedDate),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const map = {};
        snap.forEach((d) => {
          if (parentCollectionOf(d.ref) !== "teachers") return; // skip student records
          const teacherId = d.ref.parent.parent.id;
          map[teacherId] = { id: d.id, ...d.data() };
        });
        setRecordsByTeacher(map);
      },
      (err) => {
        console.error("Teacher attendance collectionGroup query failed:", err);
        setTeacherIndexError(err.message);
      },
    );
    return () => unsub();
  }, [schoolId, selectedDate]);

  const presentCount = teachers.filter(
    (t) => recordsByTeacher[t.id]?.checkInTime,
  ).length;
  const absentCount = teachers.length - presentCount;

  const filteredTeachers = teachers.filter((t) => {
    if (!searchTerm || !searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase().replace(/\s+/g, "");
    return (
      (t.name || t.fullName || "")
        .toLowerCase()
        .replace(/\s+/g, "")
        .includes(q) ||
      (t.designation || "").toLowerCase().replace(/\s+/g, "").includes(q) ||
      (t.primarySubject || "").toLowerCase().replace(/\s+/g, "").includes(q)
    );
  });

  if (loading) return <PageLoader label="Loading profiles..." />;

  return (
    <div className="space-y-3 sm:space-y-4">
      {teacherIndexError && (
        <div className="p-2.5 sm:p-3 bg-red-50 border border-red-200 rounded-xl text-[10px] sm:text-[11px] text-red-700 font-semibold">
          Unable to load attendance data. Please check your network connection
          and try again.
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 sm:gap-3 xl:gap-4">
        <StatCard label="Total Faculty" value={teachers.length} color="slate" />
        <StatCard label="Checked In" value={presentCount} color="emerald" />
        <StatCard label="Not Checked In" value={absentCount} color="red" />
      </div>

      <div className="w-full bg-white border border-slate-100 rounded-xl sm:rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto w-full">
          <table className="w-full min-w-125 sm:min-w-0 text-left text-xs table-auto">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 text-slate-500 font-bold uppercase tracking-wider text-[10px] sm:text-[11px] xl:text-[13px]">
                <th className="p-2.5 sm:p-3 xl:p-4 w-1/3">Teacher Name</th>
                <th className="p-2.5 sm:p-3 xl:p-4 w-1/3 text-center">
                  Check-In Time
                </th>
                <th className="p-2.5 sm:p-3 xl:p-4 w-1/3 text-center">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredTeachers.map((t) => {
                const record = recordsByTeacher[t.id];
                const isCheckedIn = !!record?.checkInTime;

                return (
                  <tr key={t.id} className="hover:bg-slate-50/50 transition">
                    <td className="p-2.5 sm:p-3 xl:p-4 font-medium text-[12px] sm:text-[13px] xl:text-[15px] text-slate-950">
                      {t.name || t.fullName || "Teacher"}
                    </td>
                    <td className="p-2.5 sm:p-3 xl:p-4 text-center font-mono text-slate-500 text-[12px] sm:text-[13px] xl:text-[15px]">
                      {record?.checkInTime || "—"}
                    </td>
                    <td className="p-2.5 sm:p-3 xl:p-4 text-center">
                      <span
                        className={`px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full text-[11px] sm:text-[13px] font-bold ${
                          isCheckedIn
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {isCheckedIn ? "Present" : "Absent"}
                      </span>
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
const colorMap = {
  slate: "bg-white border-slate-100 text-slate-800",
  emerald: "bg-emerald-50/40 border-emerald-100/50 text-emerald-700",
  red: "bg-red-50/40 border-red-100/50 text-red-600",
  amber: "bg-amber-50/40 border-amber-100/50 text-amber-700",
  indigo: "bg-indigo-50/40 border-indigo-100/50 text-indigo-700",
};

const StatCard = ({ label, value, color }) => (
  <div
    className={`border p-2.5 sm:p-3 xl:p-4 rounded-xl sm:rounded-2xl shadow-xs ${colorMap[color]}`}
  >
    <span className="text-[9px] sm:text-[10px] xl:text-xs font-bold uppercase tracking-wider opacity-80 block truncate">
      {label}
    </span>
    <p className="text-sm sm:text-base xl:text-xl font-black mt-0.5">{value}</p>
  </div>
);

export default Attendance;
