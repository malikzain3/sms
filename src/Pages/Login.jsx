import { useState, useEffect } from "react";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from "firebase/auth";
import { auth } from "../firebaseConfig.js";
import { useNavigate, useRouteLoaderData } from "react-router-dom";
import { motion, AnimatePresence, animateMini } from "framer-motion";
import RegisterModal from "../Components/Login/RegisterModal.jsx";
import { db } from "../firebaseConfig";
import PasswordInput from "../Components/Login/PasswordInput.jsx";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";

function Login() {
  const [forgot, setforgot] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const [resetSent, setResetSent] = useState(false);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);

  const forgotPass = () => {
    setError("");
    setforgot(true);
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    localStorage.removeItem("schoolName");
    localStorage.removeItem("schoolLogo");

    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password,
      );

      const user = userCredential.user;
      const userDocRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists()) {
        const userData = userDoc.data();
        localStorage.setItem(
          "schoolix_session",
          JSON.stringify({
            uid: user.uid,
            role: userData.role,
            schoolId: userData.schoolId || null,
          }),
        );

        if (userData.status === "inactive") {
          localStorage.removeItem("schoolix_session");
          await signOut(auth);
          setError(
            <>
              Your account is inactive. Please{" "}
              <a
                href="https://mail.google.com/mail/?view=cm&fs=1&to=zainmalik84466@gmail.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-red-600 hover:text-red-500 font-semibold cursor-pointer transition-all"
              >
                contact administration
              </a>
              .
            </>,
          );
          return;
        }

        if (userData.role === "superadmin") {
          navigate("/superadmin");
        } else if (
          userData.role === "schooladmin" ||
          userData.role === "school_admin"
        ) {
          localStorage.setItem("active_dashboard_tab", "Dashboard");
          navigate("/school");
        } else if (userData.role === "teacher") {
          // teacherId is stored on the users/{uid} doc when the account was
          // created (see utils/secondaryAuth.js) — carry it in the session
          // so the Teacher Portal never has to re-look-it-up on every page.
          localStorage.setItem(
            "schoolix_session",
            JSON.stringify({
              uid: user.uid,
              role: userData.role,
              schoolId: userData.schoolId || null,
              teacherId: userData.teacherId || null,
            }),
          );
          navigate("/teacher");
        } else {
          setError("No user profile found. Contact support.");
        }
      } else {
        const inquiryDocRef = doc(db, "inquiries", user.uid);
        let inquiryDoc = await getDoc(inquiryDocRef);
        let inquiryData = null;

        if (inquiryDoc.exists()) {
          inquiryData = inquiryDoc.data();
        } else {
          const inquiryRef = collection(db, "inquiries");
          const q = query(inquiryRef, where("uid", "==", user.uid));
          const querySnapshot = await getDocs(q);
          if (!querySnapshot.empty) {
            inquiryDoc = querySnapshot.docs[0];
            inquiryData = inquiryDoc.data();
          }
        }

        if (inquiryData) {
          if (inquiryData.status === "pending") {
            localStorage.removeItem("schoolix_session");
            await signOut(auth);
            setError(
              <>
                Your school registration is pending approval and payment
                verification. Please{" "}
                <a
                  href="https://mail.google.com/mail/?view=cm&fs=1&to=zainmalik84466@gmail.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-red-400 hover:text-red-600 font-semibold cursor-pointer transition-all"
                >
                  contact administration
                </a>
                .
              </>,
            );
          } else {
            localStorage.setItem(
              "schoolix_session",
              JSON.stringify({
                uid: user.uid,
                role: "schooladmin",
                schoolId: inquiryDoc.id,
              }),
            );
            localStorage.setItem("active_dashboard_tab", "Dashboard");
            navigate("/school");
          }
        } else {
          localStorage.removeItem("schoolix_session");
          await signOut(auth);
          setError(
            "Account profile not found. Please register your school first.",
          );
        }
      }
    } catch (err) {
      setError("Invalid email or password. Please try again.");
      localStorage.removeItem("schoolix_session");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDemoFill = (e) => {
    e.preventDefault();
    // Demo credentials set karein
    setEmail("demo@schoolix.tech");
    setPassword("Demo1234");

    // React state immediate render ke liye timeout ke zariye form submit
    setTimeout(() => {
      const form = e.target.closest("form");
      if (form) form.requestSubmit();
    }, 50);
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await sendPasswordResetEmail(auth, email);
      setResetSent(true);
    } catch (err) {
      setError("Error: " + err.message);
    }
  };

  useEffect(() => {
    if (resetSent) {
      const timer = setTimeout(() => setResetSent(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [resetSent]);

  return (
    <div className="flex min-h-screen bg-[#f8fafc]">
      {/* Left branding panel — light indigo gradient */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-linear-to-br from-indigo-600 via-indigo-700 to-violet-800 p-12 lg:flex">
        {/* Decorative glow blobs */}
        <div className="pointer-events-none absolute -top-24 -left-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-80 w-80 rounded-full bg-violet-400/20 blur-3xl" />
        <div className="pointer-events-none absolute top-1/3 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-indigo-300/10 blur-3xl" />

        {/* Faint grid texture */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />

        <div className="relative z-10">
          <img src="/smslogo.png" alt="Schoolix Logo" className="h-26 w-auto" />
        </div>

        <div className="relative z-10 max-w-md">
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-white">
            Run your school on{" "}
            <span className="text-indigo-200">one platform</span>
          </h1>
          <p className="mt-4 text-base leading-relaxed text-indigo-100/70">
            Schoolix brings admissions, attendance, fees, and communication
            together — so your entire school runs smoother, from the front
            office to the classroom.
          </p>

          <div className="mt-10 space-y-5">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/15 text-white">
                ✓
              </span>
              <p className="text-sm mt-0.5 text-indigo-100/80">
                Simple registration for schools, staff, and students
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/15 text-white">
                ✓
              </span>
              <p className="text-sm mt-0.5 text-indigo-100/80">
                Real-time dashboards for admins and administration
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/15 text-white">
                ✓
              </span>
              <p className="text-sm mt-0.5 text-indigo-100/80">
                Secure, role-based access for every account
              </p>
            </div>
          </div>
        </div>

        <p className="relative z-10 text-xs text-indigo-200/50">
          © {new Date().getFullYear()} Schoolix. All rights reserved.
        </p>
      </div>

      {/* Right form panel — light background */}
      <div className="flex w-full flex-col items-center justify-center px-4 py-12 lg:w-1/2">
        <div className="w-full max-w-md rounded-3xl border border-slate-200/80 bg-white/80 p-8 shadow-xl shadow-slate-200/50 backdrop-blur-xl lg:border lg:bg-white lg:p-10 lg:shadow-lg lg:shadow-indigo-100/40">
          {/* Logo (mobile only) */}
          <img
            src="/smslogo.png"
            alt="Schoolix Logo"
            className="mx-auto h-24 w-auto lg:hidden"
          />

          {/* Heading */}
          <div>
            {forgot ? (
              <h2 className="mt-4 text-center text-3xl font-bold tracking-tight text-slate-900 lg:text-left lg:mt-0">
                Forgot Password
              </h2>
            ) : (
              <h2 className="mt-4 text-center text-3xl font-bold tracking-tight text-slate-900 lg:text-left lg:mt-0">
                Sign in to your account
              </h2>
            )}
          </div>

          <div>
            {forgot ? (
              <p className="mt-2 text-center text-sm text-slate-500 lg:text-left">
                Enter your email to reset your password
              </p>
            ) : (
              <p className="mt-2 text-center text-sm text-slate-500 lg:text-left">
                Welcome back! Please enter your credentials.
              </p>
            )}
          </div>

          {/* Form */}
          <form
            className="mt-8 space-y-5"
            onSubmit={handleSignIn}
            autoComplete="off"
            key="register-form"
          >
            <AnimatePresence mode="wait">
              {forgot ? (
                <motion.div
                  key="forgot"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="space-y-1 mb-1">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="email"
                        className="mb-2 block text-sm font-medium text-slate-700"
                      >
                        Email address
                      </label>
                      <button
                        type="button"
                        className="cursor-pointer mb-2 inline-block text-sm font-semibold text-indigo-600 hover:text-indigo-500"
                        onClick={() => {
                          setforgot(false);
                          setError("");
                        }}
                      >
                        ⮌ Back
                      </button>
                    </div>
                    <input
                      id="email"
                      type="email"
                      name="email"
                      autoComplete="email"
                      required
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="block w-full rounded-xl border text-sm border-slate-200 bg-slate-50 px-4 py-3 text-slate-800 placeholder:text-slate-400 outline-none transition duration-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="mt-2 w-full cursor-pointer rounded-xl bg-linear-to-r from-indigo-600 to-indigo-700 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition duration-300 hover:scale-[1.02] hover:from-indigo-500 hover:to-indigo-600 active:scale-[0.98]"
                  >
                    Send Reset Link
                  </button>

                  {resetSent && (
                    <p
                      onClick={() => setResetSent(false)}
                      className="mt-3 text-center text-sm text-emerald-600 font-medium cursor-pointer"
                    >
                      ✅ Reset link sent! Check your email.
                    </p>
                  )}

                  {error && (
                    <p className="mt-3 text-center text-sm text-red-500 font-medium">
                      {error}
                    </p>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="login"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2 }}
                >
                  <div>
                    <label
                      htmlFor="email"
                      className="mb-2 block text-sm font-medium text-slate-700"
                    >
                      Email address
                    </label>
                    <input
                      id="email"
                      type="email"
                      name="email"
                      autoComplete="email"
                      required
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="text-sm block w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-slate-800 placeholder:text-slate-400 outline-none transition duration-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                    />
                  </div>

                  <div className="mb-1">
                    <div className="mb-2 mt-2 flex items-center justify-between">
                      <label
                        htmlFor="password"
                        className="text-sm font-medium text-slate-700"
                      >
                        Password
                      </label>
                      <a
                        href="#"
                        className="text-sm font-semibold text-indigo-600 hover:text-indigo-500"
                        onClick={forgotPass}
                      >
                        Forgot password?
                      </a>
                    </div>

                    <PasswordInput
                      name="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      error={error}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="mt-2 w-full cursor-pointer rounded-xl bg-linear-to-r from-indigo-600 to-indigo-700 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition duration-300 hover:scale-[1.02] hover:from-indigo-500 hover:to-indigo-600 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? "Signing in..." : "Sign in"}
                  </button>

                  {/* Divider */}
                  <div className="relative my-4 flex items-center justify-center">
                    <div className="w-full border-t border-slate-200"></div>
                    <span className="absolute bg-white px-3 text-xs font-medium text-slate-400">
                      OR
                    </span>
                  </div>

                  {/* Rocket Demo Button */}
                  <button
                    type="button"
                    disabled={loading}
                    onClick={handleDemoFill}
                    className="w-full cursor-pointer rounded-xl border border-indigo-200 bg-indigo-50/60 py-2.5 text-sm font-semibold text-indigo-700 transition duration-300 hover:bg-indigo-100 hover:border-indigo-300 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-xs"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="lucide lucide-rocket"
                    >
                      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
                      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09" />
                      <path d="M9 12a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.4 22.4 0 0 1-4 2z" />
                      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 .05 5 .05" />
                    </svg>
                    Explore Demo Account
                  </button>

                  {error && (
                    <p className="mt-3 text-center text-sm text-red-500 font-medium">
                      {error}
                    </p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </form>
          {/* Footer */}
          <p className="mt-8 text-center text-sm text-slate-500">
            Don't have an account?{" "}
            <a
              href="#"
              className="font-semibold text-indigo-600 hover:text-indigo-500"
              onClick={() => setIsRegisterOpen(true)}
            >
              Register Your School
            </a>
          </p>
        </div>
      </div>
      <RegisterModal
        className="scale-100 opacity-100 ease-out duration-300"
        isOpen={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
      />
    </div>
  );
}

export default Login;
