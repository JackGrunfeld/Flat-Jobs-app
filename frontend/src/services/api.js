import { db } from "../firebaseConfig";
import { collection, getDocs, doc, setDoc, addDoc, deleteDoc, updateDoc } from "firebase/firestore";

export const fetchHistory = async (flatId) => {
  try {
    const querySnapshot = await getDocs(collection(db, "flats", flatId, "history"));
    const history = {};
    querySnapshot.forEach((document) => {
      const { week, task, person, done } = document.data();
      if (!history[week]) history[week] = {};
      history[week][task] = { person, done: !!done };
    });
    return { data: history };
  } catch (error) {
    console.error("Error fetching history:", error);
    throw error;
  }
};

export const saveTask = async ({ flatId, week, task, person, done }) => {
  try {
    const docRef = doc(db, "flats", flatId, "history", `${week}_${task}`);
    await setDoc(docRef, {
      week: parseInt(week),
      task,
      person,
      done: done ? 1 : 0,
    }, { merge: true });
    return { success: true };
  } catch (error) {
    console.error("Error saving task:", error);
    throw error;
  }
};

export const fetchChores = async (flatId) => {
  const snap = await getDocs(collection(db, "flats", flatId, "chores"));
  const chores = [];
  snap.forEach(d => chores.push({ id: d.id, ...d.data() }));
  return chores.sort((a, b) => {
    // Handle both JS timestamps (number) and Firestore Timestamp objects
    const ta = typeof a.createdAt === "number" ? a.createdAt : (a.createdAt?.toMillis?.() || 0);
    const tb = typeof b.createdAt === "number" ? b.createdAt : (b.createdAt?.toMillis?.() || 0);
    return ta - tb || (a.id < b.id ? -1 : 1);
  });
};

export const addChore = async (flatId, { name, description, frequency, memberIds }) => {
  const createdAt = Date.now();
  const ref = await addDoc(collection(db, "flats", flatId, "chores"), { name, description, frequency, memberIds, createdAt });
  return { id: ref.id, name, description, frequency, memberIds, createdAt };
};

export const deleteChore = async (flatId, choreId) => {
  await deleteDoc(doc(db, "flats", flatId, "chores", choreId));
};

export const updateChore = async (flatId, choreId, updates) => {
  await updateDoc(doc(db, "flats", flatId, "chores", choreId), updates);
};

export const fetchShoppingItems = async (flatId) => {
  const querySnapshot = await getDocs(collection(db, "flats", flatId, "shopping_items"));
  const items = [];
  querySnapshot.forEach(d => items.push({ id: d.id, ...d.data() }));
  return items.sort((a, b) => b.createdAt - a.createdAt);
};

export const addShoppingItem = async (flatId, { name, cost, addedBy, splitWith }) => {
  const createdAt = Date.now();
  const docRef = await addDoc(collection(db, "flats", flatId, "shopping_items"), { name, cost, addedBy, splitWith, createdAt });
  return { id: docRef.id, name, cost, addedBy, splitWith, createdAt };
};

export const deleteShoppingItem = async (flatId, id) => {
  await deleteDoc(doc(db, "flats", flatId, "shopping_items", id));
};
