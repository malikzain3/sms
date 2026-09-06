import React, { useState } from "react";
import { doc, updateDoc, collection, addDoc, setDoc } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { toast, Toaster } from "react-hot-toast";
import ApprovePaymentModal from "./ApprovePaymentModal";
import { useOutletContext } from "react-router-dom";
import { Receipt } from "lucide-react";

const PendingInquiries = () => {
  const { inquiries = [] } = useOutletContext() || {};
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState(null);

  const handleApproveClick = (item) => {
    setSelectedItem(item);
    setModalOpen(true);
  };

  const handleApprove = async (paymentData) => {
    if (!selectedItem) return;

    const todayObj = new Date();
    const todayStr = todayObj.toISOString().split("T")[0];
    const billingDay = todayObj.getDate();
    // const nextDeadline = new Date(today);
    // nextDeadline.setDate(nextDeadline.getDate() + 30);
    // const formattedDeadline = nextDeadline.toISOString().split("T")[0];

    try {
      const schoolRef = await addDoc(collection(db, "schools"), {
        schoolName: selectedItem.schoolName,
        principal: selectedItem.fullName,
        email: selectedItem.email,
        phone: selectedItem.phone,
        address: selectedItem.schoolAddress,
        cnic: selectedItem.cnic || "N/A",
        logoURL: selectedItem.logoURL || "",
        plan: selectedItem.selectedPlan || "free",
        selectedPlan: selectedItem.selectedPlan || "free",
        registrationDate: todayStr,
        billingDay: billingDay,
        status: "active",
        totalPackageFee: Number(paymentData.totalFee),
        totalPaid: Number(paymentData.amountPaid),
        discountApplied: Number(paymentData.discount || 0),
        paymentStatus: paymentData.paymentStatus,
        // upcomingPayment: formattedDeadline,
        createdAt: todayStr,
        // lastPayment: today,
      });

      if (paymentData.amountPaid > 0) {
        await addDoc(collection(db, "schools", schoolRef.id, "payments"), {
          amount: Number(paymentData.amountPaid),
          date: todayStr,
          type: "Upfront Registration",
        });
      }

      // 3. Create mapping credential inside users collection
      await setDoc(doc(db, "users", selectedItem.uid), {
        email: selectedItem.email,
        role: "schooladmin",
        schoolId: schoolRef.id,
        status: "active",
        selectedPlan: selectedItem.selectedPlan || "free",
      });

      // 4. Update initial tracking record status to approved
      await updateDoc(doc(db, "inquiries", selectedItem.id), {
        status: "approved",
      });

      // 5. Notify n8n that the account was approved. This must never block
      // or fail the approval flow itself, so it gets its own try/catch and
      // an early-return safety check for the missing env var.
      try {
        const webhookUrl = import.meta.env.VITE_N8N_ACCOUNT_APPROVAL_WEBHOOK_URL;
        if (!webhookUrl) {
          console.warn(
            "VITE_N8N_ACCOUNT_APPROVAL_WEBHOOK_URL is not set — skipping account-approval webhook call.",
          );
        } else {
          await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              schoolName: selectedItem.schoolName,
              applicantName: selectedItem.fullName,
              email: selectedItem.email,
              selectedPlan: selectedItem.selectedPlan,
              status: "approved",
              schoolId: schoolRef.id,
            }),
          });
        }
      } catch (webhookErr) {
        console.error("Account-approval webhook failed:", webhookErr);
      }

      toast.success("Inquiry Approved & Payment History Initialized!");
      setModalOpen(false);
    } catch (err) {
      console.error(err);
      toast.error("Approve failed: " + err.message);
    }
  };

  const handleDecline = async (id) => {
    try {
      await updateDoc(doc(db, "inquiries", id), { status: "declined" });
      toast.success("Inquiry declined.");
    } catch (err) {
      toast.error("Decline failed:", err);
    }
  };

  if (!inquiries || inquiries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-500">
        <span className="text-4xl mb-3">📭</span>
        <p className="text-sm font-medium">
          No pending inquiries at the moment.
        </p>
      </div>
    );
  }

  return (
    <>
      <Toaster position="top-right" reverseOrder={false} />
      {inquiries.map((item) => {
        const isPro = item.selectedPlan === "pro";

        return (
          <div
            key={item.id}
            className="flex flex-col lg:flex-row justify-between items-start lg:items-center p-5 rounded-2xl border border-slate-800 bg-slate-900/20 gap-4 shadow-md"
          >
            {/* Left: Inquiry Details */}
            <div className="w-full space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-base font-bold text-white">
                  {item.schoolName}
                </h4>
                <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-400">
                  New Inquiry
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wide ${
                    isPro
                      ? "bg-indigo-500/10 text-indigo-400"
                      : "bg-slate-700/40 text-slate-300"
                  }`}
                >
                  {isPro ? "Pro Plan" : "Free Plan"}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Applicant: <span className="text-slate-200">{item.fullName}</span>{" "}
                | Address:{" "}
                <span className="text-slate-200">{item.schoolAddress}</span>
              </p>
              <p className="text-xs text-slate-400">
                Email:{" "}
                <span className="font-mono text-cyan-500/80">{item.email}</span>
              </p>
              <p className="text-xs text-slate-400">
                Contact:{" "}
                <span className="font-mono text-amber-400">{item.phone}</span>
              </p>
              <p className="text-xs text-slate-400">
                CNIC:{" "}
                <span className="font-mono text-slate-200">
                  {item.cnic || "N/A"}
                </span>
              </p>

              {/* Pro Plan Only: Transaction ID + Receipt Preview */}
              {isPro && (
                <div className="mt-2 flex flex-wrap items-center gap-3 rounded-lg border border-indigo-500/10 bg-indigo-500/5 px-3 py-2">
                  <p className="text-xs text-slate-400">
                    Transaction ID:{" "}
                    <span className="font-mono text-indigo-300">
                      {item.transactionId || "N/A"}
                    </span>
                  </p>
                  {item.paymentReceiptUrl && (
                    <button
                      type="button"
                      onClick={() =>
                        setReceiptPreviewUrl(item.paymentReceiptUrl)
                      }
                      className="cursor-pointer flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-semibold text-indigo-300 transition hover:bg-indigo-500/20"
                    >
                      <Receipt className="h-3.5 w-3.5" />
                      View Receipt
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Right: Action Buttons */}
            <div className="flex gap-2 w-full lg:w-auto">
              <button
                onClick={() => handleApproveClick(item)}
                className="cursor-pointer px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition shadow-lg shadow-emerald-900/20"
              >
                ✅ Approve & Onboard
              </button>
              <button
                onClick={() => handleDecline(item.id)}
                className="cursor-pointer px-5 py-2 bg-slate-800 hover:bg-red-900/60 hover:text-red-400 text-slate-300 rounded-xl text-xs font-semibold transition"
              >
                ❌ Decline
              </button>
            </div>
          </div>
        );
      })}

      <ApprovePaymentModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onConfirm={handleApprove}
        schoolName={selectedItem?.schoolName || ""}
        plan={selectedItem?.selectedPlan || "free"}
      />

      {/* Receipt Preview Modal */}
      {receiptPreviewUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setReceiptPreviewUrl(null)}
        >
          <div
            className="relative w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-bold text-white">Payment Receipt</h4>
              <button
                onClick={() => setReceiptPreviewUrl(null)}
                className="cursor-pointer text-sm text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <img
              src={receiptPreviewUrl}
              alt="Payment receipt"
              className="max-h-[70vh] w-full rounded-xl border border-slate-800 object-contain"
            />
          </div>
        </div>
      )}
    </>
  );
};

export default PendingInquiries;