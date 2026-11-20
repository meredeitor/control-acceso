// firebase.js (ESM)
import { initializeApp } from "./vendor/firebase-12.11.0/firebase-app.js";
import { getAuth } from "./vendor/firebase-12.11.0/firebase-auth.js";
import { getFirestore } from "./vendor/firebase-12.11.0/firebase-firestore.js";
// Si luego usas Storage:
// Storage no se utiliza actualmente; si se habilita, debe agregarse desde vendor/.

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
