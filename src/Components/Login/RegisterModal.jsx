import { useState } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebaseConfig.js";
import RegistrationSuccess from "./RegistrationSuccess.jsx";
import { motion, AnimatePresence } from "framer-motion";
import PasswordInput from "./PasswordInput.jsx";
import { toast, Toaster } from "react-hot-toast";
import { auth } from "../../firebaseConfig.js";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../../firebaseConfig.js";

const PLANS = [
  { id: "free", label: "Free", price: "$0/mo" },
  { id: "pro", label: "Pro", price: "$49/mo" },
];

const initialFormData = {
  fullName: "",
  schoolName: "",
  phone: "",
  email: "",
  cnic: "",
  logoFile: "",
  schoolAddress: "",
  password: "",
  confirmPassword: "",
  selectedPlan: "free",
  transactionId: "",
  paymentReceiptFile: "",
};

// Fires an n8n webhook whenever a new school registration/inquiry is
// successfully submitted. Wired up via VITE_N8N_NEW_INQUIRY_WEBHOOK_URL
// (.env / .env.local). If the env var isn't set, we just warn and skip —
// this must never block or fail the actual registration flow.
const triggerNewInquiryWebhook = async ({
  schoolName,
  applicantName,
  email,
  phone,
  selectedPlan,
}) => {
  const webhookUrl = import.meta.env.VITE_N8N_NEW_INQUIRY_WEBHOOK_URL;

  if (!webhookUrl) {
    console.warn(
      "VITE_N8N_NEW_INQUIRY_WEBHOOK_URL is not set — skipping new-inquiry webhook call.",
    );
    return;
  }

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schoolName,
        applicantName,
        email,
        phone,
        selectedPlan,
      }),
    });
  } catch (err) {
    console.error("New-inquiry webhook failed:", err);
  }
};

