import React, { useEffect, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { useOutletContext } from "react-router-dom";

const GenderGraph = () => {
  const [genderData, setGenderData] = useState([
    { name: "Male", value: 0, color: "#6366f1" },
    { name: "Female", value: 0, color: "#fbcfe8" },
  ]);

  const session = JSON.parse(localStorage.getItem("schoolix_session") || "null");
  const currentSchoolId = session?.schoolId || null;
  const { isSidebarHovered } = useOutletContext() || {};

  useEffect(() => {
    if (!currentSchoolId) {
      setGenderData([
        { name: "Male", value: 0, color: "#6366f1" },
        { name: "Female", value: 0, color: "#fbcfe8" },
      ]);
      return;
    }

    const q = query(
      collection(db, "students"),
      where("schoolId", "==", currentSchoolId),
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        let maleCount = 0;
        let femaleCount = 0;

        snapshot.forEach((doc) => {
          const gender = String(doc.data().gender || "").trim().toLowerCase();
          if (gender === "male") maleCount += 1;
          else if (gender === "female") femaleCount += 1;
        });

        setGenderData([
          { name: "Male", value: maleCount, color: "#6366f1" },
          { name: "Female", value: femaleCount, color: "#fbcfe8" },
        ]);
      },
      (error) => {
        console.error("GenderGraph snapshot error:", error);
      },
    );

    return () => unsub();
  }, [currentSchoolId]);

  const total = genderData.reduce((sum, item) => sum + item.value, 0);

  return (
    <div
      style={{
        width: "100%",
        minWidth: "200px",
        height: "280px",
        backgroundColor: "#ffffff",
        borderRadius: "16px",
        padding: "16px 20px",
        boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)",
        fontFamily: "sans-serif",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        boxSizing: "border-box",
      }}
    >
      <div>
        <h3 style={{ margin: "0 0 2px 0", fontSize: "18px", color: "#0f172a", fontWeight: "700" }}>
          Students by Gender
        </h3>
        <p style={{ margin: "0", fontSize: "14px", color: "#94a3b8" }}>
          Enrollment distribution metrics
        </p>
      </div>

      <div className="recharts-performance-isolation" style={{ width: "100%", height: "110px", position: "relative" }}>
        <ResponsiveContainer width="100%" height="100%" debounce={isSidebarHovered ? 500 : 0}>
          <PieChart>
            <Pie
              data={genderData}
              cx="50%"
              cy="50%"
              innerRadius={42}
              outerRadius={52}
              startAngle={90}
              endAngle={-270}
              dataKey="value"
            >
              {genderData.map((entry, idx) => (
                <Cell key={idx} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        <div style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          textAlign: "center"
        }}>
          <div style={{ fontSize: "20px", fontWeight: "800", color: "#0f172a", lineHeight: "1" }}>
            {total.toLocaleString()}
          </div>
        </div>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "10px",
        fontSize: "12px",
        width: "100%"
      }}>
        {genderData.map((item, idx) => (
          <div
            key={idx}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              backgroundColor: "#f8fafc",
              padding: "6px 10px",
              borderRadius: "20px"
            }}
          >
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: item.color, flexShrink: 0 }} />
            <span style={{ color: "#475569", fontSize: "15px", fontWeight: "500", whiteSpace: "nowrap" }}>
              {item.name} ({item.value})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default GenderGraph;
