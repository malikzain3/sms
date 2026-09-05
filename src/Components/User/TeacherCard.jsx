import React from "react";
import { deleteDoc, doc } from "firebase/firestore";

const TeacherCard = ({ teacher, onClick }) => {
  return (
    <div 
      onClick={onClick}
      className="bg-white border border-slate-100 rounded-2xl p-5 shadow-2xs hover:border-indigo-500 hover:shadow-xs transition cursor-pointer flex flex-col justify-between h-48 group relative"
    >
      <div>
        {/* Status Indicator Badge */}
        <div className="absolute top-4 right-4">
          <span className={`text-[11px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${
            teacher.status === "Active" 
              ? "bg-emerald-50 text-emerald-700 border border-emerald-100" 
              : "bg-amber-50 text-amber-700 border border-amber-100"
          }`}>
            {teacher.status}
          </span>
        </div>

        
        {/* Profile Details */}
        <div className="flex items-start gap-3">
          {teacher.photoUrl ? (
            <img
              src={teacher.photoUrl}
              alt={teacher.name}
              className="w-11 h-11 rounded-xl object-cover border border-slate-200 shrink-0"
            />
          ) : (
            <div className="w-11 h-11 rounded-xl bg-indigo-100 text-indigo-700 font-black flex items-center justify-center text-sm shrink-0">
              {teacher.name
                ?.split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")
                .toUpperCase()}
            </div>
          )}
          <div className="space-y-1 min-w-0">
            <h3 className="font-bold text-slate-900 group-hover:text-indigo-600 transition text-sm sm:text-base truncate">
              {teacher.name}
            </h3>
            <p className="text-xs text-indigo-600 font-bold font-mono">
              {teacher.designation}
            </p>
            <p className="text-[14px] text-slate-400 font-medium">
              Dept: <span className="text-slate-600">{teacher.department}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Meta Assignment Row */}
      {/* Meta Assignment Row */}
      <div className="pt-3 border-t border-slate-50 space-y-2 text-[11px]">
        <div className="flex justify-between items-center">
          <div className="flex flex-col">
            <span className="text-slate-400 font-medium">Primary Subject</span>
            <span className="text-slate-800 font-bold text-[14px] group-hover:text-indigo-600">{teacher.primarySubject}</span>
          </div>
          <div className="text-right flex flex-col">
            <span className="text-slate-400 font-medium">Contact</span>
            <span className="text-slate-500 font-mono text-[14px] ">{teacher.phone}</span>
          </div>
        </div>
        {teacher.cnic && (
          <div className="flex flex-col">
            <span className="text-slate-400 font-medium">CNIC</span>
            <span className="text-slate-600 font-mono text-[14px]">{teacher.cnic}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default TeacherCard;