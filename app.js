// ===============================
// THE HUB — app.js (v13 FULL COPY/PASTE)
// FIXED Notifications:
// - Auto-prompts permission on FIRST tap anywhere (no manual bell required)
// - Always shows in-app toast
// - Tries popup notifications if supported + allowed
// - Buzz + sound when supported
// - Prevents "spam on load" by ignoring initial snapshot load
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
  query,
  where,
  addDoc,
  serverTimestamp,
  orderBy,
  deleteDoc,
  onSnapshot,
  limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ===== Firebase config =====
const firebaseConfig = {
  apiKey: "AIzaSyA9Mq0eCDuicDEejmtqCwlWnZ4otvz9FdY",
  authDomain: "the-hub-f09c4.firebaseapp.com",
  projectId: "the-hub-f09c4",
  storageBucket: "the-hub-f09c4.firebasestorage.app",
  messagingSenderId: "992597104461",
  appId: "1:992597104461:web:17ea5b0e3ab5d518804904"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ===============================
// Cloudinary (filled)
// ===============================
const CLOUD_NAME = "dlsh8f5qh";
const UPLOAD_PRESET = "hub_upload";

async function uploadToCloudinary(file) {
  const allowed = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "application/pdf"
  ];
  if (!allowed.includes(file.type)) throw new Error("Only images or PDFs allowed.");

  const maxMB = 10;
  if (file.size > maxMB * 1024 * 1024) throw new Error(`File too large. Max ${maxMB}MB.`);

  const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`;
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", UPLOAD_PRESET);
  form.append("folder", "thehub");

  const res = await fetch(url, { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Upload failed");

  return { url: data.secure_url, type: file.type || "" };
}

// ===============================
// DOM refs
// ===============================
const authScreen = document.getElementById("authScreen");
const pendingScreen = document.getElementById("pendingScreen");
const appScreen = document.getElementById("appScreen");

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const authHint = document.getElementById("authHint");

const displayNameEl = document.getElementById("displayName");
const rolePill = document.getElementById("rolePill");
const subTitle = document.getElementById("subTitle");

const sectionTitle = document.getElementById("sectionTitle");
const sectionBody = document.getElementById("sectionBody");
const newBtn = document.getElementById("newBtn");

const sideCard = document.getElementById("sideCard");
const sideTitle = document.getElementById("sideTitle");
const sideBody = document.getElementById("sideBody");

// Toast container (make sure index.html has: <div id="toastWrap" class="toastWrap"></div>)
const toastWrap = document.getElementById("toastWrap");

// Composer (posts)
const composerOverlay = document.getElementById("composerOverlay");
const composerTitleEl = document.getElementById("composerTitle");
const postTitleInput = document.getElementById("postTitle");
const postTextInput = document.getElementById("postText");
const postFileInput = document.getElementById("postFile");
const fileHint = document.getElementById("fileHint");

// Post full view
const postViewOverlay = document.getElementById("postViewOverlay");
const postViewTitle = document.getElementById("postViewTitle");
const postViewMeta = document.getElementById("postViewMeta");
const postViewText = document.getElementById("postViewText");
const postViewFile = document.getElementById("postViewFile");
const postDeleteBtn = document.getElementById("postDeleteBtn");

// ===============================
// State
// ===============================
let currentTab = "school";
let currentUserProfile = null;

let unsubPosts = null;
let unsubPendingCount = null;
let unsubChat = null;

// Post cache for full view
let postCache = {};
let currentPostViewId = null;

// "ignore first snapshot" flags to prevent spam on load
let chatPrimed = false;
let schoolPrimed = false;
let mediaPrimed = false;

// ===============================
// Helpers
// ===============================
function showOnly(which) {
  if (authScreen) authScreen.style.display = which === "auth" ? "flex" : "none";
  if (pendingScreen) pendingScreen.style.display = which === "pending" ? "flex" : "none";
  if (appScreen) appScreen.style.display = which === "app" ? "block" : "none";
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

function isAdmin() {
  return currentUserProfile?.role === "admin" || currentUserProfile?.role === "owner";
}

function cleanupRealtime() {
  if (unsubPosts) unsubPosts();
  if (unsubPendingCount) unsubPendingCount();
  if (unsubChat) unsubChat();
  unsubPosts = unsubPendingCount = unsubChat = null;

  chatPrimed = false;
  schoolPrimed = false;
  mediaPrimed = false;
}

function tsMs(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.seconds === "number") return ts.seconds * 1000;
  return 0;
}

function renderFilePreview(url, type) {
  const safeUrl = escapeHTML(url);
  const isImage = (type || "").startsWith("image/");
  const isPDF = type === "application/pdf" || safeUrl.toLowerCase().endsWith(".pdf");

  if (isImage) {
    return `
      <div style="margin-top:10px;">
        <img src="${safeUrl}" alt="upload"
          style="width:100%; max-height:520px; object-fit:cover; border-radius:14px; border:1px solid rgba(255,255,255,.10);" />
      </div>
    `;
  }
  if (isPDF) {
    return `<div style="margin-top:10px;"><a class="btn secondary" href="${safeUrl}" target="_blank" rel="noopener">Open PDF</a></div>`;
  }
  return `<div style="margin-top:10px;"><a class="btn secondary" href="${safeUrl}" target="_blank" rel="noopener">Open file</a></div>`;
}

// ===============================
// Notifications (FIXED)
// ===============================
function toast(title, body, actionText, actionFn) {
  if (!toastWrap) return;

  const el = document.createElement("div");
  el.className = "toast";

  el.innerHTML = `
    <div style="min-width:0;">
      <div class="toastTitle">${escapeHTML(title)}</div>
      <div class="toastBody">${escapeHTML(body || "")}</div>
    </div>
    <button class="toastBtn">✕</button>
  `;

  const closeBtn = el.querySelector(".toastBtn");
  closeBtn.onclick = () => el.remove();

  if (actionText && typeof actionFn === "function") {
    const act = document.createElement("button");
    act.className = "toastBtn";
    act.textContent = actionText;
    act.onclick = () => { actionFn(); el.remove(); };
    el.appendChild(act);
  }

  toastWrap.appendChild(el);
  setTimeout(() => { try { el.remove(); } catch {} }, 6500);
}

function pingSound() {
  // Many browsers require a user gesture before audio can play.
  // We "unlock" audio by calling enableNotifications once.
  try {
    const a = new Audio("https://actions.google.com/sounds/v1/alarms/beep_short.ogg");
    a.volume = 0.5;
    a.play().catch(()=>{});
  } catch {}
}

function buzz() {
  try { navigator.vibrate?.(180); } catch {}
}

function canPopupNotify() {
  return typeof window.Notification !== "undefined";
}

function popupNotify(title, body) {
  if (!canPopupNotify()) return;
  if (Notification.permission !== "granted") return;
  try { new Notification(title, { body }); } catch {}
}

function notifyAll(title, body, actionText, actionFn) {
  toast(title, body, actionText, actionFn);
  popupNotify(title, body);
  buzz();
  pingSound();
}

// ---- Permission request (must be on user gesture) ----
async function requestNotifyPermission() {
  if (!canPopupNotify()) {
    toast("Notifications", "This browser/device won’t show popups. You’ll still get in-app toasts.");
    return;
  }

  if (Notification.permission === "granted") {
    toast("Notifications", "Enabled ✅");
    return;
  }

  if (Notification.permission === "denied") {
    toast("Notifications", "Blocked. Allow notifications in browser settings.");
    return;
  }

  try {
    const perm = await Notification.requestPermission();
    if (perm === "granted") toast("Notifications", "Enabled ✅");
    else toast("Notifications", "Not enabled. You can allow it later.");
  } catch {
    toast("Notifications", "Couldn’t request permission on this device.");
  }
}

// ✅ Your bell button still works
window.enableNotifications = async function enableNotifications() {
  await requestNotifyPermission();
};

// ✅ Auto prompt on FIRST tap anywhere (so you don't have to hunt a button)
let autoPrompted = false;
function setupAutoPrompt() {
  const once = async () => {
    if (autoPrompted) return;
    autoPrompted = true;
    await requestNotifyPermission();
    window.removeEventListener("pointerdown", once);
    window.removeEventListener("click", once);
  };

  window.addEventListener("pointerdown", once, { once: true });
  window.addEventListener("click", once, { once: true });
}
setupAutoPrompt();

// ===============================
// Full view modal
// ===============================
window.closePostView = function () {
  currentPostViewId = null;
  if (postViewOverlay) postViewOverlay.style.display = "none";
};

window.openPostView = function (postId) {
  const p = postCache[postId];
  if (!p) return;

  currentPostViewId = postId;

  if (postViewTitle) postViewTitle.textContent = p.title || "Post";
  const when = p.createdAt ? new Date(tsMs(p.createdAt)).toLocaleString() : "";
  if (postViewMeta) {
    postViewMeta.textContent = `${p.createdByEmail || "unknown"} • ${when} • ${String(p.section || "").toUpperCase()}`;
  }
  if (postViewText) postViewText.textContent = p.text || "";
  if (postViewFile) postViewFile.innerHTML = p.fileURL ? renderFilePreview(p.fileURL, p.fileType) : "";

  if (postDeleteBtn) postDeleteBtn.style.display = isAdmin() ? "inline-block" : "none";
  if (postViewOverlay) postViewOverlay.style.display = "grid";
};

window.deleteCurrentPost = async function () {
  if (!isAdmin()) return;
  if (!currentPostViewId) return;

  if (!confirm("Delete this post? This cannot be undone.")) return;

  await deleteDoc(doc(db, "posts", currentPostViewId));
  window.closePostView();
};

document.addEventListener("click", (e) => {
  const card = e.target?.closest?.("[data-postid]");
  if (!card) return;
  const postId = card.getAttribute("data-postid");
  if (postId) window.openPostView(postId);
});

// ===============================
// AUTH
// ===============================
window.signup = async function () {
  const email = (emailInput?.value || "").trim();
  const password = passwordInput?.value || "";
  setHint("");
  if (!email || !password) return setHint("Enter email and password.");

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, "users", cred.user.uid), {
      email,
      displayName: email.split("@")[0],
      role: "user",
      status: "pending",
      createdAt: Date.now()
    });
    setHint("Account created. Waiting for approval.");
  } catch (err) {
    console.error(err);
