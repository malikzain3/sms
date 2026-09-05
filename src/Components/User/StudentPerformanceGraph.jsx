import React, { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Cell,
  Tooltip,
} from "recharts";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { useOutletContext } from "react-router-dom";

const COLORS = ["#3b82f6", "#ec4899", "#6366f1", "#10b981", "#f59e0b"];

const StudentPerformanceGraph = () => {
  const session = JSON.parse(
    localStorage.getItem("schoolix_session") || "null",
  );
  const schoolId = session?.schoolId;
  const [data, setData] = useState([]);
  const { isSidebarHovered } = useOutletContext() || {};

  useEffect(() => {
    if (!schoolId) {
      setData([]);
      return;
    }

    const resultsQuery = query(
      collection(db, "examResults"),
      where("schoolId", "==", schoolId),
    );
    return onSnapshot(
      resultsQuery,
      (snapshot) => {
        console.log(
          "[StudentPerformanceGraph] examResults snapshot:",
          snapshot.size,
          snapshot.docs,
        );
        console.log(
          "[StudentPerformanceGraph] raw examResults documents:",
          snapshot.docs.map((resultDoc) => ({
            id: resultDoc.id,
            ...resultDoc.data(),
          })),
        );
        const gradeTotals = {};
        snapshot.docs.forEach((resultDoc) => {
          const result = resultDoc.data();
          const grade =
            result.className ||
            result.gradeLevel ||
            result.grade ||
            result.class;
          const storedPercentage = Number(result.percentage);
          const marksObtained = Number(
            result.marksObtained ?? result.obtainedMarks,
          );
          const totalMarks = Number(result.totalMarks);
          const percentage = Number.isFinite(storedPercentage)
            ? storedPercentage
            : totalMarks > 0 && Number.isFinite(marksObtained)
              ? (marksObtained / totalMarks) * 100
              : null;
          if (!grade || percentage === null || !Number.isFinite(percentage))
            return;
          if (!gradeTotals[grade]) gradeTotals[grade] = { total: 0, count: 0 };
          gradeTotals[grade].total += percentage;
          gradeTotals[grade].count += 1;
        });

        setData(
          Object.entries(gradeTotals)
            .sort(([first], [second]) =>
              first.localeCompare(second, undefined, { numeric: true }),
            )
            .map(([name, values], index) => ({
              name,
              value: Number((values.total / values.count).toFixed(1)),
              color: COLORS[index % COLORS.length],
            })),
        );
      },
      (error) => {
        console.error(
          "[StudentPerformanceGraph] examResults listener failed:",
          error,
        );
        setData([]);
      },
    );
  }, [schoolId]);

  return (
    <div
      style={{
        width: "100%",
        minWidth: "300px",
        height: "280px",
        backgroundColor: "#ffffff",
        borderRadius: "16px",
        padding: "20px 24px 10px 24px",
        boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)",
        fontFamily: "sans-serif",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div>
        <h3
          style={{
            margin: "0 0 2px 0",
            fontSize: "19px",
            color: "#0f172a",
            fontWeight: "700",
          }}
        >
          Student Performance
        </h3>
        <p style={{ margin: "0 0 12px 0", fontSize: "15px", color: "#94a3b8" }}>
          Average academic term grades
        </p>
      </div>

      <div
        style={{
          width: "100%",
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          overflowX: "auto",
          overflowY: "hidden",
        }}
      >
        {data.length === 0 ? (
          <div
            style={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#94a3b8",
              fontSize: "12px",
              fontStyle: "italic",
            }}
          >
            No exam results recorded yet.
          </div>
        ) : (
          <div
            className="recharts-performance-isolation"
            style={{
              width: `${Math.max(100, data.length * 80)}px`,
              minWidth: "100%",
              height: "100%",
            }}
          >
            <ResponsiveContainer
              width="100%"
              height="100%"
              debounce={isSidebarHovered ? 500 : 0}
            >
              <BarChart
                data={data}
                layout="horizontal"
                margin={{ top: 10, right: 10, left: 0, bottom: 20 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#e2e8f0"
                />
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  stroke="#94a3b8"
                  style={{ fontSize: "15px" }}
                  dy={10}
                />
                <YAxis
                  domain={[0, 100]}
                  width={45}
                  tickLine={false}
                  axisLine={false}
                  stroke="#94a3b8"
                  style={{ fontSize: "13px" }}
                  tickFormatter={(val) => `${val}%`}
                />
                <Tooltip cursor={{ fill: "#f8fafc" }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={32}>
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentPerformanceGraph;
