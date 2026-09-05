import React from "react";
import { motion } from "framer-motion";

const CalendarCard = () => {
  return (
    <>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -10 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
        className="absolute right-0 mt-2 bg-white p-4 rounded-2xl shadow-xl z-50 border border-slate-100"
      >
        <div className="bg-slate-50/60 p-4 rounded-2xl border border-slate-100/70">
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-xs font-extrabold text-slate-900 tracking-tight">
              September 2030
            </h4>
            <span className="text-[10px] text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded-md cursor-pointer">
              Agenda
            </span>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div key={i}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-bold text-slate-700">
            {Array.from({ length: 30 }, (_, i) => (
              <div
                key={i}
                className={`p-1.5 rounded-xl cursor-default transition ${i + 1 === 22 ? "bg-indigo-600 text-white shadow-sm shadow-indigo-500/20" : "hover:bg-slate-200/50"}`}
              >
                {i + 1}
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </>
  );
};

export default calendarCard;
