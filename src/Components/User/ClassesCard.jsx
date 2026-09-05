import React from "react";
import { Users, SquareUserRound } from "lucide-react";

const ClassesCard = ({ classData, onSelect, onDelete }) => {
  const { className, section, level, teachers, studentsCount, status } =
    classData || {};

  const classTeacher =
    Array.isArray(teachers) && teachers.length > 0 ? teachers[0] : "Unassigned";

  return (
    <div
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect?.();
      }}
      className="group bg-white p-5 border border-slate-100 rounded-2xl shadow-xs hover:shadow-lg hover:-translate-y-0.5 hover:border-indigo-100 transition-all duration-200 relative flex flex-col justify-between h-48 cursor-pointer overflow-hidden"
    >
      <div className="absolute top-0 left-0 w-full h-1 bg-linear-gradient(90deg, from-indigo-500 to-indigo-300)" />
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <span className="bg-emerald-50 text-emerald-600 font-bold text-[10px] px-2 py-0.5 rounded-full">
          {status || "Active"}
        </span>
        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title="Delete class"
            className="w-5 h-5 flex items-center justify-center rounded-full bg-rose-50 text-rose-500 hover:bg-rose-100 font-bold text-[11px] cursor-pointer opacity-0 group-hover:opacity-100 transition"
          >
            ✕
          </button>
        )}
      </div>

      <div>
        <div className="bg-indigo-50 text-indigo-700 font-black text-sm px-3 py-1.5 rounded-xl inline-block mb-3">
          {className || "N/A"} {"-"}{" "}
          <span className="text-indigo-700 font-bold">{section || "N/A"}</span>
        </div>
        <h4 className="text-md font-bold text-slate-800">
          Level:
          {level && (
            <span className="text-slate-400 font-medium capitalize">
              {" "}
              · {level}
            </span>
          )}
        </h4>
        <p className="flex items-center gap-1 text-xs xl:text-sm text-slate-400 mt-1 sm:mt-1.5">
  <SquareUserRound className="w-3.5 h-3.5 xl:w-4 xl:h-4 text-indigo-700 mr-0.5" /> Class Teacher:{" "}
  <span className="text-slate-600 font-semibold truncate">{classTeacher}</span>
</p>
      </div>

      <div className="border-t border-slate-50 pt-2.5 sm:pt-3 flex items-center text-xs xl:text-sm font-bold text-slate-500">
  <div className="flex items-center gap-1">
    <Users className="w-3.5 h-3.5 xl:w-4 xl:h-4 text-slate-400" />{" "}
    <span>{studentsCount || 0} Students</span>
  </div>
</div>
    </div>
  );
};

export default ClassesCard;
