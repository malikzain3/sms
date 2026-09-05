import React, { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "../../firebaseConfig";

// Same convention as TeacherSalaryLedger: teacherId + teacherData, self-contained.
const TeacherAttendanceTab = ({ teacherId, teacherData }) => {
  const [attendanceScope, setAttendanceScope] = useState("all");
  const [attendanceRecords, setAttendanceRecords] = useState([]);

  // Real attendance history — own fetch + scope filtering, owned entirely by this tab.
  useEffect(() => {
    const q = query(
      collection(db, "teachers", teacherId, "attendance"),
      orderBy("date", "desc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      setAttendanceRecords(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [teacherId]);

  // Filters attendanceRecords down to the selected scope window.
  const getRecordsInScope = () => {
    if (attendanceScope === "all") return attendanceRecords;
    const now = new Date();
    const cutoff = new Date();
    if (attendanceScope === "daily") cutoff.setDate(now.getDate() - 1);
    else if (attendanceScope === "weekly") cutoff.setDate(now.getDate() - 7);
    else if (attendanceScope === "monthly") cutoff.setMonth(now.getMonth() - 1);
    else if (attendanceScope === "yearly") cutoff.setFullYear(now.getFullYear() - 1);
    return attendanceRecords.filter((r) => new Date(r.date) >= cutoff);
  };
  const scopedRecords = getRecordsInScope();
  const presentCount = scopedRecords.filter((r) => r.status === "Present" || r.status === "Late").length;
  const absentCount = scopedRecords.filter((r) => r.status === "Absent").length;
  const leaveCount = scopedRecords.filter((r) => r.status === "Leave").length;

  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-6 space-y-6 shadow-xs">
      <div className="flex justify-between items-center bg-slate-50 p-2 rounded-xl border border-slate-100">
        <span className="text-xs font-bold text-slate-500 px-2">
          Attendance Resolution Analysis
        </span>
        <div className="flex gap-1">
          {["daily", "weekly", "monthly", "yearly", "all"].map(
            (scope) => (
              <button
                key={scope}
                onClick={() => setAttendanceScope(scope)}
                className={`px-3 py-1 rounded-lg font-black text-[12px] uppercase tracking-wide transition ${
                  attendanceScope === scope
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                }`}
              >
                {scope}
              </button>
            ),
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 text-center">
        <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-800">
          <span className="text-2xl font-black font-mono">
            {presentCount}
          </span>
          <p className="text-[10px] font-bold uppercase tracking-wider mt-1 opacity-80">
            Days Present
          </p>
        </div>
        <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl text-rose-700">
          <span className="text-2xl font-black font-mono">
            {absentCount}
          </span>
          <p className="text-[10px] font-bold uppercase tracking-wider mt-1 opacity-80">
            Absences Flagged
          </p>
        </div>
        <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl text-amber-700">
          <span className="text-2xl font-black font-mono">
            {leaveCount}
          </span>
          <p className="text-[10px] font-bold uppercase tracking-wider mt-1 opacity-80">
            Approved Leaves
          </p>
        </div>
      </div>

      {/* Daily check-in/out log */}
      <div className="border border-slate-100 rounded-xl overflow-hidden">
        <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
          {scopedRecords.length === 0 && (
            <p className="p-4 text-[15px] text-slate-400 italic text-center">
              No attendance records in this range yet.
            </p>
          )}
          {scopedRecords.map((r) => (
            <div
              key={r.id}
              className="flex justify-between items-center px-4 py-2.5 text-[15px]"
            >
              <span className="font-mono text-slate-500">{r.date}</span>
              <span className="font-mono text-slate-400">
                {r.checkInTime || "—"} → {r.checkOutTime || "—"}
              </span>
              <span
                className={`font-bold px-2 py-0.5 rounded-full text-[13px] ${
                  r.status === "Present"
                    ? "bg-emerald-50 text-emerald-700"
                    : r.status === "Absent"
                      ? "bg-rose-50 text-rose-700"
                      : "bg-amber-50 text-amber-700"
                }`}
              >
                {r.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TeacherAttendanceTab;
