import React, { useState, useEffect } from "react";
import { doc, getDoc, updateDoc, addDoc, collection } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { X, Crown, Check, Sparkles, Headset, BarChart3, Loader2 } from "lucide-react";

// Sleek upgrade-request modal shown when a Free Plan school wants to move
// to Pro. It never charges anyone or flips the plan itself — it just logs
// the request (on the school doc + in an `upgradeRequests` collection) so
// a Superadmin can review and activate Pro from their dashboard.
const PRO_BENEFITS = [
  {
    icon: <Sparkles className="h-4 w-4" />,
    title: "Unlimited Student Enrollments",
    desc: "No more 100-student cap — enroll as many learners as your school needs.",
  },
  {
    icon: <Headset className="h-4 w-4" />,
    title: "Priority Support",
    desc: "Jump the queue for help — faster responses from our support team.",
  },
  {
    icon: <BarChart3 className="h-4 w-4" />,
    title: "Advanced Reporting",
    desc: "Deeper insight into enrollment, fees, and class performance.",
  },
  {
    icon: <Crown className="h-4 w-4" />,
    title: "Dedicated Onboarding",
    desc: "Hands-on help migrating additional staff, classes, and records.",
  },
];

const UpgradeModal = ({ isOpen, onClose, schoolId, schoolName }) => {
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [alreadyPending, setAlreadyPending] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [error, setError] = useState("");

  // Every time the modal opens, check whether a request is already
  // pending so we don't let the admin queue up duplicates.
  useEffect(() => {
    if (!isOpen) return;
    setSuccess(false);
    setError("");
    setCheckingStatus(true);

    const checkStatus = async () => {
      if (!schoolId) {
        setCheckingStatus(false);
        return;
      }
      try {
        const schoolSnap = await getDoc(doc(db, "schools", schoolId));
        const data = schoolSnap.data();
        setAlreadyPending(data?.upgradeStatus === "pending_upgrade");
      } catch (err) {
        console.error("Failed to check upgrade status:", err);
      } finally {
        setCheckingStatus(false);
      }
    };
    checkStatus();
  }, [isOpen, schoolId]);

  if (!isOpen) return null;

  const handleSubmitUpgrade = async () => {
    if (!schoolId) {
      setError("Missing school reference. Please refresh and try again.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const requestedAt = new Date().toISOString();

      await updateDoc(doc(db, "schools", schoolId), {
        upgradeStatus: "pending_upgrade",
        upgradeRequestedAt: requestedAt,
      });

      await addDoc(collection(db, "upgradeRequests"), {
        schoolId,
        schoolName: schoolName || "",
        requestedAt,
        status: "pending",
        fromPlan: "free",
        toPlan: "pro",
      });

      setSuccess(true);
    } catch (err) {
      console.error("Upgrade request failed:", err);
      setError("Something went wrong sending your request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={submitting ? undefined : onClose}
      />

      <div className="relative z-[90] w-full max-w-md overflow-hidden rounded-2xl border border-indigo-100 bg-white shadow-2xl">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-500 px-5 pb-6 pt-5 text-white">
          <button
            onClick={onClose}
            disabled={submitting}
            className="absolute right-3 top-3 rounded-full p-1 text-indigo-100 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
              <Crown className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-black tracking-tight">
                Upgrade to Pro
              </h3>
              <p className="text-[11px] font-medium text-indigo-100">
                Unlock unlimited enrollments for {schoolName || "your school"}
              </p>
            </div>
          </div>
        </div>

        <div className="px-5 py-5 space-y-4">
          {checkingStatus ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking status...
            </div>
          ) : success ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
                <Check className="h-6 w-6 text-emerald-600" />
              </div>
              <p className="text-sm font-bold text-slate-800">
                Upgrade Request Sent!
              </p>
              <p className="text-xs text-slate-500 max-w-xs">
                Superadmin will review and activate your Pro plan shortly.
              </p>
              <button
                onClick={onClose}
                className="mt-2 w-full rounded-xl bg-indigo-600 py-2 text-sm font-bold text-white transition hover:bg-indigo-700"
              >
                Close
              </button>
            </div>
          ) : alreadyPending ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
                <Sparkles className="h-6 w-6 text-amber-500" />
              </div>
              <p className="text-sm font-bold text-slate-800">
                Request Already Pending
              </p>
              <p className="text-xs text-slate-500 max-w-xs">
                Your upgrade request is already awaiting Superadmin review.
                We'll activate Pro as soon as it's approved.
              </p>
              <button
                onClick={onClose}
                className="mt-2 w-full rounded-xl bg-slate-100 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-200"
              >
                Close
              </button>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {PRO_BENEFITS.map((b) => (
                  <div key={b.title} className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                      {b.icon}
                    </div>
                    <div>
                      <p className="text-[13px] font-bold text-slate-800">
                        {b.title}
                      </p>
                      <p className="text-[11px] text-slate-500">{b.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {error && (
                <p className="text-[11px] font-semibold text-red-500">
                  {error}
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="w-1/2 rounded-xl bg-slate-100 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-200 disabled:opacity-50"
                >
                  Maybe Later
                </button>
                <button
                  type="button"
                  onClick={handleSubmitUpgrade}
                  disabled={submitting}
                  className="w-1/2 rounded-xl bg-indigo-600 py-2 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? "Submitting..." : "Submit Upgrade Request"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default UpgradeModal;
