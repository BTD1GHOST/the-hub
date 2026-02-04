// ===============================
// THE HUB — app.js (v8 FULL COPY/PASTE)
// Realtime posts + realtime admin pending queue
// Auth + Users Admin + Posts (text + uploads) + Approvals
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
  onSnapshot
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

console.log("Firebase connected");

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

  return { url: data.secure_url };
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

// Composer
const composerOverlay = document.getElementById("composerOverlay");
const composerTitleEl = document.getElementById("composerTitle");
const postTitleInput = document.getElementById("postTitle");
const postTextInput = document.getElementById("postText");
const postFileInput = document.getElementById("postFile");
const fileHint = document.getElementById("fileHint");

// ===============================
// State
// ===============================
let currentTab = "school";
let currentUserProfile = null;
let composerOpen = false;

// Realtime unsubscribers
let unsubPosts = null;
let unsubPendingCount = null;
let unsubAdminUsers = null;
let unsubAdminPendingPosts = null;

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
  if (unsubAdminUsers) unsubAdminUsers();
  if (unsubAdminPendingPosts) unsubAdminPendingPosts();
  unsubPosts = null;
  unsubPendingCount = null;
  unsubAdminUsers = null;
  unsubAdminPendingPosts = null;
}

function renderFilePreview(url, type) {
  const safeUrl = escapeHTML(url);
  const isImage = (type || "").startsWith("image/");
  const isPDF = type === "application/pdf" || safeUrl.toLowerCase().endsWith(".pdf");

  if (isImage) {
    return `
      <div style="margin-top:10px;">
        <img src="${safeUrl}" alt="upload"
          style="width:100%; max-height:420px; object-fit:cover; border-radius:14px; border:1px solid rgba(255,255,255,.10);" />
      </div>
    `;
  }

  if (isPDF) {
    return `
      <div style="margin-top:10px;">
        <a class="btn secondary" href="${safeUrl}" target="_blank" rel="noopener">Open PDF</a>
      </div>
    `;
  }

  return `
    <div style="margin-top:10px;">
      <a class="btn secondary" href="${safeUrl}" target="_blank" rel="noopener">Open file</a>
    </div>
  `;
}

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
  cleanupRealtime();
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
// Composer
// ===============================
window.openComposer = function () {
  if (currentTab !== "school" && currentTab !== "media") return alert("New is only for School/Media.");
  composerOpen = true;

  composerTitleEl.textContent = currentTab === "school" ? "New School Post" : "New Media Post";
  postTitleInput.value = "";
  postTextInput.value = "";
  postFileInput.value = "";
  fileHint.textContent = "Optional: attach image/PDF. (Non-admin uploads require approval)";

  composerOverlay.style.display = "grid";
  postTitleInput.focus();
};

window.closeComposer = function () {
  composerOpen = false;
  composerOverlay.style.display = "none";
};

postFileInput?.addEventListener("change", () => {
  const f = postFileInput.files?.[0];
  fileHint.textContent = f ? `Selected: ${f.name}` : "Optional: attach image/PDF. (Non-admin uploads require approval)";
});

window.submitPost = async function () {
  if (!auth.currentUser || !currentUserProfile) return alert("Not logged in.");

  const section = currentTab;
  const title = (postTitleInput.value || "").trim();
  const text = (postTextInput.value || "").trim();
  const file = postFileInput.files?.[0] || null;

  if (!title && !text && !file) return alert("Write something or attach a file.");

  let status = "approved";
  if (file && !isAdmin()) status = "pending";

  let fileURL = "";
  let fileType = "";

  try {
    if (file) {
      fileHint.textContent = "Uploading...";
      const up = await uploadToCloudinary(file);
      fileURL = up.url;
      fileType = file.type || "";
      fileHint.textContent = "Uploaded ✔";
    }

    await addDoc(collection(db, "posts"), {
      section,
      title,
      text,
      fileURL,
      fileType,
      status,
      createdBy: auth.currentUser.uid,
      createdByEmail: currentUserProfile.email || "",
      createdAt: serverTimestamp()
    });

    window.closeComposer();
  } catch (err) {
    console.error(err);
    alert(err?.message || "Failed to post.");
  }
};

