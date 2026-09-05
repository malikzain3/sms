import React from "react";
import TimetableGrid from "./TimetableGrid";

// Same convention as StudentFeeLedger: studentId + studentData, self-contained.
const StudentTimetableTab = ({ studentId, studentData }) => {
  return (
    <div className="space-y-3">
      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex justify-between items-center">
        <span className="text-slate-500 font-bold">
          Assigned Class Schedule Constraints
        </span>
        <span className="text-[12px] bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-md font-mono font-black">
          MODE: STUDENT VIEWER
        </span>
      </div>
      {studentData.classId ? (
        <TimetableGrid
          currentId={studentData.classId}
          type="class"
          readOnly={true}
        />
      ) : (
        <div className="text-center py-12 text-xs text-slate-400 italic bg-white rounded-2xl border border-dashed border-slate-200">
          This student isn't assigned to a class yet, so no timetable is
          available.
        </div>
      )}
    </div>
  );
};

export default StudentTimetableTab;
