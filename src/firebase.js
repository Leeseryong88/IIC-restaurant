import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getAnalytics } from "firebase/analytics";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyB0fT3NP7pWkOHEg0EcS-zHM4WaqlLHMZY",
  authDomain: "iic-restaurant.firebaseapp.com",
  projectId: "iic-restaurant",
  storageBucket: "iic-restaurant.firebasestorage.app",
  messagingSenderId: "966762800318",
  appId: "1:966762800318:web:889388db32826388d3aaef",
  measurementId: "G-GZW7V4GTVW"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const analytics = typeof window !== "undefined" ? getAnalytics(app) : null;
