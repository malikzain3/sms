import React, { useState, useEffect, useRef } from "react";
import LisenseRemainingCard from "./LisenseRemainingCard";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBell } from "@fortawesome/free-solid-svg-icons";
import { motion } from "framer-motion";
import { useSchool } from "../../context/SchoolContext";

const Header = ({ onSearch, searchPlaceholder }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { schoolName, logoUrl, loading } = useSchool(); 
  const [searchQuery, setSearchQuery] = useState("");
  
  const licenseRef = useRef(null);
  const bellRef = useRef(null);

  // Close License Card on Outside Click
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (
        licenseRef.current &&
        !licenseRef.current.contains(e.target) &&
        bellRef.current &&
        !bellRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchQuery(value);
    if (onSearch) onSearch(value);
  };

  const toggleLicenseCard = () => {
    setIsOpen(!isOpen);
  };

  const displayName = loading ? "..." : (schoolName || "School");

  return (
    <>
      {/* 🚀 Main layout fix: Mobile par flex-row rakha hai taakay Bell icon hamesha side par rahe */}
      <div className="flex items-center justify-between gap-3 w-full">
        
        {/* Left Side: Logo & Text */}
        <div className="flex items-center gap-3 min-w-0">
          {logoUrl && (
            <img
              src={logoUrl}
              alt={`${displayName} logo`}
              className="w-10 h-10 md:w-12 md:h-12 rounded-xl object-cover border border-slate-200 shrink-0"
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="relative inline-block overflow-hidden max-w-full">
              <h1 className="text-lg sm:text-xl md:text-2xl font-black text-slate-900 tracking-tight truncate">
                {`Welcome to ${displayName}`}
              </h1>

              <motion.h1
                className="absolute inset-0 text-lg sm:text-xl md:text-2xl font-black tracking-tight bg-linear-to-r from-transparent via-blue-500 to-transparent bg-clip-text text-transparent select-none truncate"
                style={{ backgroundSize: "200% 100%" }}
                animate={{ backgroundPosition: ["200% 0%", "-200% 0%"] }}
                transition={{
                  duration: 2.5,
                  repeat: Infinity,
                  ease: "linear",
                  repeatDelay: 1.2,
                }}
              >
                {`Welcome to ${displayName}`}
              </motion.h1>
            </div>
            <p className="text-xs text-slate-400 mt-0 font-medium truncate">
              Here's your school operational insights portal.
            </p>
          </div>
        </div>

        {/* Right Side: Bell Icon */}
        <div className="relative flex items-center shrink-0 z-50">
          <button
            ref={bellRef}
            onClick={toggleLicenseCard}
            className="text-lg sm:text-xl focus:outline-none cursor-pointer rounded-full p-2 text-slate-600 transition hover:bg-indigo-50 hover:text-indigo-600"
          >
            <FontAwesomeIcon icon={faBell} />
          </button>

          {isOpen && (
            <div ref={licenseRef} className="absolute right-0 top-full mt-2 z-[60]">
              <LisenseRemainingCard />
            </div>
          )}
        </div>

      </div>
    </>
  );
};

export default Header;