// ===============================
// Realtime: School/Media posts
// ===============================
function startRealtimePosts(section) {
  if (unsubPosts) unsubPosts();

  sectionBody.innerHTML = `<div class="empty">Loading...</div>`;

  const q = query(
    collection(db, "posts"),
    where("section", "==", section),
    where("status", "==", "approved")
  );

  unsubPosts = onSnapshot(
    q,
    (snap) => {
      if (snap.empty) {
        sectionBody.innerHTML = `<div class="empty">No posts yet in this section.</div>`;
        return;
      }

      const posts = [];
      snap.forEach((d) => posts.push({ id: d.id, ...d.data() }));

      // Sort newest first (client-side)
      posts.sort((a, b) => {
        const ams = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds || 0) * 1000;
        const bms = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds || 0) * 1000;
        return bms - ams;
      });

      let html = `<div style="display:flex; flex-direction:column; gap:12px;">`;

      for (const p of posts) {
        html += `
          <div class="card" style="padding:14px; background:rgba(255,255,255,.05); box-shadow:none;">
            ${p.title ? `<div style="font-weight:900; margin-bottom:6px;">${escapeHTML(p.title)}</div>` : ""}
            ${p.text ? `<div style="color:rgba(234,234,255,.78); white-space:pre-wrap; line-height:1.5;">${escapeHTML(p.text)}</div>` : ""}
            ${p.fileURL ? renderFilePreview(p.fileURL, p.fileType) : ""}
            <div style="margin-top:10px; color:rgba(234,234,255,.45); font-size:12px;">
              Posted by ${escapeHTML(p.createdByEmail || "unknown")}
            </div>
          </div>
        `;
      }

      html += `</div>`;
      sectionBody.innerHTML = html;
    },
    (err) => {
      console.error("posts realtime error:", err);
      sectionBody.innerHTML = `<div class="empty">Error loading posts. Check Console.</div>`;
    }
  );
}

// Realtime: pending count (side card)
function startRealtimePendingCount(sectionOrAll) {
  if (unsubPendingCount) unsubPendingCount();

  const q =
    sectionOrAll === "all"
      ? query(collection(db, "posts"), where("status", "==", "pending"))
      : query(collection(db, "posts"), where("section", "==", sectionOrAll), where("status", "==", "pending"));

  unsubPendingCount = onSnapshot(q, (snap) => {
    if (!sideBody) return;
    if (sectionOrAll === "all") {
      sideBody.textContent = isAdmin()
        ? `Realtime • Pending posts: ${snap.size}`
        : `Realtime`;
    } else {
      sideBody.textContent = isAdmin()
        ? `Realtime • Pending in ${sectionOrAll}: ${snap.size}`
        : `Realtime`;
    }
  });
}

