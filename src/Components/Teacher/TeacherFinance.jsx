import React, { useContext, useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { CalendarDays, Tags, Wallet, TrendingUp } from "lucide-react";
import { TeacherPortalContext } from "../../Pages/TeacherPortal";

// READ-ONLY finance view for the logged-in teacher.
//
// Security model: every value shown here comes from context set up by
// TeacherPortal.jsx (already live-synced off the teacher's own auth
// session), and every Firestore query is additionally filtered by BOTH
// schoolId and teacherId — never just teacherId alone. There is no
// addDoc/updateDoc/deleteDoc anywhere in this file on purpose: teachers
// can view their pay, not edit it.
//
// Firestore paths read (same source of truth as TeacherSalaryLedger.jsx /
// Finance.jsx on the admin side):
//   teachers/{teacherId}                              -> salary.daily, salary.monthly, schoolId
//   teachers/{teacherId}/salaryPayments/{paymentId}    -> { amount, date, type, note, schoolId }

const TeacherFinance = () => {
  const { teacher, session } = useContext(TeacherPortalContext) || {};

  // Both must come from the authenticated session/teacher doc — never
  // from props, query params, or anything else a teacher could tamper with.
  const teacherId = teacher?.id || session?.teacherId || null;
  const schoolId = teacher?.schoolId || session?.schoolId || null;

  const [salaryHistory, setSalaryHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  useEffect(() => {
    if (!teacherId || !schoolId) {
      setSalaryHistory([]);
      setIsLoadingHistory(false);
      return;
    }

    // Path is already scoped to this teacherId; the where("schoolId", ...)
    // clause is a second, belt-and-suspenders check against that teacher's
    // own school, so a payment record can never render unless it matches
    // both identifiers from the authenticated session.
    const q = query(
      collection(db, "teachers", teacherId, "salaryPayments"),
      where("schoolId", "==", schoolId),
      orderBy("date", "desc"),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const logs = [];
        snap.forEach((d) => logs.push({ id: d.id, ...d.data() }));
        setSalaryHistory(logs);
        setIsLoadingHistory(false);
      },
      (err) => {
        console.error("Error loading salary history:", err);
        setIsLoadingHistory(false);
      },
    );
    return () => unsub();
  }, [teacherId, schoolId]);

  const totalPaid = salaryHistory.reduce(
    (sum, e) => sum + Number(e.amount || 0),
    0,
  );

  if (!teacherId || !schoolId) {
    return (
      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
        <p className="text-slate-400 italic text-[11px]">
          Unable to load your finance details right now.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 text-xs text-slate-700">
      {/* Base Salary Cards — view only, no edit controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide flex items-center gap-1.5">
            <Wallet className="w-3.5 h-3.5" />
            Daily Rate
          </span>
          <h4 className="text-xl font-black text-slate-900 font-mono mt-2">
            Rs.{" "}
            {teacher?.salary?.daily != null
              ? Number(teacher.salary.daily).toLocaleString()
              : "—"}
          </h4>
        </div>
        <div className="bg-indigo-50/40 border border-indigo-100 rounded-2xl p-5 shadow-xs">
          <span className="text-[10px] text-indigo-600 font-bold uppercase tracking-wide flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" />
            Monthly Base Salary
          </span>
          <h4 className="text-xl font-black text-indigo-600 font-mono mt-2">
            Rs.{" "}
            {teacher?.salary?.monthly != null
              ? Number(teacher.salary.monthly).toLocaleString()
              : "—"}
          </h4>
        </div>
      </div>

      {/* Salary Payment Ledger — strictly read-only */}
      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs space-y-4">
        <div>
          <h4 className="text-sm font-black text-slate-900">
            Salary Payment Ledger
          </h4>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Total disbursed to date:{" "}
            <span className="font-mono font-bold text-emerald-600">
              Rs. {totalPaid.toLocaleString()}
            </span>
          </p>
        </div>

        {isLoadingHistory ? (
          <p className="text-slate-400 italic text-[11px] py-4">
            Loading payment history...
          </p>
        ) : salaryHistory.length === 0 ? (
          <p className="text-slate-400 italic text-[11px] py-4">
            No salary payments recorded yet.
          </p>
        ) : (
          <div className="space-y-1.5">
            {salaryHistory.map((entry) => (
              <div
                key={entry.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] bg-slate-50 p-3 rounded-xl border border-slate-100"
              >
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="text-slate-500 flex items-center gap-1.5 font-mono">
                    <CalendarDays className="w-3.5 h-3.5" />
                    {entry.date}
                  </span>
                  <span className="font-bold text-slate-600 flex items-center gap-1.5">
                    <Tags className="w-3.5 h-3.5" />
                    {entry.type || "Monthly Salary"}
                  </span>
                  {entry.note && (
                    <span className="text-slate-400 italic">
                      {entry.note}
                    </span>
                  )}
                </div>

                <div className="shrink-0">
                  <span className="font-mono text-emerald-600 font-bold">
                    + Rs. {Number(entry.amount || 0).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TeacherFinance;