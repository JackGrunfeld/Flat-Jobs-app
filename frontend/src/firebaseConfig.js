// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDZfmJWNidUZi25AnLjN_ycscVdSHiK8x4",
  authDomain: "flatapp-46cd5.firebaseapp.com",
  projectId: "flatapp-46cd5",
  storageBucket: "flatapp-46cd5.firebasestorage.app",
  messagingSenderId: "1069302946664",
  appId: "1:1069302946664:web:0b2696ef7ae360484b14dd",
  measurementId: "G-9LFBJBMC32"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
export const db = getFirestore(app);