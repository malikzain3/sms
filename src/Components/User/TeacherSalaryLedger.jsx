import React, { useState, useEffect } from "react";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  setDoc,
  increment,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { CalendarDays, Tags, Pencil, Trash2, Plus, X } from "lucide-react";
import { useSchool } from "../../context/SchoolContext";

const N8N_SALARY_WEBHOOK_URL = import.meta.env.VITE_N8N_SALARY_WEBHOOK_URL;
// Firestore paths used:
//   teachers/{teacherId}                              -> salary.daily, salary.monthly, schoolId, classId
//   teachers/{teacherId}/salaryPayments/{paymentId}    -> { amount, date, type, note, schoolId, createdAt }
//   schools/{schoolId}/monthlyExpenses/{yyyy-mm}       -> { totalSalaryPaid, salaryPaymentCount,
//                                                          byCategory: { salary, ... }, updatedAt }
//                                                          (expense aggregate — mirrors monthlyStats on the
//                                                          income side, powers the Finance page's expense total)
//
// Every salary payment type (Monthly Salary, Advance, Bonus, Arrears, Other)
// is money going out to a teacher, so all of them count as "salary" expense
// — there's no per-type split needed here the way fee income has tuition
// vs exam vs admission, since none of these change what the school owes.

const PAYMENT_TYPES = [
  "Monthly Salary",
  "Advance",
  "Bonus",
  "Arrears",
  "Other",
];

const todayStr = () => new Date().toISOString().split("T")[0];

