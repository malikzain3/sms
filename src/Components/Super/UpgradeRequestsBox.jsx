import React, { useState, useEffect, useMemo } from "react";
import {
  doc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { toast, Toaster } from "react-hot-toast";
import { useOutletContext } from "react-router-dom";
import { Crown, Mail, Users, Calendar } from "lucide-react";

// Superadmin inbox for Pro-upgrade requests submitted from the school
// admin's UpgradeModal. Requests live in `upgradeRequests/{id}` with
// status: "pending" (the school doc itself separately carries
// upgradeStatus: "pending_upgrade" so the school's own dashboard can show
// an "already pending" state — see UpgradeModal.jsx / Phase 3 Part 1).
const UpgradeRequestsBox = () => {
  const { upgradeRequests = [], schools = [] } = useOutletContext() || {};
  const [studentCounts, setStudentCounts] = useState({});
  const [processingId, setProcessingId] = useState(null);

  // Stable key so the count-listeners effect only re-runs when the actual
  // set of school ids changes, not on every snapshot re-render.
  const schoolIdsKey = useMemo(
    () =>
      [...new Set(upgradeRequests.map((r) => r.schoolId).filter(Boolean))]
        .sort()
        .join(","),
    [upgradeRequests],
  );

  // Live per-school student counts, used to show "Current Student Count"
  // on each request card.
  useEffect(() => {
    const schoolIds = schoolIdsKey ? schoolIdsKey.split(",") : [];
    if (schoolIds.length === 0) return;

    const unsubscribers = schoolIds.map((schoolId) => {
      const q = query(
        collection(db, "students"),
        where("schoolId", "==", schoolId),
      );
      return onSnapshot(q, (snap) => {
        setStudentCounts((prev) => ({ ...prev, [schoolId]: snap.size }));
      });
    });

    return () => unsubscribers.forEach((unsub) => unsub());
  }, [schoolIdsKey]);

  const getSchoolMeta = (request) => {
    const matchedSchool = schools.find((s) => s.id === request.schoolId);
    return {
      schoolName:
        request.schoolName || matchedSchool?.schoolName || "Unknown School",
      email: matchedSchool?.email || "—",
    };
  };

  const formatDate = (value) => {
    if (!value) return "—";
    try {
      // Handles both ISO strings (written by UpgradeModal) and Firestore
      // Timestamp objects, just in case.
      const dateObj = typeof value?.toDate === "function" ? value.toDate() : new Date(value);
      return dateObj.toLocaleString();
    } catch {
      return "—";
    }
  };

  const handleApprove = async (request) => {
    setProcessingId(request.id);
    try {
      await updateDoc(doc(db, "schools", request.schoolId), {
        selectedPlan: "pro",
        upgradeStatus: "approved",
        planUpgradedAt: serverTimestamp(),
      });

      // Bump every user mapped to this school (schooladmin, teachers, etc.
      // that carry selectedPlan) rather than assuming a single admin doc.
      const usersSnap = await getDocs(
        query(
          collection(db, "users"),
          where("schoolId", "==", request.schoolId),
        ),
      );
      await Promise.all(
        usersSnap.docs.map((userDoc) =>
          updateDoc(doc(db, "users", userDoc.id), { selectedPlan: "pro" }),
        ),
      );

      await updateDoc(doc(db, "upgradeRequests", request.id), {
        status: "approved",
      });

      toast.success(
        `${request.schoolName || "School"} upgraded to Pro Plan!`,
      );
    } catch (err) {
      console.error("Failed to approve upgrade request:", err);
      toast.error("Failed to approve upgrade request.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (request) => {
    setProcessingId(request.id);
    try {
      await updateDoc(doc(db, "schools", request.schoolId), {
        upgradeStatus: "rejected",
      });
      await updateDoc(doc(db, "upgradeRequests", request.id), {
        status: "rejected",
      });
      toast.success("Upgrade request dismissed.");
    } catch (err) {
      console.error("Failed to reject upgrade request:", err);
      toast.error("Failed to dismiss upgrade request.");
    } finally {
      setProcessingId(null);
    }
  };

  if (!upgradeRequests || upgradeRequests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-500">
        <span className="text-4xl mb-3">💎</span>
        <p className="text-sm font-medium">No pending upgrade requests.</p>
      </div>
    );
  }

  return (
    <>
      <Toaster position="top-right" reverseOrder={false} />
      <div className="space-y-4">
        {upgradeRequests.map((request) => {
          const { schoolName, email } = getSchoolMeta(request);
          const studentCount = studentCounts[request.schoolId];
          const isProcessing = processingId === request.id;

          return (
            <div
              key={request.id}
              className="flex flex-col lg:flex-row justify-between items-start lg:items-center p-5 rounded-2xl border border-slate-800 bg-slate-900/20 gap-4 shadow-md"
            >
              {/* Left: Request Details */}
              <div className="w-full space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-base font-bold text-white">
                    {schoolName}
                  </h4>
                  <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400">
                    <Crown className="h-3 w-3" /> Upgrade Requested
                  </span>
                </div>
                <p className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Mail className="h-3.5 w-3.5 text-slate-500" />
                  <span className="font-mono text-cyan-500/80">{email}</span>
                </p>
                <p className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Users className="h-3.5 w-3.5 text-slate-500" />
                  Current Students:{" "}
                  <span className="font-mono text-slate-200">
                    {studentCount ?? "…"}
                  </span>
                </p>
                <p className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Calendar className="h-3.5 w-3.5 text-slate-500" />
                  Requested:{" "}
                  <span className="text-slate-200">
                    {formatDate(request.requestedAt)}
                  </span>
                </p>
              </div>

              {/* Right: Action Buttons */}
              <div className="flex gap-2 w-full lg:w-auto">
                <button
                  onClick={() => handleApprove(request)}
                  disabled={isProcessing}
                  className="cursor-pointer px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition shadow-lg shadow-emerald-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isProcessing ? "Processing..." : "💎 Approve Pro Upgrade"}
                </button>
                <button
                  onClick={() => handleReject(request)}
                  disabled={isProcessing}
                  className="cursor-pointer px-5 py-2 bg-slate-800 hover:bg-red-900/60 hover:text-red-400 text-slate-300 rounded-xl text-xs font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ❌ Reject
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};

export default UpgradeRequestsBox;
