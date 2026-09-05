import React from "react";
import { LayoutGrid } from "lucide-react";

const PageSectionHeader = ({
  title,
  subtitle,
  icon: Icon = LayoutGrid,
  action,
  children,
  className = "",
}) => {
  return (
    <div
      className={`rounded-2xl border border-slate-100 bg-white/95 px-4 py-4 shadow-sm shadow-slate-200/70 ${className}`.trim()}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
            <Icon className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-black tracking-tight text-slate-900">
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-1 text-xs sm:text-sm text-slate-500">
                {subtitle}
              </p>
            ) : null}
            {children}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
};

export default PageSectionHeader;
