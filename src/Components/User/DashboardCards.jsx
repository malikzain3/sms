import React, { useState, useEffect } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
  doc,
} from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { motion } from "framer-motion";
import { Users, UserRound, Briefcase, Wallet } from "lucide-react";

const FINANCE_MONTH_STORAGE_KEY = "schoolix_finance_month";

const DashboardCards = () => {
  const [totalStudents, setTotalStudents] = useState(0);
  const [totalTeachers, setTotalTeachers] = useState(0);
  const [feesAwaitingCount, setFeesAwaitingCount] = useState(0);
  const [monthlyCollection, setMonthlyCollection] = useState(0);
  const [monthlySalaryPaid, setMonthlySalaryPaid] = useState(0);
  const [monthlyGeneralExpenses, setMonthlyGeneralExpenses] = useState(0);
  const [monthlyNetMargin, setMonthlyNetMargin] = useState(0);
  const [selectedMonth, setSelectedMonth] = useState(
    () =>
      localStorage.getItem(FINANCE_MONTH_STORAGE_KEY) ||
      new Date().toISOString().slice(0, 7),
  );
  const [loading, setLoading] = useState(true);
  const [statsLoaded, setStatsLoaded] = useState(false);
  const [expensesLoaded, setExpensesLoaded] = useState(false);

  const session = JSON.parse(localStorage.getItem("schoolix_session"));
  const currentSchoolId = session?.schoolId || "default_school";

  useEffect(() => {
    const handleFinanceMonthChange = (event) => {
      if (event.detail) setSelectedMonth(event.detail);
    };
    const handleStorageChange = (event) => {
      if (event.key === FINANCE_MONTH_STORAGE_KEY && event.newValue) {
        setSelectedMonth(event.newValue);
      }
    };
    window.addEventListener("finance-month-change", handleFinanceMonthChange);
    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.removeEventListener("finance-month-change", handleFinanceMonthChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  useEffect(() => {
    setLoading(true);
    setStatsLoaded(false);
    setExpensesLoaded(false);

    // 1. Live Students Snapshot & Fees Awaiting Calculation
    const qStudents = query(
      collection(db, "students"),
      where("schoolId", "==", currentSchoolId),
    );
    const unsubscribeStudents = onSnapshot(
      qStudents,
      (snapshot) => {
        setTotalStudents(snapshot.size);

        // Live Filter: Count students who are Unpaid or Partial
        let awaitingCount = 0;
        snapshot.forEach((doc) => {
          const status = doc.data().feeStatus;
          if (status === "Unpaid" || status === "Partial") {
            awaitingCount++;
          }
        });
        setFeesAwaitingCount(awaitingCount);
      },
      (err) => console.error("Students snapshot fail:", err),
    );

    // 2. Live Active Teachers Snapshot Stream
    const qTeachers = query(
      collection(db, "teachers"),
      where("schoolId", "==", currentSchoolId),
    );
    const unsubscribeTeachers = onSnapshot(
      qTeachers,
      (snapshot) => {
        setTotalTeachers(snapshot.size);
      },
      (err) => console.error("Teachers snapshot fail:", err),
    );

    // 3. Live Monthly Fees Collection — reads one small aggregate document
    // (schools/{schoolId}/monthlyStats/{yyyy-mm}) instead of streaming every
    // feePayments record across every student. That aggregate is kept in
    // sync atomically by StudentFeeLedger.jsx whenever a payment is added,
    // edited, or deleted, so this scales the same whether the school has
    // 10 students or 10,000.
    const statsRef = doc(
      db,
      "schools",
      currentSchoolId,
      "monthlyStats",
      selectedMonth,
    );

    const unsubscribePayments = onSnapshot(
      statsRef,
      (snap) => {
        const totalCollected = snap.exists() ? Number(snap.data().totalCollected || 0) : 0;
        setMonthlyCollection(totalCollected);
        setStatsLoaded(true);
      },
      (err) => {
        console.error("Monthly stats snapshot fail:", err);
        setStatsLoaded(true);
      },
    );

    // Live Monthly Expenses (salaries + general expenses) for the same month
    const expensesRef = doc(
      db,
      "schools",
      currentSchoolId,
      "monthlyExpenses",
      selectedMonth,
    );
    const unsubscribeExpenses = onSnapshot(
      expensesRef,
      (snap) => {
        const totalSalary = snap.exists() ? Number(snap.data().totalSalaryPaid || 0) : 0;
        const totalGeneral = snap.exists() ? Number(snap.data().totalGeneralExpenses || 0) : 0;
        setMonthlySalaryPaid(totalSalary);
        setMonthlyGeneralExpenses(totalGeneral);
        setExpensesLoaded(true);
      },
      (err) => {
        console.error("Monthly expenses snapshot fail:", err);
        setExpensesLoaded(true);
      },
    );

    return () => {
      unsubscribeStudents();
      unsubscribeTeachers();
      unsubscribePayments();
      unsubscribeExpenses();
    };
  }, [currentSchoolId, selectedMonth]);

  useEffect(() => {
    setMonthlyNetMargin(
      monthlyCollection - (monthlySalaryPaid + monthlyGeneralExpenses),
    );
  }, [monthlyCollection, monthlySalaryPaid, monthlyGeneralExpenses]);

  useEffect(() => {
    if (statsLoaded && expensesLoaded) setLoading(false);
  }, [statsLoaded, expensesLoaded]);

  // Percentage Calculation for the Circular Ring
  const awaitingPercentage =
    totalStudents > 0
      ? Math.round((feesAwaitingCount / totalStudents) * 100)
      : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 25 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 }}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 xl:gap-4">
  {/* Card 1: Total Students */}
  <div className="group bg-indigo-50/60 hover:bg-indigo-50/90 p-3.5 xl:p-4 rounded-xl border border-indigo-100/80 flex items-center space-x-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:shadow-indigo-300/20">
    <div className="w-9 h-9 xl:w-10 xl:h-10 bg-indigo-600 rounded-lg xl:rounded-xl flex items-center justify-center text-white shadow-xs shadow-indigo-200 group-hover:scale-105 transition-transform duration-200 shrink-0">
      <Users className="w-4 h-4 xl:w-5 xl:h-5" />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-[10px] xl:text-[11px] text-indigo-950/60 font-black uppercase tracking-wider truncate">
        Total Students
      </p>
      <h3 className="text-lg xl:text-xl font-extrabold text-slate-900 mt-0.5 font-mono">
        {loading ? "..." : totalStudents.toLocaleString()}
      </h3>
    </div>
  </div>

  {/* Card 2: Active Teachers */}
  <div className="group bg-purple-50/60 hover:bg-purple-50/90 p-3.5 xl:p-4 rounded-xl border border-purple-100/80 flex items-center space-x-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:shadow-purple-300/20">
    <div className="w-9 h-9 xl:w-10 xl:h-10 bg-purple-600 rounded-lg xl:rounded-xl flex items-center justify-center text-white shadow-xs shadow-purple-200 group-hover:scale-105 transition-transform duration-200 shrink-0">
      <UserRound className="w-4 h-4 xl:w-5 xl:h-5" />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-[10px] xl:text-[11px] text-purple-950/60 font-black uppercase tracking-wider truncate">
        Active Teachers
      </p>
      <h3 className="text-lg xl:text-xl font-extrabold text-slate-900 mt-0.5 font-mono">
        {loading ? "..." : totalTeachers.toLocaleString()}
      </h3>
    </div>
  </div>

  {/* Card 3: Fees Awaiting Payment */}
  <div className="group bg-amber-50/60 hover:bg-amber-50/90 p-3.5 xl:p-4 rounded-xl border border-amber-100/80 flex items-center space-x-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:shadow-amber-300/20">
    <div className="w-9 h-9 xl:w-10 xl:h-10 bg-amber-500 rounded-lg xl:rounded-xl flex items-center justify-center text-white shadow-xs shadow-amber-200 group-hover:scale-105 transition-transform duration-200 shrink-0">
      <Briefcase className="w-4 h-4 xl:w-5 xl:h-5" />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-[10px] xl:text-[11px] text-amber-950/60 font-black uppercase tracking-wider truncate">
        Fees Awaiting
      </p>
      <div className="flex items-baseline gap-1 mt-0.5">
        <h3 className="text-lg xl:text-xl font-extrabold text-slate-900 font-mono">
          {loading ? "..." : feesAwaitingCount}
        </h3>
        <span className="text-slate-400 text-[10px] xl:text-xs font-bold font-mono">
          /{loading ? "..." : totalStudents}
        </span>
      </div>
    </div>

    {/* Progress Ring */}
    <div className="relative w-8 h-8 xl:w-9 xl:h-9 flex items-center justify-center shrink-0">
      {/* 1. Background Track */}
      <svg
        className="w-full h-full transform -rotate-90"
        viewBox="0 0 36 36"
        aria-hidden="true"
      >
        <path
          className="text-slate-200/80"
          strokeWidth="4"
          stroke="currentColor"
          fill="none"
          d="M18 2.0845 
             a 15.9155 15.9155 0 0 1 0 31.831 
             a 15.9155 15.9155 0 0 1 0 -31.831"
        />
      </svg>

      {/* 2. Active Progress Arc */}
      <svg
        className="w-full h-full absolute transform -rotate-90"
        viewBox="0 0 36 36"
        aria-hidden="true"
      >
        <path
          className="text-amber-500 transition-all duration-1000 ease-out"
          strokeWidth="4"
          strokeLinecap="round"
          stroke="currentColor"
          fill="none"
          d="M18 2.0845 
             a 15.9155 15.9155 0 0 1 0 31.831 
             a 15.9155 15.9155 0 0 1 0 -31.831"
          style={{
            strokeDasharray: `${awaitingPercentage}, 100`,
          }}
        />
      </svg>

      {/* 3. Center Label */}
      <span className="absolute text-[9px] xl:text-[10px] font-black text-slate-800 tracking-tighter select-none">
        {awaitingPercentage}%
      </span>
    </div>
  </div>

  {/* Card 4: Monthly Fees Collection */}
  <div className="group bg-emerald-50/60 hover:bg-emerald-50/90 p-3.5 xl:p-4 rounded-xl border border-emerald-100/80 flex items-center space-x-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:shadow-emerald-300/20">
    <div className="w-9 h-9 xl:w-10 xl:h-10 bg-emerald-600 rounded-lg xl:rounded-xl flex items-center justify-center text-white shadow-xs shadow-emerald-200 group-hover:scale-105 transition-transform duration-200 shrink-0">
      <Wallet className="w-4 h-4 xl:w-5 xl:h-5" />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-[10px] xl:text-[11px] text-emerald-950/60 font-black uppercase tracking-wider truncate">
        Net Monthly Margin
      </p>
      <h3 className="text-base xl:text-lg font-black text-slate-900 mt-0.5 font-mono truncate">
        {loading
          ? "..."
          : `PKR ${Number(monthlyNetMargin || 0).toLocaleString()}`}
      </h3>
    </div>
  </div>
</div>
    </motion.div>
  );
};

export default DashboardCards;