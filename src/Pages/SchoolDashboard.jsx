import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import { signOut } from "firebase/auth";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, NavLink, Outlet } from "react-router-dom";
import {
  faEnvelope,
  faChalkboardUser,
  faUserTie,
  faUsers,
  faCalendarCheck,
  faClipboardQuestion,
  faWallet,
  faGear,
} from "@fortawesome/free-solid-svg-icons";
import { motion, AnimatePresence } from "framer-motion";
import { gsap } from "gsap";
import { auth } from "../firebaseConfig";
import { X, Menu, LogOut } from "lucide-react";

const NAV_ITEMS = [
  {
    path: "/school/dashboard",
    label: "Dashboard",
    end: true,
    icon: <FontAwesomeIcon icon={faEnvelope} className="text-sm" />,
  },
  {
    path: "/school/classes",
    label: "Classes",
    icon: <FontAwesomeIcon icon={faChalkboardUser} className="text-sm" />,
  },
  {
    path: "/school/teachers",
    label: "Teachers",
    icon: <FontAwesomeIcon icon={faUserTie} className="text-sm" />,
  },
  {
    path: "/school/students",
    label: "Students",
    icon: <FontAwesomeIcon icon={faUsers} className="text-sm" />,
  },
  {
    path: "/school/attendance",
    label: "Attendance",
    icon: <FontAwesomeIcon icon={faCalendarCheck} className="text-sm" />,
  },
  {
    path: "/school/finance",
    label: "Finance",
    icon: <FontAwesomeIcon icon={faWallet} className="text-sm" />,
  },
  {
    path: "/school/examination",
    label: "Examination",
    icon: <FontAwesomeIcon icon={faClipboardQuestion} className="text-sm" />,
  },
  {
    path: "/school/settings",
    label: "Settings",
    icon: <FontAwesomeIcon icon={faGear} className="text-sm" />,
  },
];

