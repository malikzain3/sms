import React, { useContext, useEffect, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { db } from "../../firebaseConfig";
import { TeacherPortalContext } from "../../Pages/TeacherPortal";
import { Users, ArrowRight, BookMarked } from "lucide-react";

const TeacherClasses = () => {
  const { teacher, teacherAccess } = useContext(TeacherPortalContext);
  const navigate = useNavigate();
  const [studentCounts, setStudentCounts] = useState({});

  // Phase 2: classes list now comes from teacherAccess.classesList, which
  // already merges class-teacher (full access) classes with subject-only
  // classes derived from teacher.timetableMatrix — no separate query here.
  const classes = teacherAccess?.classesList || [];

  // One live listener per accessible class, counting actual student docs.
  useEffect(() => {
    if (classes.length === 0) return;
    const unsubs = classes.map((c) => {
      const q = query(collection(db, "students"), where("classId", "==", c.id));
      return onSnapshot(q, (snap) => {
        setStudentCounts((prev) => ({ ...prev, [c.id]: snap.size }));
      });
    });
    return () => unsubs.forEach((u) => u());
  }, [classes]);

  return (
    <div className="space-y-6 text-sm">
      <div>
        <h2 className="text-xl font-bold text-slate-950">My Classes</h2>
        <p className="text-sm text-slate-400 mt-1">
          Classes you're assigned to teach.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {classes.map((c) => (
          <button
            key={c.id}
            onClick={() => navigate(`/teacher/classes/${c.id}`)}
            className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs text-left hover:border-indigo-200 hover:shadow-md hover:-translate-y-0.5 transition group"
          >
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[11px] font-bold text-indigo-500 uppercase tracking-wider">
                  {c.classType || "Class"}
                </p>
                <p className="text-base font-black text-slate-900 mt-1.5">
                  {c.className} {c.section ? `— ${c.section}` : ""}
                </p>
              </div>
              <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-500 transition" />
            </div>
            <div className="flex items-center justify-between gap-2 mt-4">
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-semibold">
                <Users className="w-4 h-4" />
                {studentCounts[c.id] ?? 0} students
              </div>
              {c.isClassTeacher ? (
                <span className="text-[9px] font-black px-2 py-1 rounded-full uppercase tracking-wider bg-indigo-50 text-indigo-600 border border-indigo-100 shrink-0">
                  Class Teacher
                </span>
              ) : (
                <span
                  title={c.subjects?.join(", ")}
                  className="flex items-center gap-1 text-[9px] font-black px-2 py-1 rounded-full uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-100 shrink-0 max-w-[55%] truncate"
                >
                  <BookMarked className="w-3 h-3 shrink-0" />
                  {c.subjects && c.subjects.length > 0
                    ? c.subjects.join(", ")
                    : "Subject"}
                </span>
              )}
            </div>
          </button>
        ))}
        {classes.length === 0 && (
          <div className="col-span-full text-center py-14 bg-white rounded-2xl border border-dashed border-slate-200">
            <Users className="w-8 h-8 text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-400 italic">
              No classes assigned to you yet.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TeacherClasses;