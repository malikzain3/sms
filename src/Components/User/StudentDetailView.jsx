import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, onSnapshot, collection } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import StudentTimetableTab from "./StudentTimetableTab";
import StudentInfoTab from "./StudentInfoTab";
import StudentFeeLedger from "./StudentFeeLedger";
import ScholasticAnalytics from "./ScholasticAnalytics";
import Header from "./Header";

const statusStyles = {
  Paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Partial: "bg-amber-50 text-amber-700 border-amber-200",
  Advance: "bg-indigo-50 text-indigo-700 border-indigo-200",
  Unpaid: "bg-rose-50 text-rose-700 border-rose-200",
};

const VALID_TABS = ["timetable", "info", "analytics", "finance"];

const StudentDetailView = () => {
  const { studentId, tab } = useParams();
  const navigate = useNavigate();
  const onBack = () => navigate("/school/students");
  const activeTab = VALID_TABS.includes(tab) ? tab : "timetable";

  // The URL owns which student we're viewing — fetch it directly by id.
  const [liveStudent, setLiveStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    const unsub = onSnapshot(doc(db, "students", studentId), (snap) => {
      setLiveStudent(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      setLoading(false);
    });
    return () => unsub();
  }, [studentId]);
  const data = liveStudent;

  // Live attendance history — reads the exact subcollection Attendance.jsx
  // writes to: students/{studentId}/attendance/{date}
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "students", studentId, "attendance"),
      (snap) => {
        setAttendanceRecords(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
    );
    return () => unsub();
  }, [studentId]);

  const totalMarkedDays = attendanceRecords.length;
  const presentDays = attendanceRecords.filter(
    (r) => r.status === "Present",
  ).length;
  const attendancePercent =
    totalMarkedDays > 0
      ? ((presentDays / totalMarkedDays) * 100).toFixed(1)
      : null;

  if (loading) {
    return (
      <div className="w-full py-24 flex items-center justify-center text-slate-400 text-xs font-bold">
        Loading student profile...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="w-full py-24 flex flex-col items-center justify-center gap-3 text-slate-400 text-xs font-bold">
        <span>Student not found.</span>
        <button
          onClick={onBack}
          className="group inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 via-white to-indigo-50 px-3.5 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-200 hover:bg-gradient-to-r hover:from-indigo-50 hover:to-white hover:text-indigo-700 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-200"
        >
          ← Back 
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full text-xs text-slate-700 animate-fadeIn">
      <Header  />
      {/* Top Banner Control Panel */}
      <div className="flex justify-between items-center bg-slate-50 p-5 rounded-2xl border border-slate-100">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="group inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 via-white to-indigo-50 px-3 py-2 text-sm font-bold text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-200 hover:bg-gradient-to-r hover:from-indigo-50 hover:to-white hover:text-indigo-700 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-200"
          >
            <span className="text-base leading-none transition-transform duration-200 group-hover:-translate-x-0.5">←</span>
            <span>Back</span>
          </button>
          <div>
            <h2 className="text-xl font-bold text-slate-900 ">{data.name}</h2>
            <p className="text-indigo-600 font-bold mt-0.5">
              Roll: #{data.rollNumber} —{" "}
              <span className="text-slate-400 font-normal">
                {data.className}
                {data.section ? ` - ${data.section}` : ""}
              </span>
            </p>
          </div>
        </div>
        <span
          className={`text-[12px] font-black px-3 py-1 rounded-full uppercase tracking-wider border ${
            statusStyles[data.feeStatus] || statusStyles.Unpaid
          }`}
        >
          Accounts: {data.feeStatus || "Unpaid"}
        </span>
      </div>

      {/* Workspace Menu Tabs Selector */}
      <div className="flex border-b border-slate-100 gap-3 sm:gap-4 pb-1 overflow-x-auto text-bold">
        {[
          { id: "timetable", label: "Timetable" },
          { id: "info", label: "Student Info" },
          { id: "analytics", label: "Scholastic Analytics" },
          { id: "finance", label: "Tuition Fee" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() =>
              navigate(`/school/students/${studentId}/${t.id}`, {
                replace: true,
              })
            }
            className={`px-1.5 pb-3 text-[11px] sm:text-xs font-bold transition-all relative whitespace-nowrap ${
              activeTab === t.id
                ? "text-indigo-600 font-black"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            {t.label}
            {activeTab === t.id && (
              <div className="absolute bottom-0 inset-x-1 h-0.5 bg-indigo-600 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Core Buttons */}
      <div className="w-full">
        {/* TAB 1:  TIMETABLE */}
        {activeTab === "timetable" && (
          <StudentTimetableTab studentId={data.id} studentData={data} />
        )}

        {/* TAB: STUDENT & GUARDIAN INFO */}
        {activeTab === "info" && (
          <StudentInfoTab studentId={data.id} studentData={data} />
        )}

        {/* TAB 2: Academic  REPORT */}
        {activeTab === "analytics" && (
          <ScholasticAnalytics student={data} />
        )}

        {/* TAB 3: FINANCE */}
        {activeTab === "finance" && (
          <StudentFeeLedger studentId={data.id} studentData={data} />
        )}
      </div>
    </div>
  );
};

export default StudentDetailView;