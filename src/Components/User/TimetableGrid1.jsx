import React, { useState, useEffect, useMemo } from "react";
import {
  doc,
  onSnapshot,
  getDoc,
  writeBatch,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { SquarePen, Save, Loader, X } from "lucide-react";

const EditorActions = ({ onSave, onCancel, onCopyMonSat }) => (
  <div className="flex items-center justify-center gap-1.5 mt-1 flex-wrap">
    <button
      type="button"
      onClick={onSave}
      title="Save cell"
      className="text-emerald-600 hover:text-emerald-700 cursor-pointer p-0.5"
    >
      <Save size={13} />
    </button>
    <button
      type="button"
      onClick={onCancel}
      title="Cancel"
      className="text-rose-400 hover:text-rose-600 cursor-pointer p-0.5"
    >
      <X size={13} />
    </button>
    {onCopyMonSat && (
      <button
        type="button"
        onClick={onCopyMonSat}
        title="Copy across all days for this time slot"
        className="px-1.5 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-300 rounded text-[9px] font-bold flex items-center gap-0.5 transition cursor-pointer shadow-xs whitespace-nowrap"
      >
        ⚡ Copy Mon-Sat
      </button>
    )}
  </div>
);

const selectClass =
  "w-full p-1 bg-white text-slate-900 border border-indigo-500 rounded text-center text-[11px] focus:outline-none shadow-sm";
const linkSelectClass =
  "w-full p-1 bg-white text-slate-700 border border-slate-300 rounded text-[10px] focus:outline-none";

const isCoreSubjectMatch = (teacher, selectedSubject) => {
  if (!selectedSubject || !selectedSubject.trim()) return false;
  const subNorm = selectedSubject.trim().toLowerCase();

  if (Array.isArray(teacher?.coreSubjects)) {
    if (
      teacher.coreSubjects.some(
        (s) => (s || "").toString().trim().toLowerCase() === subNorm,
      )
    ) {
      return true;
    }
  } else if (
    typeof teacher?.coreSubjects === "string" &&
    teacher.coreSubjects.trim()
  ) {
    const parts = teacher.coreSubjects
      .split(",")
      .map((s) => s.trim().toLowerCase());
    if (parts.includes(subNorm)) return true;
  }

  if (
    typeof teacher?.primarySubject === "string" &&
    teacher.primarySubject.trim()
  ) {
    const parts = teacher.primarySubject
      .split(",")
      .map((s) => s.trim().toLowerCase());
    if (parts.includes(subNorm)) return true;
  }

  return false;
};

const CellEditor = ({
  type,
  initialText,
  initialEntry,
  classSubjectOptions, // type === "class": string[] from the class's own courses
  teacherOptions, // type === "class": [{id, label}]
  defaultTeacherId, // type === "class": pre-selected homeroom teacher id
  isAutoLinked, // type === "teacher" && scheduleType === "class"
  autoLinkedClass, // {id, className, section, courses} | null
  linkedClasses, // type === "teacher", period-based: raw class list w/ courses
  onSave,
  onCopyMonSat,
  onCancel,
}) => {
  const [text, setText] = useState(initialText || "");
  const [teacherId, setTeacherId] = useState(
    initialEntry?.teacherId || defaultTeacherId || "",
  );
  const [classId, setClassId] = useState(initialEntry?.classId || "");
  const [span, setSpan] = useState(initialEntry?.span || 1);

  const commit = () => {
    const linkId =
      type === "class"
        ? teacherId
        : isAutoLinked
          ? autoLinkedClass?.id || ""
          : classId;
    onSave(text, linkId || "", span);
  };

  const commitCopyMonSat = () => {
    const linkId =
      type === "class"
        ? teacherId
        : isAutoLinked
          ? autoLinkedClass?.id || ""
          : classId;
    if (onCopyMonSat) {
      onCopyMonSat(text, linkId || "", span);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") onCancel();
  };

  const SpanSelector = (
    <div className="flex items-center justify-between gap-1 text-[9px] font-bold text-slate-500 bg-slate-50 p-1 rounded-lg border border-slate-200 mt-0.5">
      <span>Block Duration:</span>
      <div className="flex gap-0.5">
        {[1, 2, 3].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSpan(s)}
            className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition cursor-pointer ${
              span === s
                ? "bg-indigo-600 text-white shadow-xs"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
            }`}
          >
            {s === 1 ? "1 Slot" : `${s} Slots`}
          </button>
        ))}
      </div>
    </div>
  );

  const processedTeacherOptions = useMemo(() => {
    if (!Array.isArray(teacherOptions) || teacherOptions.length === 0)
      return [];

    const selectedSubject = (text || "").trim();

    return teacherOptions
      .map((t) => {
        const isMatch = isCoreSubjectMatch(t, selectedSubject);
        const nameStr = t.name || t.label || "";
        const displayLabel = isMatch ? `${nameStr} (Core Subject)` : nameStr;
        return {
          ...t,
          isMatch,
          displayLabel,
        };
      })
      .sort((a, b) => {
        if (a.isMatch && !b.isMatch) return -1;
        if (!a.isMatch && b.isMatch) return 1;
        return (a.name || a.label || "").localeCompare(b.name || b.label || "");
      });
  }, [teacherOptions, text]);

  // ---- CLASS view ----
  if (type === "class") {
    const hasCourses =
      Array.isArray(classSubjectOptions) && classSubjectOptions.length > 0;
    return (
      <div className="flex flex-col gap-1 w-full py-0.5">
        {hasCourses ? (
          <select
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            className={selectClass}
          >
            <option value="">-- Unassign / Clear Slot --</option>
            {classSubjectOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Subject"
            className={selectClass}
          />
        )}
        {Array.isArray(processedTeacherOptions) &&
          processedTeacherOptions.length > 0 && (
            <select
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
              className={linkSelectClass}
            >
              <option value="">-- Unassign / Clear Slot --</option>
              {processedTeacherOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.displayLabel}
                </option>
              ))}
            </select>
          )}
        {SpanSelector}
        <EditorActions
          onSave={commit}
          onCancel={onCancel}
          onCopyMonSat={commitCopyMonSat}
        />
      </div>
    );
  }

  // ---- TEACHER view, class-based (auto-linked) ----
  if (isAutoLinked) {
    const opts = autoLinkedClass?.courses || [];
    return (
      <div className="flex flex-col gap-1 w-full py-0.5">
        {opts.length > 0 ? (
          <select
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            className={selectClass}
          >
            <option value="">-- Unassign / Clear Slot --</option>
            {opts.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Subject"
            className={selectClass}
          />
        )}
        <span className="text-[9px] text-indigo-500 font-bold truncate text-center">
          {autoLinkedClass
            ? `Auto-linked to ${autoLinkedClass.className}${
                autoLinkedClass.section ? ` ${autoLinkedClass.section}` : ""
              }`
            : "No class assigned yet — assign this teacher to a class first"}
        </span>
        {SpanSelector}
        <EditorActions
          onSave={commit}
          onCancel={onCancel}
          onCopyMonSat={commitCopyMonSat}
        />
      </div>
    );
  }

  // ---- TEACHER view, period-based ----
  const selectedClass = classId
    ? (linkedClasses || []).find((c) => c.id === classId)
    : null;
  const hasClassOptions =
    Array.isArray(linkedClasses) && linkedClasses.length > 0;
  const subjectOptions = selectedClass?.courses || [];

  return (
    <div className="flex flex-col gap-1 w-full py-0.5">
      {hasClassOptions && (
        <select
          autoFocus
          value={classId}
          onChange={(e) => {
            setClassId(e.target.value);
            if (!e.target.value) setText("");
          }}
          className={linkSelectClass}
        >
          <option value="">-- Unassign / Clear Slot --</option>
          {linkedClasses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.className}
              {c.section ? ` ${c.section}` : ""}
            </option>
          ))}
        </select>
      )}
      {selectedClass && subjectOptions.length > 0 ? (
        <select
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          className={selectClass}
        >
          <option value="">-- Unassign / Clear Slot --</option>
          {subjectOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={hasClassOptions ? "Subject / note" : "Subject"}
          className={selectClass}
        />
      )}
      {SpanSelector}
      <EditorActions
        onSave={commit}
        onCancel={onCancel}
        onCopyMonSat={commitCopyMonSat}
      />
    </div>
  );
};

const TimetableGrid = ({
  currentId,
  type,
  readOnly = false,

  linkedClasses = null,
  linkedTeachers = null,
}) => {
  const collectionName = type === "teacher" ? "teachers" : "classes";
  const [notFound, setNotFound] = useState(false);

  // State arrays connected natively to database document
  const [days, setDays] = useState([
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
  ]);
  const [timeSlots, setTimeSlots] = useState([
    "08:30 - 09:45",
    "09:45 - 11:00",
    "11:00 - 11:15",
    "11:15 - 12:30",
    "12:30 - 13:45",
  ]);
  const [localSchedule, setLocalSchedule] = useState([]);
  const [loading, setLoading] = useState(true);

  const [entityData, setEntityData] = useState(null);

  const [isEditingStructure, setIsEditingStructure] = useState(false);
  const [editingCell, setEditingCell] = useState(null);

  useEffect(() => {
    if (!currentId) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    const docRef = doc(db, collectionName, currentId);

    const unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        if (docSnap.exists()) {
          setNotFound(false);
          const data = docSnap.data();
          setEntityData(data);

          if (data.timetableDays) setDays(data.timetableDays);
          if (data.timetableSlots) setTimeSlots(data.timetableSlots);
          if (data.timetableMatrix) setLocalSchedule(data.timetableMatrix);
        } else {
          setNotFound(true);
        }
        setLoading(false);
      },
      (error) => {
        console.error("Firestore connection failed: ", error);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [currentId, collectionName]);

  // ---- Relationship helpers ----
  const schoolId = entityData?.schoolId || null;

  const isTeacherAutoLinked =
    type === "teacher" && entityData?.scheduleType === "class";

  const checkTeacherGlobalConflict = async (
    teacherId,
    teacherName,
    day,
    time,
    targetClassId,
  ) => {
    if ((!teacherId && !teacherName) || !day || !time) return null;

    try {
      let classesQuery;
      if (schoolId) {
        classesQuery = query(
          collection(db, "classes"),
          where("schoolId", "==", schoolId),
        );
      } else {
        classesQuery = query(collection(db, "classes"));
      }

      const querySnapshot = await getDocs(classesQuery);

      for (const classDoc of querySnapshot.docs) {
        if (targetClassId && classDoc.id === targetClassId) continue;
        if (type === "class" && classDoc.id === currentId) continue;

        const classData = classDoc.data();
        const matrix = Array.isArray(classData.timetableMatrix)
          ? classData.timetableMatrix
          : [];

        const conflictingEntry = matrix.find(
          (entry) =>
            entry.day === day &&
            entry.time === time &&
            ((teacherId && entry.teacherId === teacherId) ||
              (teacherName && entry.teacherName === teacherName)),
        );

        if (conflictingEntry) {
          const otherClassName = `${classData.className || "another class"}${
            classData.section ? ` ${classData.section}` : ""
          }`;
          return {
            otherClassName,
            teacherName:
              conflictingEntry.teacherName || teacherName || "Selected teacher",
            timeSlot: time,
            day,
          };
        }
      }
      return null;
    } catch (err) {
      console.error("Conflict checking error:", err);
      return null;
    }
  };

  const autoLinkedClass = useMemo(() => {
    if (
      !isTeacherAutoLinked ||
      !Array.isArray(linkedClasses) ||
      !entityData?.name
    ) {
      return null;
    }
    return (
      linkedClasses.find(
        (c) =>
          Array.isArray(c.teachers) && c.teachers.includes(entityData.name),
      ) || null
    );
  }, [isTeacherAutoLinked, linkedClasses, entityData?.name]);

  const defaultTeacherId = useMemo(() => {
    if (type !== "class" || !Array.isArray(linkedTeachers)) return "";
    const homeroomName = entityData?.teachers?.[0];
    if (!homeroomName) return "";
    return linkedTeachers.find((t) => t.name === homeroomName)?.id || "";
  }, [type, linkedTeachers, entityData?.teachers]);

  const getSlotEntry = (time, day) =>
    localSchedule.find((s) => s.time === time && s.day === day) || null;

  // ---- Firestore writes ----
  const saveToFirebase = async (newDays, newSlots, newSchedule) => {
    if (!currentId) return false;

    try {
      const batch = writeBatch(db);

      const currentRef = doc(db, collectionName, currentId);

      batch.update(currentRef, {
        timetableDays: newDays,
        timetableSlots: newSlots,
        timetableMatrix: newSchedule,
      });

      await batch.commit();

      return true;
    } catch (err) {
      console.error("Error committing timetable update:", err);
      return false;
    }
  };

  const handleTimeSlotChange = (index, newValue) => {
    const oldTime = timeSlots[index];
    const newSlots = [...timeSlots];
    newSlots[index] = newValue;

    const newSchedule = localSchedule.map((s) => {
      if (s.time === oldTime) {
        return { ...s, time: newValue };
      }
      return s;
    });

    setTimeSlots(newSlots);
    setLocalSchedule(newSchedule);
    saveToFirebase(days, newSlots, newSchedule);
  };

  const handleResetDefaultSlots = () => {
    if (
      window.confirm(
        "Reset timetable rows to default 40-minute period schedule?",
      )
    ) {
      const defaultSlots = [
        "08:00 - 08:40",
        "08:40 - 09:20",
        "09:20 - 10:00",
        "10:00 - 10:40",
        "10:40 - 11:00",
        "11:00 - 11:40",
        "11:40 - 12:20",
        "12:20 - 01:00",
      ];
      setTimeSlots(defaultSlots);
      saveToFirebase(days, defaultSlots, localSchedule);
    }
  };

  const handleAddRow = () => {
    const updated = [...timeSlots, "00:00 - 00:00"];
    setTimeSlots(updated);
    saveToFirebase(days, updated, localSchedule);
  };

  const handleRemoveRow = (index) => {
    const updated = timeSlots.filter((_, i) => i !== index);
    setTimeSlots(updated);
    saveToFirebase(days, updated, localSchedule);
  };

  const handleAddColumn = () => {
    const newDay = prompt("Enter Day Name (e.g., Saturday):");
    if (newDay) {
      const updated = [...days, newDay];
      setDays(updated);
      saveToFirebase(updated, timeSlots, localSchedule);
    }
  };

  const handleRemoveColumn = (dayToRemove) => {
    const updated = days.filter((d) => d !== dayToRemove);
    setDays(updated);
    saveToFirebase(updated, timeSlots, localSchedule);
  };

  const checkClassPeriodConflict = async (classId, day, time, teacherId) => {
    if (!classId || !day || !time) return null;

    try {
      const classRef = doc(db, "classes", classId);
      const classSnap = await getDoc(classRef);

      if (!classSnap.exists()) return null;

      const classData = classSnap.data();

      const existingMatrix = Array.isArray(classData.timetableMatrix)
        ? classData.timetableMatrix
        : [];

      const existingEntry = existingMatrix.find(
        (entry) => entry.day === day && entry.time === time,
      );

      // Empty period = no conflict
      if (!existingEntry) return null;

      // If editing the same teacher's existing period,
      // don't treat it as a conflict.
      if (
        teacherId &&
        existingEntry.teacherId &&
        existingEntry.teacherId === teacherId
      ) {
        return null;
      }

      return existingEntry.teacherName || "another teacher";
    } catch (err) {
      console.error("Error checking class period conflict:", err);

      // Returning a special error lets us stop the save
      // instead of risking an overwrite.
      throw new Error("Unable to verify this period. Please try again.");
    }
  };
  const handleCellSave = async (time, day, text, linkId, span = 1) => {
    const trimmed = (text || "").trim();
    const oldEntry = getSlotEntry(time, day);

    let classRef = null;
    let teacherRef = null;

    // ---------------------------------------------------------
    // BUILD RELATIONSHIP
    // ---------------------------------------------------------

    if (type === "teacher") {
      teacherRef = {
        id: currentId,
        name: entityData?.name || null,
      };

      if (isTeacherAutoLinked) {
        if (autoLinkedClass) {
          classRef = {
            id: autoLinkedClass.id,
            className: autoLinkedClass.className,
            section: autoLinkedClass.section || null,
          };
        }
      } else if (linkId) {
        const c = (linkedClasses || []).find((c) => c.id === linkId);

        if (c) {
          classRef = {
            id: c.id,
            className: c.className,
            section: c.section || null,
          };
        }
      }
    } else if (type === "class") {
      classRef = {
        id: currentId,
        className: entityData?.className || null,
        section: entityData?.section || null,
      };

      if (linkId) {
        const t = (linkedTeachers || []).find((t) => t.id === linkId);

        if (t) {
          teacherRef = {
            id: t.id,
            name: t.name,
          };
        }
      }
    }

    // ---------------------------------------------------------
    // #2 CONFLICT CHECK
    // ---------------------------------------------------------

    if (trimmed !== "" && (teacherRef?.id || teacherRef?.name)) {
      try {
        const conflict = await checkTeacherGlobalConflict(
          teacherRef.id,
          teacherRef.name,
          day,
          time,
          classRef?.id,
        );

        if (conflict) {
          alert(
            `Teacher ${conflict.teacherName} is already teaching in ${conflict.otherClassName} at ${conflict.timeSlot}!`,
          );
          return;
        }

        if (classRef?.id) {
          const conflictClass = await checkClassPeriodConflict(
            classRef.id,
            day,
            time,
            teacherRef.id,
          );

          if (conflictClass) {
            alert(`This period is already assigned to ${conflictClass}.`);
            return;
          }
        }
      } catch (err) {
        alert(err.message);
        return;
      }
    }

    // ---------------------------------------------------------
    // BUILD NEW ENTRY
    // ---------------------------------------------------------

    const isRelational = Boolean(classRef || teacherRef);

    const newEntry =
      trimmed === ""
        ? null
        : {
            day,
            time,
            label: trimmed,
            span: Number(span) || 1,

            ...(isRelational
              ? {
                  subject: trimmed,
                  schoolId,

                  classId: classRef?.id || null,
                  className: classRef?.className || null,
                  section: classRef?.section || null,

                  teacherId: teacherRef?.id || null,
                  teacherName: teacherRef?.name || null,
                }
              : {}),
          };

    // ---------------------------------------------------------
    // BUILD CURRENT DOCUMENT MATRIX
    // ---------------------------------------------------------

    const cleanedCurrent = localSchedule.filter(
      (s) => !(s.time === time && s.day === day),
    );

    const updatedCurrentSchedule = newEntry
      ? [...cleanedCurrent, newEntry]
      : cleanedCurrent;

    // ---------------------------------------------------------
    // DETERMINE COUNTERPART
    // ---------------------------------------------------------

    let counterpartCollection = null;
    let counterpartId = null;
    let oldCounterpartId = null;

    if (type === "teacher") {
      counterpartCollection = "classes";

      counterpartId = classRef?.id || null;
      oldCounterpartId = oldEntry?.classId || null;
    } else if (type === "class") {
      counterpartCollection = "teachers";

      counterpartId = teacherRef?.id || null;
      oldCounterpartId = oldEntry?.teacherId || null;
    }

    // ---------------------------------------------------------
    // READ COUNTERPART DOCUMENTS BEFORE WRITING
    // ---------------------------------------------------------

    try {
      const batch = writeBatch(db);

      const currentRef = doc(db, collectionName, currentId);

      // Current document update
      batch.update(currentRef, {
        timetableDays: days,
        timetableSlots: timeSlots,
        timetableMatrix: updatedCurrentSchedule,
      });

      // -------------------------------------------------------
      // OLD RELATIONSHIP CLEANUP
      // -------------------------------------------------------

      if (oldCounterpartId && oldCounterpartId !== counterpartId) {
        const oldRef = doc(db, counterpartCollection, oldCounterpartId);

        const oldSnap = await getDoc(oldRef);

        if (oldSnap.exists()) {
          const oldData = oldSnap.data();

          const oldMatrix = Array.isArray(oldData.timetableMatrix)
            ? oldData.timetableMatrix
            : [];

          const cleanedOldMatrix = oldMatrix.filter(
            (s) => !(s.time === time && s.day === day),
          );

          batch.update(oldRef, {
            timetableMatrix: cleanedOldMatrix,
          });
        }
      }

      // -------------------------------------------------------
      // NEW RELATIONSHIP UPDATE
      // -------------------------------------------------------

      if (counterpartId) {
        const counterpartRef = doc(db, counterpartCollection, counterpartId);

        const counterpartSnap = await getDoc(counterpartRef);

        if (counterpartSnap.exists()) {
          const counterpartData = counterpartSnap.data();

          const existingMatrix = Array.isArray(counterpartData.timetableMatrix)
            ? counterpartData.timetableMatrix
            : [];

          const cleanedCounterpartMatrix = existingMatrix.filter(
            (s) => !(s.time === time && s.day === day),
          );

          const updatedCounterpartMatrix = newEntry
            ? [...cleanedCounterpartMatrix, newEntry]
            : cleanedCounterpartMatrix;

          batch.update(counterpartRef, {
            timetableMatrix: updatedCounterpartMatrix,
          });
        }
      }

      await batch.commit();

      setLocalSchedule(updatedCurrentSchedule);

      setEditingCell(null);
    } catch (err) {
      console.error("Error committing timetable changes:", err);

      alert("Timetable could not be saved. No changes were applied.");
    }
  };

  const handleCellSaveAllDays = async (time, text, linkId, span = 1) => {
    const trimmed = (text || "").trim();

    let classRef = null;
    let teacherRef = null;

    if (type === "teacher") {
      teacherRef = {
        id: currentId,
        name: entityData?.name || null,
      };

      if (isTeacherAutoLinked) {
        if (autoLinkedClass) {
          classRef = {
            id: autoLinkedClass.id,
            className: autoLinkedClass.className,
            section: autoLinkedClass.section || null,
          };
        }
      } else if (linkId) {
        const c = (linkedClasses || []).find((c) => c.id === linkId);

        if (c) {
          classRef = {
            id: c.id,
            className: c.className,
            section: c.section || null,
          };
        }
      }
    } else if (type === "class") {
      classRef = {
        id: currentId,
        className: entityData?.className || null,
        section: entityData?.section || null,
      };

      if (linkId) {
        const t = (linkedTeachers || []).find((t) => t.id === linkId);

        if (t) {
          teacherRef = {
            id: t.id,
            name: t.name,
          };
        }
      }
    }

    if (trimmed !== "" && (teacherRef?.id || teacherRef?.name)) {
      try {
        for (const d of days) {
          const conflict = await checkTeacherGlobalConflict(
            teacherRef.id,
            teacherRef.name,
            d,
            time,
            classRef?.id,
          );

          if (conflict) {
            alert(
              `Teacher ${conflict.teacherName} is already teaching in ${conflict.otherClassName} on ${d} at ${conflict.timeSlot}!`,
            );
            return;
          }

          if (classRef?.id) {
            const conflictClass = await checkClassPeriodConflict(
              classRef.id,
              d,
              time,
              teacherRef.id,
            );

            if (conflictClass) {
              alert(
                `This period on ${d} is already assigned to ${conflictClass}.`,
              );
              return;
            }
          }
        }
      } catch (err) {
        alert(err.message);
        return;
      }
    }

    const isRelational = Boolean(classRef || teacherRef);

    const newEntries =
      trimmed === ""
        ? []
        : days.map((day) => ({
            day,
            time,
            label: trimmed,
            span: Number(span) || 1,
            ...(isRelational
              ? {
                  subject: trimmed,
                  schoolId,
                  classId: classRef?.id || null,
                  className: classRef?.className || null,
                  section: classRef?.section || null,
                  teacherId: teacherRef?.id || null,
                  teacherName: teacherRef?.name || null,
                }
              : {}),
          }));

    const cleanedCurrent = localSchedule.filter(
      (s) => !(s.time === time && days.includes(s.day)),
    );

    const updatedCurrentSchedule = [...cleanedCurrent, ...newEntries];

    let counterpartCollection = null;
    let counterpartId = null;

    if (type === "teacher") {
      counterpartCollection = "classes";
      counterpartId = classRef?.id || null;
    } else if (type === "class") {
      counterpartCollection = "teachers";
      counterpartId = teacherRef?.id || null;
    }

    try {
      const batch = writeBatch(db);
      const currentRef = doc(db, collectionName, currentId);

      batch.update(currentRef, {
        timetableDays: days,
        timetableSlots: timeSlots,
        timetableMatrix: updatedCurrentSchedule,
      });

      const oldEntriesForTime = localSchedule.filter(
        (s) => s.time === time && days.includes(s.day),
      );
      const oldCounterpartIds = new Set(
        oldEntriesForTime
          .map((e) => (type === "teacher" ? e.classId : e.teacherId))
          .filter(Boolean),
      );

      for (const oldId of oldCounterpartIds) {
        if (oldId !== counterpartId) {
          const oldRef = doc(db, counterpartCollection, oldId);
          const oldSnap = await getDoc(oldRef);

          if (oldSnap.exists()) {
            const oldMatrix = Array.isArray(oldSnap.data().timetableMatrix)
              ? oldSnap.data().timetableMatrix
              : [];
            const cleanedOldMatrix = oldMatrix.filter(
              (s) => !(s.time === time && days.includes(s.day)),
            );

            batch.update(oldRef, {
              timetableMatrix: cleanedOldMatrix,
            });
          }
        }
      }

      if (counterpartId) {
        const counterpartRef = doc(db, counterpartCollection, counterpartId);
        const counterpartSnap = await getDoc(counterpartRef);

        if (counterpartSnap.exists()) {
          const counterpartData = counterpartSnap.data();
          const existingMatrix = Array.isArray(counterpartData.timetableMatrix)
            ? counterpartData.timetableMatrix
            : [];

          const cleanedCounterpartMatrix = existingMatrix.filter(
            (s) => !(s.time === time && days.includes(s.day)),
          );

          const updatedCounterpartMatrix = [
            ...cleanedCounterpartMatrix,
            ...newEntries,
          ];

          batch.update(counterpartRef, {
            timetableMatrix: updatedCounterpartMatrix,
          });
        }
      }

      await batch.commit();

      setLocalSchedule(updatedCurrentSchedule);
      setEditingCell(null);
    } catch (err) {
      console.error("Error saving timetable slot across all days:", err);
      alert("Timetable could not be saved. No changes were applied.");
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-xs font-mono text-slate-500 italic bg-white rounded-2xl border border-slate-200 shadow-sm animate-pulse">
        <Loader /> Reading Class Layout Maps from Database Matrix...
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="text-center py-12 text-xs text-slate-400 italic bg-white rounded-2xl border border-dashed border-slate-200">
        No timetable available — this {type === "teacher" ? "teacher" : "class"}{" "}
        record could not be found.
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xl w-full text-xs text-slate-800 space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
        <div>
          <h4 className="font-bold text-sm text-slate-900">
            Interactive Timetable Layout
          </h4>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Configure intervals or select empty slots to assign topics.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {readOnly ? (
            <span className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-slate-100 text-slate-500">
              View Only
            </span>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setIsEditingStructure(!isEditingStructure)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition cursor-pointer shadow-sm ${
                  isEditingStructure
                    ? "bg-amber-600 text-white"
                    : "bg-white hover:bg-slate-100 text-slate-700 border border-slate-300"
                }`}
              >
                {isEditingStructure ? (
                  <span className="flex items-center gap-2">
                    <Save size={16} /> Lock Structure
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <SquarePen size={16} /> Edit Structure & Rows
                  </span>
                )}
              </button>
              {isEditingStructure && (
                <>
                  <button
                    type="button"
                    onClick={handleAddRow}
                    className="px-2.5 py-1.5 bg-indigo-600 text-white rounded-lg text-[11px] font-bold hover:bg-indigo-700 cursor-pointer shadow-sm"
                  >
                    + Add Time Row
                  </button>
                  <button
                    type="button"
                    onClick={handleAddColumn}
                    className="px-2.5 py-1.5 bg-emerald-600 text-white rounded-lg text-[11px] font-bold hover:bg-emerald-700 cursor-pointer shadow-sm"
                  >
                    + Add Day Col
                  </button>
                  <button
                    type="button"
                    onClick={handleResetDefaultSlots}
                    title="Reset rows to default 40-minute period schedule"
                    className="px-2.5 py-1.5 bg-amber-600 text-white rounded-lg text-[11px] font-bold hover:bg-amber-700 cursor-pointer shadow-sm"
                  >
                    ↺ Reset Default Time Slots
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-sm">
        <table className="w-full min-w-187.5 border-collapse text-center">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-200">
              <th className="p-3 w-40 text-slate-600 font-bold border-r border-slate-200">
                Time Interval Range
              </th>
              {days.map((day) => (
                <th
                  key={day}
                  className="p-3 font-bold border-r border-slate-200 last:border-r-0 relative text-slate-800 min-w-36"
                >
                  <span>{day}</span>
                  {isEditingStructure && (
                    <button
                      onClick={() => handleRemoveColumn(day)}
                      className="absolute top-1/2 -translate-y-1/2 right-2 w-4 h-4 rounded-full bg-rose-400 text-white text-[9px] flex items-center justify-center p-0.5 cursor-pointer hover:bg-rose-600 transition-all"
                    >
                      <X />
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {timeSlots.map((time, timeIdx) => {
              const isGlobalBreak =
                time.toLowerCase().includes("break") ||
                time.toLowerCase().includes("lunch");
              return (
                <tr key={timeIdx} className="hover:bg-slate-50 transition">
                  <td className="p-3 border-r border-slate-200 bg-slate-50/50 font-mono text-slate-700">
                    {isEditingStructure ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={time}
                          onChange={(e) =>
                            handleTimeSlotChange(timeIdx, e.target.value)
                          }
                          className="w-full bg-white text-slate-900 border border-slate-300 rounded px-2 py-1 text-center text-[11px] focus:outline-none focus:border-indigo-500 shadow-sm"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveRow(timeIdx)}
                          title="Remove row"
                          className="text-rose-400 hover:text-rose-600 text-xs font-bold px-1 cursor-pointer transition-all"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <span className="font-semibold">{time}</span>
                    )}
                  </td>
                  {days.map((day) => {
                    // Check if this cell is covered by an earlier rowSpan clip
                    let isCovered = false;
                    for (let prevIdx = 0; prevIdx < timeIdx; prevIdx++) {
                      const prevTime = timeSlots[prevIdx];
                      const prevEntry = getSlotEntry(prevTime, day);
                      const prevSpan = Number(prevEntry?.span) || 1;
                      if (prevIdx + prevSpan > timeIdx) {
                        isCovered = true;
                        break;
                      }
                    }
                    if (isCovered) return null;

                    const entry = getSlotEntry(time, day);
                    const value = entry?.label || "";
                    const span = Number(entry?.span) || 1;
                    const isCellEditing =
                      editingCell?.time === time && editingCell?.day === day;

                    return (
                      <td
                        key={day}
                        rowSpan={
                          span > 1
                            ? Math.min(span, timeSlots.length - timeIdx)
                            : undefined
                        }
                        className={`p-2 border-r border-slate-200 last:border-r-0 font-medium text-[11px] transition select-none align-middle ${
                          isGlobalBreak
                            ? "bg-slate-100 text-slate-500 tracking-widest font-bold"
                            : value
                              ? "bg-indigo-50/90 text-indigo-700 font-bold border-l-2 border-l-indigo-500"
                              : "text-slate-600 hover:bg-slate-100 cursor-pointer"
                        }`}
                        onClick={() =>
                          !readOnly &&
                          !isGlobalBreak &&
                          !isCellEditing &&
                          setEditingCell({ time, day })
                        }
                      >
                        {isCellEditing ? (
                          <CellEditor
                            type={type}
                            initialText={value}
                            initialEntry={entry}
                            classSubjectOptions={
                              type === "class"
                                ? entityData?.courses || []
                                : null
                            }
                            teacherOptions={
                              type === "class" && Array.isArray(linkedTeachers)
                                ? linkedTeachers.map((t) => ({
                                    id: t.id,
                                    name: t.name,
                                    label: t.name,
                                    primarySubject: t.primarySubject,
                                    coreSubjects: t.coreSubjects,
                                  }))
                                : null
                            }
                            defaultTeacherId={defaultTeacherId}
                            isAutoLinked={isTeacherAutoLinked}
                            autoLinkedClass={autoLinkedClass}
                            linkedClasses={
                              type === "teacher" ? linkedClasses : null
                            }
                            onSave={(text, linkId, span) =>
                              handleCellSave(time, day, text, linkId, span)
                            }
                            onCopyMonSat={(text, linkId, span) =>
                              handleCellSaveAllDays(time, text, linkId, span)
                            }
                            onCancel={() => setEditingCell(null)}
                          />
                        ) : isGlobalBreak ? (
                          <span>BREAK / LUNCH</span>
                        ) : value ? (
                          <div className="flex flex-col items-center leading-tight py-1 gap-0.5">
                            <span className="font-extrabold text-xs">
                              {value}
                            </span>
                            {type === "teacher" && entry?.className && (
                              <span className="text-[9px] text-indigo-500 font-semibold truncate max-w-full">
                                {entry.className}
                                {entry.section ? ` ${entry.section}` : ""}
                              </span>
                            )}
                            {type === "class" && entry?.teacherName && (
                              <span className="text-[9px] text-indigo-500 font-semibold truncate max-w-full">
                                {entry.teacherName}
                              </span>
                            )}
                            {span > 1 && (
                              <span className="text-[9px] bg-indigo-100 text-indigo-700 font-extrabold px-1.5 py-0.5 rounded-full mt-1">
                                ⚡ {span * 40}m Block ({span} Periods)
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 font-normal block w-full py-1">
                            {readOnly ? "—" : "+ Add"}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TimetableGrid;
