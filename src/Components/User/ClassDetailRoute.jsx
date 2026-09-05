import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import ClassDetailView from "./ClassDetailView";


const ClassDetailRoute = () => {
  const { classId } = useParams();
  const navigate = useNavigate();
  const [classData, setClassData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!classId) return;
    setLoading(true);
    const unsubscribe = onSnapshot(
      doc(db, "classes", classId),
      (snap) => {
        setClassData(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        setLoading(false);
      },
      (error) => {
        console.error(error);
        setClassData(null);
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [classId]);

  if (loading) {
    return (
      <div className="p-6 text-xs text-slate-400 text-center animate-pulse">
        Loading class...
      </div>
    );
  }

  if (!classData) {
    return (
      <div className="p-6 text-center text-xs text-slate-400 italic">
        This class doesn't exist or was deleted.
        <button
          onClick={() => navigate("/school/classes")}
          className="block mx-auto mt-3 text-indigo-600 font-bold cursor-pointer not-italic"
        >
          ← Back to Classes
        </button>
      </div>
    );
  }

  return (
    <ClassDetailView
      classData={classData}
      onBack={() => navigate("/school/classes")}
    />
  );
};

export default ClassDetailRoute;
