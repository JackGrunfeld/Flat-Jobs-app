import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import { auth } from "../firebaseConfig";
import {
  getUserFlat,
  checkEmailInvite,
  backfillMemberName,
  leaveFlat as leaveFlatService,
} from "../services/flatService";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userFlat, setUserFlat] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const signingUpRef = useRef(false);

  const refreshFlat = async (uid) => {
    console.log("[Auth] refreshFlat — start");
    const flat = await getUserFlat(uid);
    console.log("[Auth] refreshFlat —", flat ? "flat loaded" : "no flat found");
    setUserFlat(flat);
    return flat;
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (signingUpRef.current) {
        console.log("[Auth] onAuthStateChanged — signup in progress, skipping flat load");
        setCurrentUser(user);
        return;
      }

      console.log("[Auth] onAuthStateChanged —", user ? "signed in" : "signed out");
      setCurrentUser(user);

      if (user) {
        const flat = await getUserFlat(user.uid);
        console.log("[Auth] flat loaded —", flat ? `members: ${flat.memberIds?.length}` : "none");
        setUserFlat(flat);
      } else {
        setUserFlat(null);
      }
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  const signup = async (name, email, password) => {
    console.log("[Auth] signup — start");
    signingUpRef.current = true;
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      console.log("[Auth] user created");

      await updateProfile(cred.user, { displayName: name });
      console.log("[Auth] displayName set");

      let flatId = await checkEmailInvite(cred.user.uid, email, name.trim());
      console.log("[Auth] checkEmailInvite —", flatId ? "invite found" : "no invite found");

      if (!flatId) {
        console.log("[Auth] trying backfillMemberName fallback…");
        flatId = await backfillMemberName(cred.user.uid, name.trim());
        console.log("[Auth] backfillMemberName —", flatId ? "flat found" : "not in any flat yet");
      }

      const flat = flatId ? await getUserFlat(cred.user.uid) : null;
      console.log("[Auth] signup complete —", flat ? "flat loaded" : "no flat (will show FlatSetupPage)");
      setCurrentUser(cred.user);
      setUserFlat(flat);
      return cred.user;
    } catch (err) {
      console.error("[Auth] signup error →", err.code);
      throw err;
    } finally {
      signingUpRef.current = false;
      setAuthLoading(false);
    }
  };

  const login = async (email, password) => {
    console.log("[Auth] login — start");
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      console.log("[Auth] login — success");
      return cred;
    } catch (err) {
      console.error("[Auth] login error →", err.code);
      throw err;
    }
  };

  const logout = async () => {
    console.log("[Auth] logout — start");
    await signOut(auth);
  };

  const leaveFlat = async () => {
    if (!currentUser || !userFlat) return;
    console.log("[Auth] leaveFlat — start");
    await leaveFlatService(userFlat.id, currentUser.uid);
    setUserFlat(null);
  };

  return (
    <AuthContext.Provider value={{ currentUser, userFlat, authLoading, signup, login, logout, refreshFlat, leaveFlat }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
