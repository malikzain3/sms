import React, { useState, useEffect } from "react";
import {
  doc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { db } from "../../firebaseConfig";
import toast from "react-hot-toast";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../../firebaseConfig";
import { Cog } from "lucide-react";

const ManageUsersModal = ({ isOpen, onClose, school, onStatusChange }) => {
  // Local state forms tied to school fields
  const [principal, setPrincipal] = useState("");
  const [cnic, setCnic] = useState(school?.cnic || "");
  const [logoFile, setLogoFile] = useState(null);
  const [currentLogoURL, setCurrentLogoURL] = useState(school?.logoURL || "");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState("active");
  const [paymentStatus, setPaymentStatus] = useState("Paid");
  const [selectedPlan, setSelectedPlan] = useState("free");

  // For LOGO
  const uploadLogoImage = async (schoolId) => {
    if (!logoFile) return currentLogoURL;

    try {
      const storageRef = ref(
        storage,
        `school_logos/${schoolId}_logo_${Date.now()}`,
      );

      const snapshot = await uploadBytes(storageRef, logoFile);

      const downloadUrl = await getDownloadURL(snapshot.ref);
      return downloadUrl;
    } catch (error) {
      console.error("Storage upload failed:", error);
      throw new Error("Failed to upload school logo image file.");
    }
  };

  // Sync state data when a school is selected
  useEffect(() => {
    if (school) {
      setPrincipal(school.principal || "");
      setPhone(school.phone || "");
      setStatus(school.status || "active");
      setPaymentStatus(school.paymentStatus || "Paid");
      setSelectedPlan(school.selectedPlan || school.plan || "free");
    }
  }, [school]);

  const handleUpdate = async (e) => {
    e.preventDefault();
    // Capture the pre-edit status so we only fire the trigger when it
    // actually flips between Active/Inactive.
    const previousStatus = school?.status || "active";

    try {
      const finalLogoUrl = await uploadLogoImage(school.id);

      await updateDoc(doc(db, "schools", school.id), {
        principal: principal,
        phone: phone,
        status: status,
        paymentStatus: paymentStatus,
        cnic: cnic,
        logoUrl: finalLogoUrl,
        selectedPlan: selectedPlan,
      });

      if (school.email) {
        const useRef = collection(db, "users");
        const q = query(useRef, where("email", "==", school.email));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          const userDoc = querySnapshot.docs[0];
          await updateDoc(doc(db, "users", userDoc.id), {
            status: status,
            selectedPlan: selectedPlan,
          });
        }
      }

      // Notify the parent so it can fire an n8n webhook (or any other
      // status-change automation) — kept decoupled from the save flow above.
      if (previousStatus !== status) {
        onStatusChange?.(school, previousStatus, status);
      }

      toast.success(
        "School parameters and profile details modified successfully!",
      );
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Failed to update configurations.");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-slate-800 pb-3">
          <h3 className="flex items-center gap-2 text-lg font-bold text-white truncate">
            <Cog /> Manage {school?.schoolName}
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-sm"
          >
            ✕
          </button>
        </div>

        {/* Configurations Form */}
        <form onSubmit={handleUpdate} className="space-y-4 text-sm">
          {/* Principal Info */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Principal Name
            </label>
            <input
              type="text"
              value={principal}
              onChange={(e) => setPrincipal(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-cyan-500"
            />
          </div>

          {/* Contact Info */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Contact Phone
            </label>
            <input
              type="number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-cyan-500"
            />
          </div>

          {/* status*/}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              System Access Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-cyan-500"
            >
              <option value="active">🟢 Active (Access Allowed)</option>
              <option value="inactive">🔴 Inactive (Suspended)</option>
            </select>
          </div>
          {/* Payment status */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Billing Status
            </label>
            <select
              value={paymentStatus}
              onChange={(e) => setPaymentStatus(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-cyan-500"
            >
              <option value="paid">🟢 Fully Paid</option>
              <option value="partial">🟡 Partially Paid</option>
              <option value="unpaid">🔴 Unpaid</option>
              <option value="advancePaid">💎 Advance Paid</option>
            </select>
          </div>

          {/* Subscription plan */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Subscription Plan
            </label>
            <select
              value={selectedPlan}
              onChange={(e) => setSelectedPlan(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-cyan-500"
            >
              <option value="free">⚡ Free Plan (Max 100 Students)</option>
              <option value="pro">💎 Pro Plan (Unlimited Access)</option>
            </select>
          </div>

          {/* Form buttons */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="cursor-pointer flex-1 py-2 bg-cyan-500 hover:bg-cyan-400 text-white rounded-xl font-medium transition shadow-lg shadow-cyan-500/20"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ManageUsersModal;