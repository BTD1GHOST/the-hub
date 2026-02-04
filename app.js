// ===============================
// THE HUB — app.js (v21) FREE NOTIFY FIXED
// - Chat UI fixed (no blank screen)
// - Realtime Firestore chat
// - Free notifications (works when browser/app is running)
// - No missing variables / ids
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
  collection,
  addDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
  limit
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

const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");
const authHint = document.getElementById("authHint");

const displayNameEl = document.getElementById("displayName");
const rolePill = document.getElementById("rolePill");

const chatList = document.getElementById("chatList");
const chatInput = document.getElementById("chatInput");
const chatTiny = document.getElementById("chatTiny");

// ===== State =====
let profile = null;
let unsubChat = null;
let lastNotifiedMillis = 0;

// ===== Helpers =====
function showOnly(which) {
  authScreen.style.display = which === "auth" ? "flex" : "none";
  pendingScreen.style.display = which === "pending" ? "flex" : "none";
  appScreen.style.display = which === "app" ? "flex" : "none";
}

function setHint(msg) {
  if (!authHint) return;
  authHint.textContent = msg || "";
}

function escapeHTML(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function tsToMillis(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.seconds === "number") return ts.seconds * 1000;
  return 0;
}

function freeNotify(text) {
  // popup
  if (Notification.permission === "granted") {
    try { new Notification("The Hub", { body: text }); } catch {}
  }
  // buzz (mobile)
  try { navigator.vibrate?.(200); } catch {}
  // sound
  try {
    const a = new Audio("https://actions.google.com/sounds/v1/alarms/beep_short.ogg");
    a.volume = 0.5;
    a.play().catch(()=>{});
  } catch {}
}

// ===== Auth actions =====
window.signup = async function signup() {
  const email = (emailInput?.value || "").trim();
  const password = passwordInput?.value || "";
  setHint("");

  if (!email || !password) return setHint("Enter email and password.");

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, "users", cred.user.uid), {
      email,
      role: "user",
      status: "pending",
      createdAt: Date.now()
    });
    setHint("Account created. Waiting for approval.");
  } catch (e) {
    console.error(e);
    setHint(e?.message || "Signup failed.");
  }
};

window.login = async function login() {
  const email = (emailInput?.value || "").trim();
  const password = passwordInput?.value || "";
  setHint("");

  if (!email || !password) return setHint("Enter email and password.");

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (e) {
    console.error(e);
    setHint(e?.message || "Login failed.");
  }
};

window.logout = async function logout() {
  if (unsubChat) unsubChat();
  unsubChat = null;
  await signOut(auth);
};

// ===== Notifications enable =====
window.enableNotifications = async function enableNotifications() {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") {
    alert("Notifications blocked.");
    return;
  }
  alert("Notifications enabled ✅ (Free mode)");
};

// ===== Chat =====
function startChat() {
  if (unsubChat) unsubChat();
  chatList.innerHTML = `<div class="empty">Loading chat…</div>`;

  const msgsRef = collection(db, "rooms", "theboys", "messages");
  const q = query(msgsRef, orderBy("createdAt", "asc"), limit(250));

  unsubChat = onSnapshot(q, (snap) => {
    if (snap.empty) {
      chatList.innerHTML = `<div class="empty">No messages yet.</div>`;
      return;
    }

    let html = "";
    let newestMillis = lastNotifiedMillis;

    snap.forEach((d) => {
      const m = d.data();
      const whenMs = tsToMillis(m.createdAt);

      html += `
        <div class="chatMsg">
          <div style="flex:1;">
            <div class="chatMeta"><b>${escapeHTML(m.email || "unknown")}</b></div>
            <div class="chatText">${escapeHTML(m.text || "")}</div>
          </div>
        </div>
      `;

      // notify only for NEW messages (not your own)
      if (whenMs > newestMillis && m.uid !== auth.currentUser?.uid) {
        newestMillis = whenMs;
      }
    });

    chatList.innerHTML = html;
    chatList.scrollTop = chatList.scrollHeight;

    // If there was a new message after lastNotifiedMillis, fire one notification
    if (newestMillis > lastNotifiedMillis) {
      // Find the newest message text quickly:
      const docs = snap.docs;
      const last = docs[docs.length - 1]?.data();
      if (last?.uid !== auth.currentUser?.uid) {
        freeNotify(last?.text || "New message");
      }
      lastNotifiedMillis = newestMillis;
    }
  }, (err) => {
    console.error(err);
    chatList.innerHTML = `<div class="empty">Chat error. Check Console.</div>`;
  });

  if (chatTiny) {
    chatTiny.textContent = "Realtime • Free notifications (works while browser/app is running)";
  }
}

window.sendMessage = async function sendMessage() {
  if (!profile) return;

  const text = (chatInput.value || "").trim();
  if (!text) return;

  await addDoc(collection(db, "rooms", "theboys", "messages"), {
    text,
    email: profile.email,
    uid: auth.currentUser.uid,
    createdAt: serverTimestamp()
  });

  chatInput.value = "";
};

// ===== Auth state =====
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    profile = null;
    showOnly("auth");
    return;
  }

  const uref = doc(db, "users", user.uid);
  const usnap = await getDoc(uref);

  if (!usnap.exists()) {
    await setDoc(uref, {
      email: user.email || "",
      role: "user",
      status: "pending",
      createdAt: Date.now()
    });
    showOnly("pending");
    return;
  }

  profile = usnap.data();

  if (profile.status === "pending") {
    showOnly("pending");
    return;
  }

  showOnly("app");

  displayNameEl.textContent = profile.email || "User";
  rolePill.textContent = (profile.role || "user").toUpperCase();

  // reset notification pointer when you enter
  lastNotifiedMillis = Date.now();

  startChat();
});
