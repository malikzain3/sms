import React, { useContext } from "react";
import TimetableGrid from "../User/TimetableGrid";
import { TeacherPortalContext } from "../../Pages/TeacherPortal";

const TeacherTimeTable = () => {
  const { teacher } = useContext(TeacherPortalContext);

  if (!teacher?.id) {
    return <p className="text-xs text-slate-400 p-4">Loading timetable...</p>;
  }

  return (
    <div className="space-y-6 w-full">
      <TimetableGrid currentId={teacher.id} type="teacher" />
    </div>
  );
};

export default TeacherTimeTable;