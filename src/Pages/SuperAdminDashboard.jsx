import { useState, useEffect } from "react";
import { signOut } from "firebase/auth";
import ApprovedSchoolsBox from "../Components/Super/ApprovedSchoolsBox";
import PendingInquiries from "../Components/Super/PendingInquiries";
import FinancialAnalytics from "../Components/Super/FinancialAnalytics";
import LoadingScreen from "../Components/Super/LoadingScreen";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  ChartNoAxesCombined,
  School,
  ClipboardClock,
  LogOut,
  ShieldUser,
  Menu,
  X,
} from "lucide-react";

import {
  collection,
  onSnapshot,
  query,
  where,
  getDoc,
  doc,
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import { auth } from "../firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";

function SuperAdminDashboard() {
  const navigate = useNavigate();
  const [inquiries, setInquiries] = useState([]);
  const [schools, setSchools] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const location = useLocation();

  const getPageTitle = () => {
    const path = location.pathname;
    if (path.includes("/schools")) return "All Schools";
    if (path.includes("/inquiries")) return "Pending Inquiries";
    if (path.includes("/financial")) return "Analytics & Reports";
    if (path.includes("/settings")) return "System Settings";
    return "Super Admin Dashboard"; // Default title
  };

  useEffect(() => {
    const q = query(
      collection(db, "inquiries"),
      where("status", "==", "pending"),
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setInquiries(data);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        navigate("/");
      } else {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (!userDoc.exists() || userDoc.data().role !== "superadmin") {
          navigate("/");
        } else {
          setLoading(false);
        }
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "schools"), (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setSchools(data);
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      localStorage.removeItem("schoolix_session");
      await signOut(auth);
      navigate("/");
    } catch (err) {
      console.log("Logout Error:", err);
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="w-full h-screen bg-slate-950 text-white overflow-hidden">
      <AnimatePresence mode="wait">
        {loading || isLoggingOut ? (
          <LoadingScreen
            key="loading"
            message={isLoggingOut ? "Logging out of Schoolix..." : undefined}
          />
        ) : (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="flex h-screen bg-slate-950 text-white overflow-hidden"
          >
            {/* Sidebar for desktop */}
            <aside
              className={`fixed md:sticky top-0 left-0 z-40 w-64 h-full bg-slate-900 border-r border-slate-800 transition-transform duration-300 md:translate-x-0 ${
                sidebarOpen ? "translate-x-0" : "-translate-x-full"
              } flex flex-col`}
            >
              <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <ShieldUser/>
                  <span className="font-bold text-lg tracking-tight">
                    Schoolix Admin
                  </span>
                </div>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="md:hidden text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5"/>
                </button>
              </div>

              <nav className="flex-1 p-4 space-y-1.5">
                <NavLink
                  to="/superadmin"
                  end
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) =>
                    `w-full flex items-center space-x-3 px-4 py-2.5 rounded-xl text-xs font-semibold transition ${
                      isActive
                        ? "bg-cyan-600 text-white shadow-lg shadow-cyan-600/10"
                        : "text-slate-400 hover:bg-slate-800 hover:text-white"
                    }`
                  }
                >
                  <ChartNoAxesCombined />
                  <span>Financial Analytics</span>
                </NavLink>

                <NavLink
                  to="/superadmin/schools"
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) =>
                    `w-full flex items-center space-x-3 px-4 py-2.5 rounded-xl text-xs font-semibold transition ${
                      isActive
                        ? "bg-cyan-600 text-white shadow-lg shadow-cyan-600/10"
                        : "text-slate-400 hover:bg-slate-800 hover:text-white"
                    }`
                  }
                >
                  <School />
                  <span>Approved Schools</span>
                </NavLink>

                <NavLink
                  to="/superadmin/inquiries"
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) =>
                    `w-full flex items-center space-x-3 px-4 py-2.5 rounded-xl text-xs font-semibold transition ${
                      isActive
                        ? "bg-cyan-600 text-white shadow-lg shadow-cyan-600/10"
                        : "text-slate-400 hover:bg-slate-800 hover:text-white"
                    }`
                  }
                >
                  <ClipboardClock />
                  <span>Pending Inquiries</span>
                  {inquiries.length > 0 && (
                    <span className="ml-auto bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                      {inquiries.length}
                    </span>
                  )}
                </NavLink>
              </nav>
              <div className="p-4 border-t border-slate-800">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold text-red-400 bg-red-500/5 hover:bg-red-500 hover:text-white transition"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Logout</span>
                </button>
              </div>
            </aside>

            {/* Overlay for mobile sidebar */}
            {sidebarOpen && (
              <div
                onClick={() => setSidebarOpen(false)}
                className="fixed inset-0 z-30 bg-black/50 md:hidden"
              />
            )}

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0">
              {/* Mobile top bar */}
              <div className="md:hidden flex items-center gap-3 p-4 bg-slate-900 border-b border-slate-800">
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="p-1 text-slate-400 hover:text-white transition"
                  aria-label="Open sidebar"
                >
                  <Menu />
                </button>
                <span className="text-sm font-semibold text-white">
                  Schoolix Admin
                </span>
              </div>

              {/* Scrollable container for tables & content cards */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
                <div className="w-full max-w-7xl 2xl:max-w-[1600px] mx-auto">
                  <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white tracking-tight mb-6">
                    {getPageTitle()}
                  </h1>
                  <Outlet context={{schools, inquiries}}/>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
export default SuperAdminDashboard;
