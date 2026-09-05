import React, { useContext, useEffect, useState } from "react";
import {
  doc,
  setDoc,
  onSnapshot,
  collection,
  query,
  orderBy,
  limit,
} from "firebase/firestore";
import { TeacherPortalContext } from "../../Pages/TeacherPortal";
import { db } from "../../firebaseConfig";
import { Clock, LogIn, LogOut, CalendarDays } from "lucide-react";

const todayStr = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const timeStr = () =>
  new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

const TeacherAttendance = () => {
  const { teacher } = useContext(TeacherPortalContext);
  const [todayRecord, setTodayRecord] = useState(null);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (!teacher?.id) return;
    const unsub = onSnapshot(
      doc(db, "teachers", teacher.id, "attendance", todayStr()),
      (snap) => setTodayRecord(snap.exists() ? snap.data() : null),
    );
    return () => unsub();
  }, [teacher?.id]);

  // Full history — every past check-in/out, most recent first. This is
  // what makes the page feel like a real record instead of "empty, empty"
  // once today's card rolls over tomorrow.
  useEffect(() => {
    if (!teacher?.id) return;
    const q = query(
      collection(db, "teachers", teacher.id, "attendance"),
      orderBy("date", "desc"),
      limit(30),
    );
    const unsub = onSnapshot(q, (snap) => {
      setHistory(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [teacher?.id]);

  const handleCheckIn = async () => {
    if (!teacher?.id) return;
    setSaving(true);
    try {
      await setDoc(doc(db, "teachers", teacher.id, "attendance", todayStr()), {
        date: todayStr(),
        schoolId: teacher.schoolId || teacher.school_id || "", // Ensure schoolId is present
        teacherId: teacher.id,
        checkInTime: timeStr(),
        status: "Present",
        markedBy: "self",
        createdAt: new Date().toISOString(),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCheckOut = async () => {
    if (!teacher?.id || !todayRecord) return;
    setSaving(true);
    try {
      await setDoc(
        doc(db, "teachers", teacher.id, "attendance", todayStr()),
        { checkOutTime: timeStr() },
        { merge: true },
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
          <Clock className="w-6 h-6" />
        </div>
        <div>
          <p className="text-xs text-slate-400">Today</p>
          <p className="text-sm font-bold text-slate-900">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>

        {!todayRecord ? (
          <button
            onClick={handleCheckIn}
            disabled={saving}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <LogIn className="w-4 h-4" />
            {saving ? "Checking in..." : "Check In"}
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-center gap-6 text-xs">
              <div>
                <p className="text-slate-400 font-bold uppercase text-[10px]">
                  Checked In
                </p>
                <p className="font-mono font-bold text-emerald-600">
                  {todayRecord.checkInTime}
                </p>
              </div>
              {todayRecord.checkOutTime && (
                <div>
                  <p className="text-slate-400 font-bold uppercase text-[10px]">
                    Checked Out
                  </p>
                  <p className="font-mono font-bold text-rose-500">
                    {todayRecord.checkOutTime}
                  </p>
                </div>
              )}
            </div>

            {!todayRecord.checkOutTime && (
              <button
                onClick={handleCheckOut}
                disabled={saving}
                className="w-full py-3 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <LogOut className="w-4 h-4" />
                {saving ? "Checking out..." : "Check Out"}
              </button>
            )}
          </div>
        )}
      </div>

      <p className="text-[10px] text-slate-400 text-center">
        Your check-in/out is visible to the school admin and cannot be edited
        after checkout. Contact admin if a correction is needed.
      </p>

      {/* Full history — new day always gets a fresh card above, but the
          record itself never disappears; it just moves down into this list. */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-indigo-600" />
          <h3 className="text-sm font-bold text-slate-900">
            Attendance History
          </h3>
        </div>
        <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
          {history.length === 0 && (
            <p className="p-6 text-xs text-slate-400 italic text-center">
              No attendance recorded yet.
            </p>
          )}
          {history.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between p-4 text-xs"
            >
              <div>
                <p className="font-bold text-slate-900">
                  {new Date(r.date).toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
                {r.correctedByAdmin && (
                  <p className="text-[9px] text-indigo-500 font-bold uppercase mt-0.5">
                    Corrected by admin
                  </p>
                )}
              </div>
              <div className="flex gap-5 font-mono">
                <div className="text-center">
                  <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">
                    In
                  </p>
                  <p className="text-emerald-600 font-bold">
                    {r.checkInTime || "—"}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">
                    Out
                  </p>
                  <p className="text-rose-500 font-bold">
                    {r.checkOutTime || "—"}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TeacherAttendance;
