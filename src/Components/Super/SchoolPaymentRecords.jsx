import React, { useState, useEffect } from "react";
import { getDocs, collection } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { CalendarDays, Tags } from "lucide-react";

const SchoolPaymentRecords = ({
  schools = [],
  selectedSchool,
  setSelectedSchool,
}) => {
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [searchItem, setSearchItem] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredSchools = schools.filter((school) => {
    const matchesSearch = school.schoolName
      ?.toLowerCase()
      .includes(searchItem.toLowerCase());
    const currentStatus = school.paymentStatus || "unpaid";
    const matchesStatus =
      statusFilter == "all" || currentStatus == statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleFetchHistory = async (school) => {
    if (selectedSchool?.id === school.id) {
      setSelectedSchool(null);
      setPaymentHistory([]);
      return;
    }
    setSelectedSchool(school);
    try {
      const historySnap = await getDocs(
        collection(db, "schools", school.id, "payments"),
      );
      const logs = [];
      historySnap.forEach((doc) => logs.push({ id: doc.id, ...doc.data() }));
      setPaymentHistory(logs.sort((a, b) => b.date.localeCompare(a.date)));
      console.log(logs);
    } catch (err) {
      console.error("Error loading history sub-ledger:", err);
    }
  };

  return (
    <>
      <div className="bg-slate-900/40 border border-slate-800 p-5 rounded-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h3 className="text-base font-bold">School Payments Records</h3>

          <div className="relative max-w-xs w-full">
            {/* Search Bar */}
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500 text-xs">
              🔍
            </span>
            <input
              type="text"
              placeholder="Search school name..."
              value={searchItem}
              onChange={(e) => setSearchItem(e.target.value)}
              className="w-full pl-8 pr-4 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition"
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1.5 border-b border-slate-800/60 pb-1 text-[11px]">
          {/* Tab 1 */}
          <button
            onClick={() => setStatusFilter("all")}
            className={`px-3 py-1 rounded-lg font-medium transition ${
              statusFilter.trim() === "all"
                ? "bg-slate-800 text-cyan-400 font-bold"
                : "text-slate-400 hover:text-white"
            }`}
          >
            All ({schools.length}){" "}
          </button>

          {/* Tab 2 */}
          <button
            onClick={() => setStatusFilter("paid")}
            className={`px-3 py-1 rounded-lg font-medium transition ${
              statusFilter.trim() === "paid"
                ? "bg-emerald-500/10 text-emerald-400 font-bold"
                : "text-slate-400 hover:text-emerald-400"
            }`}
          >
            Fully Paid (
            {schools.filter((s) => s.paymentStatus === "paid").length}){" "}
          </button>

          {/* Tab 3 */}
          <button
            onClick={() => setStatusFilter("advance")}
            className={`px-3 py-1 rounded-lg font-medium transition ${
              statusFilter.trim() === "advance"
                ? "bg-purple-500/10 text-purple-400 font-bold"
                : "text-slate-400 hover:text-purple-400"
            }`}
          >
            Advance (
            {schools.filter((s) => s.paymentStatus === "advance").length})
          </button>

          {/* Tab 4 */}
          <button
            onClick={() => setStatusFilter("unpaid")}
            className={`px-3 py-1 rounded-lg font-medium transition ${
              statusFilter.trim() === "unpaid"
                ? "bg-red-500/10 text-red-400 font-bold"
                : "text-slate-400 hover:text-red-400"
            }`}
          >
            Unpaid (
            {
              schools.filter(
                (s) => s.paymentStatus === "unpaid" || !s.paymentStatus,
              ).length
            }
            )
          </button>

          {/* Tab 5 */}
          <button
            onClick={() => setStatusFilter("partial")}
            className={`px-3 py-1 rounded-lg font-medium transition ${
              statusFilter.trim() === "partial"
                ? "bg-amber-500/10 text-amber-400 font-bold"
                : "text-slate-400 hover:text-amber-400"
            }`}
          >
            Partial (
            {schools.filter((s) => s.paymentStatus === "partial").length}){" "}
          </button>
        </div>

        {/* 4. Financial Records Matrix Display Grid */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/40">
                <th className="p-3">School Name</th>
                <th className="p-3">Payment Status</th>
                <th className="p-3">Total Package Fee</th>
                <th className="p-3">Total Paid To Date</th>
                <th className="p-3 ">Remaining Amount</th>
                <th className="p-3 ">Advance Paid</th>
                <th className="p-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {/* Added error fallback screen layout conditional check if the search filter produces an empty list */}
              {filteredSchools.length === 0 ? (
                <tr>
                  <td
                    colSpan="7"
                    className="text-center py-8 text-slate-500 italic text-xs"
                  >
                    No matching school payment records found.
                  </td>
                </tr>
              ) : (
                /* Switched array loop mapping from 'schools.map' to use 'filteredSchools.map' securely */
                filteredSchools.map((school) => {
                  const packageFee = Number(school.totalPackageFee || 0);
                  const totalPaid = Number(school.totalPaid || 0);
                  const remainingAmount =
                    packageFee > totalPaid ? packageFee - totalPaid : 0;
                  const advancePaid =
                    totalPaid > packageFee ? totalPaid - packageFee : 0;

                  return (
                    <React.Fragment key={school.id}>
                      <tr className="border-b border-slate-800/60 hover:bg-slate-800/20 transition">
                        <td className="p-3 font-semibold">
                          {school.schoolName}
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              school.paymentStatus === "paid"
                                ? "bg-emerald-500/10 text-emerald-400"
                                : school.paymentStatus === "advance"
                                  ? "bg-indigo-500/10 text-indigo-400"
                                  : school.paymentStatus === "partial"
                                    ? "bg-amber-500/10 text-amber-400"
                                    : "bg-red-500/10 text-red-400"
                            }`}
                          >
                            {school.paymentStatus || "unpaid"}
                          </span>
                        </td>
                        <td className="p-3 font-mono">
                          PKR {packageFee.toLocaleString()}
                        </td>
                        <td className="p-3 font-mono text-emerald-400">
                          PKR {totalPaid.toLocaleString()}
                        </td>
                        {/* New Column: Remaining Amount */}
                        <td className="p-3 font-mono text-amber-500 font-semibold">
                          {remainingAmount > 0
                            ? `PKR ${remainingAmount.toLocaleString()}`
                            : "—"}
                        </td>
                        {/* New Column: Advance Paid */}
                        <td className="p-3 font-mono text-indigo-400 font-semibold">
                          {advancePaid > 0
                            ? `PKR ${advancePaid.toLocaleString()}`
                            : "—"}
                        </td>
                        <td className="p-3">
                          <button
                            onClick={() => handleFetchHistory(school)}
                            className="bg-slate-800 hover:bg-slate-700 text-white px-3 py-1 rounded-lg transition text-[11px]"
                          >
                            {selectedSchool?.id === school.id
                              ? "Hide History ▲"
                              : "Payment History ▼"}
                          </button>
                        </td>
                      </tr>

                      {/* Dynamic Sub-Ledger History Dropdown Section Timeline */}
                      {selectedSchool?.id === school.id && (
                        <tr>
                          <td
                            colSpan="7"
                            className="bg-slate-950/80 p-4 border-b border-slate-800"
                          >
                            <div className="space-y-2">
                              <h5 className="font-bold text-cyan-400 text-xs">
                                Payment Statements: {school.schoolName}
                              </h5>
                              {paymentHistory.length === 0 ? (
                                <p className="text-slate-500 italic text-[11px]">
                                  No micro-transactions found in history.
                                </p>
                              ) : (
                                <div className="space-y-1 max-w-2xl">
                                  {paymentHistory.map((log) => (
                                    <div
                                      key={log.id}
                                      className="flex justify-between items-center text-[11px] bg-slate-900/60 p-2 rounded-lg border border-slate-800/40"
                                    >
                                      <span className="text-slate-400 flex items-center gap-2">
                                        <CalendarDays className="w-4 h-4" />{" "}
                                        {log.date}
                                      </span>
                                      <span className="font-medium text-slate-200 flex items-center gap-2">
                                        <Tags className="w-4 h-4" />{" "}
                                        {log.type || "Invoice Payment"}
                                      </span>
                                      <span className="font-mono text-emerald-400 font-bold">
                                        + PKR{" "}
                                        {Number(log.amount).toLocaleString()}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};

export default SchoolPaymentRecords;