// ===============================
// Admin realtime panel (users + pending posts)
// ===============================
function startRealtimeAdminPanel() {
  if (!isAdmin()) {
    sectionBody.innerHTML = `<div class="empty">You are not an admin.</div>`;
    return;
  }

  // Users
  if (unsubAdminUsers) unsubAdminUsers();
  // Pending posts
  if (unsubAdminPendingPosts) unsubAdminPendingPosts();

  sectionBody.innerHTML = `<div class="empty">Loading admin panel...</div>`;

  let latestUsers = [];
  let latestPending = [];

  const rerender = () => {
    // Pending posts UI
    const pendingPosts = [...latestPending];
    pendingPosts.sort((a, b) => {
      const ams = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds || 0) * 1000;
      const bms = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds || 0) * 1000;
      return bms - ams;
    });

    let pendingHTML = "";
    if (pendingPosts.length === 0) {
      pendingHTML = `<div class="empty" style="padding:14px 10px;">No pending posts.</div>`;
    } else {
      let list = `<div style="display:flex; flex-direction:column; gap:12px;">`;
      for (const p of pendingPosts) {
        list += `
          <div class="card" style="padding:14px; background:rgba(255,255,255,.05); box-shadow:none;">
            <div style="display:flex; justify-content:space-between; gap:12px; align-items:center; flex-wrap:wrap;">
              <div>
                <div style="font-weight:900;">${escapeHTML((p.section || "post").toUpperCase())}</div>
                ${p.title ? `<div style="margin-top:6px; font-weight:800;">${escapeHTML(p.title)}</div>` : ""}
                ${p.text ? `<div style="margin-top:6px; color:rgba(234,234,255,.78); white-space:pre-wrap; line-height:1.5;">${escapeHTML(p.text)}</div>` : ""}
                ${p.fileURL ? renderFilePreview(p.fileURL, p.fileType) : ""}
                <div style="margin-top:10px; color:rgba(234,234,255,.45); font-size:12px;">
                  From ${escapeHTML(p.createdByEmail || "unknown")}
                </div>
              </div>

              <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                <button class="btn" onclick="approvePost('${p.id}')">Approve</button>
                <button class="btn secondary" onclick="denyPost('${p.id}')">Deny</button>
              </div>
            </div>
          </div>
        `;
      }
      list += `</div>`;
      pendingHTML = list;
    }

    // Users UI
    let usersHTML = `<div style="display:flex; flex-direction:column; gap:12px;">`;
    for (const u of latestUsers) {
      const email = u.email || "(no email)";
      const role = u.role || "user";
      const status = u.status || "pending";
      const uid = u.id;

      const statusColor =
        status === "approved" ? "var(--good)" :
        status === "pending" ? "var(--warn)" :
        "var(--bad)";

      const isOwner = role === "owner";

      usersHTML += `
        <div class="card" style="padding:14px; background:rgba(255,255,255,.05); box-shadow:none;">
          <div style="display:flex; justify-content:space-between; gap:12px; align-items:center; flex-wrap:wrap;">
            <div>
              <div style="font-weight:800;">${escapeHTML(email)}</div>
              <div style="color:rgba(234,234,255,.65); font-size:13px;">
                <span style="color:${statusColor}; font-weight:900;">${escapeHTML(status.toUpperCase())}</span>
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
    }
    usersHTML += `</div>`;

    sectionBody.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:18px;">
        <div>
          <div style="font-weight:900; font-size:18px; margin-bottom:10px;">Pending Posts</div>
          ${pendingHTML}
        </div>
        <div>
          <div style="font-weight:900; font-size:18px; margin:18px 0 10px;">Users</div>
          ${usersHTML}
        </div>
      </div>
    `;
  };

  unsubAdminUsers = onSnapshot(
    query(collection(db, "users"), orderBy("createdAt", "desc")),
    (snap) => {
      latestUsers = [];
      snap.forEach((d) => latestUsers.push({ id: d.id, ...d.data() }));
      rerender();
    },
    (err) => {
      console.error("admin users realtime error:", err);
      sectionBody.innerHTML = `<div class="empty">Admin error (users). Check Console.</div>`;
    }
  );

  unsubAdminPendingPosts = onSnapshot(
    query(collection(db, "posts"), where("status", "==", "pending")),
    (snap) => {
      latestPending = [];
      snap.forEach((d) => latestPending.push({ id: d.id, ...d.data() }));
      rerender();
    },
    (err) => {
      console.error("admin pending realtime error:", err);
      sectionBody.innerHTML = `<div class="empty">Admin error (pending). Check Console.</div>`;
    }
  );
}

// Admin actions
window.approvePost = async function (postId) {
  await updateDoc(doc(db, "posts", postId), { status: "approved" });
};
window.denyPost = async function (postId) {
  await deleteDoc(doc(db, "posts", postId));
};