const TeacherSalaryLedger = ({ teacherId, teacherData = {} }) => {
  // ---- Payments (transactions) ----
  const [salaryHistory, setSalaryHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const { schoolName, schoolEmail } = useSchool();

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null); // null => Add mode

  const [formAmount, setFormAmount] = useState("");
  const [formDate, setFormDate] = useState(todayStr());
  const [formType, setFormType] = useState(PAYMENT_TYPES[0]);
  const [formNote, setFormNote] = useState("");
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [confirmingDeletePaymentId, setConfirmingDeletePaymentId] =
    useState(null);
  const [isDeletingPayment, setIsDeletingPayment] = useState(false);

  // ---- Base salary edit (daily / monthly only, edited in place) ----
  const [salaryEditMode, setSalaryEditMode] = useState(null); // "daily" | "monthly" | null
  const [editDaily, setEditDaily] = useState("");
  const [editMonthly, setEditMonthly] = useState("");
  const [salaryEditError, setSalaryEditError] = useState("");
  const [isSavingSalary, setIsSavingSalary] = useState(false);

  // Live sync: payments, newest first
  useEffect(() => {
    if (!teacherId) return;
    const q = query(
      collection(db, "teachers", teacherId, "salaryPayments"),
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
  }, [teacherId]);

  // ---- Payment modal handlers ----
  const openAddPaymentModal = () => {
    setEditingPayment(null);
    setFormAmount(
      teacherData.salary?.monthly != null
        ? String(teacherData.salary.monthly)
        : "",
    );
    setFormDate(todayStr());
    setFormType(PAYMENT_TYPES[0]);
    setFormNote("");
    setFormError("");
    setIsPaymentModalOpen(true);
  };

  const openEditPaymentModal = (entry) => {
    setEditingPayment(entry);
    setFormAmount(String(entry.amount ?? ""));
    setFormDate(entry.date || todayStr());
    setFormType(entry.type || PAYMENT_TYPES[0]);
    setFormNote(entry.note || "");
    setFormError("");
    setIsPaymentModalOpen(true);
  };

  // Atomically adjusts the school's monthly expense aggregate so the
  // Finance page can read one small document instead of every teacher's
  // salaryPayments across every teacher. Mirrors adjustMonthlyStats in
  // StudentFeeLedger.jsx on the income side.
  const adjustMonthlyExpenseStats = async (
    schoolId,
    monthKey,
    deltaAmount,
    deltaCount,
  ) => {
    if (!schoolId || !monthKey || (deltaAmount === 0 && deltaCount === 0))
      return;
    try {
      const payload = {
        totalSalaryPaid: increment(deltaAmount),
        salaryPaymentCount: increment(deltaCount),
        updatedAt: new Date().toISOString(),
      };
      if (deltaAmount !== 0) {
        payload["byCategory.salary"] = increment(deltaAmount);
      }
      await setDoc(
        doc(db, "schools", schoolId, "monthlyExpenses", monthKey),
        payload,
        { merge: true },
      );
    } catch (err) {
      console.error("Error updating monthly expense stats:", err);
    }
  };

  const handleSubmitPayment = async (e) => {
    e.preventDefault();
    if (!formAmount || Number(formAmount) <= 0) {
      setFormError("Enter a valid amount.");
      return;
    }
    if (!formDate) {
      setFormError("Payment date is required.");
      return;
    }
    if (!teacherData.schoolId) {
      setFormError("Missing schoolId on teacher record — cannot save payment.");
      return;
    }

    setIsSaving(true);
    setFormError("");
    try {
      const payload = {
        amount: Number(formAmount),
        date: formDate,
        type: formType,
        note: formNote.trim(),
        schoolId: teacherData.schoolId,
      };

      const schoolId = teacherData.schoolId;
      const newAmount = Number(formAmount);
      const newMonthKey = formDate.slice(0, 7);

      if (editingPayment) {
        const oldAmount = Number(editingPayment.amount || 0);
        const oldMonthKey = (editingPayment.date || "").slice(0, 7);

        await updateDoc(
          doc(db, "teachers", teacherId, "salaryPayments", editingPayment.id),
          payload,
        );

        const sameMonth = oldMonthKey === newMonthKey;
        await adjustMonthlyExpenseStats(
          schoolId,
          oldMonthKey,
          -oldAmount,
          sameMonth ? 0 : -1,
        );
        await adjustMonthlyExpenseStats(
          schoolId,
          newMonthKey,
          newAmount,
          sameMonth ? 0 : 1,
        );
      } else {
        await addDoc(collection(db, "teachers", teacherId, "salaryPayments"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        await adjustMonthlyExpenseStats(schoolId, newMonthKey, newAmount, 1);
      }

      // Trigger n8n Email Notification
      if (teacherData?.email && N8N_SALARY_WEBHOOK_URL) {
        const webhookPayload = {
          schoolName: schoolName || "School",
          schoolEmail: schoolEmail || "",
          teacherName: teacherData.name || "Teacher",
          teacherEmail: teacherData.email,
          amountPaid: newAmount,
          paymentDate: formDate,
          paymentType: formType,
          note: formNote.trim() || "N/A",
        };

        fetch(N8N_SALARY_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(webhookPayload),
        }).catch((err) => console.error("n8n salary notification error:", err));
      }

      setIsPaymentModalOpen(false);
    } catch (err) {
      console.error("Error saving salary entry:", err);
      setFormError("Something went wrong while saving. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePayment = async (id) => {
    setIsDeletingPayment(true);
    try {
      // Grab the entry's amount/date/schoolId before it's gone, so the
      // monthly expense aggregate can be decremented correctly.
      const entry = salaryHistory.find((e) => e.id === id);

      await deleteDoc(doc(db, "teachers", teacherId, "salaryPayments", id));

      if (entry) {
        const schoolId = entry.schoolId || teacherData.schoolId;
        const monthKey = (entry.date || "").slice(0, 7);
        await adjustMonthlyExpenseStats(
          schoolId,
          monthKey,
          -Number(entry.amount || 0),
          -1,
        );
      }

      setConfirmingDeletePaymentId(null);
    } catch (err) {
      console.error("Error deleting salary entry:", err);
    } finally {
      setIsDeletingPayment(false);
    }
  };

  // ---- Base salary edit handlers ----
  const openSalaryEdit = (mode) => {
    if (mode === "daily") {
      setEditDaily(
        teacherData.salary?.daily != null
          ? String(teacherData.salary.daily)
          : "",
      );
    } else if (mode === "monthly") {
      setEditMonthly(
        teacherData.salary?.monthly != null
          ? String(teacherData.salary.monthly)
          : "",
      );
    }
    setSalaryEditError("");
    setSalaryEditMode(mode);
  };

  const handleSaveSalary = async (e) => {
    e.preventDefault();
    if (salaryEditMode === "daily") {
      if (!editDaily || Number(editDaily) <= 0) {
        setSalaryEditError("Enter a valid daily rate.");
        return;
      }
    } else if (salaryEditMode === "monthly") {
      if (!editMonthly || Number(editMonthly) <= 0) {
        setSalaryEditError("Enter a valid monthly salary.");
        return;
      }
    }

    setIsSavingSalary(true);
    setSalaryEditError("");
    try {
      const updateData = {};
      if (salaryEditMode === "daily") {
        updateData["salary.daily"] = Number(editDaily);
      } else if (salaryEditMode === "monthly") {
        updateData["salary.monthly"] = Number(editMonthly);
      }

      await updateDoc(doc(db, "teachers", teacherId), updateData);
      setSalaryEditMode(null);
    } catch (err) {
      console.error("Error updating base salary:", err);
      setSalaryEditError(
        "Something went wrong while saving. Please try again.",
      );
    } finally {
      setIsSavingSalary(false);
    }
  };

  const totalPaid = salaryHistory.reduce(
    (sum, e) => sum + Number(e.amount || 0),
    0,
  );

  return (
    <div className="space-y-5 text-xs text-slate-700">
      {/* Base Salary Cards — daily + monthly only, each editable */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs relative">
          <button
            onClick={() => openSalaryEdit("daily")}
            className="absolute top-4 right-4 p-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 rounded-lg text-indigo-600 cursor-pointer"
            title="Edit daily rate"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <span className="text-[13px] text-slate-400 font-mono uppercase tracking-wide">
            Daily Rate
          </span>
          <h4 className="text-xl font-black text-slate-900 font-mono mt-2">
            Rs.{" "}
            {teacherData.salary?.daily != null
              ? Number(teacherData.salary.daily).toLocaleString()
              : "—"}
          </h4>
        </div>
        <div className="bg-indigo-50/40 border border-indigo-100 rounded-2xl p-5 shadow-xs relative">
          <button
            onClick={() => openSalaryEdit("monthly")}
            className="absolute top-4 right-4 p-1.5 bg-white hover:bg-indigo-100 border border-indigo-200 rounded-lg text-indigo-600 cursor-pointer"
            title="Edit monthly salary"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <span className="text-[13px] text-indigo-600 font-mono uppercase tracking-wide">
            Monthly Salary
          </span>
          <h4 className="text-xl font-black text-indigo-600 font-mono mt-2">
            Rs.{" "}
            {teacherData.salary?.monthly != null
              ? Number(teacherData.salary.monthly).toLocaleString()
              : "—"}
          </h4>
        </div>
      </div>

      {/* Payment Ledger Card */}
      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h4 className="text-lg font-black text-slate-900">
              Salary Payment Ledger
            </h4>
            <p className="text-[13px] text-slate-400 mt-0.5">
              Total disbursed to date:{" "}
              <span className="font-mono font-bold text-emerald-600">
                Rs. {totalPaid.toLocaleString()}
              </span>
            </p>
          </div>
          <button
            onClick={openAddPaymentModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition font-bold shadow-xs text-[12px] shrink-0"
          >
            <Plus className="w-4 h-4" />
            Add Payment
          </button>
        </div>

        {isLoadingHistory ? (
          <p className="text-slate-400 italic text-[14px] py-4">
            Loading payment history...
          </p>
        ) : salaryHistory.length === 0 ? (
          <p className="text-slate-400 italic text-[14px] py-4">
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
                    <span className="text-slate-400 italic">{entry.note}</span>
                  )}
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-mono text-emerald-600 font-bold">
                    + Rs. {Number(entry.amount).toLocaleString()}
                  </span>

                  {confirmingDeletePaymentId === entry.id ? (
                    <>
                      <button
                        onClick={() => handleDeletePayment(entry.id)}
                        disabled={isDeletingPayment}
                        className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold disabled:opacity-50"
                      >
                        {isDeletingPayment ? "..." : "Confirm"}
                      </button>
                      <button
                        onClick={() => setConfirmingDeletePaymentId(null)}
                        disabled={isDeletingPayment}
                        className="px-2 py-1 bg-white border border-slate-200 rounded-lg font-bold text-slate-500"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => openEditPaymentModal(entry)}
                        className="p-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 rounded-lg text-indigo-600"
                        title="Edit payment"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setConfirmingDeletePaymentId(entry.id)}
                        className="p-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-100 rounded-lg text-rose-600"
                        title="Delete payment"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add / Edit Payment Modal */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs"
            onClick={() => setIsPaymentModalOpen(false)}
          />
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md p-6 relative z-60">
            <div className="flex justify-between items-start pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-xl font-black text-slate-900">
                  {editingPayment
                    ? "Edit Salary Payment"
                    : "Record Salary Payment"}
                </h3>
                <p className="text-[14px] text-slate-400">
                  {editingPayment
                    ? "Update this payment entry."
                    : `Add a new payment for ${teacherData.name || "this teacher"}.`}
                </p>
              </div>
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xs p-1 cursor-pointer"
              >
                <X />
              </button>
            </div>

            <form
              onSubmit={handleSubmitPayment}
              className="space-y-3.5 text-xs text-slate-700"
            >
              <div>
                <label className="text-[13px] font-bold text-slate-400 uppercase tracking-wider">
                  Amount (Rs.)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-hidden mt-1 font-mono font-bold text-[15px]"
                  placeholder="e.g. 45000"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[13px] font-bold text-slate-400 uppercase tracking-wider">
                    Payment Date
                  </label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    max={todayStr()}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-hidden mt-1 font-mono text-[15px]"
                    required
                  />
                </div>
                <div>
                  <label className="text-[13px] font-bold text-slate-400 uppercase tracking-wider">
                    Payment Type
                  </label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-hidden mt-1 font-semibold text-[15px]"
                  >
                    {PAYMENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[13px] font-bold text-slate-400 uppercase tracking-wider">
                  Note (optional)
                </label>
                <input
                  type="text"
                  value={formNote}
                  onChange={(e) => setFormNote(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-hidden mt-1 text-[15px]"
                  placeholder="e.g. July salary, paid via bank transfer"
                />
              </div>

              {formError && (
                <p className="text-[10px] text-rose-600 font-bold">
                  {formError}
                </p>
              )}

              <div className="pt-4 border-t border-slate-100 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="w-1/2 py-2.5 bg-slate-100 text-slate-600 font-bold rounded-xl cursor-pointer text-[16px] hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="w-1/2 py-2.5 bg-indigo-600 text-white font-bold rounded-xl shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-[16px] hover:bg-indigo-700 transition-all"
                >
                  {isSaving
                    ? "Saving..."
                    : editingPayment
                      ? "Save Changes"
                      : "Add Payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Base Salary Modal */}
      {salaryEditMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs"
            onClick={() => setSalaryEditMode(null)}
          />
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-sm p-6 relative z-60">
            <div className="flex justify-between items-start pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-lg font-black text-slate-900">
                  {salaryEditMode === "daily"
                    ? "Edit Daily Rate"
                    : "Edit Monthly Salary"}
                </h3>
                <p className="text-[13px] text-slate-400">
                  {salaryEditMode === "daily"
                    ? `Update daily wage rate for ${teacherData.name || "this teacher"}.`
                    : `Update monthly base salary for ${teacherData.name || "this teacher"}.`}
                </p>
              </div>
              <button
                onClick={() => setSalaryEditMode(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xs p-1 cursor-pointer"
              >
                <X />
              </button>
            </div>

            <form
              onSubmit={handleSaveSalary}
              className="space-y-3.5 text-xs text-slate-700"
            >
              {salaryEditMode === "daily" && (
                <div>
                  <label className="text-[13px] font-mono text-slate-400 uppercase tracking-wider">
                    Daily Rate (Rs.)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={editDaily}
                    onChange={(e) => setEditDaily(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-hidden mt-1 font-mono font-bold text-[15px]"
                    required
                  />
                </div>
              )}

              {salaryEditMode === "monthly" && (
                <div>
                  <label className="text-[13px] font-mono text-slate-400 uppercase tracking-wider">
                    Monthly Salary (Rs.)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={editMonthly}
                    onChange={(e) => setEditMonthly(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-hidden mt-1 font-mono font-bold text-[15px ]"
                    required
                  />
                </div>
              )}

              {salaryEditError && (
                <p className="text-[14px] text-rose-600 font-bold">
                  {salaryEditError}
                </p>
              )}

              <div className="pt-4 border-t border-slate-100 flex gap-3">
                <button
                  type="button"
                  onClick={() => setSalaryEditMode(null)}
                  className="w-1/2 py-2.5 bg-slate-100 text-slate-600 font-bold rounded-xl cursor-pointer hover:bg-slate-200 transition-all text-[15px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingSalary}
                  className="w-1/2 py-2.5 bg-indigo-600 text-white font-bold rounded-xl shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:bg-indigo-700 transition-all text-[15px]"
                >
                  {isSavingSalary ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherSalaryLedger;
