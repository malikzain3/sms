// Client-side image compression + Firestore-safe base64 encoding.
//
// Firebase Storage uploads are unreliable in this project (see the
// Storage-bypass workaround already in SchoolSettings.jsx). Instead of
// uploading a file to Storage and saving a download URL, we resize the
// image on the client and store it directly on the Firestore document as a
// base64 PNG data URL — the exact same pattern already working for the
// school logo, stamp, and signature uploads. No Storage rules, CORS, or
// billing plan required.

// Roughly 300KB — a single small avatar-style photo, well under Firestore's
// ~1MB per-document limit.
export const PHOTO_MAX_BYTES = 300 * 1024;

// Resizes an image file down to maxDim on its longest side and resolves
// with a base64 PNG data URL.
export const compressImageToDataUrl = (file, maxDim = 200) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);

      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Couldn't read that image file."));
    };
    img.src = objectUrl;
  });

// Old/blocked Firebase Storage links should never be used as a preview or
// save source — ignore them so the UI doesn't hang trying to load a broken
// URL. Same convention as SchoolSettings.jsx's cleanDataUrl().
export const cleanPhotoUrl = (url) => {
  if (!url) return null;
  if (
    typeof url === "string" &&
    url.includes("firebasestorage.googleapis.com")
  ) {
    return null;
  }
  return url;
};

// Rough size (in bytes) of a base64 data URL — used to warn before a save
// would bloat the Firestore document.
export const base64ByteSize = (dataUrl) => {
  if (!dataUrl) return 0;
  const base64 = dataUrl.split(",")[1] || "";
  return Math.round((base64.length * 3) / 4);
};
