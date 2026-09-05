import React from "react";

// Same spinner as App.jsx's ProtectedRoute, scaled down and scoped to sit
// inside a page's content area (under the sidebar/header) instead of
// taking over the full viewport. Drop this in wherever a page shows its
// own "Loading..." state while fetching data (Classes, Students, Teachers,
// Settings, etc).
const PageLoader = ({ label }) => {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
      {label && (
        <p className="text-xs font-semibold text-slate-400 tracking-wide animate-pulse">
          {label}
        </p>
      )}
    </div>
  );
};

export default PageLoader;
