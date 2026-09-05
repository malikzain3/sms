import React, { useState, useEffect } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import SchoolPaymentRecords from "./SchoolPaymentRecords";
import StatsCards from "./StatsCards";
import PaymentLine from "./PaymentLine";
import { LoadingSpinner } from "./LoadingScreen";
import { motion, AnimatePresence } from "framer-motion";

const FinancialAnalytics = () => {
  const [loading, setLoading] = useState(true);
  const [schools, setSchools] = useState([]);
  const [selectedSchool, setSelectedSchool] = useState(null);
  const [metrics, setMetrics] = useState({
    lifetimeARR: 0,
    monthlyARR: 0,
    remainingBalance: 0,
    activeSchools: 0,
    RevenueGoal: 0,
  });

  useEffect(() => {
    const fetchFinancialData = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "schools"));
        const schoolsData = [];
        let totalProjected = 0;
        let activeCount = 0;

        let calculatedAdvances = 0;
        let calculatedRemaining = 0;

        const currentYearMonth = new Date().toISOString().substring(0, 7);

        querySnapshot.forEach((doc) => {
          const data = doc.data();
          schoolsData.push({ id: doc.id, ...data });

          if (data.status === "active") activeCount++;

          const fee = Number(data.totalPackageFee || 0);
          const paid = Number(data.totalPaid || 0);

          totalProjected += fee;

          if (paid > fee) {
            calculatedAdvances += paid - fee;
          }

          if (fee > paid) {
            calculatedRemaining += fee - paid;
          }
        });

        setSchools(schoolsData);

        let calculatedMonthlySum = 0;
        for (const school of schoolsData) {
          const feeLimit = Number(school.totalPackageFee || 0);
          let schoolMonthlyPaid = 0;

          const historySnap = await getDocs(
            collection(db, "schools", school.id, "payments"),
          );

          historySnap.forEach((pDoc) => {
            const pData = pDoc.data();
            if (pData.date && pData.date.startsWith(currentYearMonth)) {
              schoolMonthlyPaid += Number(pData.amount || 0); // 🟢 Accumulate this month's cash flow
            }
          });

          // 💡 CAP LOGIC: Only recognize this month's payments up to the package limit
          if (schoolMonthlyPaid > feeLimit) {
            calculatedMonthlySum += feeLimit;
          } else {
            calculatedMonthlySum += schoolMonthlyPaid;
          }
        }

        setMetrics({
          advance: calculatedAdvances,
          monthlyARR: calculatedMonthlySum,
          remainingBalance: calculatedRemaining,
          activeSchools: activeCount,
          RevenueGoal: totalProjected,
        });

        setLoading(false);
      } catch (err) {
        console.error("Error fetching financial metrics:", err);
        setLoading(false);
      }
    };

    fetchFinancialData();
  }, []);

  return (
    <AnimatePresence mode="wait">
      {loading ? (
        <motion.div
          key="spinner"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="min-h-100 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm rounded-2xl border border-slate-800/60 p-8"
        >
          <LoadingSpinner text="Calculating real-time ledger metrics..." />
        </motion.div>
      ) : (
        <motion.div
          key="content"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -15 }}
          transition={{ duration: 0.4 }}
          className="space-y-6 w-full text-white"
        >
          {/* 1. Metric Overview Cards Container Row */}
          <StatsCards metrics={metrics} />

          {/* 2. Payment Progress */}
          <PaymentLine metrics={metrics} />

          <SchoolPaymentRecords
            schools={schools}
            selectedSchool={selectedSchool}
            setSelectedSchool={setSelectedSchool}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default FinancialAnalytics;
