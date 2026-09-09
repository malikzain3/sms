import React, { useState, useEffect, useMemo } from "react";
import {
  collection,
  collectionGroup,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  setDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  increment,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../firebaseConfig";
import {
  Calendar,
  Filter,
  Plus,
  Pencil,
  Trash2,
  Search,
  DollarSign,
  TrendingUp,
  TrendingDown,
  X,
} from "lucide-react";
import Header from "./Header";
import { useSchool } from "../../context/SchoolContext";
import {
  TUITION_TYPE,
  contributesToBalance,
  currentMonthKey,
  resolveAnchorMonth,
  computeFeeState,
  legacyBalanceFromState,
} from "./feeEngine";

// ---- Shared fee-status engine ----
// This page used to keep its own copy of the balance/rollover math
// (computeStatusFromBalance / applyRolloverStep / projectStudentState),
// separate from StudentFeeLedger.jsx's copy. That's exactly what let the
// two pages disagree with each other — a student could show "3 Paid" here
// while their own ledger said something else, because each page was
// nudging its own snapshot of the truth in slightly different ways.
//
// Now both pages import the SAME computeFeeState() from ./feeEngine.js,
// which always replays a student's actual feePayments history from
// scratch rather than trusting a cached balance. See feeEngine.js for the
// full explanation. Finance additionally self-heals every student's
// stored fee fields on load (see the effect below), so the numbers here
// are correct immediately — no need to open each student's own ledger
// page first.

const FEE_TYPES = [
  "Monthly Tuition",
  "Admission Fee",
  "Exam Fee",
  "Transport Fee",
  "Other",
];

const FEE_TYPE_TO_KEY = {
  "Monthly Tuition": "tuition",
  "Admission Fee": "admission",
  "Exam Fee": "exam",
  "Transport Fee": "transport",
  Other: "other",
};
const feeTypeKey = (type) => FEE_TYPE_TO_KEY[type] || "other";

const SALARY_TYPES = ["Monthly Salary", "Advance", "Bonus", "Arrears", "Other"];

const EXPENSE_CATEGORIES = [
  "Rent",
  "Utility Bills",
  "Maintenance",
  "Supplies",
  "Other",
];
const EXPENSE_CATEGORY_TO_KEY = {
  Rent: "rent",
  "Utility Bills": "utilities",
  Maintenance: "maintenance",
  Supplies: "supplies",
  Other: "other",
};
const expenseCategoryKey = (cat) => EXPENSE_CATEGORY_TO_KEY[cat] || "other";

const todayStr = () => new Date().toISOString().split("T")[0];
const FINANCE_MONTH_STORAGE_KEY = "schoolix_finance_month";

const formatCurrency = (n) => `PKR ${Number(n || 0).toLocaleString()}`;

// Builds "August 2026" style labels for card captions, matching
// StudentFeeLedger's month picker.
const monthLabel = (mk) => {
  if (!mk) return "";
  const [y, m] = mk.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
};

const statusStyles = {
  Paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Partial: "bg-amber-50 text-amber-700 border-amber-200",
  Advance: "bg-indigo-50 text-indigo-700 border-indigo-200",
  Unpaid: "bg-rose-50 text-rose-700 border-rose-200",
};

const kindBadgeStyles = {
  fee: "bg-indigo-50 text-indigo-600 border-indigo-100",
  salary: "bg-rose-50 text-rose-600 border-rose-100",
  expense: "bg-amber-50 text-amber-600 border-amber-100",
};
const kindLabels = {
  fee: "Income · Fee",
  salary: "Expense · Salary",
  expense: "Expense · Ops",
};

const Finance = ({ schoolId: schoolIdProp }) => {
  // Falls back to the app-wide SchoolContext (already wrapping every route
  // in App.jsx) so this works whether a parent route passes schoolId down
  // explicitly or not.
  const { schoolId: contextSchoolId } = useSchool();
  const schoolId = schoolIdProp || contextSchoolId;

  const [searchTerm, setSearchTerm] = useState("");
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const [classId, setClassId] = useState("all");

  // ---- Live data ----
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [classesList, setClassesList] = useState([]);
  const [feePayments, setFeePayments] = useState([]);
  // Every Monthly Tuition payment ever made across the school (NOT
  // month-filtered). The status cards need each student's FULL payment
  // history to replay through computeFeeState() correctly — a student who
  // paid ahead in June still needs that payment counted when judging
  // whether they owe anything in August. `feePayments` above stays
  // month-scoped for the transaction ledger table; this is the separate
  // feed that powers fee-status math.
  const [allFeePayments, setAllFeePayments] = useState([]);
  const [salaryPayments, setSalaryPayments] = useState([]);
  const [generalExpenses, setGeneralExpenses] = useState([]);
  const [isLoadingStudents, setIsLoadingStudents] = useState(true);
  const [isLoadingTeachers, setIsLoadingTeachers] = useState(true);
  const [isLoadingClasses, setIsLoadingClasses] = useState(true);
  const [isLoadingFees, setIsLoadingFees] = useState(true);
  const [isLoadingAllFees, setIsLoadingAllFees] = useState(true);
  const [isLoadingSalaries, setIsLoadingSalaries] = useState(true);
  const [isLoadingExpenses, setIsLoadingExpenses] = useState(true);
  const isLoading =
    isLoadingStudents ||
    isLoadingTeachers ||
    isLoadingClasses ||
    isLoadingFees ||
    isLoadingAllFees ||
    isLoadingSalaries ||
    isLoadingExpenses;

  // ---- Fee payment modal ----
  const [isFeeModalOpen, setIsFeeModalOpen] = useState(false);
  const [editingFeeEntry, setEditingFeeEntry] = useState(null);
  // Class comes first in this modal: pick a class to narrow the student
  // list down, or leave it on "All Classes" to pick from every student.
  const [feeFormClassId, setFeeFormClassId] = useState("all");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [formFeeAmount, setFormFeeAmount] = useState("");
  const [formFeeDate, setFormFeeDate] = useState(todayStr());
  const [formFeeType, setFormFeeType] = useState(FEE_TYPES[0]);
  const [formFeeNote, setFormFeeNote] = useState("");
  const [feeFormError, setFeeFormError] = useState("");
  const [isSavingFee, setIsSavingFee] = useState(false);

  // ---- Salary payment modal ----
  const [isSalaryModalOpen, setIsSalaryModalOpen] = useState(false);
  const [editingSalaryEntry, setEditingSalaryEntry] = useState(null);
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [formSalaryAmount, setFormSalaryAmount] = useState("");
  const [formSalaryDate, setFormSalaryDate] = useState(todayStr());
  const [formSalaryType, setFormSalaryType] = useState(SALARY_TYPES[0]);
  const [formSalaryNote, setFormSalaryNote] = useState("");
  const [salaryFormError, setSalaryFormError] = useState("");
  const [isSavingSalary, setIsSavingSalary] = useState(false);

  // ---- General expense modal ----
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [formExpenseCategory, setFormExpenseCategory] = useState(
    EXPENSE_CATEGORIES[0],
  );
  const [formExpenseAmount, setFormExpenseAmount] = useState("");
  const [formExpenseDate, setFormExpenseDate] = useState(todayStr());
  const [formExpenseNote, setFormExpenseNote] = useState("");
  const [expenseFormError, setExpenseFormError] = useState("");
  const [isSavingExpense, setIsSavingExpense] = useState(false);

  // ---- Unified delete confirmation ----
  const [confirmingDelete, setConfirmingDelete] = useState(null); // { kind, entry }
  const [isDeletingRecord, setIsDeletingRecord] = useState(false);

  useEffect(() => {
    localStorage.setItem(FINANCE_MONTH_STORAGE_KEY, monthKey);
    window.dispatchEvent(
      new CustomEvent("finance-month-change", { detail: monthKey }),
    );
  }, [monthKey]);

  // ---------------------------------------------------------------------
  // Live subscriptions — every one of these is scoped to `schoolId`.
  // ---------------------------------------------------------------------

  useEffect(() => {
    if (!schoolId) return;
    const q = query(
      collection(db, "students"),
      where("schoolId", "==", schoolId),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
        setStudents(list);
        setIsLoadingStudents(false);
      },
      (err) => {
        console.error("Error loading students:", err);
        setIsLoadingStudents(false);
      },
    );
    return () => unsub();
  }, [schoolId]);

  // Every Monthly-Tuition-relevant fee payment ever recorded for this
  // school, live, with NO date filter — this is what lets the fee-status
  // math below be accurate for every student without waiting for anyone
  // to open that student's own ledger page first.
  useEffect(() => {
    if (!schoolId) return;
    setIsLoadingAllFees(true);
    const q = query(
      collectionGroup(db, "feePayments"),
      where("schoolId", "==", schoolId),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = [];
        snap.forEach((d) => {
          const studentId = d.ref.parent.parent ? d.ref.parent.parent.id : null;
          list.push({ id: d.id, studentId, ...d.data() });
        });
        setAllFeePayments(list);
        setIsLoadingAllFees(false);
      },
      (err) => {
        console.error("Error loading full fee payment history:", err);
        setIsLoadingAllFees(false);
      },
    );
    return () => unsub();
  }, [schoolId]);

  // Groups the full payment history by student, for computeFeeState().
  const paymentsByStudent = useMemo(() => {
    const map = new Map();
    allFeePayments.forEach((p) => {
      if (!p.studentId) return;
      if (!map.has(p.studentId)) map.set(p.studentId, []);
      map.get(p.studentId).push(p);
    });
    return map;
  }, [allFeePayments]);

  // Self-heal every student's stored fee fields in the background — no
  // "already migrated" flag, no skipped students. Every student's ENTIRE
  // Monthly Tuition history is replayed from scratch through
  // computeFeeState() (the exact same function StudentFeeLedger.jsx uses)
  // and the result is written back, every time the student list or their
  // payment history changes. This is what fixes "data stays wrong until I
  // open that student's profile" and "hard refresh sends everything to
  // 0" — Finance no longer depends on anyone having visited a student's
  // ledger page first. Writes are skipped when nothing actually changed,
  // so this settles down instead of looping.
  useEffect(() => {
    if (
      !schoolId ||
      students.length === 0 ||
      isLoadingAllFees ||
      allFeePayments.length === 0
    ) {
      return;
    }
    const todayMk = currentMonthKey();
    students.forEach((s) => {
      const payments = paymentsByStudent.get(s.id) || [];
      if (Number(s.totalPaid || 0) > 0 && payments.length === 0) return;
      const fee = Number(s.monthlyFee || 0);
      const anchor = resolveAnchorMonth(
        s.feeAnchorMonth || s.currentBillingMonth || null,
        payments,
        todayMk,
      );
      const state = computeFeeState(payments, fee, anchor, todayMk);
      const lifetimeTotal = payments
        .filter((p) => contributesToBalance(p.type))
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const legacyBalance = legacyBalanceFromState(state);

      const alreadyCorrect =
        s.feeStatus === state.currentStatus &&
        Number(s.monthsBehind || 0) === state.monthsBehind &&
        Number(s.arrearsAmount || 0) === state.arrearsAmount &&
        Number(s.advanceForFuture || 0) === state.advanceForFuture &&
        Number(s.dueThisMonth || 0) === state.dueThisMonth &&
        Number(s.totalDue || 0) === state.totalDue &&
        s.feeAnchorMonth === anchor &&
        Number(s.totalPaid || 0) === lifetimeTotal &&
        Number(s.balance || 0) === legacyBalance &&
        s.currentBillingMonth === todayMk;
      if (alreadyCorrect) return;

      const studentRef = doc(db, "students", s.id);
      runTransaction(db, async (transaction) => {
        const snap = await transaction.get(studentRef);
        if (!snap.exists()) return;
        transaction.update(studentRef, {
          feeStatus: state.currentStatus,
          monthsBehind: state.monthsBehind,
          arrearsAmount: state.arrearsAmount,
          advanceForFuture: state.advanceForFuture,
          dueThisMonth: state.dueThisMonth,
          totalDue: state.totalDue,
          feeAnchorMonth: anchor,
          totalPaid: lifetimeTotal,
          balance: legacyBalance,
          currentBillingMonth: todayMk,
          feeStateUpdatedAt: new Date().toISOString(),
        });
      }).catch((err) =>
        console.error(`Error self-healing student ${s.id}:`, err),
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    schoolId,
    students,
    paymentsByStudent,
    isLoadingAllFees,
    allFeePayments.length,
  ]);

  useEffect(() => {
    if (!schoolId) return;
    const q = query(
      collection(db, "teachers"),
      where("schoolId", "==", schoolId),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
        setTeachers(list);
        setIsLoadingTeachers(false);
      },
      (err) => {
        console.error("Error loading teachers:", err);
        setIsLoadingTeachers(false);
      },
    );
    return () => unsub();
  }, [schoolId]);

  // Classes come straight from the "classes" collection (same source
  // Classes.jsx / ClassDetailView.jsx write to) so every class shows up
  // here — including ones with zero students right now — instead of only
  // classes that happen to have a student or teacher already tagged.
  useEffect(() => {
    if (!schoolId) return;
    const q = query(
      collection(db, "classes"),
      where("schoolId", "==", schoolId),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
        setClassesList(list);
        setIsLoadingClasses(false);
      },
      (err) => {
        console.error("Error loading classes:", err);
        setIsLoadingClasses(false);
      },
    );
    return () => unsub();
  }, [schoolId]);

  useEffect(() => {
    if (!schoolId || !monthKey) return;
    setIsLoadingFees(true);
    const start = `${monthKey}-01`;
    const end = `${monthKey}-31`;
    const q = query(
      collectionGroup(db, "feePayments"),
      where("schoolId", "==", schoolId),
      where("date", ">=", start),
      where("date", "<=", end),
      orderBy("date", "desc"),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = [];
        snap.forEach((d) => {
          const studentId = d.ref.parent.parent ? d.ref.parent.parent.id : null;
          list.push({ id: d.id, studentId, ...d.data() });
        });
        setFeePayments(list);
        setIsLoadingFees(false);
      },
      (err) => {
        console.error("Error loading fee payments:", err);
        setIsLoadingFees(false);
      },
    );
    return () => unsub();
  }, [schoolId, monthKey]);

  useEffect(() => {
    if (!schoolId || !monthKey) return;
    setIsLoadingSalaries(true);
    const start = `${monthKey}-01`;
    const end = `${monthKey}-31`;
    const q = query(
      collectionGroup(db, "salaryPayments"),
      where("schoolId", "==", schoolId),
      where("date", ">=", start),
      where("date", "<=", end),
      orderBy("date", "desc"),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = [];
        snap.forEach((d) => {
          const teacherId = d.ref.parent.parent ? d.ref.parent.parent.id : null;
          list.push({ id: d.id, teacherId, ...d.data() });
        });
        setSalaryPayments(list);
        setIsLoadingSalaries(false);
      },
      (err) => {
        console.error("Error loading salary payments:", err);
        setIsLoadingSalaries(false);
      },
    );
    return () => unsub();
  }, [schoolId, monthKey]);

  useEffect(() => {
    if (!schoolId || !monthKey) return;
    setIsLoadingExpenses(true);
    const start = `${monthKey}-01`;
    const end = `${monthKey}-31`;
    const q = query(
      collection(db, "schools", schoolId, "generalExpenses"),
      where("date", ">=", start),
      where("date", "<=", end),
      orderBy("date", "desc"),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
        setGeneralExpenses(list);
        setIsLoadingExpenses(false);
      },
      (err) => {
        console.error("Error loading general expenses:", err);
        setIsLoadingExpenses(false);
      },
    );
    return () => unsub();
  }, [schoolId, monthKey]);

  // ---------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------

  const studentNameMap = useMemo(
    () =>
      Object.fromEntries(
        students.map((s) => [s.id, s.name || "Unnamed Student"]),
      ),
    [students],
  );
  const teacherNameMap = useMemo(
    () =>
      Object.fromEntries(
        teachers.map((t) => [t.id, t.name || "Unnamed Teacher"]),
      ),
    [teachers],
  );

  // Classes list drives every class dropdown on this page (dashboard
  // filter + the fee-collection modal). A class with no students yet still
  // shows up, since it comes from the "classes" collection itself rather
  // than being inferred from existing student/teacher records.
  const classOptions = useMemo(
    () =>
      classesList
        .map((c) => ({
          id: c.id,
          label: c.section
            ? `${c.className || c.id} - ${c.section}`
            : c.className || c.id,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [classesList],
  );
  const classNameMap = useMemo(
    () => Object.fromEntries(classOptions.map((c) => [c.id, c.label])),
    [classOptions],
  );
  // Classes.jsx assigns teachers to a class by NAME (classes/{id}.teachers
  // is an array of teacher names), so a teacher may not carry a classId of
  // their own. Build a classId -> assigned teacher name set so the salary
  // side of this page can still filter teachers by class using whichever
  // relationship is actually populated.
  const classTeacherNamesMap = useMemo(() => {
    const map = new Map();
    classesList.forEach((c) => {
      map.set(c.id, new Set(Array.isArray(c.teachers) ? c.teachers : []));
    });
    return map;
  }, [classesList]);

  const filteredStudents = useMemo(
    () =>
      classId === "all"
        ? students
        : students.filter((s) => s.classId === classId),
    [students, classId],
  );
  const filteredTeachers = useMemo(() => {
    if (classId === "all") return teachers;
    const namesForClass = classTeacherNamesMap.get(classId) || new Set();
    return teachers.filter(
      (t) => t.classId === classId || namesForClass.has(t.name),
    );
  }, [teachers, classId, classTeacherNamesMap]);
  const studentIdSet = useMemo(
    () => new Set(filteredStudents.map((s) => s.id)),
    [filteredStudents],
  );
  const teacherIdSet = useMemo(
    () => new Set(filteredTeachers.map((t) => t.id)),
    [filteredTeachers],
  );

  const filteredFeePayments = useMemo(
    () =>
      classId === "all"
        ? feePayments
        : feePayments.filter((p) => studentIdSet.has(p.studentId)),
    [feePayments, classId, studentIdSet],
  );
  const filteredSalaryPayments = useMemo(
    () =>
      classId === "all"
        ? salaryPayments
        : salaryPayments.filter((p) => teacherIdSet.has(p.teacherId)),
    [salaryPayments, classId, teacherIdSet],
  );
  // General expenses are school-wide overhead, not tied to any one class,
  // so the class filter intentionally never narrows this list.

  const totalIncome = useMemo(
    () =>
      filteredFeePayments.reduce((sum, p) => sum + Number(p.amount || 0), 0),
    [filteredFeePayments],
  );
  const totalsByFeeType = useMemo(() => {
    const t = { tuition: 0, admission: 0, exam: 0, transport: 0, other: 0 };
    filteredFeePayments.forEach((p) => {
      t[feeTypeKey(p.type)] += Number(p.amount || 0);
    });
    return t;
  }, [filteredFeePayments]);

  const totalSalaryPaid = useMemo(
    () =>
      filteredSalaryPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0),
    [filteredSalaryPayments],
  );
  const totalGeneralExpenses = useMemo(
    () => generalExpenses.reduce((sum, x) => sum + Number(x.amount || 0), 0),
    [generalExpenses],
  );
  // General expenses (rent, utilities, etc.) are school-wide overhead —
  // they aren't tied to any one class, so they can't be honestly split
  // across classes. Mixing them into a class-filtered total was what made
  // "Total Expenses" and "Net Margin" stop making sense while filtering:
  // income would shrink to one class' tuition while expenses still
  // included the WHOLE school's rent bill. So:
  //   - All Classes  -> full picture: class salaries + general overhead.
  //   - One class     -> only that class's teacher salaries; general
  //                      overhead is excluded (and called out in the UI)
  //                      since it can't be attributed to a single class.
  const isClassFiltered = classId !== "all";
  const totalExpenses = isClassFiltered
    ? totalSalaryPaid
    : totalSalaryPaid + totalGeneralExpenses;
  const netMargin = totalIncome - totalExpenses;

  // Every card below is built from the SAME per-student replay through
  // computeFeeState() (the shared feeEngine, evaluated "as of" whichever
  // month the filter bar is set to), so Paid/Partial/Advance/Unpaid
  // counts, Pending Fees, and Advance Balance always agree with each
  // other — and with what that student's own ledger page shows — instead
  // of drifting apart.
  const projectedStudents = useMemo(
    () =>
      filteredStudents.map((s) => {
        const payments = paymentsByStudent.get(s.id) || [];
        const fee = Number(s.monthlyFee || 0);
        const anchor = resolveAnchorMonth(
          s.feeAnchorMonth || s.currentBillingMonth || null,
          payments,
          monthKey,
        );
        const state = computeFeeState(payments, fee, anchor, monthKey);
        return { ...s, ...state, anchor };
      }),
    [filteredStudents, paymentsByStudent, monthKey],
  );

  const feeStatusCounts = useMemo(() => {
    const c = { Paid: 0, Partial: 0, Advance: 0, Unpaid: 0 };
    projectedStudents.forEach((s) => {
      const st = s.currentStatus || "Unpaid";
      if (c[st] != null) c[st] += 1;
    });
    return c;
  }, [projectedStudents]);

  // A student only counts toward "expected" once they've actually been
  // billed as of the selected month (their anchor month has arrived) —
  // "yyyy-mm" strings sort the same lexicographically as chronologically,
  // so a plain string comparison is enough here.
  const billedStudents = useMemo(
    () => projectedStudents.filter((s) => s.anchor <= monthKey),
    [projectedStudents, monthKey],
  );
  const expectedThisMonth = useMemo(
    () => billedStudents.reduce((sum, s) => sum + Number(s.monthlyFee || 0), 0),
    [billedStudents],
  );
  const collectedThisMonth = useMemo(
    () =>
      projectedStudents.reduce(
        (sum, s) => sum + Number(s.paidThisMonth || 0),
        0,
      ),
    [projectedStudents],
  );
  // Pending Fees = everything a student still owes as of the selected
  // month — this month's shortfall PLUS any carried-over arrears from
  // before. This is the honest "how much is left to collect" number;
  // it's the direct flip side of the Unpaid/Partial counts above.
  const pendingFeesTotal = useMemo(
    () =>
      projectedStudents.reduce((sum, s) => sum + Number(s.totalDue || 0), 0),
    [projectedStudents],
  );
  const advanceBalanceTotal = useMemo(
    () =>
      projectedStudents.reduce(
        (sum, s) => sum + Number(s.advanceForFuture || 0),
        0,
      ),
    [projectedStudents],
  );

  const combinedTransactions = useMemo(() => {
    const feeTx = filteredFeePayments.map((p) => ({
      key: `fee-${p.id}`,
      kind: "fee",
      id: p.id,
      studentId: p.studentId,
      schoolId: p.schoolId,
      displayId: `#FEE-${p.id.slice(0, 6).toUpperCase()}`,
      name: studentNameMap[p.studentId] || "Unknown Student",
      date: p.date,
      amount: Number(p.amount || 0),
      sign: 1,
      typeLabel: p.type || FEE_TYPES[0],
      note: p.note || "",
    }));
    const salaryTx = filteredSalaryPayments.map((p) => ({
      key: `salary-${p.id}`,
      kind: "salary",
      id: p.id,
      teacherId: p.teacherId,
      schoolId: p.schoolId,
      displayId: `#SAL-${p.id.slice(0, 6).toUpperCase()}`,
      name: teacherNameMap[p.teacherId] || "Unknown Teacher",
      date: p.date,
      amount: Number(p.amount || 0),
      sign: -1,
      typeLabel: p.type || SALARY_TYPES[0],
      note: p.note || "",
    }));
    const expenseTx = generalExpenses.map((x) => ({
      key: `expense-${x.id}`,
      kind: "expense",
      id: x.id,
      displayId: `#EXP-${x.id.slice(0, 6).toUpperCase()}`,
      name: x.category || "Other",
      date: x.date,
      amount: Number(x.amount || 0),
      sign: -1,
      typeLabel: x.category || "Other",
      note: x.note || "",
    }));
    return [...feeTx, ...salaryTx, ...expenseTx].sort((a, b) =>
      a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
    );
  }, [
    filteredFeePayments,
    filteredSalaryPayments,
    generalExpenses,
    studentNameMap,
    teacherNameMap,
  ]);

  const visibleTransactions = useMemo(() => {
    if (!searchTerm || !searchTerm.trim()) return combinedTransactions;
    const q = searchTerm.toLowerCase().trim();
    return combinedTransactions.filter(
      (t) =>
        t.displayId.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.date.toLowerCase().includes(q) ||
        t.typeLabel.toLowerCase().includes(q),
    );
  }, [combinedTransactions, searchTerm]);

  // ---------------------------------------------------------------------
  // Aggregate helpers (mirror StudentFeeLedger.jsx / TeacherSalaryLedger.jsx)
  // ---------------------------------------------------------------------

  const adjustMonthlyIncomeStats = async (
    targetSchoolId,
    mk,
    deltaAmount,
    deltaCount,
    feeType,
  ) => {
    if (!targetSchoolId || !mk || (deltaAmount === 0 && deltaCount === 0))
      return;
    try {
      const payload = {
        totalCollected: increment(deltaAmount),
        paymentCount: increment(deltaCount),
        updatedAt: new Date().toISOString(),
      };
      if (deltaAmount !== 0)
        payload[`byType.${feeTypeKey(feeType)}`] = increment(deltaAmount);
      await setDoc(
        doc(db, "schools", targetSchoolId, "monthlyStats", mk),
        payload,
        { merge: true },
      );
    } catch (err) {
      console.error("Error updating monthly stats:", err);
    }
  };

  const adjustMonthlySalaryStats = async (
    targetSchoolId,
    mk,
    deltaAmount,
    deltaCount,
  ) => {
    if (!targetSchoolId || !mk || (deltaAmount === 0 && deltaCount === 0))
      return;
    try {
      const payload = {
        totalSalaryPaid: increment(deltaAmount),
        salaryPaymentCount: increment(deltaCount),
        updatedAt: new Date().toISOString(),
      };
      if (deltaAmount !== 0)
        payload["byCategory.salary"] = increment(deltaAmount);
      await setDoc(
        doc(db, "schools", targetSchoolId, "monthlyExpenses", mk),
        payload,
        { merge: true },
      );
    } catch (err) {
      console.error("Error updating monthly salary stats:", err);
    }
  };

  const adjustGeneralExpenseStats = async (
    targetSchoolId,
    mk,
    deltaAmount,
    deltaCount,
    category,
  ) => {
    if (!targetSchoolId || !mk || (deltaAmount === 0 && deltaCount === 0))
      return;
    try {
      const payload = {
        totalGeneralExpenses: increment(deltaAmount),
        generalExpenseCount: increment(deltaCount),
        updatedAt: new Date().toISOString(),
      };
      if (deltaAmount !== 0)
        payload[`byCategory.${expenseCategoryKey(category)}`] =
          increment(deltaAmount);
      await setDoc(
        doc(db, "schools", targetSchoolId, "monthlyExpenses", mk),
        payload,
        { merge: true },
      );
    } catch (err) {
      console.error("Error updating monthly general expense stats:", err);
    }
  };

  // Same recompute-from-scratch model as StudentFeeLedger.jsx's
  // recomputeAndPersist: re-reads this student's ENTIRE Monthly Tuition
  // history straight from Firestore (not the possibly-lagging local
  // listener) and rebuilds their fee state via the shared feeEngine, then
  // persists it inside a transaction. Called right after every fee
  // add/edit/delete from this page so the dashboard cards — and that
  // student's own ledger — agree immediately, without waiting on a
  // listener round-trip or a background self-heal pass.
  const recomputeAndPersistStudent = async (studentId) => {
    if (!studentId) return;
    try {
      const paymentsSnap = await getDocs(
        collection(db, "students", studentId, "feePayments"),
      );
      const payments = [];
      let lifetimeTotal = 0;
      paymentsSnap.forEach((d) => {
        const p = d.data();
        payments.push(p);
        lifetimeTotal += Number(p.amount || 0);
      });

      const studentRef = doc(db, "students", studentId);
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(studentRef);
        if (!snap.exists()) return;
        const data = snap.data();
        const todayMk = currentMonthKey();
        const fee = Number(data.monthlyFee || 0);
        const anchor = resolveAnchorMonth(
          data.feeAnchorMonth || data.currentBillingMonth || null,
          payments,
          todayMk,
        );
        const state = computeFeeState(payments, fee, anchor, todayMk);

        transaction.update(studentRef, {
          feeStatus: state.currentStatus,
          monthsBehind: state.monthsBehind,
          arrearsAmount: state.arrearsAmount,
          advanceForFuture: state.advanceForFuture,
          dueThisMonth: state.dueThisMonth,
          totalDue: state.totalDue,
          feeAnchorMonth: anchor,
          totalPaid: lifetimeTotal,
          balance: legacyBalanceFromState(state),
          currentBillingMonth: todayMk,
          feeStateUpdatedAt: new Date().toISOString(),
        });
      });
    } catch (err) {
      console.error("Error recomputing fee status:", err);
    }
  };

  // ---------------------------------------------------------------------
  // Fee payment CRUD
  // ---------------------------------------------------------------------

  const openAddFeeModal = () => {
    setEditingFeeEntry(null);
    // Start the modal pre-narrowed to whatever class the dashboard is
    // currently filtered to — "All Classes" on the dashboard opens the
    // modal to "All Classes" too, showing every student.
    setFeeFormClassId(classId);
    setSelectedStudentId("");
    setFormFeeAmount("");
    setFormFeeDate(todayStr());
    setFormFeeType(FEE_TYPES[0]);
    setFormFeeNote("");
    setFeeFormError("");
    setIsFeeModalOpen(true);
  };

  const openEditFeeModal = (entry) => {
    setEditingFeeEntry(entry);
    const owner = students.find((s) => s.id === entry.studentId);
    setFeeFormClassId((owner && owner.classId) || "all");
    setSelectedStudentId(entry.studentId);
    setFormFeeAmount(String(entry.amount ?? ""));
    setFormFeeDate(entry.date || todayStr());
    setFormFeeType(entry.typeLabel || FEE_TYPES[0]);
    setFormFeeNote(entry.note || "");
    setFeeFormError("");
    setIsFeeModalOpen(true);
  };

  // Students available to pick from in the fee modal, narrowed to
  // feeFormClassId (mirrors the dashboard's own class filter behavior:
  // "all" shows every student, a specific class shows only its roster).
  const feeModalStudents = useMemo(
    () => {
      const studentsInClass =
        feeFormClassId === "all"
          ? students
          : students.filter((s) => s.classId === feeFormClassId);
      return studentsInClass;
    },
    [students, feeFormClassId],
  );

  const handleFeeFormClassChange = (newClassId) => {
    setFeeFormClassId(newClassId);
    // Selected student may not belong to the newly chosen class — clear it
    // so a mismatched student/class pair can never be submitted.
    setSelectedStudentId((prev) => {
      if (newClassId === "all") return prev;
      const stillValid = students.some(
        (s) => s.id === prev && s.classId === newClassId,
      );
      return stillValid ? prev : "";
    });
  };

  const handleSubmitFeePayment = async (e) => {
    e.preventDefault();
    if (!editingFeeEntry && !selectedStudentId) {
      setFeeFormError("Select a student.");
      return;
    }
    if (!formFeeAmount || Number(formFeeAmount) <= 0) {
      setFeeFormError("Enter a valid amount.");
      return;
    }
    if (!formFeeDate) {
      setFeeFormError("Payment date is required.");
      return;
    }

    setIsSavingFee(true);
    setFeeFormError("");
    try {
      const studentId = editingFeeEntry
        ? editingFeeEntry.studentId
        : selectedStudentId;
      const student = students.find((s) => s.id === studentId);
      const resolvedSchoolId = (student && student.schoolId) || schoolId;
      if (!resolvedSchoolId) {
        setFeeFormError(
          "This student's school link is missing, so this payment can't be saved safely.",
        );
        setIsSavingFee(false);
        return;
      }

      const newAmount = Number(formFeeAmount);
      const newMonthKey = formFeeDate.slice(0, 7);
      const payload = {
        amount: newAmount,
        date: formFeeDate,
        type: formFeeType,
        note: formFeeNote.trim(),
        schoolId: resolvedSchoolId,
      };

      if (editingFeeEntry) {
        const oldAmount = Number(editingFeeEntry.amount || 0);
        const oldMonthKey = (editingFeeEntry.date || "").slice(0, 7);
        const oldType = editingFeeEntry.typeLabel;
        const sameMonth = oldMonthKey === newMonthKey;

        await updateDoc(
          doc(db, "students", studentId, "feePayments", editingFeeEntry.id),
          payload,
        );
        await adjustMonthlyIncomeStats(
          resolvedSchoolId,
          oldMonthKey,
          -oldAmount,
          sameMonth ? 0 : -1,
          oldType,
        );
        await adjustMonthlyIncomeStats(
          resolvedSchoolId,
          newMonthKey,
          newAmount,
          sameMonth ? 0 : 1,
          formFeeType,
        );

        await recomputeAndPersistStudent(studentId);
      } else {
        await addDoc(collection(db, "students", studentId, "feePayments"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        await adjustMonthlyIncomeStats(
          resolvedSchoolId,
          newMonthKey,
          newAmount,
          1,
          formFeeType,
        );
        await recomputeAndPersistStudent(studentId);
      }
      setIsFeeModalOpen(false);
    } catch (err) {
      console.error("Error saving fee payment:", err);
      setFeeFormError("Something went wrong while saving. Please try again.");
    } finally {
      setIsSavingFee(false);
    }
  };

  const handleDeleteFeePayment = async (entry) => {
    setIsDeletingRecord(true);
    try {
      await deleteDoc(
        doc(db, "students", entry.studentId, "feePayments", entry.id),
      );
      const mk = (entry.date || "").slice(0, 7);
      await adjustMonthlyIncomeStats(
        entry.schoolId || schoolId,
        mk,
        -Number(entry.amount || 0),
        -1,
        entry.typeLabel,
      );
      if (contributesToBalance(entry.typeLabel)) {
        await recomputeAndPersistStudent(entry.studentId);
      }
      setConfirmingDelete(null);
    } catch (err) {
      console.error("Error deleting fee payment:", err);
    } finally {
      setIsDeletingRecord(false);
    }
  };

  // ---------------------------------------------------------------------
  // Salary payment CRUD
  // ---------------------------------------------------------------------

  const openAddSalaryModal = () => {
    setEditingSalaryEntry(null);
    setSelectedTeacherId("");
    setFormSalaryAmount("");
    setFormSalaryDate(todayStr());
    setFormSalaryType(SALARY_TYPES[0]);
    setFormSalaryNote("");
    setSalaryFormError("");
    setIsSalaryModalOpen(true);
  };

  const openEditSalaryModal = (entry) => {
    setEditingSalaryEntry(entry);
    setSelectedTeacherId(entry.teacherId);
    setFormSalaryAmount(String(entry.amount ?? ""));
    setFormSalaryDate(entry.date || todayStr());
    setFormSalaryType(entry.typeLabel || SALARY_TYPES[0]);
    setFormSalaryNote(entry.note || "");
    setSalaryFormError("");
    setIsSalaryModalOpen(true);
  };

  const handleSubmitSalaryPayment = async (e) => {
    e.preventDefault();
    if (!editingSalaryEntry && !selectedTeacherId) {
      setSalaryFormError("Select a teacher.");
      return;
    }
    if (!formSalaryAmount || Number(formSalaryAmount) <= 0) {
      setSalaryFormError("Enter a valid amount.");
      return;
    }
    if (!formSalaryDate) {
      setSalaryFormError("Payment date is required.");
      return;
    }

    setIsSavingSalary(true);
    setSalaryFormError("");
    try {
      const teacherId = editingSalaryEntry
        ? editingSalaryEntry.teacherId
        : selectedTeacherId;
      const teacher = teachers.find((t) => t.id === teacherId);
      const resolvedSchoolId = (teacher && teacher.schoolId) || schoolId;
      if (!resolvedSchoolId) {
        setSalaryFormError(
          "Missing schoolId on this teacher record — cannot save payment.",
        );
        setIsSavingSalary(false);
        return;
      }

      const newAmount = Number(formSalaryAmount);
      const newMonthKey = formSalaryDate.slice(0, 7);
      const payload = {
        amount: newAmount,
        date: formSalaryDate,
        type: formSalaryType,
        note: formSalaryNote.trim(),
        schoolId: resolvedSchoolId,
      };

      if (editingSalaryEntry) {
        const oldAmount = Number(editingSalaryEntry.amount || 0);
        const oldMonthKey = (editingSalaryEntry.date || "").slice(0, 7);
        const sameMonth = oldMonthKey === newMonthKey;

        await updateDoc(
          doc(
            db,
            "teachers",
            teacherId,
            "salaryPayments",
            editingSalaryEntry.id,
          ),
          payload,
        );
        await adjustMonthlySalaryStats(
          resolvedSchoolId,
          oldMonthKey,
          -oldAmount,
          sameMonth ? 0 : -1,
        );
        await adjustMonthlySalaryStats(
          resolvedSchoolId,
          newMonthKey,
          newAmount,
          sameMonth ? 0 : 1,
        );
      } else {
        await addDoc(collection(db, "teachers", teacherId, "salaryPayments"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        await adjustMonthlySalaryStats(
          resolvedSchoolId,
          newMonthKey,
          newAmount,
          1,
        );
      }
      setIsSalaryModalOpen(false);
    } catch (err) {
      console.error("Error saving salary entry:", err);
      setSalaryFormError(
        "Something went wrong while saving. Please try again.",
      );
    } finally {
      setIsSavingSalary(false);
    }
  };

  const handleDeleteSalaryPayment = async (entry) => {
    setIsDeletingRecord(true);
    try {
      await deleteDoc(
        doc(db, "teachers", entry.teacherId, "salaryPayments", entry.id),
      );
      const mk = (entry.date || "").slice(0, 7);
      await adjustMonthlySalaryStats(
        entry.schoolId || schoolId,
        mk,
        -Number(entry.amount || 0),
        -1,
      );
      setConfirmingDelete(null);
    } catch (err) {
      console.error("Error deleting salary payment:", err);
    } finally {
      setIsDeletingRecord(false);
    }
  };

  // ---------------------------------------------------------------------
  // General expense CRUD
  // ---------------------------------------------------------------------

  const openAddExpenseModal = () => {
    setEditingExpense(null);
    setFormExpenseCategory(EXPENSE_CATEGORIES[0]);
    setFormExpenseAmount("");
    setFormExpenseDate(todayStr());
    setFormExpenseNote("");
    setExpenseFormError("");
    setIsExpenseModalOpen(true);
  };

  const openEditExpenseModal = (entry) => {
    setEditingExpense(entry);
    setFormExpenseCategory(entry.typeLabel || EXPENSE_CATEGORIES[0]);
    setFormExpenseAmount(String(entry.amount ?? ""));
    setFormExpenseDate(entry.date || todayStr());
    setFormExpenseNote(entry.note || "");
    setExpenseFormError("");
    setIsExpenseModalOpen(true);
  };

  const handleSubmitExpense = async (e) => {
    e.preventDefault();
    if (!formExpenseAmount || Number(formExpenseAmount) <= 0) {
      setExpenseFormError("Enter a valid amount.");
      return;
    }
    if (!formExpenseDate) {
      setExpenseFormError("Date is required.");
      return;
    }
    if (!schoolId) {
      setExpenseFormError("Missing schoolId — cannot save.");
      return;
    }

    setIsSavingExpense(true);
    setExpenseFormError("");
    try {
      const newAmount = Number(formExpenseAmount);
      const newMonthKey = formExpenseDate.slice(0, 7);
      const payload = {
        category: formExpenseCategory,
        amount: newAmount,
        date: formExpenseDate,
        note: formExpenseNote.trim(),
      };

      if (editingExpense) {
        const oldAmount = Number(editingExpense.amount || 0);
        const oldMonthKey = (editingExpense.date || "").slice(0, 7);
        const oldCategory = editingExpense.typeLabel;
        const sameMonth = oldMonthKey === newMonthKey;

        await updateDoc(
          doc(db, "schools", schoolId, "generalExpenses", editingExpense.id),
          payload,
        );
        await adjustGeneralExpenseStats(
          schoolId,
          oldMonthKey,
          -oldAmount,
          sameMonth ? 0 : -1,
          oldCategory,
        );
        await adjustGeneralExpenseStats(
          schoolId,
          newMonthKey,
          newAmount,
          sameMonth ? 0 : 1,
          formExpenseCategory,
        );
      } else {
        await addDoc(collection(db, "schools", schoolId, "generalExpenses"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        await adjustGeneralExpenseStats(
          schoolId,
          newMonthKey,
          newAmount,
          1,
          formExpenseCategory,
        );
      }
      setIsExpenseModalOpen(false);
    } catch (err) {
      console.error("Error saving expense:", err);
      setExpenseFormError(
        "Something went wrong while saving. Please try again.",
      );
    } finally {
      setIsSavingExpense(false);
    }
  };

  const handleDeleteExpense = async (entry) => {
    setIsDeletingRecord(true);
    try {
      await deleteDoc(
        doc(db, "schools", schoolId, "generalExpenses", entry.id),
      );
      const mk = (entry.date || "").slice(0, 7);
      await adjustGeneralExpenseStats(
        schoolId,
        mk,
        -Number(entry.amount || 0),
        -1,
        entry.typeLabel,
      );
      setConfirmingDelete(null);
    } catch (err) {
      console.error("Error deleting expense:", err);
    } finally {
      setIsDeletingRecord(false);
    }
  };

  // ---------------------------------------------------------------------
  // Unified row actions
  // ---------------------------------------------------------------------

  const openEditForTransaction = (tx) => {
    if (tx.kind === "fee") openEditFeeModal(tx);
    else if (tx.kind === "salary") openEditSalaryModal(tx);
    else openEditExpenseModal(tx);
  };

  const handleConfirmDelete = () => {
    if (!confirmingDelete) return;
    const { kind, entry } = confirmingDelete;
    if (kind === "fee") handleDeleteFeePayment(entry);
    else if (kind === "salary") handleDeleteSalaryPayment(entry);
    else handleDeleteExpense(entry);
  };

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------

  return (
    <div className="space-y-6 w-full">
      <Header />

      {!schoolId ? (
        <div className="bg-white border border-slate-100 rounded-2xl p-10 text-center text-xs text-slate-400 italic">
          No school selected. Sign in with a valid school account to view
          finance data.
        </div>
      ) : (
        <>
          {/* Control bar */}
          <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-4">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                School Finance Dashboard
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                Track tuition income, teacher salaries, and operational
                expenses.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={openAddFeeModal}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-[15px] font-bold hover:bg-indigo-700 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Record Fee Collection
              </button>
              <button
                onClick={openAddSalaryModal}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-rose-600 text-white rounded-xl text-[15px] font-bold hover:bg-rose-700 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Pay Teacher Salary
              </button>
              <button
                onClick={openAddExpenseModal}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-amber-500 text-white rounded-xl text-[15px] font-bold hover:bg-amber-600 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add Expense
              </button>
            </div>
          </div>

          {/* Filter bar */}
          <div className="flex flex-col sm:flex-row gap-3 bg-white border border-slate-100 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center gap-2 flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
              <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="month"
                value={monthKey}
                onChange={(e) =>
                  setMonthKey(e.target.value || currentMonthKey())
                }
                className="w-full bg-transparent text-[14px] font-bold text-slate-700 focus:outline-hidden"
              />
            </div>
            <div className="flex items-center gap-2 flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
              <Filter className="w-4 h-4 text-slate-400 shrink-0" />
              <select
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
                className="w-full bg-transparent text-[14px] font-semibold text-slate-700 focus:outline-hidden cursor-pointer"
              >
                <option value="all">All Classes</option>
                {classOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Top analytics cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-indigo-50/50 border border-indigo-100/50 p-4 rounded-2xl">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-bold text-indigo-500 uppercase tracking-wide">
                  Total Income
                </p>
                <DollarSign className="w-3.5 h-3.5 text-indigo-400" />
              </div>
              <p className="text-xl font-black text-indigo-900 mt-1">
                {formatCurrency(totalIncome)}
              </p>
              <p className="text-[13px] text-indigo-400 mt-1 leading-relaxed">
                Tuition {formatCurrency(totalsByFeeType.tuition)} | Admission{" "}
                {formatCurrency(totalsByFeeType.admission)}
                <br />
                Exam {formatCurrency(totalsByFeeType.exam)} | Transport{" "}
                {formatCurrency(totalsByFeeType.transport)} | Other{" "}
                {formatCurrency(totalsByFeeType.other)}
              </p>
            </div>

            <div className="bg-rose-50/40 border border-rose-100/50 p-4 rounded-2xl">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-bold text-rose-500 uppercase tracking-wide">
                  Total Expenses
                </p>
                <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
              </div>
              <p className="text-xl font-black text-rose-900 mt-1">
                {formatCurrency(totalExpenses)}
              </p>
              <p className="text-[13px] text-rose-400 mt-1">
                {isClassFiltered ? (
                  <>
                    Salaries (this class) {formatCurrency(totalSalaryPaid)}
                    <br />
                    Operational overhead excluded — switch to All Classes to see
                    it
                  </>
                ) : (
                  <>
                    Salaries {formatCurrency(totalSalaryPaid)} · Operational{" "}
                    {formatCurrency(totalGeneralExpenses)}
                  </>
                )}
              </p>
            </div>

            <div
              className={`p-4 rounded-2xl border ${
                netMargin >= 0
                  ? "bg-emerald-50/30 border-emerald-100/50"
                  : "bg-rose-50/40 border-rose-100/50"
              }`}
            >
              <div className="flex items-center justify-between">
                <p
                  className={`text-[13px] font-bold uppercase tracking-wide ${
                    netMargin >= 0 ? "text-emerald-600" : "text-rose-500"
                  }`}
                >
                  Net Monthly Margin
                </p>
                {netMargin >= 0 ? (
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
                )}
              </div>
              <p
                className={`text-xl font-black mt-1 ${netMargin >= 0 ? "text-emerald-800" : "text-rose-900"}`}
              >
                {netMargin >= 0 ? "+" : "-"}{" "}
                {formatCurrency(Math.abs(netMargin))}
              </p>
              <p className="text-[13px] text-slate-400 mt-1">
                {isClassFiltered
                  ? `Class income minus this class's salaries for ${monthKey}`
                  : `Income minus expenses for ${monthKey}`}
              </p>
            </div>
          </div>
          <div className="bg-white border border-slate-100 p-4 rounded-2xl">
            <p className="text-[13px] font-bold text-slate-400 uppercase tracking-wide">
              Student Fee Status — {monthLabel(monthKey)}
            </p>
            <div className="grid grid-cols-4 gap-2 mt-2">
              {Object.entries(feeStatusCounts).map(([status, count]) => (
                <div
                  key={status}
                  className={`rounded-xl border px-2.5 py-1.5 ${statusStyles[status]}`}
                >
                  <p className="text-[13px] font-bold uppercase tracking-wide">
                    {status}
                  </p>
                  <p className="text-sm font-black">{count}</p>
                </div>
              ))}
            </div>
            <p className="text-[13px] text-slate-400 mt-2">
              {billedStudents.length} student
              {billedStudents.length === 1 ? "" : "s"} billed ×{" "}
              {formatCurrency(
                billedStudents.length
                  ? expectedThisMonth / billedStudents.length
                  : 0,
              )}{" "}
              each = {formatCurrency(expectedThisMonth)} expected
            </p>
          </div>

          {/* Secondary balance cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-emerald-50/30 border border-emerald-100/50 p-4 rounded-2xl">
              <p className="text-[13px] font-bold text-emerald-600 uppercase tracking-wide">
                Collected — {monthLabel(monthKey)}
              </p>
              <p className="text-xl font-black text-emerald-800 mt-1">
                {formatCurrency(collectedThisMonth)}
              </p>
              <p className="text-[13px] text-emerald-500 mt-1">
                out of {formatCurrency(expectedThisMonth)} expected from{" "}
                {billedStudents.length} student
                {billedStudents.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="bg-amber-50/30 border border-amber-100/50 p-4 rounded-2xl">
              <p className="text-[13px] font-bold text-amber-600 uppercase tracking-wide">
                Pending Fees
              </p>
              <p className="text-xl font-black text-amber-900 mt-1">
                {formatCurrency(pendingFeesTotal)}
              </p>
              <p className="text-[13px] text-amber-500 mt-1">
                Owed by {feeStatusCounts.Unpaid + feeStatusCounts.Partial}{" "}
                Unpaid/Partial student
                {feeStatusCounts.Unpaid + feeStatusCounts.Partial === 1
                  ? ""
                  : "s"}{" "}
                as of {monthLabel(monthKey)} — includes any carried-over arrears
              </p>
            </div>
            <div className="bg-indigo-50/30 border border-indigo-100/50 p-4 rounded-2xl">
              <p className="text-[13px] font-bold text-indigo-600 uppercase tracking-wide">
                Advance Balance
              </p>
              <p className="text-xl font-black text-indigo-800 mt-1">
                {formatCurrency(advanceBalanceTotal)}
              </p>
              <p className="text-[13px] text-indigo-500 mt-1">
                Credit already paid toward future months
              </p>
            </div>
          </div>

          {/* Combined ledger */}
          <div className="bg-white border border-slate-100 rounded-2xl p-5 space-y-4 shadow-xs overflow-x-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wider">
                Combined Income &amp; Expense Ledger
              </h3>
              <Search className="w-3.5 h-3.5 text-slate-300" />
            </div>

            {isLoading ? (
              <div className="text-center py-8 text-slate-400 text-xs italic">
                Loading transactions…
              </div>
            ) : visibleTransactions.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs italic">
                No transactions match your filters.
              </div>
            ) : (
              <table className="w-full min-w-150 text-left text-[16px] table-auto">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-500 font-bold">
                    <th className="py-3">Slip ID</th>
                    <th className="py-3">Type</th>
                    <th className="py-3">Name / Category</th>
                    <th className="py-3">Date</th>
                    <th className="py-3 text-right">Amount</th>
                    <th className="py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {visibleTransactions.map((tx) => (
                    <tr key={tx.key}>
                      <td className="py-3 font-mono font-bold text-slate-500 text-[10px]">
                        {tx.displayId}
                      </td>
                      <td className="py-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-wide ${kindBadgeStyles[tx.kind]}`}
                        >
                          {kindLabels[tx.kind]}
                        </span>
                        <p className="text-[10px] text-slate-400 mt-1">
                          {tx.typeLabel}
                        </p>
                      </td>
                      <td className="py-3 font-bold text-slate-950">
                        {tx.name}
                      </td>
                      <td className="py-3 text-slate-400">{tx.date}</td>
                      <td
                        className={`py-3 text-right font-mono font-bold ${
                          tx.sign > 0 ? "text-emerald-600" : "text-rose-600"
                        }`}
                      >
                        {tx.sign > 0 ? "+" : "-"} {formatCurrency(tx.amount)}
                      </td>
                      <td className="py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEditForTransaction(tx)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition cursor-pointer"
                            title="Edit"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() =>
                              setConfirmingDelete({ kind: tx.kind, entry: tx })
                            }
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ---- Fee payment modal ---- */}
      {isFeeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs"
            onClick={() => setIsFeeModalOpen(false)}
          />
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-2xl p-6 relative z-60">
            {/* Header */}
            <div className="flex justify-between items-start pb-3 border-b border-slate-100 mb-3">
              <div>
                <h3 className="text-xl font-black text-slate-900">
                  {editingFeeEntry ? "Edit Fee Payment" : "Record Fee Payment"}
                </h3>
                <p className="text-[13px] text-slate-400">
                  {editingFeeEntry
                    ? "Update this payment entry."
                    : "Log a new student fee payment."}
                </p>
              </div>
              <button
                onClick={() => setIsFeeModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer transition-colors"
                aria-label="Close fee modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={handleSubmitFeePayment}
              className="space-y-4 text-sm text-slate-700"
            >
              {editingFeeEntry ? (
                <div className="text-[13px] text-slate-400">
                  Student:{" "}
                  <span className="font-bold text-slate-700">
                    {studentNameMap[editingFeeEntry.studentId]}
                  </span>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Class
                    </label>
                    <select
                      value={feeFormClassId}
                      onChange={(e) => handleFeeFormClassChange(e.target.value)}
                      className="w-full bg-slate-50 text-[15px] border border-slate-200 rounded-xl px-3.5 py-2.5 mt-1.5 focus:outline-hidden focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 font-semibold"
                    >
                      <option value="all">All Classes</option>
                      {classOptions.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Student
                    </label>
                    <select
                      value={selectedStudentId}
                      onChange={(e) => {
                        const studentId = e.target.value;
                        setSelectedStudentId(studentId);
                        const selected = students.find(
                          (s) => s.id === studentId,
                        );
                        if (selected && selected.monthlyFee != null) {
                          setFormFeeAmount(String(selected.monthlyFee));
                        } else if (!selected) {
                          setFormFeeAmount("");
                        }
                      }}
                      className="w-full bg-slate-50 text-[15px] border border-slate-200 rounded-xl px-3.5 py-2.5 mt-1.5 focus:outline-hidden focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 font-semibold"
                      required
                    >
                      <option value="">
                        {feeModalStudents.length === 0
                          ? "No students in this class"
                          : "Select student…"}
                      </option>
                      {feeModalStudents.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}{" "}
                          {s.classId
                            ? `(${classNameMap[s.classId] || s.className || s.classId})`
                            : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Amount & Fee Type Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Amount (Rs.)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={formFeeAmount}
                    onChange={(e) => setFormFeeAmount(e.target.value)}
                    className="w-full bg-slate-50 text-[15px] border border-slate-200 rounded-xl px-3.5 py-2.5 mt-1.5 focus:outline-hidden focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 font-mono font-bold placeholder-slate-400"
                    placeholder="e.g. 12500"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Fee Type
                  </label>
                  <select
                    value={formFeeType}
                    onChange={(e) => setFormFeeType(e.target.value)}
                    className="w-full bg-slate-50 text-[15px] border border-slate-200 rounded-xl px-3.5 py-2.5 mt-1.5 focus:outline-hidden focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 font-semibold"
                  >
                    {FEE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Payment Date & Note Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Payment Date
                  </label>
                  <input
                    type="date"
                    value={formFeeDate}
                    onChange={(e) => setFormFeeDate(e.target.value)}
                    max={todayStr()}
                    className="w-full bg-slate-50 text-[15px] border border-slate-200 rounded-xl px-3.5 py-2.5 mt-1.5 focus:outline-hidden focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Note (optional)
                  </label>
                  <input
                    type="text"
                    value={formFeeNote}
                    onChange={(e) => setFormFeeNote(e.target.value)}
                    className="w-full bg-slate-50 text-[15px] border border-slate-200 rounded-xl px-3.5 py-2.5 mt-1.5 focus:outline-hidden focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 placeholder-slate-400"
                    placeholder="e.g. Bank transfer"
                  />
                </div>
              </div>

              {feeFormError && (
                <p className="text-[13px] text-rose-600 font-bold">
                  {feeFormError}
                </p>
              )}

              {/* Compact Action Buttons */}
              <div className="pt-4 border-t border-slate-100 flex justify-end items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsFeeModalOpen(false)}
                  className="px-4 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 font-bold rounded-xl cursor-pointer transition-colors text-[15px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingFee}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs text-[15px] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isSavingFee
                    ? "Saving..."
                    : editingFeeEntry
                      ? "Save Changes"
                      : "Add Payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---- Salary payment modal ---- */}
      {isSalaryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs"
            onClick={() => setIsSalaryModalOpen(false)}
          />
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-sm p-6 relative z-60">
            <div className="flex justify-between items-start pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-xl font-black text-slate-900">
                  {editingSalaryEntry
                    ? "Edit Salary Payment"
                    : "Pay Teacher Salary"}
                </h3>
                <p className="text-[14px] text-slate-400">
                  {editingSalaryEntry
                    ? "Update this disbursement entry."
                    : "Log a new teacher salary disbursement."}
                </p>
              </div>
              <button
                onClick={() => setIsSalaryModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                aria-label="Close salary modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={handleSubmitSalaryPayment}
              className="space-y-3.5 text-xs text-slate-700"
            >
              {editingSalaryEntry ? (
                <div className="text-[14px] text-slate-400">
                  Teacher:{" "}
                  <span className="font-bold text-slate-700 text-[15px]">
                    {teacherNameMap[editingSalaryEntry.teacherId]}
                  </span>
                </div>
              ) : (
                <div>
                  <label className="text-[14px] font-bold text-slate-400 uppercase tracking-wider">
                    Teacher
                  </label>
                  <select
                    value={selectedTeacherId}
                    onChange={(e) => {
                      const tid = e.target.value;
                      setSelectedTeacherId(tid);
                      // Pull this teacher's salary straight from their
                      // TeacherSalaryLedger record (teachers/{id}.salary.monthly)
                      // so the amount is pre-filled instead of typed from
                      // scratch — still a normal editable field, so it can
                      // be adjusted or rewritten before saving.
                      const t = teachers.find((x) => x.id === tid);
                      if (t) {
                        setFormSalaryAmount(
                          t.salary?.monthly != null
                            ? String(t.salary.monthly)
                            : "",
                        );
                      }
                    }}
                    className="w-full bg-slate-50 text-[15px] border border-slate-200 rounded-xl p-2.5 focus:outline-hidden mt-1 font-semibold"
                    required
                  >
                    <option value="">Select a teacher…</option>
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}{" "}
                        {t.classId ? `(${t.className || t.classId})` : ""}
                      </option>
                    ))}
                  </select>
                  {selectedTeacherId &&
                    teachers.find((t) => t.id === selectedTeacherId)?.salary
                      ?.monthly != null && (
                      <p className="text-[13px] text-slate-400 mt-1">
                        Salary of{" "}
                        {teachers.find((t) => t.id === selectedTeacherId)?.name}{" "}
                        is :{" "}
                        <span className="font-bold text-slate-600">
                          {formatCurrency(
                            teachers.find((t) => t.id === selectedTeacherId)
                              .salary.monthly,
                          )}
                        </span>{" "}
                        — amount is editable.
                      </p>
                    )}
                </div>
              )}

              <div>
                <label className="text-[14px] font-bold text-slate-400 uppercase tracking-wider">
                  Amount (Rs.)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={formSalaryAmount}
                  onChange={(e) => setFormSalaryAmount(e.target.value)}
                  className="w-full bg-slate-50 text-[15px] border border-slate-200 rounded-xl p-2.5 focus:outline-hidden mt-1 font-mono font-bold"
                  placeholder="e.g. 45000"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[14px] font-bold text-slate-400 uppercase tracking-wider">
                    Payment Date
                  </label>
                  <input
                    type="date"
                    value={formSalaryDate}
                    onChange={(e) => setFormSalaryDate(e.target.value)}
                    max={todayStr()}
                    className="w-full bg-slate-50 text-[15px] border border-slate-200 rounded-xl p-2.5 focus:outline-hidden mt-1 font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="text-[14px] font-bold text-slate-400 uppercase tracking-wider">
                    Payment Type
                  </label>
                  <select
                    value={formSalaryType}
                    onChange={(e) => setFormSalaryType(e.target.value)}
                    className="w-full bg-slate-50 text-[15px] border border-slate-200 rounded-xl p-2.5 focus:outline-hidden mt-1 font-semibold"
                  >
                    {SALARY_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[14px] font-bold text-slate-400 uppercase tracking-wider">
                  Note (optional)
                </label>
                <input
                  type="text"
                  value={formSalaryNote}
                  onChange={(e) => setFormSalaryNote(e.target.value)}
                  className="w-full bg-slate-50 text-[15px] border border-slate-200 rounded-xl p-2.5 focus:outline-hidden mt-1"
                  placeholder="e.g. August salary, bank transfer"
                />
              </div>

              {salaryFormError && (
                <p className="text-[13px] text-rose-600 font-bold">
                  {salaryFormError}
                </p>
              )}

              <div className="pt-4 border-t border-slate-100 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsSalaryModalOpen(false)}
                  className="w-1/2 py-2.5 bg-slate-100 text-slate-600 font-bold rounded-xl cursor-pointer :hover:bg-slate-200 transition-colors text-[15px]  "
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingSalary}
                  className="w-1/2 py-2.5 bg-rose-600 text-white font-bold rounded-xl shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-[15px] :hover:bg-rose-700 tranisition-all"
                >
                  {isSavingSalary
                    ? "Saving..."
                    : editingSalaryEntry
                      ? "Save Changes"
                      : "Pay Salary"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---- General expense modal ---- */}
      {isExpenseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs"
            onClick={() => setIsExpenseModalOpen(false)}
          />
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-sm p-6 relative z-60">
            <div className="flex justify-between items-start pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-xl font-black text-slate-900">
                  {editingExpense ? "Edit Expense" : "Add General Expense"}
                </h3>
                <p className="text-[14px] text-slate-400">
                  {editingExpense
                    ? "Update this expense entry."
                    : "Log rent, utilities, or another operational cost."}
                </p>
              </div>
              <button
                onClick={() => setIsExpenseModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                aria-label="Close expense modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={handleSubmitExpense}
              className="space-y-3.5 text-xs text-slate-700"
            >
              <div>
                <label className="text-[14px] font-bold text-slate-400 uppercase tracking-wider">
                  Category
                </label>
                <select
                  value={formExpenseCategory}
                  onChange={(e) => setFormExpenseCategory(e.target.value)}
                  className="w-full bg-slate-50 border text-[15px] border-slate-200 rounded-xl p-2.5 focus:outline-hidden mt-1 font-semibold"
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[14px] font-bold text-slate-400 uppercase tracking-wider">
                  Amount (Rs.)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={formExpenseAmount}
                  onChange={(e) => setFormExpenseAmount(e.target.value)}
                  className="w-full bg-slate-50 border text-[15px] border-slate-200 rounded-xl p-2.5 focus:outline-hidden mt-1 font-mono font-bold"
                  placeholder="e.g. 15000"
                  required
                />
              </div>

              <div>
                <label className="text-[14px] font-bold text-slate-400 uppercase tracking-wider">
                  Date
                </label>
                <input
                  type="date"
                  value={formExpenseDate}
                  onChange={(e) => setFormExpenseDate(e.target.value)}
                  max={todayStr()}
                  className="w-full bg-slate-50 border text-[15px] border-slate-200 rounded-xl p-2.5 focus:outline-hidden mt-1 font-mono"
                  required
                />
              </div>

              <div>
                <label className="text-[14px] font-bold text-slate-400 uppercase tracking-wider">
                  Note (optional)
                </label>
                <input
                  type="text"
                  value={formExpenseNote}
                  onChange={(e) => setFormExpenseNote(e.target.value)}
                  className="w-full bg-slate-50 border text-[15px] border-slate-200 rounded-xl p-2.5 focus:outline-hidden mt-1"
                  placeholder="e.g. August electricity bill"
                />
              </div>

              {expenseFormError && (
                <p className="text-[14px] text-rose-600 font-bold">
                  {expenseFormError}
                </p>
              )}

              <div className="pt-4 border-t border-slate-100 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsExpenseModalOpen(false)}
                  className="w-1/2 py-2.5 bg-slate-100 text-slate-600 font-bold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingExpense}
                  className="w-1/2 py-2.5 bg-amber-500 text-white font-bold rounded-xl shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed :hover:bg-amber-700 transition-colors text-[15px] "
                >
                  {isSavingExpense
                    ? "Saving..."
                    : editingExpense
                      ? "Save Changes"
                      : "Add Expense"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---- Unified delete confirmation ---- */}
      {confirmingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs"
            onClick={() => setConfirmingDelete(null)}
          />
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-sm p-6 relative z-60">
            <h2 className="text-md font-black text-slate-900">
              Delete this record?
            </h2>
            <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">
              This will permanently remove{" "}
              <span className="font-bold text-slate-600">
                {confirmingDelete.entry.name}
              </span>{" "}
              — {formatCurrency(confirmingDelete.entry.amount)} on{" "}
              {confirmingDelete.entry.date} — and update the monthly totals.
              This can't be undone.
            </p>
            <div className="pt-5 flex gap-3">
              <button
                onClick={() => setConfirmingDelete(null)}
                className="w-1/2 py-2 text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold rounded-xl cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isDeletingRecord}
                className="w-1/2 py-2 text-xs bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isDeletingRecord ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Finance;
