import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";

const LOADING_STEPS = [
  "Securing connection to Schoolix...",
  "Loading school records...",
  "Syncing class registers...",
  "Verifying administrative tokens...",
  "Preparing school dashboard...",
];

export const LoadingScreen = ({ message }) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  useEffect(() => {
    // If a custom message is provided, don't cycle through steps
    if (message) return;

    const interval = setInterval(() => {
      setCurrentStepIndex((prev) => (prev + 1) % LOADING_STEPS.length);
    }, 1800);

    return () => clearInterval(interval);
  }, [message]);

  const displayMessage = message || LOADING_STEPS[currentStepIndex];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#f8fafc] overflow-hidden"
    >
      {/* Background glowing particles/blobs (very soft for light theme) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-600/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-96 h-96 bg-cyan-600/5 rounded-full blur-3xl" />
      </div>

      {/* Main loading container */}
      <div className="relative flex flex-col items-center max-w-sm px-6 text-center z-10">
        
        {/* Animated Rings & Logo */}
        <div className="relative w-32 h-32 mb-8 flex items-center justify-center">
          
          {/* Outer Ring - Slow clockwise rotation */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 8, ease: "linear" }}
            className="absolute inset-0 rounded-full border-2 border-dashed border-indigo-200"
          />

          {/* Middle Glowing Ring - Faster counter-clockwise rotation */}
          <motion.div
            animate={{ rotate: -360 }}
            transition={{ repeat: Infinity, duration: 2.5, ease: "linear" }}
            className="absolute inset-1.5 rounded-full border-t-2 border-l-2 border-r-2 border-transparent border-t-indigo-500 border-l-indigo-600 border-r-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.2)]"
          />

          {/* Inner Glowing Ring - Clockwise rotation */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
            className="absolute inset-4 rounded-full border-b-2 border-r-2 border-transparent border-b-cyan-500 border-r-indigo-400 opacity-60"
          />

          {/* Central Logo Cap - Pulsing & Floating */}
          <motion.div
            animate={{
              scale: [1, 1.08, 1],
              y: [0, -3, 0],
            }}
            transition={{
              repeat: Infinity,
              duration: 2,
              ease: "easeInOut",
            }}
            className="relative w-16 h-16 rounded-2xl bg-white border border-slate-100 flex items-center justify-center shadow-lg shadow-indigo-100"
          >
            {/* Custom Premium SVG School Cap */}
            <svg
              className="w-9.5 h-9.5 text-indigo-600 filter drop-shadow-[0_0_6px_rgba(99,102,241,0.3)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 14l9-5-9-5-9 5 9 5z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 14l9-5-9-5-9 5 9 5zm0 0v6"
              />
            </svg>
          </motion.div>
        </div>

        {/* Text Container with AnimatePresence for text transition */}
        <div className="h-14 flex items-center justify-center">
          <motion.p
            key={displayMessage}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.3 }}
            className="text-sm font-semibold tracking-wider uppercase bg-clip-text text-transparent bg-linear-to-r from-slate-700 via-indigo-700 to-indigo-900"
          >
            {displayMessage}
          </motion.p>
        </div>

        {/* Progress bar animation */}
        <div className="w-48 h-1 bg-slate-100 rounded-full mt-4 overflow-hidden border border-slate-200/50">
          <motion.div
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{
              repeat: Infinity,
              duration: 3,
              ease: "easeInOut",
            }}
            className="h-full bg-linear-to-r from-indigo-600 to-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.3)]"
          />
        </div>
      </div>
    </motion.div>
  );
};

export default LoadingScreen;
