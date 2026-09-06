import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import {
  CircleDollarSign,
  CircleCheck,
  Clock,
  ChartSpline,
} from "lucide-react";

const LicenseRemainingCard = () => {
  const [licenseData, setLicenseData] = useState({
    totalPaid: 0,
    totalPackageFee: 0,
    remaining: 0,
    advance: 0,
    lastPaymentDate: "No Payment Recorded",
    renewalDeadline: "No Payment Recorded",
    selectedPlan: "free",
  });

  useEffect(() => {
    const fetchLicenseData = async () => {
      const session = JSON.parse(localStorage.getItem("schoolix_session"));
      if (session && session.schoolId) {
        try {
          // 1. Try checking schools collection
          let schoolDocRef = doc(db, "schools", session.schoolId);
          let schoolDoc = await getDoc(schoolDocRef);

          // 2. Fallback to inquiries collection if needed
          if (!schoolDoc.exists()) {
            schoolDocRef = doc(db, "inquiries", session.schoolId);
            schoolDoc = await getDoc(schoolDocRef);
          }

          if (schoolDoc.exists()) {
            const data = schoolDoc.data();

            // Match Superadmin field mapping keys exactly
            const packageFee = Number(data.totalPackageFee || 0);
            const totalPaid = Number(data.totalPaid || 0);
            const remainingBalance =
              packageFee > totalPaid ? packageFee - totalPaid : 0;
            const advanceBalance =
              totalPaid > packageFee ? totalPaid - packageFee : 0;

            const today = new Date();
            const fallbackDay = data.registrationDate
              ? data.registrationDate.split("-")[2]
              : String(today.getDate()).padStart(2, "0");
            const targetDay = Number(data.billingDay || fallbackDay);
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
            const deadlineDateString = `${targetYear}-${formattedMonth}-${formattedDay}`;

            setLicenseData({
              totalPaid: totalPaid,
              totalPackageFee: packageFee,
              remaining: remainingBalance,
              advance: advanceBalance,
              lastPaymentDate:
                data.lastPayment || data.createdAt || "No Payment ",
              renewalDeadline: deadlineDateString,
              selectedPlan: data.selectedPlan || data.plan || "free",
            });
          }
        } catch (err) {
          console.log(`Error fetching License Data: ${err.message}`);
        }
      }
    };
    fetchLicenseData();
  }, []);

  return (
    <>
      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: -8 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
        className="relative w-64 overflow-hidden rounded-2xl border border-indigo-100 bg-white shadow-[0_20px_45px_-18px_rgba(79,70,229,0.45)] z-50"
      >
        <div className="absolute inset-x-0 top-0 h-14 bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-500" />

        <div className="relative p-3.5">
          <div className="mb-3 rounded-xl bg-white/10 px-3 py-2 text-white backdrop-blur-sm">
            <h4 className="text-[11px] font-black uppercase tracking-[0.18em] text-indigo-50/90">
              SaaS License
            </h4>
            <p className="mt-1 text-[10px] font-medium text-indigo-100">
              Subscription status
            </p>
          </div>

          {/* Plan Badge */}
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className={`mb-3 flex items-center justify-between rounded-xl border px-3 py-2 shadow-sm ${
              licenseData.selectedPlan === "pro"
                ? "border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50"
                : "border-slate-200 bg-gradient-to-r from-slate-50 to-slate-100"
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${
                  licenseData.selectedPlan === "pro"
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-500 text-white"
                }`}
              >
                {licenseData.selectedPlan === "pro" ? "Pro Plan" : "Free Plan"}
              </span>
            </div>
            <span
              className={`text-[9px] font-bold ${
                licenseData.selectedPlan === "pro"
                  ? "text-indigo-700"
                  : "text-slate-600"
              }`}
            >
              {licenseData.selectedPlan === "pro"
                ? "Unlimited Access"
                : "Max 100 Students Allowed"}
            </span>
          </motion.div>

          <div className="space-y-2.5">
            {[
              {
                label: "Package Fee",
                value: licenseData.totalPackageFee,
                gradient: "from-indigo-50 to-violet-50",
                border: "border-indigo-200",
                textColor: "text-indigo-700",
                dotColor: "bg-indigo-500",
                icon: <CircleDollarSign className="h-3.5 w-3.5" />,
              },
              {
                label: "Total Paid",
                value: licenseData.totalPaid,
                gradient: "from-emerald-50 to-green-50",
                border: "border-emerald-200",
                textColor: "text-emerald-700",
                dotColor: "bg-emerald-500",
                icon: <CircleCheck className="h-3.5 w-3.5" />,
              },
              {
                label: "Remaining",
                value: licenseData.remaining,
                gradient: "from-amber-50 to-orange-50",
                border: "border-amber-200",
                textColor: "text-amber-700",
                dotColor: "bg-amber-500",
                icon: <Clock className="h-3.5 w-3.5" />,
              },
              {
                label: "Advance",
                value: licenseData.advance,
                gradient: "from-sky-50 to-cyan-50",
                border: "border-sky-200",
                textColor: "text-sky-700",
                dotColor: "bg-sky-500",
                icon: <ChartSpline className="h-3.5 w-3.5" />,
              },
            ].map((item, i) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  delay: 0.08 * (i + 1),
                  duration: 0.25,
                  ease: "easeOut",
                }}
                className={`flex items-center justify-between rounded-xl border bg-gradient-to-r ${item.gradient} ${item.border} px-2.5 py-2 shadow-sm`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-white bg-white text-slate-700 shadow-sm">
                    {item.icon}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${item.dotColor}`} />
                      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">
                        {item.label}
                      </p>
                    </div>
                    <p className={`mt-0.5 text-xs font-black ${item.textColor}`}>
                      PKR {item.value?.toLocaleString() ?? "0"}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="mt-3 rounded-xl border border-indigo-100 bg-slate-50 p-2.5">
            <div className="flex items-center justify-between gap-2 text-[9px] text-slate-500">
              <span>Last payment</span>
              <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 font-bold text-indigo-700">
                {licenseData.lastPaymentDate}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 text-[9px] text-amber-700">
              <span>Renewal</span>
              <span className="rounded-md bg-amber-50 px-1.5 py-0.5 font-bold">
                {licenseData.renewalDeadline}
              </span>
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );
};

export default LicenseRemainingCard;