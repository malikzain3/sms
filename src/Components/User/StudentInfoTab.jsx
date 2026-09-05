import React from "react";

// Same convention as StudentFeeLedger: studentId + studentData, self-contained.
const StudentInfoTab = ({ studentId, studentData }) => {
  const data = studentData;
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-6 space-y-5 shadow-xs">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-3 bg-slate-50 rounded-xl">
          <span className="text-[12px] text-slate-400 font-mono uppercase tracking-wider block">
            Father / Guardian Name
          </span>
          <span className="text-slate-900  font-mono mt-1 block text-[15px]">
            {data.fatherName || "—"}
          </span>
        </div>
        <div className="p-3 bg-slate-50 rounded-xl">
          <span className="text-[12px] text-slate-400 font-mono uppercase tracking-wider block">
            Contact Number
          </span>
          <span className="text-slate-900 font-mono mt-1 block text-[15px]">
            {data.contact || "—"}
          </span>
        </div>
        <div className="p-3 bg-slate-50 rounded-xl">
          <span className="text-[12px] text-slate-400 font-mono uppercase tracking-wider block">
            Email Address
          </span>
          <span className="text-slate-900 font-mono mt-1 block text-[15px]">
            {data.email || "—"}
          </span>
        </div>
        <div className="p-3 bg-slate-50 rounded-xl">
          <span className="text-[12px] text-slate-400 font-mono uppercase tracking-wider block">
            B-Form / CNIC
          </span>
          <span className="text-slate-900 font-mono  mt-1 block text-[15px]">
            {data.cnic || "—"}
          </span>
        </div>
        <div className="p-3 bg-slate-50 rounded-xl">
          <span className="text-[12px] text-slate-400 font-mono uppercase tracking-wider block">
            Roll Number
          </span>
          <span className="text-slate-900 font-mono mt-1 block text-[15px]">
            {data.rollNumber || "—"}
          </span>
        </div>
        <div className="p-3 bg-slate-50 rounded-xl">
          <span className="text-[12px] text-slate-400 font-mono uppercase tracking-wider block">
            Grade / Class Section
          </span>
          <span className="text-slate-900 font-mono mt-1 block text-[15px]">
            {data.className || "Unassigned"}
            {data.section ? ` - ${data.section}` : ""}
          </span>
        </div>
        <div className="p-3 bg-slate-50 rounded-xl">
          <span className="text-[12px] text-slate-400 font-mono uppercase tracking-wider block">
            Enrollment Status
          </span>
          <span className="text-slate-900 font-mono mt-1 block text-[15px]">
            {data.status || "Active"}
          </span>
        </div>
        <div className="p-3 bg-slate-50 rounded-xl">
          <span className="text-[12px] text-slate-400 font-mono uppercase tracking-wider block">
            Monthly Tuition Fee
          </span>
          <span className="text-slate-900 font-mono mt-1 block text-[15px]">
            {data.monthlyFee != null && data.monthlyFee !== ""
              ? `Rs. ${Number(data.monthlyFee).toLocaleString()}`
              : "—"}
          </span>
        </div>
        <div className="p-3 bg-slate-50 rounded-xl flex flex-col ">
          <span className="text-[12px] text-slate-400 font-mono uppercase tracking-wider block">
            Gender
          </span>
          <span className="text-slate-900 font-mono mt-1 block text-[15px]">
            {data.gender || "Not Specified"}
          </span>
        </div>
        <div className="p-3 bg-slate-50 rounded-xl sm:col-span-2">
          <span className="text-[12px] text-slate-400 font-mono uppercase tracking-wider block">
            Residential Address
          </span>
          <span className="text-slate-900 mt-1 block text-[15px]">
            {data.address || "—"}
          </span>
        </div>
      </div>
    </div>
  );
};

export default StudentInfoTab;
