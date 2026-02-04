// ===============================
// THE HUB — app.js (FULL COPY/PASTE VERSION)
// Firebase Auth + Firestore
// Admin Panel (users)
// Posts (School + Media) - text-only for now
// Cloudinary helper included (optional, later)
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
  updateDoc,
  collection,
  getDocs,
  query,
  orderBy,
  addDoc,
  serverTimestamp,
  where
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

// ===== Initialize Firebase =====
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

console.log("Firebase connected");

// ===============================
// Cloudinary (OPTIONAL — later)
// ===============================
const CLOUD_NAME = ""; // put your cloud name later
const UPLOAD_PRESET = ""; // put your preset later (hub_upload)

async function uploadToCloudinary(file) {
  if (!CLOUD_NAME || !UPLOAD_PRESET) throw new Error("Cloudinary not configured.");

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
// State
// ===============================
let currentTab = "school";
let currentUserProfile = null;

// ===============================
// UI helpers
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
  return String(str || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

// ===============================
// AUTH: Sign Up / Login / Logout
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
    setHint(err?.message || "Signup failed.");
  }
};

window.login = async function () {
  const email = (emailInput?.value || "").trim();
  const password = passwordInput?.value || "";
  setHint("");

  if (!email || !password) return setHint("Enter email and password.");

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    console.error(err);
    setHint(err?.message || "Login failed.");
  }
};

window.logout = async function () {
  await signOut(auth);
};

// ===============================
// Tabs
// ===============================
window.showTab = function (tab) {
  currentTab = tab;

  document.querySelectorAll(".tab").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tab);
  });

  renderTab();
};

// ===============================
// POSTS (text-only for now)
// ===============================
async function createPost(section) {
  if (!auth.currentUser || !currentUserProfile) {
    alert("Not logged in.");
    return;
  }

  const title = prompt("Post title (optional):") || "";
  const text = prompt("Post text:") || "";

  // If they cancel both prompts / no content, don't post.
  if (!title.trim() && !text.trim()) {
    alert("No content. Cancelled.");
    return;
  }

  // Text-only posts are approved instantly (your rule)
  const status = "approved";

  await addDoc(collection(db, "posts"), {
    section, // "school" or "media"
    title: title.trim(),
    text: text.trim(),
    fileURL: "",
    fileType: "",
    status,
    createdBy: auth.currentUser.uid,
    createdByEmail: currentUserProfile.email || "",
    createdAt: serverTimestamp()
  });

  alert("Posted!");
  await loadPosts(section);
}

async function loadPosts(section) {
  sectionBody.innerHTML = `<div class="empty">Loading...</div>`;

  // Approved posts only
  const q = query(
    collection(db, "posts"),
    where("section", "==", section),
    where("status", "==", "approved"),
    orderBy("createdAt", "desc")
  );

  const snap = await getDocs(q);

  if (snap.empty) {
    sectionBody.innerHTML = `<div class="empty">No posts yet in this section.</div>`;
    return;
  }

  let html = `<div style="display:flex; flex-direction:column; gap:12px;">`;

  snap.forEach((d) => {
    const p = d.data();
    html += `
      <div class="card" style="padding:14px; background:rgba(255,255,255,.05); box-shadow:none;">
        ${p.title ? `<div style="font-weight:800; margin-bottom:6px;">${escapeHTML(p.title)}</div>` : ""}
        ${p.text ? `<div style="color:rgba(234,234,255,.78); white-space:pre-wrap; line-height:1.5;">${escapeHTML(p.text)}</div>` : ""}
        <div style="margin-top:10px; color:rgba(234,234,255,.45); font-size:12px;">
          Posted by ${escapeHTML(p.createdByEmail || "unknown")}
        </div>
      </div>
    `;
  });

  html += `</div>`;
  sectionBody.innerHTML = html;
}

// ===============================
// Admin: Users panel
// ===============================
async function renderAdminUsers() {
  sectionBody.innerHTML = `<div class="empty">Loading users...</div>`;

  const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);

  if (snap.empty) {
    sectionBody.innerHTML = `<div class="empty">No users found.</div>`;
    return;
  }

  let html = `<div style="display:flex; flex-direction:column; gap:12px;">`;

  snap.forEach((d) => {
    const u = d.data();
    const uid = d.id;

    const email = u.email || "(no email)";
    const role = u.role || "user";
    const status = u.status || "pending";

    const statusColor =
      status === "approved" ? "var(--good)" :
      status === "pending" ? "var(--warn)" :
      "var(--bad)";

    const isOwner = role === "owner";

    html += `
      <div class="card" style="padding:14px; background:rgba(255,255,255,.05); box-shadow:none;">
        <div style="display:flex; justify-content:space-between; gap:12px; align-items:center; flex-wrap:wrap;">
          <div>
            <div style="font-weight:700;">${escapeHTML(email)}</div>
            <div style="color:rgba(234,234,255,.65); font-size:13px;">
              <span style="color:${statusColor}; font-weight:700;">${escapeHTML(status.toUpperCase())}</span>
              • Role: <b>${escapeHTML(role)}</b>
              • UID: <span style="opacity:.6;">${uid.slice(0,6)}…</span>
            </div>
          </div>

          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <select class="input" style="width:auto; padding:10px 12px;"
              onchange="changeRole('${uid}', this.value)"
              ${isOwner ? "disabled" : ""}>
              ${["user","admin","owner"].map(r => `<option value="${r}" ${r===role?"selected":""}>${r}</option>`).join("")}
            </select>

            ${
              status !== "approved"
                ? `<button class="btn" onclick="approveUser('${uid}')">Approve</button>`
                : `<button class="btn secondary" disabled>Approved</button>`
            }

            ${
              status !== "banned"
                ? `<button class="btn secondary" onclick="banUser('${uid}')">Ban</button>`
                : `<button class="btn" onclick="unbanUser('${uid}')">Unban</button>`
            }
          </div>
        </div>
      </div>
    `;
  });

  html += `</div>`;
  sectionBody.innerHTML = html;
}

