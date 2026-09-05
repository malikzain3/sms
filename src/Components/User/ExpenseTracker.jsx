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
} from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { Plus, Pencil, Trash2, Receipt, X } from "lucide-react";

// Firestore paths used:
//   schools/{schoolId}/expenses/{expenseId}      -> { amount, date, category, note, schoolId, createdAt }
//   schools/{schoolId}/monthlyExpenses/{yyyy-mm} -> { totalOtherExpenses, otherExpenseCount,
//                                                      byCategory: { utilityBill, rent, maintenance,
//                                                      examExpense, other, salary }, updatedAt }
//                                                      (same aggregate doc TeacherSalaryLedger writes
//                                                      totalSalaryPaid/byCategory.salary into — this
//                                                      component only ever touches totalOtherExpenses,
//                                                      otherExpenseCount and its own byCategory keys)
//
// These are ad-hoc school costs that aren't a student's fee payment or a
// teacher's salary payment — utility bills, rent, maintenance, exam-day
// costs, anything else. Recorded here so the Finance page can show a real
// "money going out" total instead of dummy numbers.

const EXPENSE_CATEGORIES = [
  "Utility Bill",
  "Rent",
  "Maintenance",
  "Exam Expense",
  "Other",
];

const CATEGORY_TO_KEY = {
  "Utility Bill": "utilityBill",
  Rent: "rent",
  Maintenance: "maintenance",
  "Exam Expense": "examExpense",
  Other: "other",
};
const categoryKey = (c) => CATEGORY_TO_KEY[c] || "other";

const categoryStyles = {
  "Utility Bill": "bg-amber-50 text-amber-700 border-amber-200",
  Rent: "bg-indigo-50 text-indigo-700 border-indigo-200",
  Maintenance: "bg-rose-50 text-rose-700 border-rose-200",
  "Exam Expense": "bg-purple-50 text-purple-700 border-purple-200",
  Other: "bg-slate-100 text-slate-600 border-slate-200",
};

const todayStr = () => new Date().toISOString().split("T")[0];
const currentMonthKey = () => todayStr().slice(0, 7);

