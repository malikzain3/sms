import React from "react";


const StatsCards = ({ metrics }) => {
  const {
    advance = 0,
    monthlyARR = 0,
    remainingBalance = 0,
    activeSchools = 0,
    RevenueGoal = 0,
  } = metrics || {};

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
          <p className="text-xs text-slate-400 font-medium">
            Monthly Revenue (July)
          </p>
          <h3 className="text-xl font-extrabold text-cyan-400 mt-1">
            PKR {monthlyARR.toLocaleString()}
          </h3>
        </div>
        <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
          <p className="text-xs text-slate-400 font-medium">Advance Payment</p>
          <h3 className="text-xl font-extrabold text-emerald-400 mt-1">
            PKR {advance.toLocaleString()}
          </h3>
        </div>
        <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
          <p className="text-xs text-slate-400 font-medium">
            Remaining Balance
          </p>
          <h3 className="text-xl font-extrabold text-amber-500 mt-1">
            PKR {remainingBalance.toLocaleString()}
          </h3>
        </div>
        <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
          <p className="text-xs text-slate-400 font-medium">Revenue Goal</p>
          <h3 className="text-xl font-extrabold text-indigo-400 mt-1">
            PKR {RevenueGoal.toLocaleString()}
          </h3>
        </div>
        <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
          <p className="text-xs text-slate-400 font-medium">Active Schools</p>
          <h3 className="text-xl font-extrabold text-fuchsia-400 mt-1">
            {activeSchools}
          </h3>
        </div>
      </div>
    </>
  );
};

export default StatsCards;