const SchoolDashboard = () => {
  const navigate = useNavigate();

  // Drawer is now a controlled overlay, not a hover-expand panel.
  // Same boolean drives both the desktop drawer and the mobile drawer,
  // so there is only one toggle pattern to reason about.
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  // ---- refs used for GSAP entrance-animation targets (collapsed rail) ----
  const railRef = useRef(null);
  const logoRef = useRef(null);
  const logoutRef = useRef(null);
  const navItemRefs = useRef([]);

  // ---- refs for the drawer's own contents (re-animated each time it opens) ----
  const drawerNavItemRefs = useRef([]);

  navItemRefs.current = [];
  const addNavRef = (el) => {
    if (el && !navItemRefs.current.includes(el)) navItemRefs.current.push(el);
  };

  drawerNavItemRefs.current = [];
  const addDrawerNavRef = (el) => {
    if (el && !drawerNavItemRefs.current.includes(el))
      drawerNavItemRefs.current.push(el);
  };

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      localStorage.removeItem("schoolix_session");
      localStorage.removeItem("active_dashboard_tab");
      await signOut(auth);
      navigate("/");
    } catch (err) {
      console.log("Logout Error:", err);
      setIsLoggingOut(false);
    }
  };

  const closeDrawer = () => setIsSidebarOpen(false);
  const openDrawer = () => setIsSidebarOpen(true);

  // Close the drawer automatically if the viewport grows back to desktop
  // width while it happens to be open — purely a UX nicety, not required
  // for layout correctness since the drawer is always an overlay now.
  useEffect(() => {
    // no-op placeholder retained intentionally minimal; drawer behavior
    // is identical across breakpoints so no resize-driven layout math
    // is needed anymore (this is the whole point of the overlay pattern).
  }, []);

  // Close drawer on Escape for accessibility
  useEffect(() => {
    if (!isSidebarOpen) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") closeDrawer();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isSidebarOpen]);

  // Initial Load Animations for the collapsed rail (logo / icons / logout).
  // These never move or resize again once mounted, so the entrance
  // animation plays exactly once and the main content grid is never
  // touched — this is what removes the Recharts reflow/lag.
  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      tl.fromTo(
        logoRef.current,
        { scale: 0.5, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.5, ease: "back.out(1.5)" },
      )
        .fromTo(
          navItemRefs.current,
          { opacity: 0, x: -12 },
          { opacity: 1, x: 0, stagger: 0.04, duration: 0.35 },
          "-=0.2",
        )
        .fromTo(
          logoutRef.current,
          { opacity: 0, y: 10 },
          { opacity: 1, y: 0, duration: 0.3 },
          "-=0.15",
        );
    }, railRef);

    return () => ctx.revert();
  }, []);

  // Small stagger for the drawer's own nav list every time it opens,
  // so the expanded view still feels alive rather than just sliding in flat.
  useEffect(() => {
    if (!isSidebarOpen) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        drawerNavItemRefs.current,
        { opacity: 0, x: -8 },
        { opacity: 1, x: 0, stagger: 0.03, duration: 0.25, ease: "power2.out" },
      );
    });
    return () => ctx.revert();
  }, [isSidebarOpen]);

  const renderNavIcon = (tab) => (
    <span className="text-base 2xl:text-lg min-w-6 2xl:min-w-7 shrink-0 flex justify-center items-center">
      {tab.icon}
    </span>
  );

  return (
    <div className="flex h-screen bg-[#f8fafc] text-slate-800 overflow-hidden font-sans antialiased relative">
      <AnimatePresence mode="wait">
        {loading || isLoggingOut ? (
          <div
            key="loading"
            className="flex flex-col items-center justify-center w-full h-full bg-[#f8fafc]"
          >
            <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-indigo-600"></div>
            {isLoggingOut && (
              <p className="mt-6 text-sm font-semibold text-slate-500 tracking-wide animate-pulse">
                Logging out of Schoolix...
              </p>
            )}
          </div>
        ) : (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="flex-1 flex bg-[#f8fafc] text-slate-800 overflow-hidden"
          >
            {/* ============ BACKDROP (shared by mobile + desktop drawer) ============ */}
            <AnimatePresence>
              {isSidebarOpen && (
                <motion.div
                  key="backdrop"
                  onClick={closeDrawer}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-40"
                />
              )}
            </AnimatePresence>

            {/* ============ DESKTOP COLLAPSED ICON RAIL ============ */}
            {/* Fixed width, never resizes — main content's margin never changes,
                so charts never reflow when the drawer opens/closes. */}
            <aside
              ref={railRef}
              className="hidden lg:flex flex-col justify-between w-20 shrink-0 bg-white border-r border-slate-200/80 p-4 z-30"
                className="hidden lg:flex flex-col justify-between w-20 2xl:w-22 shrink-0 bg-white border-r border-slate-200/80 p-4 2xl:p-5 z-30"
            >
              <div className="space-y-7">
                {/* Collapsed state: hamburger only, no logo — sits directly
                    above the nav icons, OdoNova-style. */}
                <div className="flex justify-center px-0.5">
                  <button
                    ref={logoRef}
                    onClick={openDrawer}
                    aria-label="Open menu"
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 hover:text-indigo-600 hover:bg-indigo-50/80 transition-colors duration-200 focus:outline-none"
                  >
                    <Menu size={20} />
                  </button>
                </div>

                {/* Main Navigation Controls (icons only) */}
                <nav className="space-y-1.5">
                  {NAV_ITEMS.map((tab) => (
                    <NavLink
                      key={tab.path}
                      ref={addNavRef}
                      to={tab.path}
                      end={tab.end}
                      title={tab.label}
                      className={({ isActive }) =>
                        `w-full flex items-center justify-center p-2.5 rounded-xl text-xs font-semibold transition-all duration-200 ${
                          isActive
                            ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                            : "text-slate-600 hover:bg-indigo-50/80 hover:text-indigo-600"
                        }`
                      }
                    >
                      {renderNavIcon(tab)}
                    </NavLink>
                  ))}
                </nav>
              </div>

              {/* User Account / Logout */}
              <button
                ref={logoutRef}
                onClick={handleLogout}
                title="Logout System"
                className="cursor-pointer w-full flex items-center justify-center px-4 py-3 rounded-xl text-xs font-bold text-red-500 bg-red-50/60 hover:bg-red-100 transition-all duration-300 border border-red-100/30 hover:-translate-y-0.5 hover:shadow-md"
              >
                <LogOut size={18} color="#ef4444" strokeWidth={1.75} />
              </button>
            </aside>

            {/* ============ FLOATING DRAWER OVERLAY (desktop + mobile) ============ */}
            <AnimatePresence>
              {isSidebarOpen && (
                <motion.aside
                  key="drawer"
                  initial={{ x: "-100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "-100%" }}
                  transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
                  className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-white border-r border-slate-200/80 flex flex-col justify-between p-4 lg:p-5 shadow-2xl"
                    className="fixed inset-y-0 left-0 z-50 w-72 2xl:w-80 max-w-[85vw] bg-white border-r border-slate-200/80 flex flex-col justify-between p-4 lg:p-5 2xl:p-6 shadow-2xl"
                >
                  <div className="space-y-7">
                    {/* Brand Identity / Logo */}
                    <div className="flex items-center justify-between px-1">
                      <div className="flex items-center gap-3 2xl:gap-4">
                        <div className="w-10 h-10 2xl:w-11 2xl:h-11 rounded-xl p-1 bg-slate-900 shadow-md shadow-slate-900/20 shrink-0 flex items-center justify-center">
                          {!logoFailed ? (
                            <img
                              src="/smslogo.png"
                              alt="Schoolix"
                              className="w-full h-full object-contain filter drop-shadow-sm"
                              onError={() => setLogoFailed(true)}
                            />
                          ) : (
                            <div className="w-full h-full bg-indigo-600 rounded-lg flex items-center justify-center text-white font-black text-sm">
                              S
                            </div>
                          )}
                        </div>
                        <span className="font-bold text-lg 2xl:text-xl text-slate-900 tracking-tight whitespace-nowrap">
                          Schoolix
                        </span>
                      </div>

                      {/* Close drawer button */}
                      <button
                        onClick={closeDrawer}
                        aria-label="Close menu"
                        className="text-slate-400 hover:text-slate-600 text-lg focus:outline-none"
                      >
                        <X />
                      </button>
                    </div>

                    {/* Main Navigation Controls (icon + label) */}
                    <nav className="space-y-1.5 2xl:space-y-2 px-0.5">
                      {NAV_ITEMS.map((tab) => (
                        <NavLink
                          key={tab.path}
                          ref={addDrawerNavRef}
                          to={tab.path}
                          end={tab.end}
                          onClick={closeDrawer}
                          className={({ isActive }) =>
                            `w-full flex items-center justify-start space-x-3 2xl:space-x-3.5 p-2.5 2xl:p-3 rounded-xl text-xs 2xl:text-sm font-semibold transition-all duration-200 ${
                              isActive
                                ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                                : "text-slate-600 hover:bg-indigo-50/80 hover:text-indigo-600"
                            }`
                          }
                        >
                          {renderNavIcon(tab)}
                          <span className="whitespace-nowrap overflow-hidden shrink-0">
                            {tab.label}
                          </span>
                        </NavLink>
                      ))}
                    </nav>
                  </div>

                  {/* User Account / Logout */}
                  <button
                    onClick={handleLogout}
                    className="cursor-pointer w-full flex items-center justify-start space-x-2 2xl:space-x-3 px-4 py-3 2xl:py-3.5 rounded-xl text-xs 2xl:text-sm font-bold text-red-500 bg-red-50/60 hover:bg-red-100 transition-all duration-300 border border-red-100/30 overflow-hidden hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <span className="min-w-6 flex justify-center items-center">
                      <LogOut size={20} color="#ef4444" strokeWidth={1.75} />
                    </span>
                    <span className="whitespace-nowrap overflow-hidden">
                      Logout System
                    </span>
                  </button>
                </motion.aside>
              )}
            </AnimatePresence>

            {/* ============ MOBILE NAVIGATION HEADER BAR ============ */}
            <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-slate-200/80 flex items-center px-6 z-30 justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={openDrawer}
                  aria-label="Open menu"
                  className="text-slate-600 text-xl focus:outline-none"
                >
                  <Menu />
                </button>
                <span className="font-bold text-lg text-slate-900 tracking-tight whitespace-nowrap shrink-0">
                  Schoolix
                </span>
              </div>
              <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg">
                Schoolix Portal
              </span>
            </div>

            {/* ============ MAIN CONTENT ============ */}
            {/* Fixed left offset on desktop (rail width), fixed top offset on
                mobile (header height) — neither ever changes when the drawer
                opens, so the grid/charts underneath never reflow. */}
            <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-2 sm:p-6 lg:p-8 space-y-8 mt-16 lg:mt-0">
              <div className="w-full max-w-full mx-auto px-0 sm:px-1 lg:px-2">
                <Outlet context={{ isSidebarOpen }} />
              </div>
            </main>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SchoolDashboard;