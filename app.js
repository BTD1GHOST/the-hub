// ===============================
// THE HUB — app.js (v7 FULL COPY/PASTE)
// Auth + Users Admin + Posts (text + uploads) + Approvals + Auto-refresh
// Posts loading avoids composite indexes by sorting client-side.
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
  where,
  addDoc,
  serverTimestamp,
  orderBy,
  deleteDoc
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
// Cloudinary (YOU MUST FILL THESE IN)
// ===============================
const CLOUD_NAME = "";     // <-- put your cloud name here
const UPLOAD_PRESET = "";  // <-- put your unsigned preset here (hub_upload)

async function uploadToCloudinary(file) {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error("Cloudinary not configured. Fill CLOUD_NAME + UPLOAD_PRESET in app.js");
  }

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

  const maxMB = 10;
  if (file.size > maxMB * 1024 * 1024) {
    throw new Error(`File too large. Max ${maxMB}MB.`);
  }

  const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`;
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", UPLOAD_PRESET);
  form.append("folder", "thehub");

  const res = await fetch(url, { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Upload failed");

  return {
    url: data.secure_url,
    resourceType: data.resource_type,
    format: data.format
  };
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

let refreshTimer = null;
let composerOpen = false;

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
function tsToMs(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.seconds === "number") return ts.seconds * 1000;
  return 0;
}
function isAdmin() {
  return currentUserProfile?.role === "admin" || currentUserProfile?.role === "owner";
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
  startAutoRefresh();
};

// ===============================
// Composer modal
// ===============================
window.openComposer = function () {
  if (currentTab !== "school" && currentTab !== "media") {
    alert("New is only for School/Media right now.");
    return;
  }

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
  if (!f) {
    fileHint.textContent = "Optional: attach image/PDF. (Non-admin uploads require approval)";
    return;
  }
  fileHint.textContent = `Selected: ${f.name}`;
});

window.submitPost = async function () {
  if (!auth.currentUser || !currentUserProfile) return alert("Not logged in.");

  const section = currentTab; // "school" or "media"
  const title = (postTitleInput.value || "").trim();
  const text = (postTextInput.value || "").trim();
  const file = postFileInput.files?.[0] || null;

  if (!title && !text && !file) {
    alert("Write something or attach a file.");
    return;
  }

  // STATUS RULES:
  // - text-only => approved
  // - file attached => pending unless admin/owner
  let status = "approved";
  if (file && !isAdmin()) status = "pending";
  if (file && isAdmin()) status = "approved";

  let fileURL = "";
  let fileType = "";

  try {
    // If file exists, upload it to Cloudinary first
    if (file) {
      // Show quick feedback
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

    // Immediate refresh: if pending and you're not admin, you won't see it (correct)
    await loadPosts(section);
    await updateSideCounts();
    if (currentTab === "admin" && isAdmin()) await renderAdminPanel();
  } catch (err) {
    console.error(err);
    alert(err?.message || "Failed to post.");
  }
};

// ===============================
// POSTS: approved list (no composite index)
// ===============================
async function loadPosts(section) {
  try {
    sectionBody.innerHTML = `<div class="empty">Loading...</div>`;

    const q = query(
      collection(db, "posts"),
      where("section", "==", section),
      where("status", "==", "approved")
    );

    const snap = await getDocs(q);

    if (snap.empty) {
      sectionBody.innerHTML = `<div class="empty">No posts yet in this section.</div>`;
      return;
    }

    const posts = [];
    snap.forEach((d) => posts.push({ id: d.id, ...d.data() }));
    posts.sort((a, b) => tsToMs(b.createdAt) - tsToMs(a.createdAt));

    let html = `<div style="display:flex; flex-direction:column; gap:12px;">`;

    for (const p of posts) {
      const hasFile = !!p.fileURL;

      html += `
        <div class="card" style="padding:14px; background:rgba(255,255,255,.05); box-shadow:none;">
          ${p.title ? `<div style="font-weight:900; margin-bottom:6px;">${escapeHTML(p.title)}</div>` : ""}
          ${p.text ? `<div style="color:rgba(234,234,255,.78); white-space:pre-wrap; line-height:1.5;">${escapeHTML(p.text)}</div>` : ""}

          ${
            hasFile
              ? renderFilePreview(p.fileURL, p.fileType)
              : ""
          }

          <div style="margin-top:10px; color:rgba(234,234,255,.45); font-size:12px;">
            Posted by ${escapeHTML(p.createdByEmail || "unknown")}
          </div>
        </div>
      `;
    }

    html += `</div>`;
    sectionBody.innerHTML = html;
  } catch (err) {
    console.error("loadPosts error:", err);
    sectionBody.innerHTML = `<div class="empty">Error loading posts. Check Console.</div>`;
  }
}

function renderFilePreview(url, type) {
  const safeUrl = escapeHTML(url);
  const isImage = (type || "").startsWith("image/");
  const isPDF = type === "application/pdf" || safeUrl.toLowerCase().endsWith(".pdf");

  if (isImage) {
    return `
      <div style="margin-top:10px;">
        <img src="${safeUrl}" alt="upload" style="width:100%; max-height:420px; object-fit:cover; border-radius:14px; border:1px solid rgba(255,255,255,.10);" />
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
// ADMIN: Users + Pending Posts
// ===============================
async function renderAdminPanel() {
  sectionBody.innerHTML = `<div class="empty">Loading admin panel...</div>`;

  // Build users list
  const usersQ = query(collection(db, "users"), orderBy("createdAt", "desc"));
  const usersSnap = await getDocs(usersQ);

  // Pending posts
  const pendingQ = query(collection(db, "posts"), where("status", "==", "pending"));
  const pendingSnap = await getDocs(pendingQ);

  // Users HTML
  let usersHTML = `<div style="display:flex; flex-direction:column; gap:12px;">`;
  usersSnap.forEach((d) => {
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
  });
  usersHTML += `</div>`;

  // Pending Posts HTML
  const pendingPosts = [];
  pendingSnap.forEach((d) => pendingPosts.push({ id: d.id, ...d.data() }));
  pendingPosts.sort((a, b) => tsToMs(b.createdAt) - tsToMs(a.createdAt));

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
              <div style="font-weight:900;">${escapeHTML(p.section || "post").toUpperCase()}</div>
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

  // Final admin panel
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
}

