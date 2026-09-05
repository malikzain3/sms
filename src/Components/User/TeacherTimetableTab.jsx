import React, { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import TimetableGrid from "./TimetableGrid";

// Same convention as TeacherSalaryLedger: teacherId + teacherData, self-contained.
const TeacherTimetableTab = ({ teacherId, teacherData }) => {
  // Classes in this teacher's school — passed to TimetableGrid so periods
  // can be linked to a class (and, for period-based teachers, a subject
  // pulled from that class's own course list).
  const [linkedClasses, setLinkedClasses] = useState([]);

  useEffect(() => {
    if (!teacherData?.schoolId) return;
    const q = query(
      collection(db, "classes"),
      where("schoolId", "==", teacherData.schoolId),
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setLinkedClasses(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsubscribe();
  }, [teacherData?.schoolId]);

  return (
    <div className="space-y-3">
      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex justify-between items-center">
        <span className="text-slate-500 font-bold">
          Personal Workload Lecture Matrix Grid
        </span>
        <span className="text-[14px] bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-md font-mono font-bold">
          Mode : {teacherData.scheduleType.toUpperCase()}
        </span>
      </div>

      <TimetableGrid
        currentId={teacherId}
        type="teacher"
        linkedClasses={linkedClasses}
      />
    </div>
  );
};

export default TeacherTimetableTab;