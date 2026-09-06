import { React, useState, useEffect } from "react";
import {
  doc,
  addDoc,
  updateDoc,
  query,
  where,
  getDocs,
  deleteDoc,
  collection,
} from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { toast, Toaster } from "react-hot-toast";
import ManageUsersModal from "./ManageUsersModal";
import { useOutletContext } from "react-router-dom";
import {
  MapPin,
  Pickaxe,
  CircleCheck,
  Clock,
  CircleX,
  SquarePen,
  Send,
  Trash,
  Wallet,
} from "lucide-react";

// Payment-reminder webhook URL comes from the environment (.env / .env.local):
//   VITE_N8N_PAYMENT_REMINDER_WEBHOOK_URL=https://your-n8n-instance.example.com/webhook/payment-reminder
// Falls back to the placeholder if the env var isn't set.
const N8N_PAYMENT_REMINDER_WEBHOOK_URL =
  import.meta.env.VITE_N8N_PAYMENT_REMINDER_WEBHOOK_URL ||
  "https://your-n8n-instance.example.com/webhook/payment-reminder";

// Status-change webhook URL comes from the environment (.env / .env.local):
//   VITE_N8N_STATUS_CHANGE_WEBHOOK_URL=https://your-n8n-instance.example.com/webhook/school-status-change
// Falls back to the placeholder if the env var isn't set, so the safety
// checks in handleStatusChange still have something sane to compare against.
const N8N_STATUS_CHANGE_WEBHOOK_URL =
  import.meta.env.VITE_N8N_STATUS_CHANGE_WEBHOOK_URL ||
  "https://your-n8n-instance.example.com/webhook/school-status-change";