window.approvePost = async function (postId) {
  await updateDoc(doc(db, "posts", postId), { status: "approved" });
  await renderAdminPanel();
  await updateSideCounts();
};
window.denyPost = async function (postId) {
  // Deny = delete post record. (Cloudinary file remains unless you add signed deletes later.)
  await deleteDoc(doc(db, "posts", postId));
  await renderAdminPanel();
  await updateSideCounts();
};

window.approveUser = async function (uid) {
  await updateDoc(doc(db, "users", uid), { status: "approved" });
  await renderAdminPanel();
};
window.banUser = async function (uid) {
  await updateDoc(doc(db, "users", uid), { status: "banned" });
  await renderAdminPanel();
};
window.unbanUser = async function (uid) {
  await updateDoc(doc(db, "users", uid), { status: "approved" });
  await renderAdminPanel();
};
window.changeRole = async function (uid, role) {
  await updateDoc(doc(db, "users", uid), { role });
  await renderAdminPanel();
};

// ===============================
// Side counts (pending posts per section)
// ===============================
async function updateSideCounts() {
  try {
    if (!sideBody) return;

    // For school/media tabs, show pending count for that section (admin can see pending)
    if (currentTab === "school" || currentTab === "media") {
      const sec = currentTab;
      const q1 = query(collection(db, "posts"), where("section", "==", sec), where("status", "==", "pending"));
      const s1 = await getDocs(q1);
      sideBody.textContent = isAdmin()
        ? `Auto-refresh: every 5s • Pending in ${sec}: ${s1.size}`
        : `Auto-refresh: every 5s`;
      return;
    }

    if (currentTab === "admin") {
      const qAll = query(collection(db, "posts"), where("status", "==", "pending"));
      const sAll = await getDocs(qAll);
      sideBody.textContent = `Auto-refresh: every 5s • Pending posts: ${sAll.size}`;
      return;
    }

    sideBody.textContent = "Auto-refresh: every 5s";
  } catch (e) {
    console.error("updateSideCounts", e);
  }
}

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
    if (sideCard) sideCard.style.display = "block";
    updateSideCounts();
  }

  if (currentTab === "media") {
    sectionTitle.textContent = "Media";
    if (newBtn) newBtn.style.display = "inline-block";
    loadPosts("media");
    if (sideTitle) sideTitle.textContent = "Queue";
    if (sideCard) sideCard.style.display = "block";
    updateSideCounts();
  }

  if (currentTab === "chat") {
    sectionTitle.textContent = "The Boys";
    if (newBtn) newBtn.style.display = "none";
    sectionBody.innerHTML = `<div class="empty">Chat UI comes next.</div>`;
    if (sideTitle) sideTitle.textContent = "Chat Queue";
    if (sideBody) sideBody.textContent = "Soon";
    if (sideCard) sideCard.style.display = "block";
  }

  if (currentTab === "admin") {
    sectionTitle.textContent = "Admin Panel";
    if (newBtn) newBtn.style.display = "none";

    if (!isAdmin()) {
      sectionBody.innerHTML = `<div class="empty">You are not an admin.</div>`;
    } else {
      renderAdminPanel();
    }

    if (sideTitle) sideTitle.textContent = "Admin Queue";
    if (sideCard) sideCard.style.display = "block";
    updateSideCounts();
  }

  if (currentTab === "info") {
    sectionTitle.textContent = "Info";
    if (newBtn) newBtn.style.display = "none";
    sectionBody.innerHTML = `
      <div class="empty">
        <div style="text-align:left; max-width:520px; margin: 0 auto;">
          <div style="font-weight:900; margin-bottom:8px;">Account Status Rules</div>
          <div style="color:rgba(234,234,255,.70); line-height:1.6">
            • New signup = <b>pending</b><br/>
            • Approved user = <b>approved</b><br/>
            • Banned user = <b>banned</b><br/>
            • Text-only posts = <b>approved</b><br/>
            • File uploads = <b>pending</b> unless admin/owner
          </div>
        </div>
      </div>
    `;
    if (sideCard) sideCard.style.display = "none";
  }
}