window.approveUser = async function (uid) {
  await updateDoc(doc(db, "users", uid), { status: "approved" });
  renderAdminUsers();
};

window.banUser = async function (uid) {
  await updateDoc(doc(db, "users", uid), { status: "banned" });
  renderAdminUsers();
};

window.unbanUser = async function (uid) {
  await updateDoc(doc(db, "users", uid), { status: "approved" });
  renderAdminUsers();
};

window.changeRole = async function (uid, role) {
  await updateDoc(doc(db, "users", uid), { role });
  renderAdminUsers();
};

// ===============================
// Render tab content
// ===============================
function renderTab() {
  if (!sectionTitle || !sectionBody) return;

  if (currentTab === "school") {
    sectionTitle.textContent = "School Work";
    if (newBtn) newBtn.style.display = "inline-block";
    loadPosts("school");

    if (sideTitle) sideTitle.textContent = "Queue";
    if (sideBody) sideBody.textContent = "Nothing pending.";
    if (sideCard) sideCard.style.display = "block";
  }

  if (currentTab === "media") {
    sectionTitle.textContent = "Media";
    if (newBtn) newBtn.style.display = "inline-block";
    loadPosts("media");

    if (sideTitle) sideTitle.textContent = "Queue";
    if (sideBody) sideBody.textContent = "Nothing pending.";
    if (sideCard) sideCard.style.display = "block";
  }

  if (currentTab === "chat") {
    sectionTitle.textContent = "The Boys";
    if (newBtn) newBtn.style.display = "none";
    sectionBody.innerHTML = `<div class="empty">Chat UI comes next.</div>`;

    if (sideTitle) sideTitle.textContent = "Chat Queue";
    if (sideBody) sideBody.textContent = "Nothing pending.";
    if (sideCard) sideCard.style.display = "block";
  }

  if (currentTab === "admin") {
    sectionTitle.textContent = "Admin Panel";
    if (newBtn) newBtn.style.display = "none";
    renderAdminUsers();

    if (sideTitle) sideTitle.textContent = "Approvals";
    if (sideBody) sideBody.textContent = "Nothing pending.";
    if (sideCard) sideCard.style.display = "block";
  }

  if (currentTab === "info") {
    sectionTitle.textContent = "Info";
    if (newBtn) newBtn.style.display = "none";
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
    if (sideCard) sideCard.style.display = "none";
  }
}

// ===============================
// Buttons
// ===============================
window.openComposer = function () {
  if (currentTab === "school") return createPost("school");
  if (currentTab === "media") return createPost("media");
  alert("New is only for School/Media right now.");
};

window.refreshSide = function () {
  if (sideBody) sideBody.textContent = "Nothing pending.";
};

// ===============================
// Auth state: decide which screen to show
// ===============================
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    currentUserProfile = null;
    showOnly("auth");
    return;
  }

  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);

  // If missing user doc, create pending
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
  currentUserProfile = data;

  // banned
  if (data.status === "banned") {
    showOnly("auth");
    setHint("This account is banned.");
    await signOut(auth);
    return;
  }

  // pending
  if (data.status === "pending") {
    showOnly("pending");
    return;
  }

  // approved => app
  showOnly("app");

  // header UI
  if (displayNameEl) displayNameEl.textContent = data.displayName || data.email || "User";
  if (rolePill) rolePill.textContent = (data.role || "user").toUpperCase();
  if (subTitle) {
    subTitle.textContent =
      data.role === "admin" || data.role === "owner"
        ? "Administrator Dashboard"
        : "Dashboard";
  }

  // show/hide admin tab
  const adminTabBtn = document.querySelector('.tab[data-tab="admin"]');
  if (adminTabBtn) {
    adminTabBtn.style.display =
      data.role === "admin" || data.role === "owner" ? "inline-flex" : "none";
  }

  renderTab();
});
