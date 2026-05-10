import { db } from "../firebaseConfig";
import { collection, getDocs, doc, setDoc } from "firebase/firestore";

// Change the name from getHistory to fetchHistory
export const fetchHistory = async () => {
  try {
    const querySnapshot = await getDocs(collection(db, "history"));
    const history = {};

    querySnapshot.forEach((document) => {
      const data = document.data();
      const { week, task, person, done } = data;
      
      if (!history[week]) history[week] = {};
      history[week][task] = { person, done: !!done };
    });

    // Note: We return { data: history } because your HomePage uses .then((res) => res.data)
    return { data: history };
  } catch (error) {
    console.error("Error fetching history:", error);
    throw error;
  }
};

// Also rename saveHistory to saveTask to match your HomePage
export const saveTask = async ({ week, task, person, done }) => {
  try {
    const docId = `${week}_${task}`;
    const docRef = doc(db, "history", docId);

    await setDoc(docRef, {
      week: parseInt(week),
      task: task,
      person: person,
      done: done ? 1 : 0
    }, { merge: true });

    return { success: true };
  } catch (error) {
    console.error("Error saving task:", error);
    throw error;
  }
};