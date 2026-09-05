import React, {
  useState,
  useRef,
  useLayoutEffect,
  useEffect,
} from "react";
import gsap from "gsap";
import { useSchool } from "../../context/SchoolContext";
import { auth, db } from "../../firebaseConfig";
import Header from "./Header";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import {
  Building2,
  Hash,
  Barcode,
  Mail,
  Lock,
  KeyRound,
  Phone,
  Globe,
  MapPin,
  Landmark,
  Flag,
  Palette,
  ImagePlus,
  Stamp,
  User,
  Briefcase,
  PenTool,
  Receipt,
  FileText,
  Save,
  X,
  Info,
  CheckCircle2,
  Loader2,
} from "lucide-react";

const BRANDING_IMAGE_MAX_DIMENSION = 320;

const BRANDING_PAYLOAD_MAX_BYTES = 700 * 1024;

const useHoverLift = ({ y = -6, scale = 1, shadow = true } = {}) => {
  const onMouseEnter = (e) => {
    gsap.to(e.currentTarget, {
      y,
      scale,
      boxShadow: shadow ? "0 24px 48px -16px rgba(79,70,229,0.22)" : undefined,
      duration: 0.35,
      ease: "power2.out",
    });
  };
  const onMouseLeave = (e) => {
    gsap.to(e.currentTarget, {
      y: 0,
      scale: 1,
      boxShadow: shadow ? "0 1px 2px 0 rgba(15,23,42,0.04)" : undefined,
      duration: 0.35,
      ease: "power2.out",
    });
  };
  return { onMouseEnter, onMouseLeave };
};

const SectionCard = React.forwardRef(
  ({ icon: Icon, title, description, children, className = "" }, ref) => {
    const hoverProps = useHoverLift();
    return (
      <div
        ref={ref}
        {...hoverProps}
        className={`settings-card bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 p-4 sm:p-6 transition-colors duration-300 ${className}`}
      >
        <div className="flex items-start gap-3.5 mb-6">
          <div className="w-11 h-11 shrink-0 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-black text-slate-900">
              {title}
            </h2>
            {description && (
              <p className="text-xs text-slate-400 font-medium mt-0.5">
                {description}
              </p>
            )}
          </div>
        </div>
        {children}
      </div>
    );
  },
);
SectionCard.displayName = "SectionCard";

const SettingInput = ({
  icon: Icon,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}) => (
  <div className="setting-input">
    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
      {label}
    </label>
    <div className="relative">
      <Icon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full pl-10 pr-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 font-medium placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all duration-300"
      />
    </div>
  </div>
);

const ReadOnlyInput = ({ icon: Icon, label, value, trailing }) => (
  <div className="setting-input">
    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
      {label}
    </label>
    <div className="relative flex items-center">
      <Icon className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
      <input
        type="text"
        value={value}
        readOnly
        className={`w-full pl-10 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-500 font-semibold cursor-not-allowed ${
          trailing ? "pr-10" : "pr-3.5"
        }`}
      />
      {trailing && <div className="absolute right-2.5">{trailing}</div>}
    </div>
  </div>
);

