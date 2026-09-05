import React, { useEffect, useState } from "react";

const ApprovePaymentModal = ({
  isOpen,
  onClose,
  onConfirm,
  schoolName,
  plan = "free",
}) => {
  const isFree = plan === "free";
  const [totalFee, setTotalFee] = useState("");
  const [discount, setDiscount] = useState("");
  const [amountPaid, setAmountPaid] = useState("");

  // Reset/prefill fields whenever the modal opens or the plan changes.
  // Free plan schools default to $0 across the board so nothing blocks
  // required-field validation.
  useEffect(() => {
    if (!isOpen) return;
    if (isFree) {
      setTotalFee("0");
      setDiscount("0");
      setAmountPaid("0");
    } else {
      setTotalFee("");
      setDiscount("");
      setAmountPaid("");
    }
  }, [isOpen, isFree]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();

    const rawFee = parseFloat(totalFee) || 0;
    const discountAmount = isFree ? 0 : parseFloat(discount) || 0;
    const netFee = Math.max(rawFee - discountAmount, 0);
    const paid = parseFloat(amountPaid) || 0;

    let paymentStatus = "unpaid";
    if (netFee === 0) {
      // Free plan (or a fully discounted Pro plan) — nothing owed.
      paymentStatus = "paid";
    } else if (paid >= netFee) {
      paymentStatus = "paid";
    } else if (paid > 0 && paid < netFee) {
      paymentStatus = "partial";
    }

    onConfirm({
      totalFee: netFee,
      amountPaid: paid,
      discount: discountAmount,
      paymentStatus,
    });

    setTotalFee("");
    setDiscount("");
    setAmountPaid("");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-slate-800 pb-3">
          <h3 className="text-lg font-bold text-white truncate">
            💰 Setup Billing: {schoolName}
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-sm"
          >
            ✕
          </button>
        </div>

        {/* Plan Badge */}
        <div className="flex items-center justify-between -mb-1">
          <span
            className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wide ${
              isFree
                ? "bg-slate-700/40 text-slate-300"
                : "bg-indigo-500/10 text-indigo-400"
            }`}
          >
            {isFree ? "Free Plan" : "Pro Plan"}
          </span>
        </div>

        {isFree && (
          <p className="text-xs text-slate-400">
            Free plan schools don't require billing setup — package fee and
            amount paid default to PKR 0.
          </p>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-sm">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Total Registration / Package Fee (PKR)
            </label>
            <input
              type="number"
              required={!isFree}
              disabled={isFree}
              min="0"
              placeholder="e.g. 5000"
              value={totalFee}
              onChange={(e) => setTotalFee(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          {!isFree && (
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Discount (PKR)
              </label>
              <input
                type="number"
                min="0"
                placeholder="e.g. 500"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-cyan-500"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Amount Paid Upfront (PKR)
            </label>
            <input
              type="number"
              required={!isFree}
              disabled={isFree}
              min="0"
              placeholder="e.g. 2000"
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          {/* Form Actions */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="cursor-pointer flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium transition shadow-lg shadow-emerald-500/20"
            >
              Confirm & Onboard
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ApprovePaymentModal;