window.approveUser = async function (uid) {
  await updateDoc(doc(db, "users", uid), { status: "approved" });
};
window.banUser = async function (uid) {
  await updateDoc(doc(db, "users", uid), { status: "banned" });
};
window.unbanUser = async function (uid) {
  await updateDoc(doc(db, "users", uid), { status: "approved" });
};
window.changeRole = async function (uid, role) {
  await updateDoc(doc(db, "users", uid), { role });
};

// ===============================
// Render tab content
// ===============================
function renderTab() {
  if (!sectionTitle || !sectionBody) return;

  // Stop old realtime listeners and start new ones for the current tab
  cleanupRealtime();

  if (currentTab === "school") {
    sectionTitle.textContent = "School Work";
    if (newBtn) newBtn.style.display = "inline-block";
    if (sideCard) sideCard.style.display = "block";
    if (sideTitle) sideTitle.textContent = "Queue";

    startRealtimePosts("school");
    startRealtimePendingCount("school");
  }

  if (currentTab === "media") {
    sectionTitle.textContent = "Media";
    if (newBtn) newBtn.style.display = "inline-block";
    if (sideCard) sideCard.style.display = "block";
    if (sideTitle) sideTitle.textContent = "Queue";

    startRealtimePosts("media");
    startRealtimePendingCount("media");
  }

  if (currentTab === "chat") {
    sectionTitle.textContent = "The Boys";
    if (newBtn) newBtn.style.display = "none";
    sectionBody.innerHTML = `<div class="empty">Chat comes next.</div>`;
    if (sideCard) sideCard.style.display = "block";
    if (sideTitle) sideTitle.textContent = "Chat Queue";
    if (sideBody) sideBody.textContent = "Soon";
  }

  if (currentTab === "admin") {
    sectionTitle.textContent = "Admin Panel";
    if (newBtn) newBtn.style.display = "none";
    if (sideCard) sideCard.style.display = "block";
    if (sideTitle) sideTitle.textContent = "Admin Queue";

    startRealtimePendingCount("all");
    startRealtimeAdminPanel();
  }

  if (currentTab === "info") {
    sectionTitle.textContent = "Info";
    if (newBtn) newBtn.style.display = "none";
    sectionBody.innerHTML = `
      <div class="empty">
        <div style="text-align:left; max-width:520px; margin: 0 auto;">
          <div style="font-weight:900; margin-bottom:8px;">Rules</div>
          <div style="color:rgba(234,234,255,.70); line-height:1.6">
            • New signup = <b>pending</b><br/>
            • Approved user = <b>approved</b><br/>
            • Banned user = <b>banned</b><br/>
            • Text-only posts = <b>approved</b><br/>
            • File uploads = <b>pending</b> unless admin/owner<br/>
            • Realtime updates enabled ✅
          </div>
        </div>
      </div>
    `;
    if (sideCard) sideCard.style.display = "none";
  }
}

window.refreshSide = function () {
  // with realtime, manual refresh isn’t needed, but keep it harmless
  renderTab();
};

// ===============================
// Auth state
// ===============================
onAuthStateChanged(auth, async (user) => {
  cleanupRealtime();

  if (!user) {
    currentUserProfile = null;
    showOnly("auth");
    return;
  }

  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);

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

  if (data.status === "banned") {
    showOnly("auth");
    setHint("This account is banned.");
    await signOut(auth);
    return;
  }

  if (data.status === "pending") {
    showOnly("pending");
    return;
  }

  showOnly("app");

  if (displayNameEl) displayNameEl.textContent = data.displayName || data.email || "User";
  if (rolePill) rolePill.textContent = (data.role || "user").toUpperCase();
  if (subTitle) subTitle.textContent = isAdmin() ? "Administrator Dashboard" : "Dashboard";

  const adminTabBtn = document.querySelector('.tab[data-tab="admin"]');
  if (adminTabBtn) adminTabBtn.style.display = isAdmin() ? "inline-flex" : "none";

  renderTab();
});
