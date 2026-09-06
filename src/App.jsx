import "./App.css";
import { useState, useEffect } from "react";
import { Navigate, Routes, Route, useLocation } from "react-router-dom";
import { auth, db } from "./firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import Login from "./Pages/Login";
import SuperAdminDashboard from "./Pages/SuperAdminDashboard";
import SchoolDashboard from "./Pages/SchoolDashboard";
import Dashboard from "./Components/User/Dashboard";
import Classes from "./Components/User/Classes";
import ClassDetailView from "./Components/User/ClassDetailView";
import Teachers from "./Components/User/Teachers";
import TeacherDetailView from "./Components/User/TeacherDetailView";
import Students from "./Components/User/Students";
import StudentDetailView from "./Components/User/StudentDetailView";
import Attendance from "./Components/User/Attendance";
import Finance from "./Components/User/Finance";
import SchoolSettings from "./Components/User/SchoolSettings";
import FinancialAnalytics from "./Components/Super/FinancialAnalytics";
import ApprovedSchoolsBox from "./Components/Super/ApprovedSchoolsBox";
import PendingInquiries from "./Components/Super/PendingInquiries";
import UpgradeRequestsBox from "./Components/Super/UpgradeRequestsBox";
import SchoolExaminationDashboard from "./Components/User/SchoolExaminationDashboard";

// Context API Provider
import { SchoolProvider } from "./context/SchoolContext.jsx";

// TEACHER PORTAL
import TeacherPortal from "./Pages/TeacherPortal";
import TeacherHome from "./Components/Teacher/TeacherHome";
import TeacherAttendance from "./Components/Teacher/TeacherAttendance";
import TeacherClasses from "./Components/Teacher/TeacherClasses";
import TeacherClassDetail from "./Components/Teacher/TeacherClassDetail";
import TeacherStudentDetail from "./Components/Teacher/TeacherStudentDetail";
import TeacherSettings from "./Components/Teacher/TeacherSettings";
import TeacherTimeTable from "./Components/Teacher/TeacherTimeTable";
import TeacherExaminationDashboard from "./Components/Teacher/TeacherExaminationDashboard";
import TeacherFinance from "./Components/Teacher/TeacherFinance";

function App() {
  const ProtectedRoute = ({ children, allowedRoles }) => {
    const [loading, setLoading] = useState(true);
    const [authorized, setAuthorized] = useState(false);
    const [schoolSlug, setSchoolSlug] = useState("");
    const location = useLocation();

    useEffect(() => {
      const localSession = JSON.parse(localStorage.getItem("schoolix_session"));

      if (!localSession) {
        setAuthorized(false);
        setLoading(false);
        return;
      }
      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (!user) {
          localStorage.removeItem("schoolix_session");
          setAuthorized(false);
          setLoading(false);
          return;
        }

        try {
          const userDocRef = doc(db, "users", user.uid);
          const userDoc = await getDoc(userDocRef);

          if (userDoc.exists()) {
            const userData = userDoc.data();
            const isAuthorizedRole =
              userData.role === allowedRoles ||
              (allowedRoles === "schooladmin" &&
                (userData.role === "school_admin" ||
                  userData.role === "schoolAdmin"));

            if (isAuthorizedRole) {
              if (
                allowedRoles === "schooladmin" ||
                allowedRoles === "teacher"
              ) {
                const schoolDocRef = doc(db, "schools", userData.schoolId);
                const schoolDoc = await getDoc(schoolDocRef);
                if (
                  schoolDoc.exists() &&
                  schoolDoc.data().status === "active"
                ) {
                  setAuthorized(true);
                } else {
                  setAuthorized(false);
                }
              } else {
                setAuthorized(true);
              }
            } else {
              setAuthorized(false);
            }
          } else {
            const inquiryDocRef = doc(db, "inquiries", user.uid);
            const inquiryDoc = await getDoc(inquiryDocRef);
            if (inquiryDoc.exists()) {
              if (allowedRoles === "schooladmin") {
                setAuthorized(true);
              } else {
                setAuthorized(false);
              }
            } else {
              setAuthorized(false);
            }
          }
        } catch (err) {
          console.log("Router authorization Error:", err);
          setAuthorized(false);
        } finally {
          setLoading(false);
        }
      });
      return () => unsubscribe();
    }, [allowedRoles]);

    if (loading) {
      return (
        <div className="flex items-center justify-center h-screen">
          <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-blue-600"></div>
        </div>
      );
    }

    if (!authorized) {
      // Pure root paths like /superadmin or /school ko query state mein na bhejein
      const isBaseRoute = ["/superadmin", "/school", "/teacher", "/"].includes(
        location.pathname,
      );
      const redirectQuery = isBaseRoute
        ? ""
        : `?redirect=${encodeURIComponent(location.pathname + location.search)}`;

      return <Navigate to={`/${redirectQuery}`} replace />;
    }
    return children;
  };

  return (
    // YAHAN PAR SchoolProvider SE WRAP KIYA GAYA HAI ⬇️
    <SchoolProvider>
      <Routes>
        <Route path="/" element={<Login />} />

        {/* SCHOOL DASHBOARD */}
        <Route
          path="/school"
          element={
            <ProtectedRoute allowedRoles="schooladmin">
              <SchoolDashboard />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/school/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="classes" element={<Classes />} />
          <Route path="classes/:classId" element={<ClassDetailView />} />
          <Route path="teachers" element={<Teachers />} />
          <Route
            path="teachers/:teacherId/:tab?"
            element={<TeacherDetailView />}
          />
          <Route path="students" element={<Students />} />
          <Route
            path="/school/students/:studentId/:tab?"
            element={<StudentDetailView />}
          />
          <Route path="attendance" element={<Attendance />} />
          <Route path="finance" element={<Finance />} />
          <Route path="examination" element={<SchoolExaminationDashboard />} />
          <Route path="settings" element={<SchoolSettings />} />
        </Route>

        {/* TEACHER PORTAL */}
        <Route
          path="/teacher"
          element={
            <ProtectedRoute allowedRoles="teacher">
              <TeacherPortal />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/teacher/dashboard" replace />} />
          <Route path="dashboard" element={<TeacherHome />} />
          <Route path="attendance" element={<TeacherAttendance />} />
          <Route path="classes" element={<TeacherClasses />} />
          <Route path="timetable" element={<TeacherTimeTable />} />
          <Route path="classes/:classId" element={<TeacherClassDetail />} />
          <Route path="examination" element={<TeacherExaminationDashboard />} />
          <Route path="finance" element={<TeacherFinance />} />
          <Route
            path="classes/:classId/students/:studentId"
            element={<TeacherStudentDetail />}
          />
          <Route path="settings" element={<TeacherSettings />} />
        </Route>

        {/* SUPER ADMIN */}
        <Route
          path="/superadmin"
          element={
            <ProtectedRoute allowedRoles="superadmin">
              <SuperAdminDashboard />
            </ProtectedRoute>
          }
        >
          <Route index element={<FinancialAnalytics />} />
          <Route path="financial" element={<FinancialAnalytics />} />
          <Route path="schools" element={<ApprovedSchoolsBox />} />
          <Route path="inquiries" element={<PendingInquiries />} />
          {/* Fix path name here */}
          <Route path="upgrades" element={<UpgradeRequestsBox />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </SchoolProvider>
  );
}

export default App;
