import React, { useState, useEffect } from "react";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  getDocs,
  query,
  orderBy,
  increment,
  runTransaction,
} from "firebase/firestore";
import { db } from "../../firebaseConfig";
import {
  CalendarDays,
  Tags,
  Pencil,
  Trash2,
  Plus,
  Printer,
  CalendarRange,
  X,
} from "lucide-react";
import FeeReceiptModal from "./FeeReceiptModal";
import {
  currentMonthKey,
  resolveAnchorMonth,
  computeFeeState,
  legacyBalanceFromState,
} from "./feeEngine";


const generateReceiptBase64 = async (elementId) => {
  const element = document.getElementById(elementId);
  if (!element) return "";
  
  if (!window.html2pdf) {
    await new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
      script.onload = resolve;
      document.body.appendChild(script);
    });
  }

  const opt = {
    margin: 10,
    filename: 'receipt.pdf',
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  const pdfArrayBuffer = await window.html2pdf().set(opt).from(element).outputPdf('arraybuffer');
  let binary = '';
  const bytes = new Uint8Array(pdfArrayBuffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};
// Firestore paths used:
//   students/{studentId}                          -> monthlyFee, feeAnchorMonth,
//                                                     feeStatus, monthsBehind, arrearsAmount,
//                                                     totalPaid, schoolId, classId (auto-managed).
//                                                     `balance` / `currentBillingMonth` are also
//                                                     kept written (legacy fields) in case any
//                                                     other page still reads them.
//   students/{studentId}/feePayments/{paymentId}   -> { amount, date, type, note, schoolId, receiptNo, createdAt }
//   schools/{schoolId}/monthlyStats/{yyyy-mm}      -> { totalCollected, paymentCount, byType: {
//                                                     tuition, admission, exam, transport, other },
//                                                     updatedAt } (income aggregate — powers
//                                                     Dashboard Card 4 and the Finance page)
//   schools/{schoolId}/meta/receiptCounter         -> { count } (sequential receipt numbering, incremented in a transaction)
//
// ---- Monthly billing model (see ./feeEngine.js for the actual math) ----
// feeStatus is NEVER set by hand from here. Every time a payment is added,
// edited, or deleted, this component re-reads the student's ENTIRE
// Monthly Tuition payment history and calls computeFeeState() to recompute
// their status from scratch — there is no incrementally-nudged number
// that can drift out of sync anymore. See feeEngine.js for the full
// explanation of the month-by-month replay model and why it correctly
// handles a lump payment that clears an old shortfall AND the current
// month in one go, instead of overshooting into "Advance".
//
// IMPORTANT: schoolId on a payment is NEVER guessed or defaulted. If it's
// missing on the passed-in studentData, we re-fetch the student doc to get
// the authoritative value. If that's also missing, the save is blocked with
// an error instead of silently tagging the payment with a placeholder — a
// placeholder would (a) make that money vanish from the school's dashboard
// totals, and (b) risk bucketing multiple schools' payments under the same
// fake id once this app has more than one tenant.

const FEE_TYPES = [
  "Monthly Tuition",
  "Admission Fee",
  "Exam Fee",
  "Transport Fee",
  "Other",
];

// Maps each fee type to the key it's bucketed under inside the monthly
// aggregate's `byType` map, so the Finance page can show Tuition vs Exam vs
// Admission vs Transport vs Other collections separately instead of just
// one lump `totalCollected` figure.
const FEE_TYPE_TO_KEY = {
  "Monthly Tuition": "tuition",
  "Admission Fee": "admission",
  "Exam Fee": "exam",
  "Transport Fee": "transport",
  Other: "other",
};
const feeTypeKey = (type) => FEE_TYPE_TO_KEY[type] || "other";

const todayStr = () => new Date().toISOString().split("T")[0];

const statusStyles = {
  Paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Partial: "bg-amber-50 text-amber-700 border-amber-200",
  Advance: "bg-indigo-50 text-indigo-700 border-indigo-200",
  Unpaid: "bg-rose-50 text-rose-700 border-rose-200",
};

// Builds "August 2026" style labels for the month picker without pulling
// in a date library.
const monthLabel = (mk) => {
  if (!mk) return "";
  const [y, m] = mk.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
};

const N8N_WEBHOOK_URL = import.meta.env.VITE_N8N_WEBHOOK_URL;
const StudentFeeLedger = ({ studentId, studentData = {} }) => {
  const [feeHistory, setFeeHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  // Which month's records/status the ledger is showing. Defaults to the
  // real current month. "all" shows every record ever, with no status
  // recompute filter applied.
  const [viewMonth, setViewMonth] = useState(currentMonthKey());

  // ---- Add / Edit payment modal ----
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null); // null => Add mode

  const [formAmount, setFormAmount] = useState("");
  const [formDate, setFormDate] = useState(todayStr());
  const [formType, setFormType] = useState(FEE_TYPES[0]);
  const [formNote, setFormNote] = useState("");
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // ---- Receipt modal (shown right after adding a payment, or on demand) ----
  const [receiptEntry, setReceiptEntry] = useState(null);

  // ---- Monthly fee edit modal ----
  const [isFeeEditOpen, setIsFeeEditOpen] = useState(false);
  const [editMonthlyFee, setEditMonthlyFee] = useState("");
  const [feeEditError, setFeeEditError] = useState("");
  const [isSavingFee, setIsSavingFee] = useState(false);

  useEffect(() => {
    if (!studentId) return;
    const q = query(
      collection(db, "students", studentId, "feePayments"),
      orderBy("date", "desc"),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const logs = [];
        snap.forEach((d) => logs.push({ id: d.id, ...d.data() }));
        // Firestore's orderBy("date", "desc") has no defined order for two
        // payments recorded on the SAME date — that's what let a brand
        // new receipt land anywhere in the list instead of at the top.
        // Break ties with createdAt (newest first) so same-day entries
        // are always ordered by when they were actually recorded.
        logs.sort((a, b) => {
          if (a.date !== b.date) return a.date < b.date ? 1 : -1;
          const aC = a.createdAt || "";
          const bC = b.createdAt || "";
          return aC < bC ? 1 : aC > bC ? -1 : 0;
        });
        setFeeHistory(logs);
        setIsLoadingHistory(false);
      },
      (err) => {
        console.error("Error loading fee history:", err);
        setIsLoadingHistory(false);
      },
    );
    return () => unsub();
  }, [studentId]);

  // Recomputes this student's ENTIRE fee state from their real payment
  // history and persists it. Runs once whenever this component mounts for
  // a student (self-heals automatically — no "already migrated" flag to
  // track, it's cheap and safe to run every time), and again after every
  // payment add/edit/delete or fee change. Firestore is always treated as
  // the source of truth for the payments themselves: even if a payment
  // was ever deleted outside the app (or some other bug slipped through),
  // simply opening this student's ledger throws away the old cached
  // feeStatus/balance and rebuilds it fresh from the actual feePayments
  // records — nothing here is ever nudged by a +/- delta.
  useEffect(() => {
    if (!studentId) return;
    recomputeAndPersist(studentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const recomputeAndPersist = async (sid) => {
    if (!sid) return;
    try {
      const paymentsSnap = await getDocs(
        collection(db, "students", sid, "feePayments"),
      );
      const payments = [];
      let lifetimeTotal = 0;
      paymentsSnap.forEach((d) => {
        const p = d.data();
        payments.push(p);
        lifetimeTotal += Number(p.amount || 0);
      });

      const studentRef = doc(db, "students", sid);
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(studentRef);
        if (!snap.exists()) return;
        const data = snap.data();
        const todayMk = currentMonthKey();
        const fee = Number(data.monthlyFee || 0);
        // feeAnchorMonth is fixed once and never moves again. Falls back
        // to the old currentBillingMonth field the first time this runs
        // for a student who was on the previous model, so nobody loses
        // their billing history in the switch-over.
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
          // Legacy fields kept in sync for any other page (e.g. a
          // Dashboard card or student list badge) that might still read
          // the old single-number balance / currentBillingMonth fields.
          balance: legacyBalanceFromState(state),
          currentBillingMonth: todayMk,
          feeStateUpdatedAt: new Date().toISOString(),
        });
      });
    } catch (err) {
      console.error("Error recomputing fee status:", err);
    }
  };

  // Returns the authoritative schoolId for this student. Falls back to a
  // fresh read of the student document if the prop is stale/missing.
  // Returns null (never a placeholder) if it truly can't be found.
  const resolveSchoolId = async () => {
    if (studentData.schoolId) return studentData.schoolId;
    try {
      const snap = await getDoc(doc(db, "students", studentId));
      return snap.exists() ? snap.data().schoolId || null : null;
    } catch (err) {
      console.error("Error resolving schoolId:", err);
      return null;
    }
  };

  // Atomically adjusts the school's monthly collection aggregate so the
  // Dashboard can read one small document instead of every payment record.
  const adjustMonthlyStats = async (
    schoolId,
    monthKey,
    deltaAmount,
    deltaCount,
    feeType,
  ) => {
    if (!schoolId || !monthKey || (deltaAmount === 0 && deltaCount === 0))
      return;
    try {
      const payload = {
        totalCollected: increment(deltaAmount),
        paymentCount: increment(deltaCount),
        updatedAt: new Date().toISOString(),
      };
      // Only bump the per-type breakdown when there's an actual amount
      // moving — a pure count-only correction has no type to attribute.
      if (deltaAmount !== 0) {
        payload[`byType.${feeTypeKey(feeType)}`] = increment(deltaAmount);
      }
      await setDoc(
        doc(db, "schools", schoolId, "monthlyStats", monthKey),
        payload,
        { merge: true },
      );
    } catch (err) {
      console.error("Error updating monthly stats:", err);
    }
  };

  // ---- Payment modal handlers ----
  const openAddPaymentModal = () => {
    setEditingPayment(null);
    setFormAmount(
      studentData.monthlyFee != null ? String(studentData.monthlyFee) : "",
    );
    setFormDate(todayStr());
    setFormType(FEE_TYPES[0]);
    setFormNote("");
    setFormError("");
    setIsPaymentModalOpen(true);
  };

  const openEditPaymentModal = (entry) => {
    setEditingPayment(entry);
    setFormAmount(String(entry.amount ?? ""));
    setFormDate(entry.date || todayStr());
    setFormType(entry.type || FEE_TYPES[0]);
    setFormNote(entry.note || "");
    setFormError("");
    setIsPaymentModalOpen(true);
  };

  const handleSubmitPayment = async (e) => {
    e.preventDefault();

    // 1. Validation checks first, before touching any loading state.
    if (!formAmount || Number(formAmount) <= 0) {
      setFormError("Enter a valid amount.");
      return;
    }
    if (!formDate) {
      setFormError("Payment date is required.");
      return;
    }

    setIsSaving(true);
    setFormError("");

    try {
      // Never fall back to a placeholder schoolId — repair it from the
      // student doc instead, and block the save if it truly can't be found.
      const schoolId = await resolveSchoolId();
      if (!schoolId) {
        setFormError(
          "This student's school link is missing, so this payment can't be saved safely. Please reopen or re-save the student profile first.",
        );
        setIsSaving(false);
        return;
      }

      const newAmount = Number(formAmount);
      const newMonthKey = formDate.slice(0, 7); // "yyyy-mm"

      const payload = {
        amount: newAmount,
        date: formDate,
        type: formType,
        note: formNote.trim(),
        schoolId,
      };

      if (editingPayment) {
        // ---- EDIT: adjust the monthly aggregate by the delta ----
        const oldAmount = Number(editingPayment.amount || 0);
        const oldMonthKey = (editingPayment.date || "").slice(0, 7);

        await updateDoc(
          doc(db, "students", studentId, "feePayments", editingPayment.id),
          payload,
        );

        // Always modeled as "remove the old payment, add the new one" —
        // this way a fee-type change (e.g. Exam Fee edited into Monthly
        // Tuition) moves the money between byType buckets correctly even
        // when the month didn't change, instead of only adjusting the
        // total and leaving byType wrong.
        const sameMonth = oldMonthKey === newMonthKey;
        await adjustMonthlyStats(
          schoolId,
          oldMonthKey,
          -oldAmount,
          sameMonth ? 0 : -1,
          editingPayment.type,
        );
        await adjustMonthlyStats(
          schoolId,
          newMonthKey,
          newAmount,
          sameMonth ? 0 : 1,
          formType,
        );

        await recomputeAndPersist(studentId);
        setIsPaymentModalOpen(false);
      } else {
        // ---- ADD: assign a sequential receipt number inside a transaction
        // so two staff members saving at the same instant never collide. ----
        const counterRef = doc(
          db,
          "schools",
          schoolId,
          "meta",
          "receiptCounter",
        );
        const newPaymentRef = doc(
          collection(db, "students", studentId, "feePayments"),
        );
        const createdAt = new Date().toISOString();

        const receiptNo = await runTransaction(db, async (transaction) => {
          const counterSnap = await transaction.get(counterRef);
          const nextNumber =
            (counterSnap.exists() ? counterSnap.data().count : 0) + 1;
          const formattedReceiptNo = `RCPT-${new Date().getFullYear()}-${String(
            nextNumber,
          ).padStart(5, "0")}`;

          transaction.set(newPaymentRef, {
            ...payload,
            receiptNo: formattedReceiptNo,
            createdAt,
          });
          transaction.set(counterRef, { count: nextNumber }, { merge: true });

          return formattedReceiptNo;
        });

        await adjustMonthlyStats(schoolId, newMonthKey, newAmount, 1, formType);
        await recomputeAndPersist(studentId);

        setIsPaymentModalOpen(false);
        // Offer a receipt immediately for what was just recorded.
        setReceiptEntry({
          id: newPaymentRef.id,
          ...payload,
          receiptNo,
          createdAt,
        });
        if (studentData?.email && N8N_WEBHOOK_URL) {
        
          const webhookPayload = {
            studentName: studentData.name || "Student",
            studentEmail: studentData.email,
            amountPaid: newAmount,
            month: formDate.slice(0, 7),
            receiptId: receiptNo,
            feeType: formType,
            paymentDate: formDate,
          };

          fetch(N8N_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify(webhookPayload),
          }).catch((err) => console.error("n8n notification error:", err));
        }
      }
    } catch (err) {
      console.error("Error saving fee payment:", err);
      setFormError("Something went wrong while saving. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePayment = async (id) => {
    setIsDeleting(true);
    try {
      // Grab the entry's amount/date/schoolId before it's gone, so the
      // monthly aggregate can be decremented correctly.
      const entry = feeHistory.find((e) => e.id === id);

      await deleteDoc(doc(db, "students", studentId, "feePayments", id));

      if (entry) {
        const schoolId = entry.schoolId || (await resolveSchoolId());
        const monthKey = (entry.date || "").slice(0, 7);
        await adjustMonthlyStats(
          schoolId,
          monthKey,
          -Number(entry.amount || 0),
          -1,
          entry.type,
        );
      }

      await recomputeAndPersist(studentId);
      setConfirmingDeleteId(null);
    } catch (err) {
      console.error("Error deleting fee payment:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  // ---- Monthly fee edit handlers ----
  const openFeeEdit = () => {
    setEditMonthlyFee(
      studentData.monthlyFee != null ? String(studentData.monthlyFee) : "",
    );
    setFeeEditError("");
    setIsFeeEditOpen(true);
  };

  const handleSaveFee = async (e) => {
    e.preventDefault();
    if (!editMonthlyFee || Number(editMonthlyFee) <= 0) {
      setFeeEditError("Enter a valid monthly fee.");
      return;
    }

    setIsSavingFee(true);
    setFeeEditError("");
    try {
      const fee = Number(editMonthlyFee);
      await updateDoc(doc(db, "students", studentId), { monthlyFee: fee });
      await recomputeAndPersist(studentId);
      setIsFeeEditOpen(false);
    } catch (err) {
      console.error("Error updating monthly fee:", err);
      setFeeEditError("Something went wrong while saving. Please try again.");
    } finally {
      setIsSavingFee(false);
    }
  };

  const totalPaid = feeHistory.reduce(
    (sum, e) => sum + Number(e.amount || 0),
    0,
  );

  // The month picker changes what's displayed, but ALWAYS by replaying the
  // real payment history "as of" that month — never by touching the
  // student doc. Picking August just shows what the ledger looked like at
  // the end of August; it never writes anything.
  const fee = Number(studentData.monthlyFee || 0);
  const effectiveViewMonth =
    viewMonth === "all" ? currentMonthKey() : viewMonth;
  const isCurrentMonthView = effectiveViewMonth === currentMonthKey();
  const anchor = resolveAnchorMonth(
    studentData.feeAnchorMonth || studentData.currentBillingMonth || null,
    feeHistory,
    effectiveViewMonth,
  );
  const viewState = computeFeeState(
    feeHistory,
    fee,
    anchor,
    effectiveViewMonth,
  );
  const currentStatus = viewState.currentStatus;

  const visibleFeeHistory =
    viewMonth === "all"
      ? feeHistory
      : feeHistory.filter((e) => (e.date || "").slice(0, 7) === viewMonth);

  return (
    <div className="space-y-5 text-xs text-slate-700">
      {/* Monthly Fee + Status Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="bg-indigo-50/40 border border-indigo-100 rounded-2xl p-5 shadow-xs relative">
          <button
            onClick={openFeeEdit}
            className="absolute top-4 right-4 p-1.5 bg-white hover:bg-indigo-100 border border-indigo-200 rounded-lg text-indigo-600"
            title="Edit monthly fee"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <span className="text-[12px] text-slate-800 font-bold uppercase tracking-wide">
            Monthly Tuition Fee
          </span>
          <h4 className="text-xl font-black text-indigo-600 font-mono mt-2">
            Rs.{" "}
            {studentData.monthlyFee != null
              ? Number(studentData.monthlyFee).toLocaleString()
              : "—"}
          </h4>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-2.5 shadow-xs">
          <span className="text-[12px] text-slate-400 font-bold uppercase tracking-wide">
            {isCurrentMonthView
              ? "Current Account Status"
              : `Status as of ${monthLabel(effectiveViewMonth)}`}
          </span>
          <div className="mt-2">
            <span
              className={`inline-block px-3 py-1 rounded-full text-sm font-black uppercase tracking-wide border ${
                statusStyles[currentStatus] || statusStyles.Unpaid
              }`}
            >
              {currentStatus}
            </span>
          </div>
          <p className="text-[13px] text-slate-400 mt-2">
            {viewState.monthsBehind > 0 && (
              <>
                Behind by {viewState.monthsBehind}{" "}
                {viewState.monthsBehind === 1 ? "month" : "months"} — Rs.{" "}
                <span className="font-mono font-bold text-rose-600">
                  {viewState.arrearsAmount.toLocaleString()}
                </span>{" "}
                owed from before, plus this month's Rs.{" "}
                <span className="font-mono font-bold text-rose-600">
                  {fee.toLocaleString()}
                </span>
                .
              </>
            )}
            {viewState.monthsBehind === 0 &&
              currentStatus === "Advance" &&
              (viewState.advanceForFuture > 0 ? (
                <>
                  This month's tuition is covered — advance for future months:{" "}
                  <span className="font-mono font-bold text-indigo-600">
                    Rs. {viewState.advanceForFuture.toLocaleString()}
                  </span>
                </>
              ) : (
                "This month's tuition is covered."
              ))}
            {viewState.monthsBehind === 0 && currentStatus === "Partial" && (
              <>
                Paid so far this month:{" "}
                <span className="font-mono font-bold text-slate-600">
                  Rs. {viewState.paidThisMonth.toLocaleString()}
                </span>{" "}
                — still due:{" "}
                <span className="font-mono font-bold text-amber-600">
                  Rs. {viewState.dueThisMonth.toLocaleString()}
                </span>
              </>
            )}
            {viewState.monthsBehind === 0 &&
              currentStatus === "Paid" &&
              "This month's tuition is fully paid."}
            {viewState.monthsBehind === 0 &&
              currentStatus === "Unpaid" &&
              (fee > 0 ? (
                <>
                  No tuition paid this month — due:{" "}
                  <span className="font-mono font-bold text-rose-600">
                    Rs. {fee.toLocaleString()}
                  </span>
                </>
              ) : (
                "No tuition payment recorded for this month yet."
              ))}
          </p>
        </div>
      </div>

      {/* Fee Payment Ledger */}
      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h4 className="text-lg   font-black text-slate-900">
              Tuition Fee Ledger
            </h4>
            <p className="text-[14px] text-slate-400 mt-0.5">
              Total received to date (all fee types):{" "}
              <span className="font-mono font-bold text-emerald-600">
                Rs. {totalPaid.toLocaleString()}
              </span>{" "}
              — account status above only reflects Monthly Tuition payments.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="relative">
              <CalendarRange className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="month"
                value={viewMonth === "all" ? "" : viewMonth}
                onChange={(e) =>
                  setViewMonth(e.target.value || currentMonthKey())
                }
                className="bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-2.5 py-2 text-[14px] font-semibold focus:outline-hidden"
                title="Filter by month"
              />
            </div>
            <button
              type="button"
              onClick={() => setViewMonth("all")}
              className={`px-2.5 py-2 rounded-xl text-[14px] font-bold border transition ${
                viewMonth === "all"
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
              }`}
            >
              All
            </button>
            <button
              onClick={openAddPaymentModal}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition font-bold shadow-xs text-[13px] shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Payment
            </button>
          </div>
        </div>

        {isLoadingHistory ? (
          <p className="text-slate-400 italic text-[11px] py-4">
            Loading fee history...
          </p>
        ) : visibleFeeHistory.length === 0 ? (
          <p className="text-slate-400 italic text-[11px] py-4">
            {viewMonth === "all"
              ? "No fee payments recorded yet."
              : `No fee payments recorded for ${monthLabel(viewMonth)}.`}
          </p>
        ) : (
          <div className="space-y-1.5">
            {visibleFeeHistory.map((entry) => (
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
                    {entry.type || "Monthly Tuition"}
                  </span>
                  {entry.note && (
                    <span className="text-slate-400 italic">{entry.note}</span>
                  )}
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-mono text-emerald-600 font-bold">
                    + Rs. {Number(entry.amount).toLocaleString()}
                  </span>

                  {confirmingDeleteId === entry.id ? (
                    <>
                      <button
                        onClick={() => handleDeletePayment(entry.id)}
                        disabled={isDeleting}
                        className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold disabled:opacity-50"
                      >
                        {isDeleting ? "..." : "Confirm"}
                      </button>
                      <button
                        onClick={() => setConfirmingDeleteId(null)}
                        disabled={isDeleting}
                        className="px-2 py-1 bg-white border border-slate-200 rounded-lg font-bold text-slate-500"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => setReceiptEntry(entry)}
                        className="p-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 rounded-lg text-emerald-600"
                        title="Print / view receipt"
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => openEditPaymentModal(entry)}
                        className="p-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 rounded-lg text-indigo-600"
                        title="Edit payment"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => setConfirmingDeleteId(entry.id)}
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
                  {editingPayment ? "Edit Fee Payment" : "Record Fee Payment"}
                </h3>
                <p className="text-[14px] text-slate-400">
                  {editingPayment
                    ? "Update this payment entry."
                    : `Add a new payment for ${studentData.name || "this student"}.`}
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
                  className="w-full bg-slate-50 text-[15px] border border-slate-200 rounded-xl p-2.5 focus:outline-hidden mt-1 font-mono font-bold"
                  placeholder="e.g. 12500"
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
                    className="w-full bg-slate-50 text-[15px] border border-slate-200 rounded-xl p-2.5 focus:outline-hidden mt-1 font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="text-[13px] font-bold text-slate-400 uppercase tracking-wider">
                    Fee Type
                  </label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                    className="w-full bg-slate-50 text-[15px] border border-slate-200 rounded-xl p-2.5 focus:outline-hidden mt-1 font-semibold"
                  >
                    {FEE_TYPES.map((t) => (
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
                  className="w-full bg-slate-50 text-[15px] border border-slate-200 rounded-xl p-2.5 focus:outline-hidden mt-1"
                  placeholder="e.g. July tuition, paid via bank transfer"
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
                  className="w-1/2 py-2.5 bg-slate-100 text-slate-600 font-bold rounded-xl cursor-pointer text-[15px] hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="w-1/2 py-2.5 bg-indigo-600 text-white font-bold rounded-xl shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-[15px] hover:bg-indigo-700 transition-all"
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

      {/* Edit Monthly Fee Modal */}
      {isFeeEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs"
            onClick={() => setIsFeeEditOpen(false)}
          />
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-sm p-6 relative z-60">
            <div className="flex justify-between items-start pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-xl font-black text-slate-900">
                  Edit Monthly Fee
                </h3>
                <p className="text-[14px] text-slate-400">
                  Update {studentData.name || "this student"}'s expected monthly
                  tuition.
                </p>
              </div>
              <button
                onClick={() => setIsFeeEditOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xs p-1 cursor-pointer"
              >
                <X />
              </button>
            </div>

            <form
              onSubmit={handleSaveFee}
              className="space-y-3.5 text-xs text-slate-700"
            >
              <div>
                <label className="text-[13px] font-bold text-slate-400 uppercase tracking-wider">
                  Monthly Fee (Rs.)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={editMonthlyFee}
                  onChange={(e) => setEditMonthlyFee(e.target.value)}
                  className="w-full text-[15px] bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-hidden mt-1 font-mono font-bold"
                  required
                />
              </div>

              {feeEditError && (
                <p className="text-[15px] text-rose-600 font-bold">
                  {feeEditError}
                </p>
              )}

              <div className="pt-4 border-t border-slate-100 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsFeeEditOpen(false)}
                  className="w-1/2 py-2.5 bg-slate-100 text-slate-600 font-bold rounded-xl cursor-pointer text-[15px] hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingFee}
                  className="w-1/2 py-2.5 bg-indigo-600 text-white font-bold rounded-xl shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-[15px] hover:bg-indigo-700 transition-all"
                >
                  {isSavingFee ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Receipt Modal */}
      {receiptEntry && (
        <FeeReceiptModal
          entry={receiptEntry}
          student={studentData}
          onClose={() => setReceiptEntry(null)}
        />
      )}
    </div>
  );
};

export default StudentFeeLedger;
