import React, { useState, useEffect } from "react";
import {
  collection,
  onSnapshot,
  addDoc,
  doc,
  query,
  where,
  getDocs,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../firebaseConfig";
import ClassesCard from "./ClassesCard";
import Header from "./Header";
import { X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import PageLoader from "./PageLoader";

const MIN_COURSES = 3;
const MAX_COURSES = 8;

const Classes = () => {
  const navigate = useNavigate();
  const [classesList, setClassesList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [classPendingDeletion, setClassPendingDeletion] = useState(null);
  const [isDeletingClass, setIsDeletingClass] = useState(false);

  // Basic info
  const [className, setClassName] = useState("");
  const [section, setSection] = useState("");
  const [level, setLevel] = useState("");
  const [roomNumber, setRoomNumber] = useState("");
  const [academicYear, setAcademicYear] = useState("");

  // Teacher(s)
  const [teacherMode, setTeacherMode] = useState("single");
  const [teacherSingle, setTeacherSingle] = useState("");
  const [teachersMulti, setTeachersMulti] = useState([""]);
  const [teachersList, setTeachersList] = useState([]);

  // Courses (min 3, max 8)
  const [courses, setCourses] = useState(["", "", ""]);

  const session = JSON.parse(localStorage.getItem("schoolix_session"));
  const currentSchoolId = session?.schoolId || "default_school";

  useEffect(() => {
    setLoading(true);
    const q = query(
      collection(db, "classes"),
      where("schoolId", "==", currentSchoolId),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = [];
        snapshot.forEach((doc) => {
          docs.push({ id: doc.id, ...doc.data() });
        });
        setClassesList(docs);
        setLoading(false);
      },
      (error) => {
        console.error(error);
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [currentSchoolId]);

  useEffect(() => {
    const q = query(
      collection(db, "teachers"),
      where("schoolId", "==", currentSchoolId),
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = [];
      snapshot.forEach((doc) => {
        docs.push({ id: doc.id, ...doc.data() });
      });
      setTeachersList(docs);
    });
    return () => unsubscribe();
  }, [currentSchoolId]);

  // Only show teachers matching the current mode and not already assigned elsewhere
  const requiredScheduleType = teacherMode === "single" ? "class" : "period";
  const assignedTeacherNames = new Set(
    classesList.flatMap((c) => (Array.isArray(c.teachers) ? c.teachers : [])),
  );
  const availableTeachers = teachersList.filter(
    (t) =>
      t.scheduleType === requiredScheduleType &&
      !assignedTeacherNames.has(t.name),
  );
  const normalize = (str) => (str || "").toLowerCase().replace(/\s+/g, "");

  const filteredClasses = classesList
    .filter((c) => {
      const q = normalize(searchTerm);
      if (!q) return true;
      const countStr = String(c.studentsCount ?? 0);
      return (
        normalize(c.className).includes(q) ||
        normalize(c.section).includes(q) ||
        normalize(c.level).includes(q) ||
        normalize(c.status).includes(q) ||
        normalize(c.roomNumber).includes(q) ||
        normalize(countStr).includes(q) ||
        normalize(`${countStr}students`).includes(q) ||
        (Array.isArray(c.teachers) &&
          c.teachers.some((t) => normalize(t).includes(q)))
      );
    })
    .sort((first, second) =>
      `${first.className || ""} ${first.section || ""}`.localeCompare(
        `${second.className || ""} ${second.section || ""}`,
        undefined,
        { numeric: true, sensitivity: "base" },
      ),
    );
  const resetForm = () => {
    setClassName("");
    setSection("");
    setLevel("");
    setRoomNumber("");
    setAcademicYear("");
    setTeacherMode("single");
    setTeacherSingle("");
    setTeachersMulti([""]);
    setCourses(["", "", ""]);
    setFormError("");
  };

  const handleAddTeacher = () => {
    if (teachersMulti.length >= 8) return;
    setTeachersMulti([...teachersMulti, ""]);
  };

  const handleRemoveTeacher = (index) => {
    if (teachersMulti.length <= 1) return;
    setTeachersMulti(teachersMulti.filter((_, i) => i !== index));
  };

  const handleTeacherChange = (index, value) => {
    const updated = [...teachersMulti];
    updated[index] = value;
    setTeachersMulti(updated);
  };

  const handleAddCourse = () => {
    if (courses.length >= MAX_COURSES) return;
    setCourses([...courses, ""]);
  };

  const handleRemoveCourse = (index) => {
    if (courses.length <= MIN_COURSES) return;
    setCourses(courses.filter((_, i) => i !== index));
  };

  const handleCourseChange = (index, value) => {
    const updated = [...courses];
    updated[index] = value;
    setCourses(updated);
  };

  const handleCreateClass = async (e) => {
    e.preventDefault();
    setLoading(true);
    setFormError("");

    if (!className || !section || !level) {
      setFormError("Class name, section, and level are required.");
      return;
    }

    const cleanedCourses = courses.map((c) => c.trim()).filter(Boolean);
    if (
      cleanedCourses.length < MIN_COURSES ||
      cleanedCourses.length > MAX_COURSES
    ) {
      setFormError(
        `Please provide between ${MIN_COURSES} and ${MAX_COURSES} courses.`,
      );
      return;
    }

    const lowerCourses = cleanedCourses.map((c) => c.toLowerCase());
    if (new Set(lowerCourses).size !== lowerCourses.length) {
      setFormError("You've entered the same course more than once.");
      return;
    }

    const duplicateClass = classesList.some(
      (c) =>
        c.className?.trim().toLowerCase() === className.trim().toLowerCase() &&
        c.section?.trim().toLowerCase() === section.trim().toLowerCase(),
    );
    if (duplicateClass) {
      setFormError("A class with this name and section already exists.");
      return;
    }

    if (roomNumber.trim()) {
      const roomTaken = classesList.some(
        (c) =>
          c.roomNumber?.trim().toLowerCase() ===
          roomNumber.trim().toLowerCase(),
      );
      if (roomTaken) {
        setFormError("This room number is already assigned to another class.");
        return;
      }
    }

    if (!teacherSingle) {
      setFormError("Please select a class teacher.");
      return;
    }
    const alreadyAssigned = classesList.some(
      (c) => Array.isArray(c.teachers) && c.teachers.includes(teacherSingle),
    );
    if (alreadyAssigned) {
      setFormError("This teacher is already assigned to a different class.");
      return;
    }
    const teachers = [teacherSingle];

    try {
      await addDoc(collection(db, "classes"), {
        schoolId: currentSchoolId,
        className,
        section,
        level,
        teacherMode,
        teachers,
        roomNumber: roomNumber || null,
        academicYear: academicYear || null,
        courses: cleanedCourses,
        studentsCount: 0,
        status: "Active",
        createdDate: new Date().toISOString().split("T")[0],
      });
      resetForm();
      setIsModalOpen(false);
    } catch (err) {
      console.error(err);
      setFormError(
        "Something went wrong while creating the class. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClass = async (deleteStudents) => {
    const classToDelete = classPendingDeletion;
    if (!classToDelete || isDeletingClass) return;

    setIsDeletingClass(true);
    try {
      const studentsSnapshot = await getDocs(
        query(
          collection(db, "students"),
          where("classId", "==", classToDelete.id),
        ),
      );
      const studentsInSchool = studentsSnapshot.docs.filter(
        (studentDoc) => studentDoc.data().schoolId === currentSchoolId,
      );

      const teachersSnapshot = await getDocs(
        query(
          collection(db, "teachers"),
          where("schoolId", "==", currentSchoolId),
        ),
      );

      const operations = [];
      studentsInSchool.forEach((studentDoc) => {
        operations.push((batch) => {
          const studentRef = doc(db, "students", studentDoc.id);
          if (deleteStudents) batch.delete(studentRef);
          else batch.update(studentRef, { classId: null });
        });
      });

      teachersSnapshot.forEach((teacherDoc) => {
        const teacherData = teacherDoc.data();
        const timetableMatrix = Array.isArray(teacherData.timetableMatrix)
          ? teacherData.timetableMatrix
          : [];
        const cleanedMatrix = timetableMatrix.filter(
          (entry) =>
            entry.classId !== classToDelete.id &&
            !(
              entry.className === classToDelete.className &&
              (!classToDelete.section ||
                !entry.section ||
                entry.section === classToDelete.section)
            ),
        );

        if (cleanedMatrix.length !== timetableMatrix.length) {
          operations.push((batch) =>
            batch.update(doc(db, "teachers", teacherDoc.id), {
              timetableMatrix: cleanedMatrix,
            }),
          );
        }
      });

      operations.push((batch) =>
        batch.delete(doc(db, "classes", classToDelete.id)),
      );

      // Firestore batches are limited to 500 operations. Keep a margin for
      // retries and future additions while retaining batched cleanup.
      for (let start = 0; start < operations.length; start += 450) {
        const batch = writeBatch(db);
        operations
          .slice(start, start + 450)
          .forEach((operation) => operation(batch));
        await batch.commit();
      }

      setClassPendingDeletion(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsDeletingClass(false);
    }
  };

  if (loading) return <PageLoader label="Loading faculty profiles..." />;

  return (
    <div className="space-y-6 text-xs text-slate-700">
      <Header />
      <div className="p-6 bg-white border border-slate-100 rounded-2xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-sm sm:text-base xl:text-xl font-bold text-slate-900 tracking-tight">
              Academic Classes Registry
            </h2>
            <p className="text-sm  text-slate-500 mt-1">
              Configure and inspect section layouts operational under this
              specific school environment.
            </p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition cursor-pointer shrink-0"
          >
            + Add New Class
          </button>
        </div>

        {classesList.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-slate-200 text-slate-400 italic rounded-2xl">
            No classroom matrices initialized for this school branch yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredClasses.map((cls) => (
              <ClassesCard
                key={cls.id}
                classData={cls}
                onSelect={() => navigate(`/school/classes/${cls.id}`)}
                onDelete={() => setClassPendingDeletion(cls)}
              />
            ))}
          </div>
        )}
      </div>

      {classPendingDeletion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs"
            onClick={() => !isDeletingClass && setClassPendingDeletion(null)}
          />
          <div className="bg-white rounded-2xl border border-slate-100 w-full max-w-md p-6 relative z-60 space-y-4 shadow-2xl">
            <div className="flex justify-between items-start gap-4 pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-black text-slate-900 text-lg">
                  Delete {classPendingDeletion.className} -{" "}
                  {classPendingDeletion.section}?
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Choose what should happen to students enrolled in this class.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  !isDeletingClass && setClassPendingDeletion(null)
                }
                disabled={isDeletingClass}
                className="text-slate-400 hover:text-slate-600 font-bold text-xs p-1 cursor-pointer disabled:opacity-50"
              >
                <X />
              </button>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleDeleteClass(false)}
                disabled={isDeletingClass}
                className="w-full text-left p-3 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition disabled:opacity-50"
              >
                <span className="block text-sm font-black text-amber-800">
                  Delete Class Only
                </span>
                <span className="block text-[11px] text-amber-700 mt-1">
                  Keep student records and mark them as unassigned.
                </span>
              </button>
              <button
                type="button"
                onClick={() => handleDeleteClass(true)}
                disabled={isDeletingClass}
                className="w-full text-left p-3 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition disabled:opacity-50"
              >
                <span className="block text-sm font-black text-rose-800">
                  Delete Class + Students
                </span>
                <span className="block text-[11px] text-rose-700 mt-1">
                  Permanently delete students enrolled in this class.
                </span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setClassPendingDeletion(null)}
              disabled={isDeletingClass}
              className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* MODAL SECTION */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs"
            onClick={() => setIsModalOpen(false)}
          />
          <div className="bg-white rounded-2xl border border-slate-100 w-full max-w-lg p-6 relative z-60 space-y-4 max-h-[80vh] overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-slate-200 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent [scrollbar-thin] [scrollbar-color:#e2e8f0_transparent]">
            <div className="flex justify-between items-start pb-3 border-b border-slate-100 mb-4">
              <h3 className="font-black text-slate-900 text-xl">
                Setup Active Classroom Node
              </h3>
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setIsModalOpen(false);
                }}
                className="text-slate-400 hover:text-slate-600 font-bold text-xs p-1 cursor-pointer"
              >
                <X />
              </button>
            </div>

            <form onSubmit={handleCreateClass} className="space-y-4">
              {/* Class name */}
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">
                  Class Identification / Section
                </label>
                <select
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 mt-1 focus:outline-hidden font-semibold"
                  required
                >
                  <option value="">Select grade</option>
                  {[
                    "Nursery",
                    "KG",
                    "Grade 1",
                    "Grade 2",
                    "Grade 3",
                    "Grade 4",
                    "Grade 5",
                    "Grade 6",
                    "Grade 7",
                    "Grade 8",
                    "Grade 9",
                    "Grade 10",
                    "Grade 11",
                    "Grade 12",
                  ].map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>

              {/* Section + Level */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">
                    Section
                  </label>
                  <input
                    type="text"
                    placeholder="A"
                    value={section}
                    onChange={(e) => setSection(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 mt-1 focus:outline-hidden"
                    required
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">
                    Level
                  </label>
                  <select
                    value={level}
                    onChange={(e) => setLevel(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 mt-1 focus:outline-hidden"
                    required
                  >
                    <option value="">Select level</option>
                    <option value="primary">Primary</option>
                    <option value="middle">Middle</option>
                    <option value="upper">Upper</option>
                  </select>
                </div>
              </div>

              {/* Teacher mode */}
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">
                  Teacher Assignment
                </label>
                <div className="flex gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setTeacherMode("single");
                      setTeacherSingle("");
                    }}
                    className={`flex-1 py-1.5 rounded-xl font-bold border transition cursor-pointer ${
                      teacherMode === "single"
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-slate-50 text-slate-500 border-slate-200"
                    }`}
                  >
                    Single Teacher
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTeacherMode("multi");
                      setTeacherSingle("");
                    }}
                    className={`flex-1 py-1.5 rounded-xl font-bold border transition cursor-pointer ${
                      teacherMode === "multi"
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-slate-50 text-slate-500 border-slate-200"
                    }`}
                  >
                    Multiple Teachers
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">
                  Class Teacher
                </label>
                <select
                  value={teacherSingle}
                  onChange={(e) => setTeacherSingle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 mt-1 focus:outline-hidden font-semibold"
                  required
                >
                  <option value="">
                    {availableTeachers.length === 0
                      ? "No available teachers for this mode"
                      : "Select a teacher"}
                  </option>
                  {availableTeachers.map((t) => (
                    <option key={t.id} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  {teacherMode === "single"
                    ? "Only class-based teachers not already assigned are shown."
                    : "Only period-based teachers not already assigned are shown."}
                </p>
              </div>
              {/* Room + Academic year (optional) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">
                    Room Number{" "}
                    <span className="normal-case text-slate-300">
                      (optional)
                    </span>
                  </label>
                  <input
                    type="text"
                    placeholder="Room 14, Physics Wing"
                    value={roomNumber}
                    onChange={(e) => setRoomNumber(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 mt-1 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">
                    Academic Year{" "}
                    <span className="normal-case text-slate-300">
                      (optional)
                    </span>
                  </label>
                  <input
                    type="text"
                    placeholder="2025-2026"
                    value={academicYear}
                    onChange={(e) => setAcademicYear(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 mt-1 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Courses (min 3, max 8) */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase">
                  Courses ({MIN_COURSES}–{MAX_COURSES} required)
                </label>
                {courses.map((course, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      placeholder={`Course ${index + 1}`}
                      value={course}
                      onChange={(e) =>
                        handleCourseChange(index, e.target.value)
                      }
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-hidden"
                    />
                    {courses.length > MIN_COURSES && (
                      <button
                        type="button"
                        onClick={() => handleRemoveCourse(index)}
                        className="px-3 bg-slate-100 text-slate-500 rounded-xl font-bold cursor-pointer"
                      >
                        −
                      </button>
                    )}
                  </div>
                ))}
                {courses.length < MAX_COURSES && (
                  <button
                    type="button"
                    onClick={handleAddCourse}
                    className="text-indigo-600 font-bold cursor-pointer"
                  >
                    + Add another course
                  </button>
                )}
              </div>

              {formError && (
                <p className="text-red-500 font-semibold">{formError}</p>
              )}

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setIsModalOpen(false);
                  }}
                  className="w-1/2 py-2 bg-slate-100 text-slate-600 font-bold rounded-xl cursor-pointer transition-all  hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-1/2 py-2 bg-indigo-600 text-white font-bold rounded-xl cursor-pointer transition-all disabled:opacity-50 hover:bg-indigo-700"
                >
                  {loading ? "Saving..." : "Initialize"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Classes;
