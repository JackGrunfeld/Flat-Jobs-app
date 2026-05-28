import { db } from "../firebaseConfig";
import emailjs from "@emailjs/browser";
import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  getDocs,
  query,
  where,
  arrayUnion,
  arrayRemove,
  deleteField,
  serverTimestamp,
} from "firebase/firestore";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // omits 0/O, 1/I/L

function generateCode() {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

async function uniqueCode() {
  for (let i = 0; i < 10; i++) {
    const code = generateCode();
    const snap = await getDocs(query(collection(db, "flats"), where("code", "==", code)));
    if (snap.empty) return code;
  }
  throw new Error("Could not generate a unique code. Try again.");
}

export const createFlat = async ({ uid, flatName, userEmail, userName }) => {
  console.log("[Flat] createFlat — start");
  const code = await uniqueCode();
  const flatRef = doc(collection(db, "flats"));

  await setDoc(flatRef, {
    name: flatName,
    code,
    ownerId: uid,
    memberIds: [uid],
    memberNames: { [uid]: userName },
    invitedEmails: [],
    createdAt: serverTimestamp(),
  });

  await setDoc(doc(db, "users", uid), {
    displayName: userName,
    email: userEmail.toLowerCase(),
    flatId: flatRef.id,
    createdAt: serverTimestamp(),
  }, { merge: true });

  console.log("[Flat] createFlat — success");
  return { id: flatRef.id, name: flatName, code, memberIds: [uid], memberNames: { [uid]: userName }, invitedEmails: [] };
};

export const joinFlatByCode = async ({ uid, code, userEmail, userName }) => {
  console.log("[Flat] joinFlatByCode — start");
  const snap = await getDocs(
    query(collection(db, "flats"), where("code", "==", code.toUpperCase().trim()))
  );
  if (snap.empty) {
    console.warn("[Flat] joinFlatByCode — no flat found");
    throw new Error("No flat found with that code. Check and try again.");
  }

  const flatDoc = snap.docs[0];
  console.log("[Flat] joinFlatByCode — flat found");

  await updateDoc(flatDoc.ref, {
    memberIds: arrayUnion(uid),
    [`memberNames.${uid}`]: userName,
    invitedEmails: arrayRemove(userEmail.toLowerCase()),
  });

  await setDoc(doc(db, "users", uid), {
    displayName: userName,
    email: userEmail.toLowerCase(),
    flatId: flatDoc.id,
  }, { merge: true });

  console.log("[Flat] joinFlatByCode — success");
  return flatDoc.id;
};

export const getUserFlat = async (uid) => {
  console.log("[Flat] getUserFlat — start");
  const userSnap = await getDoc(doc(db, "users", uid));
  if (!userSnap.exists()) {
    console.log("[Flat] getUserFlat — no user doc found");
    return null;
  }
  const { flatId } = userSnap.data() || {};
  if (!flatId) {
    console.log("[Flat] getUserFlat — user has no flat");
    return null;
  }

  const flatSnap = await getDoc(doc(db, "flats", flatId));
  if (!flatSnap.exists()) {
    console.warn("[Flat] getUserFlat — flat doc not found");
    return null;
  }
  const flatData = flatSnap.data();
  console.log("[Flat] getUserFlat — loaded flat, members:", flatData.memberIds?.length ?? 0);

  // Heal any members whose names are missing from the flat document.
  const memberIds = flatData.memberIds || [];
  const existingNames = flatData.memberNames || {};
  const nameless = memberIds.filter(id => !existingNames[id]);

  if (nameless.length === 0) {
    return { id: flatId, ...flatData };
  }

  console.log("[Flat] getUserFlat — backfilling names for", nameless.length, "member(s)");
  const userDocs = await Promise.all(nameless.map(id => getDoc(doc(db, "users", id))));
  const updates = {};
  const mergedNames = { ...existingNames };

  userDocs.forEach((snap, i) => {
    if (snap.exists()) {
      const { displayName } = snap.data();
      if (displayName) {
        updates[`memberNames.${nameless[i]}`] = displayName;
        mergedNames[nameless[i]] = displayName;
      } else {
        console.warn("[Flat] getUserFlat — member has no displayName");
      }
    } else {
      console.warn("[Flat] getUserFlat — no user doc for member");
    }
  });

  if (Object.keys(updates).length > 0) {
    console.log("[Flat] getUserFlat — writing", Object.keys(updates).length, "backfilled name(s)");
    await updateDoc(flatSnap.ref, updates);
  }

  return { id: flatId, ...flatData, memberNames: mergedNames };
};

export const backfillMemberName = async (uid, userName) => {
  console.log("[Flat] backfillMemberName — start");
  if (!uid || !userName) return null;
  const snap = await getDocs(
    query(collection(db, "flats"), where("memberIds", "array-contains", uid))
  );
  if (snap.empty) {
    console.log("[Flat] backfillMemberName — not in any flat yet");
    return null;
  }
  const flatDoc = snap.docs[0];
  console.log("[Flat] backfillMemberName — flat found, writing name");
  await updateDoc(flatDoc.ref, { [`memberNames.${uid}`]: userName });
  await setDoc(doc(db, "users", uid), { displayName: userName }, { merge: true });
  return flatDoc.id;
};

export const inviteByEmail = async (flatId, email, { flatName, flatCode, inviterName } = {}) => {
  const normalised = email.toLowerCase().trim();
  console.log("[Flat] inviteByEmail — start");

  await updateDoc(doc(db, "flats", flatId), {
    invitedEmails: arrayUnion(normalised),
  });

  if (flatName && flatCode) {
    try {
      await emailjs.send(
        process.env.REACT_APP_EMAILJS_SERVICE_ID,
        process.env.REACT_APP_EMAILJS_TEMPLATE_ID,
        {
          to_email: normalised,
          flat_name: flatName,
          flat_code: flatCode,
          from_name: inviterName || "Your flatmate",
        },
        process.env.REACT_APP_EMAILJS_PUBLIC_KEY,
      );
      console.log("[Flat] inviteByEmail — EmailJS sent");
    } catch (err) {
      console.error("[Flat] inviteByEmail — EmailJS failed:", err?.text || err?.status || JSON.stringify(err));
    }
  } else {
    console.log("[Flat] inviteByEmail — no EmailJS params provided, skipped email send");
  }
};

export const leaveFlat = async (flatId, uid) => {
  console.log("[Flat] leaveFlat — start");
  await updateDoc(doc(db, "flats", flatId), {
    memberIds: arrayRemove(uid),
    [`memberNames.${uid}`]: deleteField(),
    [`memberColors.${uid}`]: deleteField(),
  });
  await updateDoc(doc(db, "users", uid), { flatId: deleteField() });
  console.log("[Flat] leaveFlat — done");
};

export const updateFlatName = async (flatId, name) => {
  console.log("[Flat] updateFlatName — start");
  await updateDoc(doc(db, "flats", flatId), { name });
};

export const updateMemberColor = async (flatId, uid, color) => {
  console.log("[Flat] updateMemberColor — color:", color);
  await updateDoc(doc(db, "flats", flatId), { [`memberColors.${uid}`]: color });
};

export const checkEmailInvite = async (uid, email, userName = null) => {
  console.log("[Flat] checkEmailInvite — start");
  const snap = await getDocs(
    query(collection(db, "flats"), where("invitedEmails", "array-contains", email.toLowerCase()))
  );
  if (snap.empty) {
    console.log("[Flat] checkEmailInvite — no invite found");
    return null;
  }

  const flatDoc = snap.docs[0];
  const flatData = flatDoc.data();
  console.log("[Flat] checkEmailInvite — invite found");

  if (flatData.memberIds?.includes(uid)) {
    console.log("[Flat] checkEmailInvite — already a member");
    if (userName && !flatData.memberNames?.[uid]) {
      console.log("[Flat] checkEmailInvite — backfilling missing name for existing member");
      await updateDoc(flatDoc.ref, { [`memberNames.${uid}`]: userName });
    }
    return flatDoc.id;
  }

  const flatUpdate = {
    memberIds: arrayUnion(uid),
    invitedEmails: arrayRemove(email.toLowerCase()),
  };
  if (userName) {
    flatUpdate[`memberNames.${uid}`] = userName;
    console.log("[Flat] checkEmailInvite — joining with name set");
  } else {
    console.warn("[Flat] checkEmailInvite — joining WITHOUT a name (displayName not set yet)");
  }

  await updateDoc(flatDoc.ref, flatUpdate);

  await setDoc(doc(db, "users", uid), {
    flatId: flatDoc.id,
    ...(userName ? { displayName: userName } : {}),
  }, { merge: true });

  console.log("[Flat] checkEmailInvite — joined flat");
  return flatDoc.id;
};
