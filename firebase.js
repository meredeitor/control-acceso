// firebase.js (ESM)
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
// Si luego usas Storage:
// import { getStorage } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyDmdS1mt12tyWOE48U2As-53vtdQT7esPg",
  authDomain: "control-acceso-cd3db.firebaseapp.com",
  projectId: "control-acceso-cd3db",
  storageBucket: "control-acceso-cd3db.firebasestorage.app",
  messagingSenderId: "98995699294",
  appId: "1:98995699294:web:dd1b6b639525fd06a5fecf"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
// export const storage = getStorage(app);
