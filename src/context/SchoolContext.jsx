import React, { createContext, useState, useEffect, useContext } from "react";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { db, auth } from "../firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";

const SchoolContext = createContext();

export const SchoolProvider = ({ children }) => {
  const [schoolId, setSchoolId] = useState(null);
  const [schoolName, setSchoolName] = useState("");
  const [logoUrl, setLogoUrl] = useState(null);
  const [signatureUrl, setSignatureUrl] = useState(null);
  const [stampUrl, setStampUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [schoolEmail, setSchoolEmail] = useState("");

  const fetchSchoolData = async (uid = auth.currentUser?.uid) => {
    if (!uid) return;
    try {
      setLoading(true);
      const userDocRef = doc(db, "users", uid);
      const userDoc = await getDoc(userDocRef);

      let targetSchoolId = userDoc.exists() ? userDoc.data().schoolId : uid;

      if (!targetSchoolId) {
        setSchoolId(null);
        setSchoolName("");
        setLogoUrl(null);
        setSignatureUrl(null);
        setStampUrl(null);
        setLoading(false);
        return;
      }

      setSchoolId(targetSchoolId);

      let schoolDocRef = doc(db, "schools", targetSchoolId);
      let schoolDoc = await getDoc(schoolDocRef);

      if (!schoolDoc.exists()) {
        schoolDocRef = doc(db, "inquiries", targetSchoolId);
        schoolDoc = await getDoc(schoolDocRef);
      }

      if (schoolDoc.exists()) {
        const data = schoolDoc.data();
        setSchoolName(data.schoolName || data.name || "School");
        setLogoUrl(data.logoUrl || data.logoURL || null);
        setSignatureUrl(data.signatureUrl || null);
        setStampUrl(data.stampUrl || null);
      }
    } catch (err) {
      console.error("Error fetching school data in Context:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let unsubSchool = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setLoading(true);
        try {
          const userDocRef = doc(db, "users", user.uid);
          const userDoc = await getDoc(userDocRef);
          const targetSchoolId = userDoc.exists()
            ? userDoc.data().schoolId
            : user.uid;

          if (targetSchoolId) {
            setSchoolId(targetSchoolId);

            unsubSchool = onSnapshot(
              doc(db, "schools", targetSchoolId),
              (docSnap) => {
                if (docSnap.exists()) {
                  const data = docSnap.data();
                  setSchoolName(data.schoolName || data.name || "School");
                  setSchoolEmail(data.email || data.schoolEmail || "");
                  setLogoUrl(data.logoUrl || data.logoURL || null);
                  setSignatureUrl(data.signatureUrl || null);
                  setStampUrl(data.stampUrl || null);
                }
                setLoading(false);
              },
            );
          } else {
            setLoading(false);
          }
        } catch (err) {
          console.error("Error setting up real-time listener:", err);
          setLoading(false);
        }
      } else {
        if (unsubSchool) unsubSchool();
        setSchoolId(null);
        setSchoolName("");
        setLogoUrl(null);
        setSignatureUrl(null);
        setStampUrl(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubSchool) unsubSchool();
    };
  }, []);

  return (
    <SchoolContext.Provider
      value={{
        schoolId,
        schoolName,
        logoUrl,
        signatureUrl,
        stampUrl,
        loading,
        schoolEmail,
        setSchoolName,
        setLogoUrl,
        setSignatureUrl,
        setStampUrl,
        setSchoolEmail,
        fetchSchoolData,
      }}
    >
      {children}
    </SchoolContext.Provider>
  );
};

export const useSchool = () => useContext(SchoolContext);