const ApprovedSchoolsBox = () => {
  const { schools = [] } = useOutletContext() || {};
  const [modalOpen, setModalOpen] = useState(false);
  const [activeSchool, setActiveSchool] = useState(null);
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false);
  const [recordPaymentSchool, setRecordPaymentSchool] = useState(null);

  const handleManageUsers = (school) => {
    setActiveSchool(school);
    setModalOpen(true);
  };

  const handleOpenRecordPayment = (school) => {
    setRecordPaymentSchool(school);
    setRecordPaymentOpen(true);
  };

  // Fires whenever a school's Active/Inactive status actually changes —
  // whether toggled here or from inside ManageUsersModal. Wire the URL
  // above to your n8n webhook to dispatch status-change notification emails.
  const handleStatusChange = async (school, previousStatus, newStatus) => {
    if (previousStatus === newStatus) return;
    if (!import.meta.env.VITE_N8N_STATUS_CHANGE_WEBHOOK_URL) {
      console.warn(
        "VITE_N8N_STATUS_CHANGE_WEBHOOK_URL is not set — skipping status-change webhook call.",
      );
      return;
    }
    try {
      await fetch(N8N_STATUS_CHANGE_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schoolId: school.id,
          schoolName: school.schoolName,
          email: school.email,
          previousStatus,
          newStatus,
        }),
      });
    } catch (err) {
      console.error("Status-change webhook failed:", err);
    }
  };

  // One-click payment reminder — fires an n8n webhook instead of the old
  // window.prompt()-based manual invoice flow.
  const handleSendPaymentReminder = async (school) => {
    if (!import.meta.env.VITE_N8N_PAYMENT_REMINDER_WEBHOOK_URL) {
      console.warn(
        "VITE_N8N_PAYMENT_REMINDER_WEBHOOK_URL is not set — skipping payment-reminder webhook call.",
      );
      toast.error("Payment reminder webhook is not configured.");
      return;
    }
    const netFee = Number(school.totalPackageFee) || 0;
    const totalPaid = Number(school.totalPaid) || 0;
    const remainingBalance = Math.max(netFee - totalPaid, 0);

    try {
      await fetch(N8N_PAYMENT_REMINDER_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schoolId: school.id,
          schoolName: school.schoolName,
          email: school.email,
          paymentStatus: school.paymentStatus || "unpaid",
          totalPaid,
          netFee,
          remainingBalance,
        }),
      });
      toast.success(`Payment reminder queued for ${school.schoolName}.`);
    } catch (err) {
      console.error("Payment reminder webhook failed:", err);
      toast.error("Failed to queue payment reminder.");
    }
  };

  const handleDeleteSchool = async (school) => {
    const confirmation = window.confirm(
      `Are you sure you want to completely delete ${school.schoolName}? This will permanently delete school records, user data and invoices.`,
    );
    if (!confirmation) return;
    try {
      await deleteDoc(doc(db, "schools", school.id));
      if (school.email) {
        const useRef = collection(db, "users");
        const q = query(useRef, where("email", "==", school.email));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          const userDocId = querySnapshot.docs[0].id;
          await deleteDoc(doc(db, "users", userDocId));
        }
        toast.success(`${school.schoolName} has been deleted successfully!`);
      }
    } catch (err) {
      console.error("Deletion Failed", err);
      toast.error("Failed to delete school configuration profile.");
    }
  };

  if (!schools || schools.length === 0) {
    return (
      <div className="col-span-full flex flex-col items-center justify-center py-16 text-slate-500">
        <span className="text-4xl mb-3">🏫</span>
        <p className="text-sm font-medium">No approved schools found.</p>
      </div>
    );
  }

  return (
    <>
      <Toaster position="top-right" reverseOrder={false} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6 w-full">
        {schools.map((school) => {
          const today = new Date();
          const fallbackDay = school.registrationDate
            ? school.registrationDate.split("-")[2]
            : String(today.getDate()).padStart(2, "0");
          const targetDay = Number(school.billingDay || fallbackDay);
          let targetYear = today.getFullYear();
          let targetMonth = today.getMonth() + 1;

          if (today.getDate() >= targetDay) {
            targetMonth += 1;
            if (targetMonth > 12) {
              targetMonth = 1;
              targetYear += 1;
            }
          }

          const formattedMonth = String(targetMonth).padStart(2, "0");
          const formattedDay = String(targetDay).padStart(2, "0");
          const calculatedDeadline = `${targetYear}-${formattedMonth}-${formattedDay}`;

          return (
            <div
              key={school.id}
              className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 shadow-xl backdrop-blur-md flex flex-col justify-between space-y-4"
            >
              <div className="min-w-0 overflow-hidden">
                <div className="flex items-center justify-between gap-2 min-w-0 overflow-hidden">
                  <img
                    src={school.logoURL}
                    className="w-8 h-8 rounded-lg object-cover mr-2"
                    alt="logo"
                  />
                  <h3
                    className="text-lg font-bold text-white tracking-tight truncate flex-1 min-w-0"
                    title={school.schoolName}
                  >
                    {school.schoolName}
                  </h3>
                  <span
                    className={`shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap ${
                      school.status === "active"
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                    }`}
                  >
                    <span className="mr-1 text-[10px]">●</span>
                    {school.status === "active" ? "Active" : "Inactive"}
                  </span>
                  <span
                    className={`shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border whitespace-nowrap ${
                      (school.selectedPlan || school.plan) === "pro"
                        ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                        : "bg-slate-700/30 text-slate-300 border-slate-600/30"
                    }`}
                  >
                    {(school.selectedPlan || school.plan) === "pro"
                      ? "Pro Plan"
                      : "Free Plan"}
                  </span>
                </div>
                {school.address && (
                  <p
                    className="mt-4 flex text-xs text-slate-400 truncate"
                    title={school.address}
                  >
                    <MapPin className="w-4 h-4 mr-2 text-slate-500" />{" "}
                    {school.address}
                  </p>
                )}
              </div>

              <div className="text-xs space-y-1 text-slate-300 border-t border-slate-800/60 pt-3">
                {school.principal && (
                  <p>
                    <span className="text-slate-500">Principal:</span>{" "}
                    {school.principal}
                  </p>
                )}
                {school.email && (
                  <p>
                    <span className="text-slate-500">Email:</span>{" "}
                    {school.email}
                  </p>
                )}
                {school.cnic && (
                  <p>
                    <span className="text-slate-500">CNIC:</span> {school.cnic}
                  </p>
                )}
              </div>

              {/* Billing Sub-ledger */}
              <div className="rounded-xl bg-slate-950/60 p-3.5 border border-slate-800/40 text-xs space-y-2">
                {/* Row 1: Payment Status */}
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Payment Status:</span>

                  {school.paymentStatus === "advance" && (
                    <span className="text-indigo-400 font-bold flex items-center gap-1">
                      <Pickaxe className="w-4 h-4 mr-1" /> Advance Paid
                    </span>
                  )}
                  {school.paymentStatus === "paid" && (
                    <span className="text-emerald-400 font-semibold flex">
                      <CircleCheck className="w-4 h-4 mr-1" /> Fully Paid
                    </span>
                  )}
                  {school.paymentStatus === "partial" && (
                    <span className="text-amber-400 font-semibold flex">
                      <Clock className="w-4 h-4 mr-1" /> Partially Paid
                    </span>
                  )}
                  {(school.paymentStatus === "unpaid" ||
                    !school.paymentStatus) && (
                    <span className="text-red-400 font-semibold flex">
                      <CircleX className="w-4 h-4 mr-1" /> Unpaid
                    </span>
                  )}
                </div>

                {/* Row 2: Total Paid */}
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Total Paid:</span>
                  <span className="font-semibold text-emerald-400">
                    PKR {school.totalPaid || 0}
                  </span>
                </div>

                {/* Row 3: Registration Date */}
                <div className="flex justify-between items-center w-full">
                  <span className="text-slate-500">Registration Date:</span>
                  <span className="text-slate-300">
                    {school.registrationDate}
                  </span>
                </div>

                {/* Row 4: Upcoming Deadline */}
                <div className="flex justify-between items-center border-t border-slate-800/60 pt-1.5 mt-1">
                  <span className="text-slate-500">Upcoming Deadline:</span>
                  <span className="text-cyan-400 font-medium">
                    {calculatedDeadline}
                  </span>
                </div>
              </div>

              <div className="flex gap-2 pt-1 flex-wrap">
                <button
                  onClick={() => handleManageUsers(school)}
                  className="flex items-center justify-center gap-1 cursor-pointer flex-1 text-center py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition min-w-22.5"
                >
                  <SquarePen className="w-4 h-4" /> Edit
                </button>
                <button
                  onClick={() => handleOpenRecordPayment(school)}
                  className="flex items-center justify-center gap-1 cursor-pointer flex-1 text-center py-2 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 rounded-xl text-xs font-semibold transition min-w-22.5"
                >
                  <Wallet className="w-4 h-4" /> Record Payment
                </button>
                <button
                  onClick={() => handleSendPaymentReminder(school)}
                  className="flex items-center justify-center gap-1 cursor-pointer flex-1 text-center py-2 bg-cyan-600/20 text-cyan-400 hover:bg-cyan-600/30 rounded-xl text-xs font-semibold transition min-w-22.5"
                >
                  <Send className="w-4 h-4" /> Send Reminder
                </button>
                <button
                  onClick={() => handleDeleteSchool(school)}
                  className="cursor-pointer px-3 py-2 bg-red-600/10 text-red-400 hover:bg-red-600 hover:text-white rounded-xl text-xs font-semibold transition"
                  title="Delete School Profile"
                >
                  <Trash className="w-5 h-5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <ManageUsersModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        school={activeSchool}
        onStatusChange={handleStatusChange}
      />

      <RecordPaymentModal
        isOpen={recordPaymentOpen}
        onClose={() => setRecordPaymentOpen(false)}
        school={recordPaymentSchool}
      />
    </>
  );
};

// Small dedicated modal for logging an incoming payment against an already
// approved/active school. Adds the amount to the payments sub-collection,
// bumps totalPaid, and recomputes paymentStatus.
const RecordPaymentModal = ({ isOpen, onClose, school }) => {
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [method, setMethod] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setAmount("");
      setPaymentDate(new Date().toISOString().split("T")[0]);
      setMethod("");
    }
  }, [isOpen]);

  if (!isOpen || !school) return null;

  const netFee = Number(school.totalPackageFee) || 0;
  const totalPaid = Number(school.totalPaid) || 0;
  const remaining = Math.max(netFee - totalPaid, 0);

  const newAmount = parseFloat(amount) || 0;
  const projectedTotalPaid = totalPaid + newAmount;
  const projectedRemaining = Math.max(netFee - projectedTotalPaid, 0);

  const statusMeta = {
    advance: { label: "Advance Paid", className: "text-indigo-400" },
    paid: { label: "Fully Paid", className: "text-emerald-400" },
    partial: { label: "Partially Paid", className: "text-amber-400" },
    unpaid: { label: "Unpaid", className: "text-red-400" },
  };
  const currentStatus =
    statusMeta[school.paymentStatus] || statusMeta.unpaid;

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (newAmount <= 0) {
      toast.error("Enter a valid payment amount.");
      return;
    }

    setSaving(true);
    try {
      // 1. Log the payment in the school's payments sub-collection
      await addDoc(collection(db, "schools", school.id, "payments"), {
        amount: newAmount,
        date: paymentDate || new Date().toISOString().split("T")[0],
        type: "Invoice Payment",
        method: method.trim() || "N/A",
      });

      // 2. Bump totalPaid and recompute paymentStatus against the net fee
      const updatedTotalPaid = totalPaid + newAmount;
      let updatedPaymentStatus = "unpaid";
      if (netFee === 0 || updatedTotalPaid >= netFee) {
        updatedPaymentStatus = "paid";
      } else if (updatedTotalPaid > 0 && updatedTotalPaid < netFee) {
        updatedPaymentStatus = "partial";
      }

      await updateDoc(doc(db, "schools", school.id), {
        totalPaid: updatedTotalPaid,
        paymentStatus: updatedPaymentStatus,
      });

      toast.success(
        `Recorded PKR ${newAmount} for ${school.schoolName}. New total: PKR ${updatedTotalPaid}.`,
      );
      onClose();
    } catch (err) {
      console.error("Failed to record payment:", err);
      toast.error("Failed to record payment.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-slate-800 pb-3">
          <h3 className="text-lg font-bold text-white truncate">
            💳 Record Payment: {school.schoolName}
          </h3>
          <button
            onClick={onClose}
            disabled={saving}
            className="text-slate-400 hover:text-white text-sm disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        {/* Current status + ledger snapshot */}
        <div className="rounded-xl bg-slate-950/60 border border-slate-800/40 p-3.5 text-xs space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Current Status:</span>
            <span className={`font-semibold ${currentStatus.className}`}>
              {currentStatus.label}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Net Fee / Package Amount:</span>
            <span className="font-semibold text-white">PKR {netFee}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Total Already Paid:</span>
            <span className="font-semibold text-emerald-400">
              PKR {totalPaid}
            </span>
          </div>
          <div className="flex justify-between items-center border-t border-slate-800/60 pt-1.5 mt-1">
            <span className="text-slate-400">Remaining Balance:</span>
            <span className="font-semibold text-amber-400">
              PKR {remaining}
            </span>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-sm">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              New Payment Amount (PKR)
            </label>
            <input
              type="number"
              required
              min="0"
              placeholder="e.g. 1500"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Payment Date
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Method / Notes
              </label>
              <input
                type="text"
                placeholder="e.g. Bank transfer"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {newAmount > 0 && (
            <div className="rounded-lg border border-emerald-500/10 bg-emerald-500/5 px-3 py-2 text-xs text-slate-300">
              New Total Paid:{" "}
              <span className="font-semibold text-emerald-400">
                PKR {projectedTotalPaid}
              </span>{" "}
              · Remaining After:{" "}
              <span className="font-semibold text-amber-400">
                PKR {projectedRemaining}
              </span>
            </div>
          )}

          {/* Form Actions */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="cursor-pointer flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="cursor-pointer flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium transition shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving..." : "Save Payment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ApprovedSchoolsBox;