function RegisterModal({ isOpen, onClose }) {
  const [formData, setFormData] = useState(initialFormData);
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  if (!isOpen) return null;

  const isPro = formData.selectedPlan === "pro";

  const uploadLogoImage = async (userUid) => {
    if (!formData.logoFile) return "";
    try {
      const storageRef = ref(storage, `school_logos/${userUid}_${Date.now()}`);
      const snapshot = await uploadBytes(storageRef, formData.logoFile);
      const downloadUrl = await getDownloadURL(snapshot.ref);
      return downloadUrl;
    } catch (error) {
      console.error("Logo upload failed: ", error);
      throw new Error("Failed to upload logo image file.");
    }
  };

  // Shared Canvas-based compressor: downscales + re-encodes an image file to a
  // compressed Base64 JPEG Data URL. Used for both the school logo and the
  // payment receipt so we avoid Firebase Storage's uploadBytes() entirely
  // (sidesteps the CORS issues that call triggers on localhost).
  const compressImageToBase64 = (file, maxWidth, maxHeight, quality) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height *= maxWidth / width;
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width *= maxHeight / height;
              height = maxHeight;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);

          resolve(canvas.toDataURL("image/jpeg", quality));
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setPasswordError("");

    if (formData.password !== formData.confirmPassword) {
      setPasswordError("Passwords do not match.");
      toast.error("Passwords do not match.");
      return;
    }

    if (isPro) {
      if (!formData.transactionId.trim()) {
        toast.error("Transaction ID is required for the Pro plan.");
        return;
      }
      if (!formData.paymentReceiptFile) {
        toast.error("Payment receipt screenshot is required for the Pro plan.");
        return;
      }
    }

    setLoading(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        formData.email,
        formData.password,
      );
      const user = userCredential.user;

      // Downscale the logo to a clean 150x150 dashboard thumbnail, heavily
      // compressed (~10-30KB) since it's just a small badge icon.
      let logoBase64String = "";
      if (formData.logoFile) {
        logoBase64String = await compressImageToBase64(
          formData.logoFile,
          150,
          150,
          0.6,
        );
      }

      // Downscale the payment receipt to a max of 800px on its longest side,
      // compressed at 0.7 quality to keep the text/amounts legible.
      let paymentReceiptBase64String = null;
      if (isPro && formData.paymentReceiptFile) {
        paymentReceiptBase64String = await compressImageToBase64(
          formData.paymentReceiptFile,
          800,
          800,
          0.7,
        );
      }

      const registrationData = {
        schoolName: formData.schoolName,
        fullName: formData.fullName,
        email: formData.email,
        phone: formData.phone,
        schoolAddress: formData.schoolAddress,
        cnic: formData.cnic,
        logoURL: logoBase64String,
        selectedPlan: formData.selectedPlan,
        transactionId: isPro ? formData.transactionId : null,
        paymentReceiptUrl: isPro ? paymentReceiptBase64String : null,
        status: "pending",
        uid: user.uid,
      };

      await addDoc(collection(db, "inquiries"), {
        ...registrationData,
        createdAt: serverTimestamp(),
      });

      // Fire-and-forget: notify n8n of the new inquiry. Any failure here
      // (including a missing env var) is already handled inside the helper
      // and must not interrupt the registration success flow.
      triggerNewInquiryWebhook({
        schoolName: formData.schoolName,
        applicantName: formData.fullName,
        email: formData.email,
        phone: formData.phone,
        selectedPlan: formData.selectedPlan,
      });

      setFormData(initialFormData);
      setPasswordError("");

      setShowSuccess(true);
    } catch (err) {
      console.error("Error submitting inquiry: ", err);
      toast.error(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-3 bg-slate-900/40 backdrop-blur-sm">
      <Toaster position="top-right" reverseOrder={false} />
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 shadow-2xl transition-all max-h-[95vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <h3 className="text-lg font-semibold text-slate-900 sm:text-xl">
            Register Your School
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-xl font-bold cursor-pointer"
          >
            &times;
          </button>
        </div>

        <form className="mt-2 space-y-2 ml-0.5" onSubmit={handleSubmit}>
          <AnimatePresence mode="wait">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full rounded-xl border border-indigo-100/60 bg-white p-3 sm:p-4 shadow-md grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3"
            >
              {/* Plan Selector */}
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-700 mb-1.5">
                  Select Your Plan
                </label>
                <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-slate-100 p-1">
                  {PLANS.map((plan) => {
                    const active = formData.selectedPlan === plan.id;
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() =>
                          setFormData({ ...formData, selectedPlan: plan.id })
                        }
                        className={`cursor-pointer rounded-lg py-2 text-xs font-semibold transition-all ${
                          active
                            ? "bg-white text-indigo-700 shadow-sm"
                            : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        {plan.label}
                        <span className="block text-[10px] font-normal opacity-70">
                          {plan.price}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Full Name */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  name="fullName"
                  placeholder="e.g., Prof. Ahmed"
                  value={formData.fullName}
                  onChange={(e) =>
                    setFormData({ ...formData, fullName: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                />
              </div>

              {/* Contact Number */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Contact Number
                </label>
                <input
                  type="number"
                  name="phone"
                  required
                  placeholder="e.g., 03001234567"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                />
              </div>

              {/* School Name */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  School Name
                </label>
                <input
                  type="text"
                  name="school name"
                  required
                  placeholder="e.g., Allied School"
                  value={formData.schoolName}
                  onChange={(e) =>
                    setFormData({ ...formData, schoolName: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                />
              </div>

              {/* School Address */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  School Address
                </label>
                <input
                  type="text"
                  name="schoolAddress"
                  autoComplete="school-address"
                  required
                  placeholder="karachi, pakistan"
                  value={formData.schoolAddress}
                  onChange={(e) =>
                    setFormData({ ...formData, schoolAddress: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                />
              </div>

              {/* CNIC */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  CNIC Number
                </label>
                <input
                  type="text"
                  required
                  name="cnic"
                  placeholder="e.g., 35201-XXXXXXX-X"
                  value={formData.cnic}
                  onChange={(e) =>
                    setFormData({ ...formData, cnic: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Official Email Address
                </label>
                <input
                  type="email"
                  name="register-email"
                  autoComplete="email"
                  required
                  placeholder="e.g., principal@school.com"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Password
                </label>
                <PasswordInput
                  name="new-password"
                  autoComplete="new-password"
                  value={formData.password}
                  onChange={(e) => {
                    setFormData({ ...formData, password: e.target.value });
                    if (passwordError) setPasswordError("");
                  }}
                  placeholder="Enter your password"
                />
              </div>

              {/* Confirm password */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Confirm Password
                </label>
                <PasswordInput
                  name="confirm-password"
                  autoComplete="new-password"
                  value={formData.confirmPassword}
                  onChange={(e) => {
                    setFormData({ ...formData, confirmPassword: e.target.value });
                    if (passwordError) setPasswordError("");
                  }}
                  placeholder="Re-enter your password"
                />
                {passwordError && (
                  <p className="mt-1 text-xs font-medium text-red-500">
                    {passwordError}
                  </p>
                )}
              </div>

              {/* School Logo */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  School Logo
                </label>
                <input
                  type="file"
                  accept="image/*"
                  required
                  onChange={(e) =>
                    setFormData({ ...formData, logoFile: e.target.files[0] })
                  }
                  className="block w-full text-[11px] text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-[11px] file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
                />
              </div>

              {/* Pro Plan Only: Transaction ID + Payment Receipt */}
              <AnimatePresence>
                {isPro && (
                  <>
                    <motion.div
                      key="transactionId"
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.15 }}
                    >
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Transaction ID
                      </label>
                      <input
                        type="text"
                        name="transactionId"
                        required
                        placeholder="e.g., TXN123456789"
                        value={formData.transactionId}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            transactionId: e.target.value,
                          })
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                      />
                    </motion.div>

                    <motion.div
                      key="paymentReceipt"
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.15 }}
                    >
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Payment Receipt
                      </label>
                      <input
                        type="file"
                        accept="image/*"
                        required
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            paymentReceiptFile: e.target.files[0],
                          })
                        }
                        className="block w-full text-[11px] text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-[11px] file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
                      />
                    </motion.div>
                  </>
                )}
              </AnimatePresence>

              {/* Submit button stretches across both columns */}
              <button
                type="submit"
                disabled={loading}
                className="w-full sm:col-span-2 mt-1.5 cursor-pointer rounded-xl bg-linear-to-r from-indigo-600 to-indigo-700 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:from-indigo-500 hover:to-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading
                  ? "Submitting..."
                  : isPro
                    ? "Submit Pro Registration Request"
                    : "Submit Registration Request"}
              </button>
            </motion.div>
          </AnimatePresence>
        </form>
      </div>
      <RegistrationSuccess
        isOpen={showSuccess}
        onClose={() => {
          setShowSuccess(false);
          onClose();
        }}
      />
    </div>
  );
}

export default RegisterModal;