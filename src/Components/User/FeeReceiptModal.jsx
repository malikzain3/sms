import React from "react";
import { Printer, X } from "lucide-react";
import { useSchool } from "../../context/SchoolContext";
import html2pdf from "html2pdf.js";

// Renders a single fee payment as a printable receipt. Only the
// #fee-receipt-printable node is visible when the browser print dialog is
// triggered — everything else on the page (including the modal's own
// backdrop and buttons) is hidden by the injected @media print rules below,
// so this needs no changes to any global stylesheet or index.html.
const FeeReceiptModal = ({ entry, student = {}, onClose }) => {
  const { schoolName, logoUrl, signatureUrl, stampUrl, schoolInfo } =
    useSchool();
  // signerName / signerDesignation aren't in SchoolContext yet — keep pulling
  // them straight from the school doc via context if you add them there
  // later. For now they gracefully fall back to blank labels below.
  const signerName = schoolInfo?.principalName || "";
  const signerDesignation = schoolInfo?.designation || "Principal";

  if (!entry) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div id="fee-receipt-printable" className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #fee-receipt-printable,
          #fee-receipt-printable * {
            visibility: visible !important;
          }
          #fee-receipt-printable {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            height: auto !important;
            margin: 0 !important;
            padding: 20px !important;
            background: #ffffff !important;
            box-shadow: none !important;
            border: none !important;
            z-index: 9999999 !important;
          }
          #fee-receipt-printable .flex {
            display: flex !important;
          }
          #fee-receipt-printable .grid {
            display: grid !important;
          }
        }
      `}</style>

      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs no-print modal-overlay"
        onClick={onClose}
      />

      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md relative z-60 max-h-[90vh] overflow-y-auto modal-container">
        {/* Toolbar (hidden on print) */}
        <div className="no-print flex justify-between items-center p-4 border-b border-slate-100">
          <h3 className="text-sm font-black text-slate-900">Fee Receipt</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-[11px]"
            >
              <Printer className="w-3.5 h-3.5" />
              Print
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 font-bold text-xs p-1.5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable receipt body */}
        <div
          id="fee-receipt-printable"
          className="relative p-6 text-xs text-slate-700"
        >
          {/* Stamp — placed as a subtle watermark-style overlay near the
              signature block. Only rendered when a stamp has been uploaded. */}
          {stampUrl && (
            <img
              src={stampUrl}
              alt="School stamp"
              className="pointer-events-none select-none absolute right-8 bottom-16 h-20 w-20 object-contain opacity-70"
            />
          )}

          <div className="text-center border-b border-dashed border-slate-200 pb-4 mb-4">
            {logoUrl && (
              <img
                src={logoUrl}
                alt="logo"
                className="h-16 w-auto object-contain object-bottom mb-1 mx-auto"
              />
            )}
            <h2 className="text-lg font-black text-slate-900">
              {schoolName || "Your School Name"}
            </h2>
            <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider mt-1">
              Fee Payment Receipt
            </p>
          </div>

          <div className="flex justify-between mb-4">
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                Receipt No.
              </span>
              <span className="font-mono font-black text-slate-900">
                {entry.receiptNo || "—"}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                Date
              </span>
              <span className="font-mono font-bold text-slate-900">
                {entry.date}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-slate-50 rounded-xl p-3">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                Student Name
              </span>
              <span className="font-bold text-slate-900 block mt-0.5">
                {student.name || "—"}
              </span>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                Class
              </span>
              <span className="font-bold text-slate-900 block mt-0.5">
                {student.className || "—"}
                {student.section ? ` - ${student.section}` : ""}
              </span>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                Father / Guardian
              </span>
              <span className="font-bold text-slate-900 block mt-0.5">
                {student.fatherName || "—"}
              </span>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                Fee Type
              </span>
              <span className="font-bold text-slate-900 block mt-0.5">
                {entry.type || "Monthly Tuition"}
              </span>
            </div>
          </div>

          {entry.note && (
            <div className="bg-slate-50 rounded-xl p-3 mb-4">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                Note
              </span>
              <span className="text-slate-700 block mt-0.5 italic">
                {entry.note}
              </span>
            </div>
          )}

          <div className="flex justify-between items-center bg-emerald-50 border border-emerald-100 rounded-xl p-4 mb-6">
            <span className="text-[11px] text-emerald-700 font-bold uppercase tracking-wider">
              Amount Received
            </span>
            <span className="text-xl font-black font-mono text-emerald-700">
              Rs. {Number(entry.amount || 0).toLocaleString()}
            </span>
          </div>

          <div className="relative flex justify-between items-end pt-6 border-t border-dashed border-slate-200">
            <span className="text-[10px] text-slate-400 italic">
              Computer generated receipt.
            </span>
            <div className="text-center">
              {signatureUrl ? (
                <img
                  src={signatureUrl}
                  alt="Authorized signature"
                  className="h-10 w-28 object-contain object-bottom mb-1 mx-auto"
                />
              ) : (
                <div className="border-t border-slate-400 w-28 mb-1" />
              )}
              <span className="text-[10px] text-slate-400 block">
                {signerName || "Received By"}
              </span>
              {signerName && (
                <span className="text-[9px] text-slate-300 block">
                  {signerDesignation}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FeeReceiptModal;