import React, { useState } from "react";
import Header from "./Header";

const NoticeBoard = () => {
  const [searchTerm, setSearchTerm] = useState("");

  const bulletins = [
    {
      id: 1,
      type: "Urgent Update",
      date: "July 16, 2026",
      headline: "Parent-Teacher Conference & Schedule",
      desc: "This contains the description detailing parent-teacher conferences, upcoming scheduled examinations, or operational holiday timelines.",
    },
    {
      id: 2,
      type: "General Info",
      date: "July 16, 2026",
      headline: "Mid-Term Examination Guidelines",
      desc: "This contains the description detailing parent-teacher conferences, upcoming scheduled examinations, or operational holiday timelines.",
    },
  ];

  const filteredBulletins = bulletins.filter((b) => {
    if (!searchTerm || !searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase().trim();
    return (
      b.headline.toLowerCase().includes(q) ||
      b.desc.toLowerCase().includes(q) ||
      b.type.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 w-full">
      <Header onSearch={setSearchTerm} searchPlaceholder="Search notices & announcements..." />
      {/* Responsive Control Bar */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Bulletin Notice Board</h2>
          <p className="text-xs text-slate-400">Post announcements and guidelines across student and staff portals.</p>
        </div>
        <button className="w-full sm:w-auto px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition">
          New Announcement
        </button>
      </div>

      {/* Bulletin Grid */}
      {filteredBulletins.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-slate-200 text-slate-400 text-xs rounded-2xl italic">
          No notices match your search term.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredBulletins.map((b) => (
            <div key={b.id} className="bg-white border border-slate-100 p-5 rounded-2xl shadow-xs space-y-3 relative overflow-hidden">
              <div className="flex justify-between items-center">
                <span className={`text-[9px] font-bold uppercase px-2.5 py-0.5 rounded-full ${
                  b.id === 1 ? "bg-rose-50 text-rose-500 border border-rose-100" : "bg-indigo-50 text-indigo-500"
                }`}>
                  {b.type}
                </span>
                <p className="text-[10px] font-mono text-slate-400">📅 {b.date}</p>
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-950">{b.headline}</h4>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  {b.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default NoticeBoard;