import React, { useEffect, useMemo, useState } from "react";
import { Outlet, useNavigate, NavLink, Link } from "react-router-dom";
import {
  doc,
  onSnapshot,
  getDoc,
  collection,
  query,
  where,
} from "firebase/firestore";
import { signOut } from "firebase/auth";
import { db, auth } from "../firebaseConfig";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  CalendarCheck,
  GraduationCap,
  Settings,
  LogOut,
  Menu,
  X,
  Clock,
  Building2,
  BookOpenCheck,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import { faShieldHalved } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export const TeacherPortalContext = React.createContext(null);

const TeacherPortal = () => {
  const navigate = useNavigate();
  const session = JSON.parse(
    localStorage.getItem("schoolix_session") || "null",
  );

  const [teacher, setTeacher] = useState(null);
  const [school, setSchool] = useState(null);
  const [schoolName, setSchoolName] = useState("School");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isDesktopOpen, setIsDesktopOpen] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  useEffect(() => {
    if (!session?.teacherId) return;
    const unsub = onSnapshot(doc(db, "teachers", session.teacherId), (snap) => {
      if (snap.exists()) setTeacher({ id: snap.id, ...snap.data() });
    });
    return () => unsub();
  }, [session?.teacherId]);

  // Live-tracks the "please change your temporary password" nudge.
  // Cleared by TeacherSettings once the teacher sets their own password.
  useEffect(() => {
    if (!teacher?.authUid) return;
    const unsub = onSnapshot(doc(db, "users", teacher.authUid), (snap) => {
      setMustChangePassword(
        snap.exists() && snap.data().mustChangePassword === true,
      );
    });
    return () => unsub();
  }, [teacher?.authUid]);

  // ---------------------------------------------------------------------
  // PHASE 2 — Teacher class/subject access scope
  //
  // Two sources of truth, both already scoped by schoolId:
  // 1. "classes" docs where teachers array-contains teacher.name —
  //    this is the class-teacher / homeroom relationship. Full access.
  // 2. teacher.timetableMatrix (already on the teacher doc, dual-written
  //    by TimetableGrid) — every {classId, subject} pair this teacher
  //    actually teaches, class-teacher or not. Subject-only access for
  //    any classId here that isn't already a class-teacher class.
  // ---------------------------------------------------------------------
  const [classTeacherClasses, setClassTeacherClasses] = useState([]);
  useEffect(() => {
    if (!teacher?.schoolId || !teacher?.name) {
      setClassTeacherClasses([]);
      return;
    }
    const q = query(
      collection(db, "classes"),
      where("schoolId", "==", teacher.schoolId),
      where("teachers", "array-contains", teacher.name),
    );
    const unsub = onSnapshot(q, (snap) => {
      setClassTeacherClasses(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [teacher?.schoolId, teacher?.name]);

  const teacherAccess = useMemo(() => {
    const compareClasses = (first, second) =>
      `${first.className || ""} ${first.section || ""}`.localeCompare(
        `${second.className || ""} ${second.section || ""}`,
        undefined,
        { numeric: true, sensitivity: "base" },
      );
    const classTeacherClassIds = new Set(classTeacherClasses.map((c) => c.id));
    const classTeacherMeta = new Map(
      classTeacherClasses.map((c) => [
        c.id,
        { className: c.className, section: c.section || null },
      ]),
    );

    // Derive every class+subject this teacher teaches from their own
    // timetableMatrix — the strongest existing source of truth.
    const subjectAccessByClass = new Map();
    const matrix = Array.isArray(teacher?.timetableMatrix)
      ? teacher.timetableMatrix
      : [];
    matrix.forEach((entry) => {
      if (!entry?.classId) return;
      const subject = (entry.subject || entry.label || "").trim();
      if (!subject) return;
      if (!subjectAccessByClass.has(entry.classId)) {
        subjectAccessByClass.set(entry.classId, {
          className: entry.className || null,
          section: entry.section || null,
          subjects: new Set(),
        });
      }
      subjectAccessByClass.get(entry.classId).subjects.add(subject);
    });

    // Combined, de-duplicated list for "My Classes" — class-teacher
    // classes first, then subject-only classes.
    const classesList = [
      ...classTeacherClasses.map((c) => ({
        id: c.id,
        className: c.className,
        section: c.section || null,
        classType: c.classType,
        isClassTeacher: true,
        subjects: null,
      })),
      ...Array.from(subjectAccessByClass.entries())
        .filter(([classId]) => !classTeacherClassIds.has(classId))
        .map(([classId, meta]) => ({
          id: classId,
          className: meta.className,
          section: meta.section,
          classType: null,
          isClassTeacher: false,
          subjects: Array.from(meta.subjects),
        })),
    ].sort((first, second) => {
      if (first.isClassTeacher !== second.isClassTeacher) {
        return first.isClassTeacher ? -1 : 1;
      }
      return compareClasses(first, second);
    });

    const isClassTeacherOf = (classId) => classTeacherClassIds.has(classId);
    const getSubjectsFor = (classId) => {
      const entry = subjectAccessByClass.get(classId);
      return entry ? Array.from(entry.subjects) : [];
    };
    const hasAccessToClass = (classId) =>
      classTeacherClassIds.has(classId) || subjectAccessByClass.has(classId);

    return {
      loaded: !!teacher,
      classTeacherClassIds,
      classTeacherMeta,
      subjectAccessByClass,
      classesList,
      isClassTeacherOf,
      getSubjectsFor,
      hasAccessToClass,
    };
  }, [classTeacherClasses, teacher]);

  useEffect(() => {
    const fetchSchoolData = async () => {
      const targetSchoolId = session?.schoolId || teacher?.schoolId;
      if (!targetSchoolId) return;

      try {
        // 1. Check 'schools' collection
        let schoolDocRef = doc(db, "schools", targetSchoolId);
        let schoolDoc = await getDoc(schoolDocRef);

        // 2. Fallback check 'inquiries' collection if not in 'schools'
        if (!schoolDoc.exists()) {
          schoolDocRef = doc(db, "inquiries", targetSchoolId);
          schoolDoc = await getDoc(schoolDocRef);
        }

        if (schoolDoc.exists()) {
          const data = schoolDoc.data();
          setSchool({
            id: schoolDoc.id,
            name: data.schoolName || data.name || "School", // Check both field names!
            logoUrl: data.logoUrl || null,
            ...data,
          });
        }
      } catch (err) {
        console.log(`Error fetching School: ${err.message}`);
      }
    };

    fetchSchoolData();
  }, [session?.schoolId, teacher?.schoolId]);

  const handleLogout = async () => {
    await signOut(auth);
    localStorage.removeItem("schoolix_session");
    navigate("/");
  };

  const navItems = [
    { to: "/teacher/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/teacher/attendance", label: "My Attendance", icon: CalendarCheck },
    { to: "/teacher/classes", label: "My Classes", icon: GraduationCap },
    { to: "/teacher/timetable", label: "My Timetable", icon: Clock },
    { to: "/teacher/examination", label: "Examination", icon: BookOpenCheck },
    { to: "/teacher/finance", label: "My Finance", icon: Wallet },
    { to: "/teacher/settings", label: "Settings", icon: Settings },
  ];

  const initials = (teacher?.name || "T")
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const SidebarContent = ({ onNavigate }) => (
    <>
      {/* Brand Header */}
      <div className="p-6 border-b border-slate-100 flex items-center gap-3">
        <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-sm shadow-sm shadow-indigo-500/30 shrink-0">
          <FontAwesomeIcon icon={faShieldHalved} />
        </div>

        <div className="min-w-0 flex flex-col">
          <span className="font-bold text-lg text-slate-900 tracking-tight whitespace-nowrap overflow-hidden">
            Schoolix
          </span>
          <p className="text-[10px] font-black text-indigo-600 uppercase tracking-wider whitespace-nowrap overflow-hidden">
            Teacher Portal
          </p>
        </div>
      </div>

      {/* Nav links */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition ${
                isActive
                  ? "bg-indigo-50 text-indigo-600"
                  : "text-slate-500 hover:bg-slate-50"
              }`
            }
          >
            <item.icon className="w-4 h-4 shrink-0" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Profile Footer */}
      <div className="p-4 border-t border-slate-100 space-y-3 shrink-0">
        <NavLink
          to="/teacher/settings"
          onClick={onNavigate}
          className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-slate-50 transition"
        >
          {teacher?.photoUrl ? (
            <img
              src={teacher.photoUrl}
              alt={teacher.name}
              className="w-9 h-9 rounded-full object-cover border border-slate-200 shrink-0"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-indigo-50 text-indigo-600 font-black text-[11px] flex items-center justify-center shrink-0">
              {initials}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-slate-900 truncate">
              {teacher?.name || "My Profile"}
            </p>
            <p className="text-[10px] text-slate-400 truncate">
              {teacher?.designation || "View profile"}
            </p>
          </div>
        </NavLink>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 transition"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Sign Out
        </button>
      </div>
    </>
  );
  // Thin, always-static desktop rail — icons only, no logo/text.
  // This never changes width, so it never triggers a layout shift;
  // the full drawer opens as a floating overlay on top of it instead.
  const CollapsedRailContent = () => (
    <>
      <button
        onClick={() => setIsDesktopOpen(true)}
        aria-label="Open menu"
        className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 hover:text-indigo-600 hover:bg-indigo-50/80 transition-colors duration-200 focus:outline-none shrink-0"
      >
        <Menu className="w-5 h-5" />
      </button>

      <nav className="flex-1 flex flex-col items-center gap-1.5 w-full px-2 mt-4 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            title={item.label}
            className={({ isActive }) =>
              `w-10 h-10 flex items-center justify-center rounded-xl transition ${
                isActive
                  ? "bg-indigo-50 text-indigo-600"
                  : "text-slate-500 hover:bg-slate-50"
              }`
            }
          >
            <item.icon className="w-4 h-4 shrink-0" />
          </NavLink>
        ))}
      </nav>

      <div className="flex flex-col items-center gap-2 pb-1 shrink-0">
        <NavLink
          to="/teacher/settings"
          title={teacher?.name || "My Profile"}
          className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-slate-50 transition"
        >
          {teacher?.photoUrl ? (
            <img
              src={teacher.photoUrl}
              alt={teacher.name}
              className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 font-black text-[10px] flex items-center justify-center shrink-0">
              {initials}
            </div>
          )}
        </NavLink>
        <button
          onClick={handleLogout}
          title="Sign Out"
          className="w-10 h-10 flex items-center justify-center rounded-xl text-rose-600 hover:bg-rose-50 transition"
        >
          <LogOut className="w-4 h-4 shrink-0" />
        </button>
      </div>
    </>
  );

  const displayedSchoolName = school?.name || "School";
  const displayedLogoUrl = school?.logoUrl;
  return (
    <TeacherPortalContext.Provider
      value={{ session, teacher, school, mustChangePassword, teacherAccess }}
    >
      {/* Outer Container locked to screen height */}
      <div className="h-screen w-screen bg-slate-50 flex overflow-hidden">
        {/* Desktop Collapsed Rail — fixed w-16, never resizes, so the
            main content grid width is 100% static regardless of the
            drawer's open/closed state. */}
        <aside className="hidden lg:flex w-16 bg-white border-r border-slate-100 flex-col items-center shrink-0 h-full py-4">
          <CollapsedRailContent />
        </aside>

        {/* Desktop Drawer Overlay — floats above the rail, doesn't push it */}
        <AnimatePresence>
          {isDesktopOpen && (
            <React.Fragment key="desktop-drawer-group">
              <motion.div
                key="desktop-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                onClick={() => setIsDesktopOpen(false)}
                className="hidden lg:block fixed inset-0 bg-black/20 backdrop-blur-[2px] z-40"
              />
              <motion.aside
                key="desktop-drawer"
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                className="hidden lg:flex fixed inset-y-0 left-0 z-50 w-64 bg-white flex-col h-full shadow-2xl"
              >
                <button
                  onClick={() => setIsDesktopOpen(false)}
                  aria-label="Close menu"
                  className="absolute top-4 right-4 p-1.5 rounded-lg bg-slate-50 text-slate-400 hover:text-slate-600 z-20"
                >
                  <X className="w-4 h-4" />
                </button>
                <SidebarContent onNavigate={() => setIsDesktopOpen(false)} />
              </motion.aside>
            </React.Fragment>
          )}
        </AnimatePresence>

        {/* Mobile Slide-over Sidebar */}
        {mobileNavOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            <div
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs"
              onClick={() => setMobileNavOpen(false)}
            />
            <aside className="relative w-72 max-w-[80vw] bg-white flex flex-col h-full shadow-2xl animate-fadeIn z-10">
              <button
                onClick={() => setMobileNavOpen(false)}
                className="absolute top-4 right-4 p-1.5 rounded-lg bg-slate-50 text-slate-400 z-20"
              >
                <X className="w-4 h-4" />
              </button>
              <SidebarContent onNavigate={() => setMobileNavOpen(false)} />
            </aside>
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
          {/* Header Banner */}
          {/* Header Banner matching the design */}
          {/* Header Banner */}
          <header className="bg-white border-b border-slate-100 px-4 sm:px-8 py-4 sm:py-5 flex items-center gap-4 shrink-0">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden shrink-0 p-2 rounded-xl bg-slate-50 text-slate-500 border border-slate-100"
            >
              <Menu className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 min-w-0">
              {/* 1. School Logo */}
              {displayedLogoUrl ? (
                <img
                  src={displayedLogoUrl}
                  alt={`${displayedSchoolName} logo`}
                  className="w-10 h-10 md:w-12 md:h-12 rounded-xl object-cover border border-slate-200 shrink-0"
                />
              ) : (
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 font-black flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5 md:w-6 md:h-6" />
                </div>
              )}

              {/* 2. Text Block with Animated Gradient Title */}
              <div className="min-w-0">
                <div className="relative inline-block overflow-hidden max-w-full">
                  <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight truncate">
                    {`Welcome to ${displayedSchoolName}`}
                  </h1>

                  <motion.h1
                    className="absolute inset-0 text-xl md:text-2xl font-black tracking-tight bg-linear-to-r from-transparent via-blue-500 to-transparent bg-clip-text text-transparent select-none truncate"
                    style={{ backgroundSize: "200% 100%" }}
                    animate={{ backgroundPosition: ["200% 0%", "-200% 0%"] }}
                    transition={{
                      duration: 2.5,
                      repeat: Infinity,
                      ease: "linear",
                      repeatDelay: 1.2,
                    }}
                  >
                    {`Welcome to ${displayedSchoolName}`}
                  </motion.h1>
                </div>

                {/* 3. Teacher Subtitle Line */}
                <p className="text-xs text-slate-400 font-medium mt-0.5 truncate">
                  Welcome back,{" "}
                  <span className="font-bold text-slate-700">
                    {teacher?.name || "..."}
                  </span>
                  {teacher?.designation && ` · ${teacher.designation}`}
                  {teacher?.scheduleType && (
                    <span className="ml-1 text-indigo-500 font-bold">
                      ·{" "}
                      {teacher.scheduleType === "class"
                        ? "Class-based"
                        : "Period-based"}
                    </span>
                  )}
                </p>
              </div>
            </div>
          </header>

          {/* Temporary Password Nudge */}
          {mustChangePassword && (
            <div className="bg-amber-50 border-b border-amber-100 px-4 sm:px-8 py-2.5 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                <p className="text-xs font-bold text-amber-700 truncate">
                  You're signed in with a temporary password. Please change it
                  in Settings.
                </p>
              </div>
              <Link
                to="/teacher/settings"
                className="shrink-0 text-[11px] font-black text-amber-700 hover:text-amber-800 underline underline-offset-2"
              >
                Go to Settings →
              </Link>
            </div>
          )}

          {/* Scrollable Main Area */}
          <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto overflow-x-hidden">
            <div className="w-full max-w-full mx-auto px-0 sm:px-1 lg:px-2">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </TeacherPortalContext.Provider>
  );
};

export default TeacherPortal;
