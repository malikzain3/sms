// Client-side Base64 conversion for exam documents (question papers,
// student answer sheets) — same Firebase-Storage-bypass approach already
// used by PhotoUploadBox.jsx / imageUpload.js for profile photos, the
// school logo, stamp, and signature. Storage uploads (CORS, rules,
// billing) were unreliable in this project, so files are resized/encoded
// entirely on the client and stored directly as Base64 data URL strings
// on the Firestore document (`paperLink` on examinations, `answerSheetUrl`
// on examResults). No Storage bucket, CORS config, or billing plan
// required.

import { base64ByteSize } from "./imageUpload";

// ~650KB — documents get a bigger budget than the tiny avatar photos in
// imageUpload.js (a scanned exam page needs to stay legible), while still
// leaving headroom inside Firestore's ~1MB per-document limit alongside
// the rest of an examination/examResult document's fields.
export const DOC_MAX_BYTES = 650 * 1024;

const ACCEPTED_TYPES_HINT = "PDF or PNG/JPG";

const isPdf = (file) => file?.type === "application/pdf";
const isImage = (file) => !!file?.type && file.type.startsWith("image/");

// Reads a file straight into a Base64 data URL with no re-encoding. Used
// for PDFs, which are already a compressed binary format and can't be
// shrunk further on a <canvas>.
const fileToRawDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.readAsDataURL(file);
  });

// Resizes a photographed/scanned document image, trying progressively
// smaller dimensions and JPEG quality until the result fits within
// maxBytes (or falls back to the smallest attempt if it still doesn't).
const compressDocImageToDataUrl = (file, maxBytes = DOC_MAX_BYTES) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      const attempts = [
        { maxDim: 1600, quality: 0.75 },
        { maxDim: 1400, quality: 0.65 },
        { maxDim: 1100, quality: 0.55 },
        { maxDim: 900, quality: 0.45 },
        { maxDim: 700, quality: 0.4 },
      ];

      let result = null;
      for (const { maxDim, quality } of attempts) {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));

        const ctx = canvas.getContext("2d");
        // Flatten onto white first — JPEG has no alpha channel, and scans
        // of paper are opaque anyway.
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        result = dataUrl;
        if (base64ByteSize(dataUrl) <= maxBytes) break;
      }

      URL.revokeObjectURL(objectUrl);
      resolve(result);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Couldn't read that image file."));
    };
    img.src = objectUrl;
  });

// Main entry point used by both examination dashboards. Converts a
// question-paper or answer-sheet file into a Base64 data URL suitable for
// saving directly on a Firestore document field (`paperLink` /
// `answerSheetUrl`), or throws a user-friendly Error if it can't be used.
export const convertFileToBase64Doc = async (file) => {
  if (!file) throw new Error("No file selected.");

  if (!isPdf(file) && !isImage(file)) {
    throw new Error(`Please choose a ${ACCEPTED_TYPES_HINT} file.`);
  }

  const dataUrl = isImage(file)
    ? await compressDocImageToDataUrl(file)
    : await fileToRawDataUrl(file);

  if (base64ByteSize(dataUrl) > DOC_MAX_BYTES) {
    throw new Error(
      isPdf(file)
        ? "That PDF is too large to attach. Try a smaller file or an image instead."
        : "That image is too large even after compression. Try a smaller photo.",
    );
  }

  return dataUrl;
};

// Opens a Question Paper / Answer Sheet in a new tab. Browsers block
// `window.open(dataUrl)` for large base64 data: URLs (or silently show an
// about:blank/black screen), so base64 URLs are first converted into a
// Blob object URL, which opens reliably. Plain http(s) URLs (e.g. legacy
// links saved before this project switched to Base64 storage) are opened
// as-is.
export const openDocumentInNewTab = (dataUrl) => {
  if (!dataUrl) return;
  if (dataUrl.startsWith("data:")) {
    const [header, base64Data] = dataUrl.split(",");
    const mimeMatch = header.match(/:(.*?);/);
    const mimeType = mimeMatch ? mimeMatch[1] : "application/pdf";
    const binaryStr = atob(base64Data);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mimeType });
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, "_blank");
  } else {
    window.open(dataUrl, "_blank", "noopener,noreferrer");
  }
};

// Old/blocked Firebase Storage links should never be used as a preview or
// open-in-new-tab source — ignore them so the UI doesn't hang trying to
// load a broken URL. Same convention as cleanPhotoUrl() in imageUpload.js.
export const cleanDocUrl = (url) => {
  if (!url) return null;
  if (
    typeof url === "string" &&
    url.includes("firebasestorage.googleapis.com")
  ) {
    return null;
  }
  return url;
};