const ExpenseTracker = ({ schoolId: schoolIdProp }) => {
  // Falls back to the same session-derived schoolId DashboardCards.jsx
  // uses, so this component works whether or not Finance.jsx passes one.
  const session = JSON.parse(
    localStorage.getItem("schoolix_session") || "null",
  );
  const schoolId = schoolIdProp || session?.schoolId || "default_school";

  const [expenses, setExpenses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [editingExpense, setEditingExpense] = useState(null); // null => Add mode
  const [formAmount, setFormAmount] = useState("");
  const [formDate, setFormDate] = useState(todayStr());
  const [formCategory, setFormCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [formNote, setFormNote] = useState("");
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!schoolId) return;
    const q = query(
      collection(db, "schools", schoolId, "expenses"),
      orderBy("date", "desc"),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = [];
        snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
        setExpenses(rows);
        setIsLoading(false);
      },
      (err) => {
        console.error("Error loading expenses:", err);
        setIsLoading(false);
      },
    );
    return () => unsub();
  }, [schoolId]);

  // Mirrors adjustMonthlyStats (StudentFeeLedger.jsx) and
  // adjustMonthlyExpenseStats (TeacherSalaryLedger.jsx) — same document,
  // different fields, so all three writers can merge into one aggregate
  // per month without stepping on each other.
  const adjustMonthlyExpenseAggregate = async (
    monthKey,
    deltaAmount,
    deltaCount,
    category,
  ) => {
    if (!schoolId || !monthKey || (deltaAmount === 0 && deltaCount === 0))
      return;
    try {
      const payload = {
        totalOtherExpenses: increment(deltaAmount),
        otherExpenseCount: increment(deltaCount),
        updatedAt: new Date().toISOString(),
      };
      if (deltaAmount !== 0) {
        payload[`byCategory.${categoryKey(category)}`] = increment(deltaAmount);
      }
      await setDoc(
        doc(db, "schools", schoolId, "monthlyExpenses", monthKey),
        payload,
        { merge: true },
      );
    } catch (err) {
      console.error("Error updating monthly expense aggregate:", err);
    }
  };

  const resetForm = () => {
    setEditingExpense(null);
    setFormAmount("");
    setFormDate(todayStr());
    setFormCategory(EXPENSE_CATEGORIES[0]);
    setFormNote("");
    setFormError("");
  };

  const startEdit = (entry) => {
    setEditingExpense(entry);
    setFormAmount(String(entry.amount ?? ""));
    setFormDate(entry.date || todayStr());
    setFormCategory(entry.category || EXPENSE_CATEGORIES[0]);
    setFormNote(entry.note || "");
    setFormError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formAmount || Number(formAmount) <= 0) {
      setFormError("Enter a valid amount.");
      return;
    }
    if (!formDate) {
      setFormError("Date is required.");
      return;
    }
    if (!schoolId) {
      setFormError("Missing schoolId — cannot save this expense.");
      return;
    }

    setIsSaving(true);
    setFormError("");

    const newAmount = Number(formAmount);
    const newMonthKey = formDate.slice(0, 7);
    const payload = {
      amount: newAmount,
      date: formDate,
      category: formCategory,
      note: formNote.trim(),
      schoolId,
    };

    try {
      if (editingExpense) {
        const oldAmount = Number(editingExpense.amount || 0);
        const oldMonthKey = (editingExpense.date || "").slice(0, 7);

        await updateDoc(
          doc(db, "schools", schoolId, "expenses", editingExpense.id),
          payload,
        );

        // Same remove-old/add-new model used for fee & salary payments, so
        // a category or date change on edit is attributed correctly.
        const sameMonth = oldMonthKey === newMonthKey;
        await adjustMonthlyExpenseAggregate(
          oldMonthKey,
          -oldAmount,
          sameMonth ? 0 : -1,
          editingExpense.category,
        );
        await adjustMonthlyExpenseAggregate(
          newMonthKey,
          newAmount,
          sameMonth ? 0 : 1,
          formCategory,
        );
      } else {
        await addDoc(collection(db, "schools", schoolId, "expenses"), {
          ...payload,
          createdAt: new Date().toISOString(),
        });
        await adjustMonthlyExpenseAggregate(
          newMonthKey,
          newAmount,
          1,
          formCategory,
        );
      }
      resetForm();
    } catch (err) {
      console.error("Error saving expense:", err);
      setFormError("Something went wrong while saving. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id) => {
    setIsDeleting(true);
    try {
      const entry = expenses.find((e) => e.id === id);
      await deleteDoc(doc(db, "schools", schoolId, "expenses", id));

      if (entry) {
        const monthKey = (entry.date || "").slice(0, 7);
        await adjustMonthlyExpenseAggregate(
          monthKey,
          -Number(entry.amount || 0),
          -1,
          entry.category,
        );
      }
      setConfirmingDeleteId(null);
    } catch (err) {
      console.error("Error deleting expense:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  const monthTotal = expenses
    .filter((e) => (e.date || "").slice(0, 7) === currentMonthKey())
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);

  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wider">
            Other Expenses
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Bills, rent, maintenance, exam costs — anything outside student
            fees and teacher salaries.
          </p>
        </div>
        <div className="bg-rose-50/60 border border-rose-100 rounded-xl px-4 py-2 shrink-0">
          <p className="text-[10px] font-bold text-rose-500 uppercase tracking-wide">
            This Month
          </p>
          <p className="text-base font-black text-rose-700 font-mono">
            PKR {monthTotal.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Quick-add / edit calculator row */}
      <form
        onSubmit={handleSubmit}
        className="bg-slate-50/70 border border-slate-100 rounded-2xl p-4"
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Amount (Rs.)
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={formAmount}
              onChange={(e) => setFormAmount(e.target.value)}
              placeholder="e.g. 3500"
              className="w-full bg-white border border-slate-200 rounded-xl p-2.5 focus:outline-hidden mt-1 font-mono font-bold text-xs"
              required
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Date
            </label>
            <input
              type="date"
              value={formDate}
              onChange={(e) => setFormDate(e.target.value)}
              max={todayStr()}
              className="w-full bg-white border border-slate-200 rounded-xl p-2.5 focus:outline-hidden mt-1 font-mono text-xs"
              required
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Category
            </label>
            <select
              value={formCategory}
              onChange={(e) => setFormCategory(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl p-2.5 focus:outline-hidden mt-1 font-semibold text-xs"
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Note (optional)
            </label>
            <input
              type="text"
              value={formNote}
              onChange={(e) => setFormNote(e.target.value)}
              placeholder="e.g. July electricity bill"
              className="w-full bg-white border border-slate-200 rounded-xl p-2.5 focus:outline-hidden mt-1 text-xs"
            />
          </div>
          <div className="flex items-end gap-2 col-span-2 sm:col-span-4 lg:col-span-1">
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 py-2.5 bg-indigo-600 text-white font-bold rounded-xl shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 text-xs"
            >
              {editingExpense ? (
                "Save Changes"
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" /> Add
                </>
              )}
            </button>
            {editingExpense && (
              <button
                type="button"
                onClick={resetForm}
                className="py-2.5 px-3 bg-slate-200 text-slate-600 font-bold rounded-xl cursor-pointer text-xs"
                title="Cancel edit"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
        {formError && (
          <p className="text-[10px] text-rose-600 font-bold mt-2">
            {formError}
          </p>
        )}
      </form>

      {/* Expense list */}
      <div className="divide-y divide-slate-100">
        {isLoading ? (
          <p className="text-[11px] text-slate-400 py-4 text-center">
            Loading expenses...
          </p>
        ) : expenses.length === 0 ? (
          <p className="text-[11px] text-slate-400 py-4 text-center flex items-center justify-center gap-2">
            <Receipt className="w-4 h-4" /> No expenses recorded yet.
          </p>
        ) : (
          expenses.map((entry) => (
            <div
              key={entry.id}
              className="py-2.5 flex items-center justify-between gap-3 text-xs"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`shrink-0 px-2 py-1 rounded-lg border text-[10px] font-bold ${
                    categoryStyles[entry.category] || categoryStyles.Other
                  }`}
                >
                  {entry.category || "Other"}
                </span>
                <div className="min-w-0">
                  <p className="font-bold text-slate-800 truncate">
                    {entry.note || entry.category || "Expense"}
                  </p>
                  <p className="text-[10px] text-slate-400 font-mono">
                    {entry.date}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono font-bold text-rose-600">
                  - PKR {Number(entry.amount || 0).toLocaleString()}
                </span>

                {confirmingDeleteId === entry.id ? (
                  <>
                    <button
                      onClick={() => handleDelete(entry.id)}
                      disabled={isDeleting}
                      className="text-[10px] font-bold text-rose-600 hover:text-rose-700 cursor-pointer disabled:opacity-50"
                    >
                      {isDeleting ? "..." : "Confirm"}
                    </button>
                    <button
                      onClick={() => setConfirmingDeleteId(null)}
                      className="text-[10px] font-bold text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => startEdit(entry)}
                      className="p-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-lg text-slate-500 cursor-pointer"
                      title="Edit"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setConfirmingDeleteId(entry.id)}
                      className="p-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-100 rounded-lg text-rose-500 cursor-pointer"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ExpenseTracker;