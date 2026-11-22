import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Вставь сюда конфиг из Firebase Console → Project settings → Your apps → Web app.
// Это не секрет: данные защищены правилами Firestore, а не этим ключом.
const firebaseConfig = {
  apiKey: "AIzaSyBFclFpAiKWJgyFx6Ow79bxUJETprjS-UI",
  authDomain: "movie-night-4208f.firebaseapp.com",
  projectId: "movie-night-4208f",
  storageBucket: "movie-night-4208f.firebasestorage.app",
  messagingSenderId: "538289960309",
  appId: "1:538289960309:web:a599ac4cbf1be80e048f3c"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const provider = new GoogleAuthProvider();
