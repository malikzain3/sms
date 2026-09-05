import { calcRelativeAxisPosition, reverseEasing } from "framer-motion";
import React from "react";

const PaymentLine = ({ metrics }) => {
  const {monthlyARR = 0 , RevenueGoal = 0, } = metrics || {}
  const progressPercent = RevenueGoal > 0 ? (monthlyARR/ RevenueGoal) * 100 : 0;   
  
  return (
    <>
      <div className="bg-slate-900/40 border border-slate-800/80 p-5 rounded-2xl space-y-3">
        <h4 className="text-sm font-semibold text-slate-300">
          Monthly Revenue Progress
        </h4>
        <div className="w-full bg-slate-950 h-5 rounded-full overflow-hidden flex border border-slate-800">
          <div
            style={{
              width: `${progressPercent}%`,
            }}
            className="bg-linear-to-r from-emerald-500 to-cyan-500 h-full transition-all duration-500"
          />
        </div>
        <div className="flex justify-between text-[11px] text-slate-400">
          <span>
            Collected This Month: {progressPercent.toFixed(1)}% (PKR {monthlyARR.toLocaleString()})
          </span>
          <span>
            Target Contract Ceiling: PKR {RevenueGoal.toLocaleString()}
          </span>
        </div>
      </div>
    </>
  );
};

export default PaymentLine;
