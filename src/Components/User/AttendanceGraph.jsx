import React, { useState, useEffect, useRef } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { collection, collectionGroup, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { useOutletContext } from "react-router-dom";

const STATUS_COLORS = {
  Present: '#3b82f6',
  Leave: '#f59e0b',
  Absent: '#ef4444',
  'Not Marked': '#94a3b8',
};

export default function AttendanceGraph() {
  const getTodayDateString = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const todayDate = getTodayDateString();
  const [selectedDate, setSelectedDate] = useState(todayDate);
  const [loading, setLoading] = useState(false);
  const [studentRosterVersion, setStudentRosterVersion] = useState(0);
  const schoolStudentIdsRef = useRef(new Set());
  const [totalStudents, setTotalStudents] = useState(0);
  const [attendanceCounts, setAttendanceCounts] = useState({
    present: 0,
    leave: 0,
    absent: 0,
    total: 0,
  });
  const { isSidebarOpen } = useOutletContext() || {};

  const session = JSON.parse(localStorage.getItem('schoolix_session') || 'null');
  const currentSchoolId = session?.schoolId || 'default_school';

  useEffect(() => {
    if (!currentSchoolId) {
      setAttendanceCounts({ present: 0, leave: 0, absent: 0, total: 0 });
      return;
    }

    setLoading(true);
    const q = query(
      collectionGroup(db, 'attendance'),
      where('schoolId', '==', currentSchoolId),
      where('date', '==', selectedDate),
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const countsByStudent = new Map();

        snapshot.forEach((doc) => {
          const studentId = doc.ref.parent.parent?.id;
          if (!studentId || !schoolStudentIdsRef.current.has(studentId)) return;
          const status = String(doc.data().status || '').trim();
          if (status === 'Present' || status === 'Leave' || status === 'Absent') {
            countsByStudent.set(studentId, status);
          }
        });

        let present = 0;
        let leave = 0;
        let absent = 0;
        countsByStudent.forEach((status) => {
          if (status === 'Present') present += 1;
          else if (status === 'Leave') leave += 1;
          else if (status === 'Absent') absent += 1;
        });

        const total = present + leave + absent;
        console.log('[AttendanceGraph] unique school attendance records:', {
          date: selectedDate,
          schoolStudents: schoolStudentIdsRef.current.size,
          markedStudents: total,
        });
        setAttendanceCounts({ present, leave, absent, total });
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching attendance data: ', error);
        setAttendanceCounts({ present: 0, leave: 0, absent: 0, total: 0 });
        setLoading(false);
      },
    );

    return () => {
      unsub();
    };
  }, [currentSchoolId, selectedDate, studentRosterVersion]);

  useEffect(() => {
    if (!currentSchoolId) return;

    const studentsQuery = query(
      collection(db, 'students'),
      where('schoolId', '==', currentSchoolId),
    );
    const unsubscribeStudents = onSnapshot(
      studentsQuery,
      (snapshot) => {
        schoolStudentIdsRef.current = new Set(
          snapshot.docs.map((studentDoc) => studentDoc.id),
        );
        setTotalStudents(schoolStudentIdsRef.current.size);
        setStudentRosterVersion((version) => version + 1);
      },
      (error) => {
        console.error('Error fetching school students for attendance: ', error);
        schoolStudentIdsRef.current = new Set();
        setTotalStudents(0);
        setStudentRosterVersion((version) => version + 1);
      },
    );

    return () => unsubscribeStudents();
  }, [currentSchoolId]);

  // Marked count is always relative to the actual student roster, never
  // the raw Firestore doc count, so stale/duplicate records can't inflate it.
  const markedCount = attendanceCounts.present + attendanceCounts.leave + attendanceCounts.absent;
  const notMarkedCount = Math.max(totalStudents - markedCount, 0);
  const nothingMarkedYet = totalStudents > 0 && markedCount === 0;

  const pct = (count) =>
    totalStudents > 0 ? Math.round((count / totalStudents) * 100) : 0;

  // When nothing has been marked, render a single full gray ring instead
  // of a 0-value chart (Recharts draws nothing useful for an all-zero Pie).
  const activeChartData = nothingMarkedYet
    ? [{ name: 'Not Marked', value: 100, color: STATUS_COLORS['Not Marked'] }]
    : [
        { name: 'Present', value: pct(attendanceCounts.present), color: STATUS_COLORS.Present },
        { name: 'Leave', value: pct(attendanceCounts.leave), color: STATUS_COLORS.Leave },
        { name: 'Absent', value: pct(attendanceCounts.absent), color: STATUS_COLORS.Absent },
        { name: 'Not Marked', value: pct(notMarkedCount), color: STATUS_COLORS['Not Marked'] },
      ];

  // Legend always shows all 4 statuses (even at 0%) for a consistent layout.
  const legendData = [
    { name: 'Present', value: pct(attendanceCounts.present), color: STATUS_COLORS.Present },
    { name: 'Leave', value: pct(attendanceCounts.leave), color: STATUS_COLORS.Leave },
    { name: 'Absent', value: pct(attendanceCounts.absent), color: STATUS_COLORS.Absent },
    { name: 'Not Marked', value: pct(notMarkedCount), color: STATUS_COLORS['Not Marked'] },
  ];

  return (
    <div className="w-full min-h-[240px] sm:min-h-67.5 bg-white border border-slate-200/80 rounded-xl sm:rounded-2xl p-3.5 sm:p-4 xl:p-5 shadow-xs flex flex-col justify-between box-border">

      {/* Header with Styled Date Input Calendar Icon */}
      <div className="flex items-center justify-between w-full gap-2">
        <div className="min-w-0">
          <h3 className="m-0 text-[15px] sm:text-[16px] xl:text-[18px] text-slate-900 font-bold tracking-tight truncate">
            Attendance Overview
          </h3>
          <p className="m-0 text-[11px] sm:text-[12px] xl:text-[14px] text-slate-400 mt-0.5 truncate">
            Daily presence matrix statistics
          </p>
        </div>

        {/* Beautiful Hover Interactive Calendar Picker Container */}
        <div className="relative flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200/60 rounded-lg sm:rounded-xl transition-all duration-200 group cursor-pointer shrink-0">
          <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-500 group-hover:text-indigo-600 transition-colors shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75h18M3 7.5h18M4.5 21h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v12a2.25 2.25 0 0 0 2.25 2.25Z" />
          </svg>

          <input 
            type="date" 
            value={selectedDate}
            max={todayDate} 
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-[74px] sm:w-auto text-[10px] sm:text-xs font-bold text-slate-600 bg-transparent border-none outline-none focus:ring-0 cursor-pointer uppercase tracking-wider"
            style={{ colorScheme: 'light' }}
          />
        </div>
      </div>

      {/* "Not Marked" status badge, shown only when nothing has been recorded yet */}
      {!loading && nothingMarkedYet && (
        <div className="flex justify-center mt-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            Not Marked
          </span>
        </div>
      )}

      {/* Recharts Pie Layout Wrapper with full support for smooth loaders and native crisp animations */}
      <div className="recharts-performance-isolation w-full h-24 sm:h-27.5 xl:h-30 relative mt-2">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center text-[11px] sm:text-xs font-medium text-slate-400 animate-pulse">
            Fetching data...
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height="100%" debounce={isSidebarOpen ? 500 : 0}>
              <PieChart>
                <Pie
                  data={activeChartData}
                  cx="50%"          
                  cy="50%"           
                  innerRadius={38} 
                  outerRadius={48} 
                  startAngle={90}
                  endAngle={-270}
                  dataKey="value"
                  isAnimationActive={true}
                  animationDuration={700}
                >
                  {activeChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} cornerRadius={4} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>

            {/* Perfect Centered Matrix Counter Inside Donut Ring — always
                shows the total student roster, never a raw "0". */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
              <div className="text-lg sm:text-xl xl:text-2xl font-black text-slate-900 leading-none">
                {totalStudents.toLocaleString()}
              </div>
              <div className="text-[9px] sm:text-[10px] xl:text-[11px] font-black text-slate-400 mt-1 sm:mt-1.5 tracking-wider uppercase">
                Students
              </div>
            </div>
          </>
        )}
      </div>

      {/* Hint banner when today's attendance hasn't been touched at all */}
      {!loading && nothingMarkedYet && (
        <p className="text-center text-[11px] sm:text-[12px] font-semibold text-slate-400 mt-2 px-2">
          Attendance for {selectedDate === todayDate ? 'today' : 'this date'} has not been marked yet.
        </p>
      )}

      {/* 4 Interactive Grid Options: Present, Leave, Absent, Not Marked */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2 w-full mt-2">
        {legendData.map((item, index) => (
          <div 
            key={index} 
            className="flex items-center justify-between bg-slate-50/80 border border-slate-100 hover:border-slate-200 p-1.5 sm:p-2 rounded-lg sm:rounded-xl text-[12px] sm:text-[13px] xl:text-[14px] transition-all box-border w-full shadow-3xs"
          >
            <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
              <span 
                className="w-1.5 h-1.5 rounded-full shrink-0" 
                style={{ backgroundColor: item.color }}
              />
              <span className="text-slate-600 font-semibold truncate">{item.name}</span>
            </div>
            <span className="text-slate-900 font-extrabold ml-1 shrink-0">
              {item.value}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}