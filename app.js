// ===============================
// THE HUB — clean app.js (v1)
// Firebase Auth + Firestore
// Cloudinary upload helper (we’ll use later)
// ===============================

// ===== Firebase imports =====
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
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ===== YOUR Firebase config (PASTE YOUR REAL VALUES HERE) =====
const firebaseConfig = {
  apiKey: "AIzaSyA9Mq0eCDuicDEejmtqCwlWnZ4otvz9FdY",
  authDomain: "the-hub-f09c4.firebaseapp.com",
  projectId: "the-hub-f09c4",
  storageBucket: "the-hub-f09c4.firebasestorage.app",
  messagingSenderId: "992597104461",
  appId: "1:992597104461:web:17ea5b0e3ab5d518804904"
};

// ===== Initialize Firebase =====
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

console.log("Firebase connected");

// ===============================
// Cloudinary (we’ll use later for uploads)
// Put your values later when ready
// ===============================
const CLOUD_NAME = ""; // ex: "abcd123"
const UPLOAD_PRESET = ""; // ex: "hub_upload"

async function uploadToCloudinary(file) {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error("Cloudinary not configured yet.");
  }

  // Optional safety check (we’ll expand later)
  const allowed = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "application/pdf"
  ];
  if (!allowed.includes(file.type)) {
    throw new Error("Only images (jpg/png/webp/gif) or PDFs allowed.");
  }

  const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`;
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", UPLOAD_PRESET);
  form.append("folder", "thehub");

  const res = await fetch(url, { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Upload failed");

  return { secure_url: data.secure_url, public_id: data.public_id };
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

// ===============================
// Simple view helpers
// ===============================
function showOnly(which) {
  authScreen.style.display = which === "auth" ? "flex" : "none";
  pendingScreen.style.display = which === "pending" ? "flex" : "none";
  appScreen.style.display = which === "app" ? "block" : "none";
}

function setHint(msg) {
  if (!authHint) return;
  authHint.textContent = msg || "";
}

// ===============================
// AUTH: Sign Up / Login / Logout
// ===============================
window.signup = async function signup() {
  const email = (emailInput?.value || "").trim();
  const password = passwordInput?.value || "";

  setHint("");

  if (!email || !password) {
    setHint("Enter email and password.");
    return;
  }

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);

    // Create a user doc (pending by default)
    await setDoc(doc(db, "users", cred.user.uid), {
      email,
      displayName: email.split("@")[0],
      role: "user",
      status: "pending",
      createdAt: Date.now()
    });

    setHint("Account created. Waiting for approval.");
  } catch (err) {
    setHint(err?.message || "Signup failed.");
    console.error(err);
  }
};

window.login = async function login() {
  const email = (emailInput?.value || "").trim();
  const password = passwordInput?.value || "";

  setHint("");

  if (!email || !password) {
    setHint("Enter email and password.");
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    setHint(err?.message || "Login failed.");
    console.error(err);
  }
};

window.logout = async function logout() {
  await signOut(auth);
};

// ===============================
// TAB UI (basic)
// ===============================
let currentTab = "school";

window.showTab = function showTab(tab) {
  currentTab = tab;

  // highlight tabs
  document.querySelectorAll(".tab").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tab);
  });

  renderTab();
};

function renderTab() {
  if (!sectionTitle || !sectionBody) return;

  if (currentTab === "school") {
    sectionTitle.textContent = "School Work";
    newBtn.style.display = "inline-block";
    sectionBody.innerHTML = `<div class="empty">No posts yet in this section.</div>`;

    sideTitle.textContent = "Queue";
    sideBody.textContent = "Nothing pending.";
    sideCard.style.display = "block";
  }

  if (currentTab === "media") {
    sectionTitle.textContent = "Media";
    newBtn.style.display = "inline-block";
    sectionBody.innerHTML = `<div class="empty">No media yet.</div>`;

    sideTitle.textContent = "Queue";
    sideBody.textContent = "Nothing pending.";
    sideCard.style.display = "block";
  }

  if (currentTab === "chat") {
    sectionTitle.textContent = "The Boys";
    newBtn.style.display = "none";
    sectionBody.innerHTML = `<div class="empty">Chat UI comes next.</div>`;

    sideTitle.textContent = "Chat Queue";
    sideBody.textContent = "Nothing pending.";
    sideCard.style.display = "block";
  }

  if (currentTab === "admin") {
    sectionTitle.textContent = "Admin Panel";
    newBtn.style.display = "none";
    sectionBody.innerHTML = `<div class="empty">Admin user list comes next.</div>`;

    sideTitle.textContent = "Approvals";
    sideBody.textContent = "Nothing pending.";
    sideCard.style.display = "block";
  }

  if (currentTab === "info") {
    sectionTitle.textContent = "Info";
    newBtn.style.display = "none";
    sectionBody.innerHTML = `
      <div class="empty">
        <div style="text-align:left; max-width:520px; margin: 0 auto;">
          <div style="font-weight:700; margin-bottom:8px;">Account Status Rules</div>
          <div style="color:rgba(234,234,255,.70); line-height:1.6">
            • New signup = <b>pending</b><br/>
            • Approved user = <b>approved</b><br/>
            • Banned user = <b>banned</b><br/>
            • Admin/Owner = role with approved status
          </div>
        </div>
      </div>
    `;

    sideCard.style.display = "none";
  }
}

window.openComposer = function openComposer() {
  alert("Composer comes next — we’ll add the modal after admin approvals.");
};

window.refreshSide = function refreshSide() {
  // placeholder for now
  sideBody.textContent = "Nothing pending.";
};

// ===============================
// AUTH STATE — decides which screen to show
// ===============================
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    showOnly("auth");
    return;
  }

  // make sure user doc exists
  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);

  // If user logged in but doc is missing (rare), create it
  if (!snap.exists()) {
    await setDoc(userRef, {
      email: user.email || "",
      displayName: (user.email || "User").split("@")[0],
      role: "user",
      status: "pending",
      createdAt: Date.now()
    });
    showOnly("pending");
    return;
  }

  const data = snap.data();

  // banned check
  if (data.status === "banned") {
    showOnly("auth");
    setHint("This account is banned.");
    await signOut(auth);
    return;
  }

  // pending check
  if (data.status === "pending") {
    showOnly("pending");
    return;
  }

  // approved => app
  showOnly("app");

  // fill header UI
  displayNameEl.textContent = data.displayName || data.email || "User";
  rolePill.textContent = (data.role || "user").toUpperCase();
  subTitle.textContent =
    data.role === "admin" || data.role === "owner"
      ? "Administrator Dashboard"
      : "Dashboard";

  // show/hide admin tab
  const adminTabBtn = document.querySelector('.tab[data-tab="admin"]');
  if (adminTabBtn) {
    adminTabBtn.style.display =
      data.role === "admin" || data.role === "owner" ? "inline-flex" : "none";
  }

  // render current tab
  renderTab();
});

// ===============================
// OPTIONAL: quick “make me admin” helper (REMOVE LATER)
// Only use once, then delete this function.
// ===============================

  const user = auth.currentUser;
  if (!user) return alert("Not logged in.");

  await updateDoc(doc(db, "users", user.uid), {
    role: "admin",
    status: "approved"
  });

  alert("Set to admin+approved. Refresh the page. Then DELETE makeMeAdminOnce()");
};
