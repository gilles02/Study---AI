import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore }  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth }       from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {

  apiKey: "AIzaSyAnio8L6H9oZIDp1HTTlx7aAdiKpEsiTSU",

  authDomain: "study-ia-416ea.firebaseapp.com",

  projectId: "study-ia-416ea",

  storageBucket: "study-ia-416ea.firebasestorage.app",

  messagingSenderId: "743825012528",

  appId: "1:743825012528:web:953fc7e45043ff2ca1baf5"

};


const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

export { app, db, auth };