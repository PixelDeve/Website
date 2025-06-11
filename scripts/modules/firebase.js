// modules/firebase.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAPbvxBU0PYdgrHdHKCeqNAdiX0f-BdftY",
  authDomain: "pichat-b1206.firebaseapp.com",
  projectId: "pichat-b1206",
  storageBucket: "pichat-b1206.appspot.com",
  messagingSenderId: "844622847426",
  appId: "1:844622847426:web:d76521621977b1d1074a5b",
  measurementId: "G-20QPP0S27J"
};

let app, auth, db, provider;

function initializeFirebase() {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  provider = new GoogleAuthProvider();
}

export { initializeFirebase, auth, db, provider };
