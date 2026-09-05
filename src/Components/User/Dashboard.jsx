import React from "react";
import DashboardCards from "./DashboardCards";
import RevenueGraph from "./RevenueGraph";
import AttendanceGraph from "./AttendanceGraph";
import StudentPerformanceGraph from "./StudentPerformanceGraph";
import GenderGraph from "./GenderGraph";
import Header from "./Header";

const Dashboard = () => {
  
  return (
    <div className="space-y-6 md:space-y-8 w-full">
      <Header />
      {/* Dashboard Summary Widgets */}
      <DashboardCards />

      {/* First Row of Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RevenueGraph />
        </div>
        <div>
          <AttendanceGraph />
        </div>
      </div>

      {/* Second Row of Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <StudentPerformanceGraph />
        </div>
        <div>
          <GenderGraph />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