const UploadBox = ({
  icon: Icon,
  label,
  helperText,
  preview,
  onFileChange,
  optional,
}) => {
  const inputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const hoverProps = useHoverLift({ y: -3, shadow: false });

  const handleFiles = (fileList) => {
    const file = fileList?.[0];
    if (file) onFileChange(file);
  };
  return (
    <div className="setting-input">
      <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
        {label}
        {optional && (
          <span className="text-slate-300 normal-case font-medium">
            {" "}
            (optional)
          </span>
        )}
      </label>
      <div
        {...hoverProps}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed p-6 cursor-pointer transition-colors duration-300 text-center ${
          isDragging
            ? "border-indigo-500 bg-indigo-50/70"
            : "border-slate-300 bg-slate-50/60 hover:border-indigo-400 hover:bg-indigo-50/30"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        {preview ? (
          <img
            src={preview}
            alt={label}
            className="w-20 h-20 object-cover rounded-xl shadow-md border border-white"
          />
        ) : (
          <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600">
            <Icon className="w-6 h-6" />
          </div>
        )}

        <p className="text-xs font-bold text-slate-600">
          {preview
            ? "Click or drop to replace"
            : "Drag & drop or click to upload"}
        </p>
        <p className="text-[10px] text-slate-400">{helperText}</p>
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------------
// Button — the two variants this page needs: a gradient primary action and a
// plain bordered secondary/cancel action. Hover motion is GSAP, not CSS.
// ----------------------------------------------------------------------------
const Button = ({
  children,
  icon: Icon,
  variant = "primary",
  onClick,
  type = "button",
  className = "",
  disabled = false,
}) => {
  const hoverProps = useHoverLift({ y: -2, scale: 1.02, shadow: false });
  const variants = {
    primary:
      "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/30",
    secondary:
      "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:border-slate-300",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      {...(disabled ? {} : hoverProps)}
      className={`inline-flex items-center justify-center gap-2 font-bold rounded-2xl px-5 py-2.5 text-sm transition-colors duration-300 disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
    >
      {Icon && <Icon className="w-4 h-4" />}
      {children}
    </button>
  );
};

// ----------------------------------------------------------------------------
// ChangePasswordModal — self-contained modal so the main component stays
// readable. Purely client-side state for now; wired to Firebase Auth later.
// ----------------------------------------------------------------------------
const ChangePasswordModal = ({ onClose }) => {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const isPasswordChanged =
    Boolean(current.trim()) && Boolean(next.trim()) && Boolean(confirm.trim());

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!current || !next || !confirm) {
      setError("Fill in all three fields.");
      return;
    }
    if (next.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    if (next !== confirm) {
      setError("New password and confirmation don't match.");
      return;
    }

    const user = auth.currentUser;
    if (!user || !user.email) {
      setError("You're not signed in. Please log in again and retry.");
      return;
    }

    setIsSaving(true);
    try {
      // Firebase requires proof you know the CURRENT password before it will
      // let you set a new one — this re-authenticates that credential.
      const credential = EmailAuthProvider.credential(user.email, current);
      await reauthenticateWithCredential(user, credential);

      // Only after reauthentication succeeds can the password actually change.
      await updatePassword(user, next);

      onClose();
    } catch (err) {
      console.error("Error changing password:", err);
      switch (err.code) {
        case "auth/wrong-password":
        case "auth/invalid-credential":
          setError("Current password is incorrect.");
          break;
        case "auth/too-many-requests":
          setError("Too many attempts. Please wait a moment and try again.");
          break;
        case "auth/requires-recent-login":
          setError("For security, please log out and back in, then retry.");
          break;
        case "auth/weak-password":
          setError("Choose a stronger new password (at least 6 characters).");
          break;
        default:
          setError("Something went wrong. Please try again.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs"
        onClick={onClose}
      />
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-sm p-6 relative z-10">
        <div className="flex justify-between items-start pb-3 border-b border-slate-100 mb-4">
          <div>
            <h3 className="text-sm font-black text-slate-900">
              Change Password
            </h3>
            <p className="text-[11px] text-slate-400">
              Update your account's login password.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <SettingInput
            icon={Lock}
            label="Current Password"
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder="••••••••"
          />
          <SettingInput
            icon={KeyRound}
            label="New Password"
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="••••••••"
          />
          <SettingInput
            icon={KeyRound}
            label="Confirm New Password"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
          />

          {error && (
            <p className="text-[11px] text-rose-600 font-bold">{error}</p>
          )}

          <div className="pt-3 flex gap-3">
            <Button
              variant="secondary"
              onClick={onClose}
              className="w-1/2 justify-center"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isSaving || !isPasswordChanged}
              className="w-1/2 justify-center disabled:opacity-60"
            >
              {isSaving ? "Updating..." : "Update Password"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN PAGE
// ============================================================================
const SchoolSettings = () => {
  // The school this settings page belongs to — every read/write on this page
  // is scoped to this id once Firestore is connected.
  const { setLogoUrl, setSchoolName, setSignatureUrl, setStampUrl } =
    useSchool();
  const session = JSON.parse(localStorage.getItem("schoolix_session") || "{}");
  const schoolId = session?.schoolId || "default_school";

  // ---- Section 1: School Information ----
  const initialFormData = {
    schoolName: session?.schoolName || "The Kids Foundation School",
    schoolCode: "TKF-2026",
    email: session?.email || "admin@school.com",
    phone: "",
    website: "",
    address: "",
    city: "",
    country: "Pakistan",
  };
  const [formData, setFormData] = useState(initialFormData);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

  // Which collection the doc actually lives in ("schools" or the legacy
  // "inquiries" fallback) — set once on load, reused so Save writes back to
  // the same place it was read from.
  const [collectionName, setCollectionName] = useState("schools");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const handleFieldChange = (field) => (e) =>
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));

  // ---- Section 2: Branding ----
  // logoUrl/stampUrl double as both the <img> preview source AND the value
  // saved to Firestore — whether it's a freshly compressed base64 data URL
  // from a new upload, or the value already loaded from the school doc.
  const initialBranding = {
    logoUrl: null,
    stampUrl: null,
  };
  const [branding, setBranding] = useState(initialBranding);
  const [imageError, setImageError] = useState("");

  // Resizes an image file down to BRANDING_IMAGE_MAX_DIMENSION on its
  // longest side and returns a base64 PNG data URL — small enough to store
  // directly on the Firestore document instead of Firebase Storage.
  // PNG (not JPEG) is used specifically to preserve transparency for
  // logos/stamps/signatures on a transparent background.
  const cleanDataUrl = (url) => {
    if (!url) return null;
    // Purani blocked Firebase Storage links ko ignore kare taake app stuck na ho
    if (
      typeof url === "string" &&
      url.includes("firebasestorage.googleapis.com")
    ) {
      return null;
    }
    return url;
  };

  const compressImageToDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        const scale = Math.min(
          1,
          BRANDING_IMAGE_MAX_DIMENSION / Math.max(img.width, img.height),
        );
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

  const getSafePreviewUrl = (url) => {
    if (!url) return null;
    if (typeof url === "string" && url.startsWith("data:")) return url;
    return cleanDataUrl(url);
  };

  const handleLogoChange = async (file) => {
    try {
      setImageError("");
      const dataUrl = await compressImageToDataUrl(file);
      setBranding((prev) => ({ ...prev, logoUrl: dataUrl }));
    } catch (err) {
      setImageError(err.message || "Couldn't process the logo image.");
    }
  };

  const handleStampChange = async (file) => {
    try {
      setImageError("");
      const dataUrl = await compressImageToDataUrl(file);
      setBranding((prev) => ({ ...prev, stampUrl: dataUrl }));
    } catch (err) {
      setImageError(err.message || "Couldn't process the stamp image.");
    }
  };

  // ---- Section 3: Documents ----
  const initialDocuments = {
    principalName: "",
    designation: "Principal",
    signatureUrl: null,
    receiptFooter: "Computer Generated Receipt.",
  };
  const [documents, setDocuments] = useState(initialDocuments);

  const handleDocFieldChange = (field) => (e) =>
    setDocuments((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSignatureChange = async (file) => {
    try {
      setImageError("");
      const dataUrl = await compressImageToDataUrl(file);
      setDocuments((prev) => ({ ...prev, signatureUrl: dataUrl }));
    } catch (err) {
      setImageError(err.message || "Couldn't process the signature image.");
    }
  };

  // ---- Load existing settings on mount ----
  // Without this, Save writes to Firestore fine but the form always starts
  // blank again on refresh — nothing ever reads the doc back. This fetches
  // once on mount and hydrates all three sections, following the same
  // schools → inquiries fallback pattern used in Header.jsx and
  // FeeReceiptModal.jsx.
  const [savedBaseline, setSavedBaseline] = useState(null);

  const isChanged = React.useMemo(() => {
    if (!savedBaseline) return false;

    const formChanged = Object.keys(formData).some(
      (key) => (formData[key] || "") !== (savedBaseline.formData[key] || ""),
    );

    const brandingChanged =
      (branding.logoUrl || null) !== (savedBaseline.branding.logoUrl || null) ||
      (branding.stampUrl || null) !== (savedBaseline.branding.stampUrl || null);

    const docsChanged = Object.keys(documents).some(
      (key) => (documents[key] || "") !== (savedBaseline.documents[key] || ""),
    );

    return formChanged || brandingChanged || docsChanged;
  }, [formData, branding, documents, savedBaseline]);

  useEffect(() => {
    const loadSettings = async () => {
      if (!schoolId || schoolId === "default_school") {
        setSavedBaseline({
          formData: initialFormData,
          branding: initialBranding,
          documents: initialDocuments,
        });
        setIsLoading(false);
        return;
      }

      try {
        let ref = doc(db, "schools", schoolId);
        let snap = await getDoc(ref);
        let foundIn = "schools";

        if (!snap.exists()) {
          ref = doc(db, "inquiries", schoolId);
          snap = await getDoc(ref);
          foundIn = "inquiries";
        }

        const data = snap.exists() ? snap.data() : {};
        if (snap.exists()) {
          setCollectionName(foundIn);
        }

        const loadedForm = {
          ...initialFormData,
          schoolName:
            data.schoolName || data.name || initialFormData.schoolName,
          schoolCode: data.schoolCode || initialFormData.schoolCode,
          email: data.email || initialFormData.email,
          phone: data.phone || "",
          website: data.website || "",
          address: data.address || "",
          city: data.city || "",
          country: data.country || initialFormData.country,
        };

        const loadedBranding = {
          logoUrl: cleanDataUrl(data.logoUrl),
          stampUrl: cleanDataUrl(data.stampUrl),
        };

        const loadedDocs = {
          principalName: data.principalName || "",
          designation: data.designation || initialDocuments.designation,
          signatureUrl: cleanDataUrl(data.signatureUrl),
          receiptFooter: data.receiptFooter || initialDocuments.receiptFooter,
        };

        setFormData(loadedForm);
        setBranding(loadedBranding);
        setDocuments(loadedDocs);
        setSavedBaseline({
          formData: loadedForm,
          branding: loadedBranding,
          documents: loadedDocs,
        });
      } catch (err) {
        console.error("Error loading school settings:", err);
        setSavedBaseline({
          formData: initialFormData,
          branding: initialBranding,
          documents: initialDocuments,
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  // ---- Save / Cancel ----
  const [saveNotice, setSaveNotice] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Rough size (in bytes) of a base64 data URL string — used to warn before
  // a save would exceed Firestore's ~1MB document limit.
  const base64ByteSize = (dataUrl) => {
    if (!dataUrl) return 0;
    const base64 = dataUrl.split(",")[1] || "";
    return Math.round((base64.length * 3) / 4);
  };

  const handleSave = async () => {
    if (!schoolId || schoolId === "default_school") {
      setSaveError("No school session found — please log in again.");
      return;
    }

    const combinedImageBytes =
      base64ByteSize(branding.logoUrl) +
      base64ByteSize(branding.stampUrl) +
      base64ByteSize(documents.signatureUrl);

    if (combinedImageBytes > BRANDING_PAYLOAD_MAX_BYTES) {
      setSaveError(
        "Logo, stamp, and signature images together are too large to save. Try smaller source images.",
      );
      return;
    }

    setIsSaving(true);
    setSaveError("");

    try {
      const payload = {
        ...formData,
        principalName: documents.principalName,
        designation: documents.designation,
        receiptFooter: documents.receiptFooter,
        ...(branding.logoUrl && { logoUrl: branding.logoUrl }),
        ...(branding.stampUrl && { stampUrl: branding.stampUrl }),
        ...(documents.signatureUrl && { signatureUrl: documents.signatureUrl }),
      };

      await setDoc(doc(db, collectionName, schoolId), payload, { merge: true });

      // ⚡ STEP 1: INSTANT CONTEXT STATE UPDATE (Header Refresh Ke Bina Badlega)
      if (branding.logoUrl) {
        setLogoUrl(branding.logoUrl);
      }
      if (formData.schoolName) {
        setSchoolName(formData.schoolName);
      }
      if (documents.signatureUrl) {
        setSignatureUrl(documents.signatureUrl);
      }
      if (branding.stampUrl) {
        setStampUrl(branding.stampUrl);
      }

      // LocalStorage update
      try {
        const updatedSession = {
          ...session,
          schoolName: formData.schoolName,
          ...(branding.logoUrl && { logoUrl: branding.logoUrl }),
        };

        localStorage.setItem(
          "schoolix_session",
          JSON.stringify(updatedSession),
        );
      } catch {
        // non-fatal
      }

      setSavedBaseline({ formData, branding, documents });

      setSaveNotice(true);
      gsap.fromTo(
        ".save-notice",
        { opacity: 0, y: -10 },
        { opacity: 1, y: 0, duration: 0.35, ease: "power2.out" },
      );
      setTimeout(() => setSaveNotice(false), 2600);
    } catch (err) {
      console.error("Error saving school settings:", err);
      setSaveError(err?.message || "Couldn't save settings. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (savedBaseline) {
      setFormData(savedBaseline.formData);
      setBranding(savedBaseline.branding);
      setDocuments(savedBaseline.documents);
    } else {
      setFormData(initialFormData);
      setBranding(initialBranding);
      setDocuments(initialDocuments);
    }
  };

  // ---- GSAP entrance timeline ----
  const containerRef = useRef(null);
  const headerRef = useRef(null);
  const cardRefs = useRef([]);
  const registerCard = (el) => {
    if (el && !cardRefs.current.includes(el)) cardRefs.current.push(el);
  };

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.from(headerRef.current, { opacity: 0, y: -24, duration: 0.6 })
        .from(
          cardRefs.current,
          { opacity: 0, y: 44, duration: 0.7, stagger: 0.15 },
          "-=0.3",
        )
        .from(
          ".setting-input",
          { opacity: 0, y: 14, duration: 0.45, stagger: 0.035 },
          "-=0.55",
        )
        .from(
          ".footer-actions > *",
          { opacity: 0, y: 18, duration: 0.4, stagger: 0.1 },
          "-=0.2",
        );
    }, containerRef);
    return () => ctx.revert();
  }, []);

  return (
    <div
      ref={containerRef}
      className="min-h-screen bg-[#F8FAFC] p-0 sm:p-0 lg:p-0"
    >
      <Header />
      <div className="max-w-full mx-auto space-y-6 mt-4">
        <div
          ref={headerRef}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
        >
          <div>
            <h1 className="text-md sm:text-xl font-bold text-slate-900 tracking-tight">
              School Settings
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Manage your school's information, branding and document
              preferences.
            </p>
            <span className="inline-flex items-center gap-1.5 mt-2.5 text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full uppercase tracking-wider">
              <Hash className="w-3 h-3" />
              School ID: {schoolId}
            </span>
          </div>
        </div>

        {/* Save confirmation / error toast */}
        {saveNotice && (
          <div className="save-notice flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold px-4 py-3 rounded-2xl">
            <CheckCircle2 className="w-4 h-4" />
            Settings saved.
          </div>
        )}
        {saveError && (
          <div className="save-notice flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold px-4 py-3 rounded-2xl">
            <Info className="w-4 h-4" />
            {saveError}
          </div>
        )}
        {imageError && (
          <div className="save-notice flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold px-4 py-3 rounded-2xl">
            <Info className="w-4 h-4" />
            {imageError}
          </div>
        )}
        {isLoading && (
          <div className="flex items-center gap-2 text-slate-400 text-xs font-bold px-1">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading school settings...
          </div>
        )}

        {/* ---------------- Section 1: School Information ---------------- */}
        <SectionCard
          ref={registerCard}
          icon={Building2}
          title="School Information"
          description="Core details that identify your school across the platform."
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <SettingInput
              icon={Building2}
              label="School Name"
              value={formData.schoolName}
              onChange={handleFieldChange("schoolName")}
              placeholder="e.g. The Kids Foundation School"
            />
            <ReadOnlyInput icon={Hash} label="School ID" value={schoolId} />

            <SettingInput
              icon={Barcode}
              label="School Code"
              value={formData.schoolCode}
              onChange={handleFieldChange("schoolCode")}
              placeholder="e.g. TKF-2026"
            />

            <ReadOnlyInput icon={Mail} label="Email" value={formData.email} />

            <SettingInput
              icon={Phone}
              label="Phone Number"
              value={formData.phone}
              onChange={handleFieldChange("phone")}
              placeholder="e.g. +92 300 1234567"
            />
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1">
                <ReadOnlyInput
                  icon={Lock}
                  label="Password"
                  value="••••••••••"
                />
              </div>
              <Button
                variant="secondary"
                icon={KeyRound}
                onClick={() => setIsPasswordModalOpen(true)}
                className="shrink-0"
              >
                Change Password
              </Button>
            </div>

            <SettingInput
              icon={Globe}
              label="Website"
              value={formData.website}
              onChange={handleFieldChange("website")}
              placeholder="e.g. www.yourschool.edu.pk"
            />

            <div className="sm:col-span-2">
              <SettingInput
                icon={MapPin}
                label="Address"
                value={formData.address}
                onChange={handleFieldChange("address")}
                placeholder="Street address"
              />
            </div>

            <SettingInput
              icon={Landmark}
              label="City"
              value={formData.city}
              onChange={handleFieldChange("city")}
              placeholder="e.g. Islamabad"
            />
            <SettingInput
              icon={Flag}
              label="Country"
              value={formData.country}
              onChange={handleFieldChange("country")}
              placeholder="e.g. Pakistan"
            />
          </div>
        </SectionCard>

        {/* ---------------- Sections 2 & 3: side-by-side on desktop ---------------- */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ---- Section 2: Branding ---- */}
          <SectionCard
            ref={registerCard}
            icon={Palette}
            title="Branding"
            description="Your school's visual identity across receipts and documents."
          >
            <div className="space-y-5">
              <UploadBox
                icon={ImagePlus}
                label="School Logo"
                helperText="PNG or WEBP"
                preview={getSafePreviewUrl(branding.logoUrl)}
                onFileChange={handleLogoChange}
              />
              <UploadBox
                icon={Stamp}
                label="School Stamp"
                helperText="PNG or WEBP"
                preview={getSafePreviewUrl(branding.stampUrl)}
                onFileChange={handleStampChange}
                optional
              />
            </div>
          </SectionCard>

          {/* ---- Section 3: Documents ---- */}
          <SectionCard
            ref={registerCard}
            icon={FileText}
            title="Documents"
            description="Signature block used across generated documents."
          >
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <SettingInput
                  icon={User}
                  label="Principal Name"
                  value={documents.principalName}
                  onChange={handleDocFieldChange("principalName")}
                  placeholder="e.g. Dr. Ayesha Khan"
                />
                <SettingInput
                  icon={Briefcase}
                  label="Designation"
                  value={documents.designation}
                  onChange={handleDocFieldChange("designation")}
                  placeholder="e.g. Principal"
                />
              </div>

              <UploadBox
                icon={PenTool}
                label="Signature Upload"
                helperText="PNG or WEBP"
                preview={getSafePreviewUrl(documents.signatureUrl)}
                onFileChange={handleSignatureChange}
              />

              <SettingInput
                icon={Receipt}
                label="Receipt Footer"
                value={documents.receiptFooter}
                onChange={handleDocFieldChange("receiptFooter")}
                placeholder="Computer Generated Receipt."
              />

              <div className="flex items-start gap-2.5 bg-indigo-50/60 border border-indigo-100 rounded-2xl p-3.5">
                <Info className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                <p className="text-[13px] text-indigo-700 font-medium leading-relaxed">
                  This name and signature will automatically appear on Fee
                  Receipts, Certificates, Result Cards, and Transfer
                  Certificates.
                </p>
              </div>
            </div>
          </SectionCard>
        </div>

        <div className="footer-actions flex items-center justify-end gap-3 border-t border-slate-200/80 pt-4 pb-4">
          <Button
            variant="secondary"
            icon={X}
            onClick={handleCancel}
            disabled={isSaving || !isChanged}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={isSaving ? Loader2 : Save}
            onClick={handleSave}
            disabled={isSaving || !isChanged}
            className={isSaving ? "[&_svg]:animate-spin" : ""}
          >
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      {isPasswordModalOpen && (
        <ChangePasswordModal onClose={() => setIsPasswordModalOpen(false)} />
      )}
    </div>
  );
};

export default SchoolSettings;
