import React, { useRef, useState } from "react";
import { Camera, X, Loader2 } from "lucide-react";
import {
  compressImageToDataUrl,
  base64ByteSize,
  PHOTO_MAX_BYTES,
} from "../../utils/imageUpload";

// Drag-and-drop / click-to-upload photo picker used in both the "Add
// Teacher" and "Edit Teacher" forms.
//
// This does NOT touch Firebase Storage. It resizes the image on the client
// and hands the parent a compressed base64 data URL via onChange — the
// same string-on-Firestore-document approach already working for the
// school logo/stamp/signature in SchoolSettings.jsx. That's deliberate:
// Storage uploads were breaking here, this bypasses the problem entirely.
const PhotoUploadBox = ({ value, onChange, label = "Profile Picture" }) => {
  const inputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");

  const processFile = async (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }

    setError("");
    setIsProcessing(true);
    try {
      const dataUrl = await compressImageToDataUrl(file);
      if (base64ByteSize(dataUrl) > PHOTO_MAX_BYTES) {
        setError("That image is too large even after compression. Try a smaller photo.");
        return;
      }
      onChange(dataUrl);
    } catch (err) {
      setError(err.message || "Couldn't process that image.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div>
      <label className="text-[13px] font-bold text-slate-400 uppercase tracking-wider">
        {label}
      </label>

      <div
        onClick={() => !isProcessing && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          processFile(e.dataTransfer.files?.[0]);
        }}
        className={`mt-1 flex items-center gap-3 rounded-xl border-2 border-dashed p-2.5 cursor-pointer transition-colors ${
          isDragging
            ? "border-indigo-500 bg-indigo-50/70"
            : "border-slate-200 bg-slate-50 hover:border-indigo-300"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => processFile(e.target.files?.[0])}
        />

        {value ? (
          <img
            src={value}
            alt="Preview"
            className="w-10 h-10 rounded-lg object-cover border border-white shadow-xs shrink-0"
          />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
            {isProcessing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Camera className="w-6 h-6" />
            )}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold text-slate-600 truncate">
            {isProcessing
              ? "Processing..."
              : value
              ? "Click or drop to replace"
              : "Click or drop image to upload"}
          </p>
          <p className="text-[13px] text-slate-400">PNG or JPG works best</p>
        </div>

        {value && !isProcessing && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
            className="shrink-0 p-1.5 rounded-lg bg-white text-rose-500 hover:text-cyan-600 border border-slate-200"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {error && (
        <p className="text-[10px] text-rose-600 font-bold mt-1">{error}</p>
      )}
    </div>
  );
};

export default PhotoUploadBox;
