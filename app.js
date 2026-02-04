import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc,
  collection, addDoc, onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyA9Mq0eCDuicDEejmtqCwlWnZ4otvz9FdY",
  authDomain: "the-hub-f09c4.firebaseapp.com",
  projectId: "the-hub-f09c4",
  messagingSenderId: "992597104461",
  appId: "1:992597104461:web:17ea5b0e3ab5d518804904"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM
const authScreen = document.getElementById("authScreen");
const pendingScreen = document.getElementById("pendingScreen");
const appScreen = document.getElementById("appScreen");
const chatList = document.getElementById("chatList");
const chatInput = document.getElementById("chatInput");
const displayName = document.getElementById("displayName");
const rolePill = document.getElementById("rolePill");
const authHint = document.getElementById("authHint");

let profile = null;
let lastSeen = Date.now();

// Helpers
function show(a,b,c){
  authScreen.style.display=a;
  pendingScreen.style.display=b;
  appScreen.style.display=c;
}

// Auth
window.signup = async () => {
  const email = emailInput.value;
  const password = passwordInput.value;
  const cred = await createUserWithEmailAndPassword(auth,email,password);
  await setDoc(doc(db,"users",cred.user.uid),{
    email, role:"user", status:"pending"
  });
};

window.login = async () => {
  await signInWithEmailAndPassword(auth,emailInput.value,passwordInput.value);
};

window.logout = async () => signOut(auth);

// FREE notifications
window.enableNotifications = async () => {
  const perm = await Notification.requestPermission();
  if (perm === "granted") alert("Notifications enabled");
};

function notify(text){
  if (Notification.permission === "granted") {
    new Notification("New message",{ body:text });
  }
  navigator.vibrate?.(200);
  new Audio("https://actions.google.com/sounds/v1/alarms/beep_short.ogg").play().catch(()=>{});
}

// Chat
function listenChat(){
  onSnapshot(collection(db,"rooms","theboys","messages"), snap => {
    chatList.innerHTML="";
    snap.forEach(d=>{
      const m=d.data();
      chatList.innerHTML+=`
        <div class="chatMsg"><b>${m.email}</b>: ${m.text}</div>
      `;
      const t = m.createdAt?.seconds*1000 || 0;
      if (t > lastSeen && m.email !== profile.email) {
        notify(m.text);
        lastSeen = t;
      }
    });
  });
}

window.sendMessage = async () => {
  const text = chatInput.value.trim();
  if (!text) return;
  await addDoc(collection(db,"rooms","theboys","messages"),{
    text,
    email: profile.email,
    createdAt: serverTimestamp()
  });
  chatInput.value="";
};

// Auth state
onAuthStateChanged(auth, async user=>{
  if(!user) return show("flex","none","none");

  const snap = await getDoc(doc(db,"users",user.uid));
  profile = snap.data();

  if(profile.status==="pending")
    return show("none","flex","none");

  show("none","none","block");
  displayName.textContent = profile.email;
  rolePill.textContent = profile.role.toUpperCase();
  listenChat();
});
