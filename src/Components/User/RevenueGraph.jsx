import React, { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { useOutletContext } from "react-router-dom";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const CHART_YEAR = 2026;

const emptyData = MONTHS.map((name) => ({ name, Revenue: 0 }));

const getMonthIndex = (value) => {
  if (!value) return -1;
  if (typeof value === "string") {
    const monthKeyMatch = value.match(/^(\d{4})-(\d{1,2})$/);
    if (monthKeyMatch) {
      return Number(monthKeyMatch[1]) === CHART_YEAR
        ? Number(monthKeyMatch[2]) - 1
        : -1;
    }

    const monthLabelMatch = value.match(/^([A-Za-z]+)\s+(\d{4})$/);
    if (monthLabelMatch && Number(monthLabelMatch[2]) === CHART_YEAR) {
      const monthIndex = MONTHS.findIndex(
        (month) => month.toLowerCase() === monthLabelMatch[1].toLowerCase(),
      );
      return monthIndex;
    }
  }

  if (typeof value.toDate === "function") value = value.toDate();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) || date.getFullYear() !== CHART_YEAR
    ? -1
    : date.getMonth();
};

// Compact "18k" style formatter for the Y axis
const formatCompact = (value) => {
  const num = Number(value) || 0;
  if (Math.abs(num) >= 1000) {
    const k = num / 1000;
    return `${Number.isInteger(k) ? k : k.toFixed(1)}k`;
  }
  return `${num}`;
};

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg shadow-slate-900/10 border border-slate-100 px-4 py-3 min-w-[160px]">
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
          {label}
        </p>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
          <p className="text-sm font-bold text-slate-800">
            PKR {Number(payload[0].value || 0).toLocaleString("en-PK")}
          </p>
        </div>
      </div>
    );
  }
  return null;
};

export const RevenueGraph = () => {
  const session = JSON.parse(
    localStorage.getItem("schoolix_session") || "null",
  );
  const schoolId = session?.schoolId;
  const [data, setData] = useState(emptyData);
  // isSidebarOpen drives the drawer overlay now (renamed from the old
  // hover-based isSidebarHovered) — kept here only to debounce the chart's
  // resize handling while the drawer animates open/closed.
  const { isSidebarOpen } = useOutletContext() || {};

  useEffect(() => {
    if (!schoolId) {
      setData(emptyData);
      return;
    }

    const monthlyStatsRef = collection(db, "schools", schoolId, "monthlyStats");
    return onSnapshot(
      monthlyStatsRef,
      (snapshot) => {
        const totals = Array(12).fill(0);
        snapshot.docs.forEach((monthlyStatDoc) => {
          const monthlyStat = monthlyStatDoc.data();
          const monthIndex =
            getMonthIndex(monthlyStatDoc.id) >= 0
              ? getMonthIndex(monthlyStatDoc.id)
              : getMonthIndex(monthlyStat.month || monthlyStat.monthKey);
          const amount = Number(monthlyStat.totalCollected || 0);
          if (monthIndex >= 0 && Number.isFinite(amount)) {
            totals[monthIndex] = amount;
          }
        });
        setData(
          MONTHS.map((name, index) => ({
            name,
            Revenue: Number(totals[index].toFixed(2)),
          })),
        );
      },
      (error) => {
        console.error("[RevenueGraph] monthly income listener failed:", error);
        setData(emptyData);
      },
    );
  }, [schoolId]);

  return (
    <div
      className="recharts-performance-isolation"
      style={{ width: "100%", height: "100%", minHeight: "350px" }}
    >
      <ResponsiveContainer
        width="100%"
        height="90%"
        debounce={isSidebarOpen ? 500 : 0}
      >
        <AreaChart
          data={data}
          margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
        >
          <defs>
            <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#6366f1" stopOpacity={0.05} />
            </linearGradient>
          </defs>

          <CartesianGrid
            vertical={false}
            strokeDasharray="3 3"
            stroke="#e2e8f0"
            opacity={0.6}
          />

          <XAxis
            dataKey="name"
            interval={0}
            tickFormatter={(month) => month.slice(0, 3)}
            tick={{ fontSize: 12, fill: "#94a3b8" }}
            axisLine={{ stroke: "#e2e8f0" }}
            tickLine={false}
            minTickGap={0}
          />
          <YAxis
            domain={[0, "auto"]}
            tickFormatter={formatCompact}
            tick={{ fontSize: 12, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
            width={48}
          />

          <Tooltip
            content={<CustomTooltip />}
            cursor={{ stroke: "#6366f1", strokeWidth: 1, strokeDasharray: "4 4" }}
          />

          <Area
            type="monotone"
            dataKey="Revenue"
            name="Revenue"
            stroke="#6366f1"
            strokeWidth={3}
            fill="url(#revenueGradient)"
            activeDot={{ r: 5, fill: "#6366f1", strokeWidth: 2, stroke: "#fff" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default RevenueGraph;