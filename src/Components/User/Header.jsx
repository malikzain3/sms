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

  // SchoolContext.jsx ke andar:
useEffect(() => {
  const fetchSchoolData = async () => {
    // Apka existing fetch/getDoc logic
  };

  fetchSchoolData();

  // Settings update hone par instant data sync
  window.addEventListener("schoolSettingsUpdated", fetchSchoolData);

  return () => {
    window.removeEventListener("schoolSettingsUpdated", fetchSchoolData);
  };
}, []);

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchQuery(value);
    if (onSearch) onSearch(value);
  };

  const toggleLicenseCard = () => {
    setIsOpen(!isOpen);
  };

  // Safe fallback text jab tak data load ho raha ho
  const displayName = loading ? "..." : (schoolName || "School");

  return (
    <>
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        {/* Left Side */}
        <div className="flex items-center gap-3">
          {logoUrl && (
            <img
              src={logoUrl}
              alt={`${displayName} logo`}
              className="w-10 h-10 md:w-12 md:h-12 rounded-xl object-cover border border-slate-200 shrink-0"
            />
          )}
          <div>
            <div className="relative inline-block overflow-hidden">
              <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">
                {`Welcome to ${displayName}`}
              </h1>

              <motion.h1
                className="absolute inset-0 text-xl md:text-2xl font-black tracking-tight bg-linear-to-r from-transparent via-blue-500 to-transparent bg-clip-text text-transparent select-none"
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
            <p className="text-xs text-slate-400 mt-0 font-medium">
              Here's your school operational insights portal.
            </p>
          </div>
        </div>

        {/* Right Side */}
        <div className="relative flex items-center justify-end ml-auto z-50">
          <button
            ref={bellRef}
            onClick={toggleLicenseCard}
            className="text-xl focus:outline-none cursor-pointer rounded-full p-2 text-slate-600 transition hover:bg-indigo-50 hover:text-indigo-600"
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