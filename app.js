// ===============================
// THE HUB — app.js (FREE NOTIFY VERSION)
// No Cloud Functions
// 100% free
// ===============================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  addDoc,
  onSnapshot,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ===== Firebase config =====
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

// ===== DOM =====
const authScreen = document.getElementById("authScreen");
const pendingScreen = document.getElementById("pendingScreen");
const appScreen = document.getElementById("appScreen");
const sectionBody = document.getElementById("sectionBody");
const adminTab = document.getElementById("adminTab");
const displayName = document.getElementById("displayName");
const rolePill = document.getElementById("rolePill");

let currentUserProfile = null;
let chatUnsub = null;
let lastMessageTime = 0;

// ===== Helpers =====
const show = (a,b,c) => {
  authScreen.style.display=a;
  pendingScreen.style.display=b;
  appScreen.style.display=c;
};
const isAdmin = () => currentUserProfile?.role === "admin";

// ===== AUTH =====
window.signup = async () => {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const cred = await createUserWithEmailAndPassword(auth,email,password);
  await setDoc(doc(db,"users",cred.user.uid),{
    email,
    role:"user",
    status:"pending",
    createdAt:Date.now()
  });
};

window.login = async () => {
  await signInWithEmailAndPassword(
    auth,
    document.getElementById("email").value,
    document.getElementById("password").value
  );
};

window.logout = async () => signOut(auth);

// ===== FREE NOTIFICATIONS =====
window.enableNotifications = async () => {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    alert("Notifications blocked");
    return;
  }
  alert("Notifications enabled ✅ (free mode)");
};

function notify(title, body) {
  if (Notification.permission === "granted") {
    new Notification(title, { body });
  }

  // sound ping
  const audio = new Audio("https://actions.google.com/sounds/v1/alarms/beep_short.ogg");
  audio.play().catch(()=>{});
}

// ===== CHAT =====
function renderChat() {
  sectionBody.innerHTML = `
    <div class="chatList" id="chatList"></div>
    <textarea id="chatText" class="input" placeholder="Message..."></textarea>
    <button class="btn" onclick="sendChat()">Send</button>
  `;

  const list = document.getElementById("chatList");

  if (chatUnsub) chatUnsub();

  chatUnsub = onSnapshot(
    query(collection(db,"rooms","theboys","messages"), orderBy("createdAt")),
    snap => {
      list.innerHTML = "";
      snap.forEach(d => {
        const m = d.data();
        list.innerHTML += `
          <div class="chatMsg">
            <b>${m.createdByEmail}</b>: ${m.text}
            ${isAdmin()?`<button onclick="deleteMsg('${d.id}')">🗑</button>`:""}
          </div>
        `;

        const ts = m.createdAt?.seconds || 0;
        if (ts > lastMessageTime && m.createdBy !== auth.currentUser.uid) {
          notify("New chat message", m.text || "New message");
          lastMessageTime = ts;
        }
      });
    }
  );
}

window.sendChat = async () => {
  const text = document.getElementById("chatText").value;
  if (!text) return;

  await addDoc(collection(db,"rooms","theboys","messages"),{
    text,
    createdBy: auth.currentUser.uid,
    createdByEmail: currentUserProfile.email,
    createdAt: serverTimestamp()
  });

  document.getElementById("chatText").value="";
};

window.deleteMsg = async id => {
  if (!isAdmin()) return;
  await deleteDoc(doc(db,"rooms","theboys","messages",id));
};

// ===== TABS =====
window.showTab = tab => {
  if (tab === "chat") renderChat();
};

// ===== AUTH STATE =====
onAuthStateChanged(auth, async user => {
  if (!user) return show("block","none","none");

  const snap = await getDoc(doc(db,"users",user.uid));
  if (!snap.exists()) return;

  currentUserProfile = snap.data();

  if (currentUserProfile.status === "pending")
    return show("none","block","none");

  show("none","none","block");

  displayName.textContent = currentUserProfile.email;
  rolePill.textContent = currentUserProfile.role.toUpperCase();
  adminTab.style.display = isAdmin() ? "inline-block" : "none";

  renderChat();
});
