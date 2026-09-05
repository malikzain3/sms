import React, { useContext, useEffect, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { db } from "../../firebaseConfig";
import { TeacherPortalContext } from "../../Pages/TeacherPortal";
import { GraduationCap, Users, ArrowRight, BookMarked } from "lucide-react";

const TeacherHome = () => {
  const { teacherAccess } = useContext(TeacherPortalContext);
  const navigate = useNavigate();
  const [studentCounts, setStudentCounts] = useState({});

  // Keep the dashboard aligned with My Classes: this includes both
  // class-teacher classes and subject-only timetable classes.
  const myClasses = teacherAccess?.classesList || [];

  // 2. Fetch actual student counts per class dynamically
  useEffect(() => {
    if (myClasses.length === 0) return;
    const unsubs = myClasses.map((c) => {
      const q = query(collection(db, "students"), where("classId", "==", c.id));
      return onSnapshot(q, (snap) => {
        setStudentCounts((prev) => ({ ...prev, [c.id]: snap.size }));
      });
    });
    return () => unsubs.forEach((u) => u());
  }, [myClasses]);

  // Calculate total students dynamically from studentCounts
  const totalStudents = Object.values(studentCounts).reduce(
    (sum, count) => sum + count,
    0
  );

  return (
    <div className="space-y-7 text-sm">
      {/* Top Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="bg-white border border-slate-100 p-6 rounded-2xl shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Assigned Classes
            </p>
            <p className="text-2xl font-black text-slate-900 mt-0.5">
              {myClasses.length}
            </p>
          </div>
        </div>

        <div className="bg-white border border-slate-100 p-6 rounded-2xl shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Total Students
            </p>
            <p className="text-2xl font-black text-slate-900 mt-0.5">
              {totalStudents}
            </p>
          </div>
        </div>
      </div>

      {/* Classes List */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-xs overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-900">My Classes</h3>
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {myClasses.length === 0 && (
            <p className="p-6 text-sm text-slate-400 italic text-center md:col-span-2">
              No classes assigned to you yet.
            </p>
          )}
          {myClasses.map((c) => {
            return (
              <button
                key={c.id}
                onClick={() => navigate(`/teacher/classes/${c.id}`)}
                className="w-full min-h-28 flex items-center justify-between p-5 rounded-2xl border border-slate-100 bg-slate-50/40 hover:bg-white hover:border-indigo-200 hover:shadow-md hover:-translate-y-0.5 transition text-left group"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-slate-900">
                      {c.className} — {c.section || "Section"}
                    </p>

                    {c.isClassTeacher ? (
                      <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-600 uppercase">
                        Class Teacher
                      </span>
                    ) : (
                      <span
                        title={c.subjects?.join(", ")}
                        className="flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 uppercase max-w-[55%] truncate"
                      >
                        <BookMarked className="w-3 h-3 shrink-0" />
                        {c.subjects?.length ? c.subjects.join(", ") : "Subject"}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 text-xs text-slate-400 mt-2 font-medium">
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-emerald-500" />
                      {studentCounts[c.id] ?? 0} students
                    </span>
                  </div>
                </div>

                <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-500 transition" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default TeacherHome;