// ===============================
// Manual refresh button
// ===============================
window.refreshSide = function () {
  if (composerOpen) return;

  if (currentTab === "school") return loadPosts("school");
  if (currentTab === "media") return loadPosts("media");
  if (currentTab === "admin") return isAdmin() ? renderAdminPanel() : null;
  updateSideCounts();
};

// ===============================
// Auto refresh (every 5 seconds)
// ===============================
function stopAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = null;
}
function startAutoRefresh() {
  stopAutoRefresh();

  const shouldRefresh = (currentTab === "school" || currentTab === "media" || currentTab === "admin");
  if (!shouldRefresh) return;

  refreshTimer = setInterval(async () => {
    if (composerOpen) return;

    if (currentTab === "school") await loadPosts("school");
    if (currentTab === "media") await loadPosts("media");
    if (currentTab === "admin" && isAdmin()) await renderAdminPanel();
    await updateSideCounts();
  }, 5000);
}

// ===============================
// Auth state
// ===============================
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    currentUserProfile = null;
    stopAutoRefresh();
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
    stopAutoRefresh();
    showOnly("pending");
    return;
  }

  const data = snap.data();
  currentUserProfile = data;

  if (data.status === "banned") {
    stopAutoRefresh();
    showOnly("auth");
    setHint("This account is banned.");
    await signOut(auth);
    return;
  }

  if (data.status === "pending") {
    stopAutoRefresh();
    showOnly("pending");
    return;
  }

  showOnly("app");

  if (displayNameEl) displayNameEl.textContent = data.displayName || data.email || "User";
  if (rolePill) rolePill.textContent = (data.role || "user").toUpperCase();
  if (subTitle) {
    subTitle.textContent = isAdmin()
      ? "Administrator Dashboard"
      : "Dashboard";
  }

  const adminTabBtn = document.querySelector('.tab[data-tab="admin"]');
  if (adminTabBtn) {
    adminTabBtn.style.display = isAdmin() ? "inline-flex" : "none";
  }

  renderTab();
  startAutoRefresh();
});
