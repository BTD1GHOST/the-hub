// ===============================
// THE HUB — app.js (v11 + Nicknames + Owner self-edit nick)
// Fixes:
// - Non-admin posts are ALWAYS pending (approval required)
// - Click any post -> full view modal
// - Admin can delete chat messages
// - Admin can delete ANY post (approved or pending)
// + Admin can set nicknames (displayed instead of email)
// + Owner can set THEIR OWN nickname (was blocked)
// + Tutor tab (100% free local AI via Ollama - vision)
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

// Realtime unsubscribers (TAB-SCOPED)
let unsubPosts = null;
let unsubPendingCount = null;
let unsubAdminUsers = null;
let unsubAdminPendingPosts = null;
let unsubChat = null;

// Global realtime (NOT killed on tab switch)
let unsubUserNames = null;

// Cache for clickable posts
let postCache = {}; // { [id]: postData }

// currently opened post id (for delete)
let currentPostViewId = null;

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

function cleanupTabRealtime() {
  if (unsubPosts) unsubPosts();
  if (unsubPendingCount) unsubPendingCount();
  if (unsubAdminUsers) unsubAdminUsers();
  if (unsubAdminPendingPosts) unsubAdminPendingPosts();
  if (unsubChat) unsubChat();

  unsubPosts = unsubPendingCount = unsubAdminUsers = unsubAdminPendingPosts = unsubChat = null;
}

function cleanupAllRealtime() {
  cleanupTabRealtime();
  if (unsubUserNames) unsubUserNames();
  unsubUserNames = null;
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
// Nicknames / Display Names (Realtime cache)
// ===============================
let userNameCache = {}; // { [uid]: { nickname, displayName, email } }

function displayNameFor(uid, emailFallback = "") {
  const u = userNameCache?.[uid];
  const name =
    (u?.nickname || "").trim() ||
    (u?.displayName || "").trim() ||
    (u?.email || "").trim() ||
    (emailFallback || "").trim();
  return name || "unknown";
}

function startRealtimeUserNames() {
  if (unsubUserNames) unsubUserNames();
  unsubUserNames = onSnapshot(collection(db, "users"), (snap) => {
    const next = {};
    snap.forEach((d) => {
      const data = d.data() || {};
      next[d.id] = {
        nickname: data.nickname || "",
        displayName: data.displayName || "",
        email: data.email || ""
      };
    });
    userNameCache = next;

    // Refresh current tab so labels update instantly
    try { renderTab(); } catch {}
  });
}

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
    const who = displayNameFor(p.createdBy, p.createdByEmail || "");
    postViewMeta.textContent = `${who} • ${when} • ${String(p.section || "").toUpperCase()}`;
  }

  if (postViewText) postViewText.textContent = p.text || "";
  if (postViewFile) postViewFile.innerHTML = p.fileURL ? renderFilePreview(p.fileURL, p.fileType) : "";

  // show delete button only for admins
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

// Click handling for posts (event delegation)
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
      nickname: "",
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
  cleanupAllRealtime();
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
// Post composer
// ===============================
window.openComposer = function () {
  if (currentTab !== "school" && currentTab !== "media") return alert("New is only for School/Media.");

  composerTitleEl.textContent = currentTab === "school" ? "New School Post" : "New Media Post";
  postTitleInput.value = "";
  postTextInput.value = "";
  postFileInput.value = "";
  fileHint.textContent = "Optional: attach image/PDF.";
  composerOverlay.style.display = "grid";
  postTitleInput.focus();
};

window.closeComposer = function () {
  composerOverlay.style.display = "none";
};

postFileInput?.addEventListener("change", () => {
  const f = postFileInput.files?.[0];
  fileHint.textContent = f ? `Selected: ${f.name}` : "Optional: attach image/PDF.";
});

window.submitPost = async function () {
  if (!auth.currentUser || !currentUserProfile) return alert("Not logged in.");

  const section = currentTab;
  const title = (postTitleInput.value || "").trim();
  const text = (postTextInput.value || "").trim();
  const file = postFileInput.files?.[0] || null;

  if (!title && !text && !file) return alert("Write something or attach a file.");

  // Non-admin => ALWAYS pending
  const status = isAdmin() ? "approved" : "pending";

  let fileURL = "";
  let fileType = "";

  try {
    if (file) {
      fileHint.textContent = "Uploading...";
      const up = await uploadToCloudinary(file);
      fileURL = up.url;
      fileType = up.type;
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
    if (!isAdmin()) alert("Posted ✅ Sent for approval (pending).");
  } catch (err) {
    console.error(err);
    alert(err?.message || "Failed to post.");
  }
};

// ===============================
// Realtime Posts (approved only)
// ===============================
function startRealtimePosts(section) {
  if (unsubPosts) unsubPosts();

  sectionBody.innerHTML = `<div class="empty">Loading...</div>`;
  postCache = {};

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
      snap.forEach((d) => {
        const p = { id: d.id, ...d.data() };
        posts.push(p);
        postCache[d.id] = p;
      });

      posts.sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt));

      let html = `<div style="display:flex; flex-direction:column; gap:12px;">`;
      for (const p of posts) {
        const who = displayNameFor(p.createdBy, p.createdByEmail || "");
        html += `
          <div class="card postCard" data-postid="${escapeHTML(p.id)}" style="padding:14px; background:rgba(255,255,255,.05); box-shadow:none;">
            ${p.title ? `<div style="font-weight:900; margin-bottom:6px;">${escapeHTML(p.title)}</div>` : ""}
            ${p.text ? `<div style="color:rgba(234,234,255,.78); white-space:pre-wrap; line-height:1.5; max-height: 4.2em; overflow:hidden;">${escapeHTML(p.text)}</div>` : ""}
            ${p.fileURL ? `<div style="margin-top:8px; color:rgba(234,234,255,.55); font-size:12px;">Attachment included • click to view</div>` : ""}
            <div style="margin-top:10px; color:rgba(234,234,255,.45); font-size:12px;">
              ${escapeHTML(who)} • click to open
            </div>
          </div>
        `;
      }
      html += `</div>`;
      sectionBody.innerHTML = html;
    },
    (err) => {
      console.error(err);
      sectionBody.innerHTML = `<div class="empty">Error loading posts. Check Console.</div>`;
    }
  );
}

function startRealtimePendingCount(sectionOrAll) {
  if (unsubPendingCount) unsubPendingCount();

  const q =
    sectionOrAll === "all"
      ? query(collection(db, "posts"), where("status", "==", "pending"))
      : query(
          collection(db, "posts"),
          where("section", "==", sectionOrAll),
          where("status", "==", "pending")
        );

  unsubPendingCount = onSnapshot(q, (snap) => {
    if (!sideBody) return;

    if (sectionOrAll === "all") {
      sideBody.textContent = isAdmin() ? `Realtime • Pending posts: ${snap.size}` : `Realtime`;
    } else {
      sideBody.textContent = isAdmin()
        ? `Realtime • Pending in ${sectionOrAll}: ${snap.size}`
        : `Realtime`;
    }
  });
}

// ===============================
// Admin panel realtime (users + pending posts)
// ===============================
function startRealtimeAdminPanel() {
  if (!isAdmin()) {
    sectionBody.innerHTML = `<div class="empty">You are not an admin.</div>`;
    return;
  }

  if (unsubAdminUsers) unsubAdminUsers();
  if (unsubAdminPendingPosts) unsubAdminPendingPosts();

  sectionBody.innerHTML = `<div class="empty">Loading admin panel...</div>`;

  let latestUsers = [];
  let latestPending = [];

  const rerender = () => {
    const pendingPosts = [...latestPending].sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt));

    let pendingHTML =
      pendingPosts.length === 0
        ? `<div class="empty" style="padding:14px 10px;">No pending posts.</div>`
        : `
          <div style="display:flex; flex-direction:column; gap:12px;">
            ${pendingPosts
              .map((p) => {
                const who = displayNameFor(p.createdBy, p.createdByEmail || "");
                return `
                <div class="card" style="padding:14px; background:rgba(255,255,255,.05); box-shadow:none;">
                  <div style="display:flex; justify-content:space-between; gap:12px; align-items:center; flex-wrap:wrap;">
                    <div style="flex:1; min-width:260px;">
                      <div style="font-weight:900;">${escapeHTML((p.section || "post").toUpperCase())}</div>
                      ${p.title ? `<div style="margin-top:6px; font-weight:800;">${escapeHTML(p.title)}</div>` : ""}
                      ${p.text ? `<div style="margin-top:6px; color:rgba(234,234,255,.78); white-space:pre-wrap; line-height:1.5;">${escapeHTML(p.text)}</div>` : ""}
                      ${p.fileURL ? renderFilePreview(p.fileURL, p.fileType) : ""}
                      <div style="margin-top:10px; color:rgba(234,234,255,.45); font-size:12px;">From ${escapeHTML(who)}</div>
                    </div>
                    <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                      <button class="btn" onclick="approvePost('${p.id}')">Approve</button>
                      <button class="btn secondary" onclick="denyPost('${p.id}')">Deny</button>
                    </div>
                  </div>
                </div>
              `;
              })
              .join("")}
          </div>
        `;

    const usersHTML = `
      <div style="display:flex; flex-direction:column; gap:12px;">
        ${latestUsers
          .map((u) => {
            const email = u.email || "(no email)";
            const role = u.role || "user";
            const status = u.status || "pending";
            const uid = u.id;
            const nick = u.nickname || "";
            const statusColor =
              status === "approved" ? "var(--good)" : status === "pending" ? "var(--warn)" : "var(--bad)";
            const isOwner = role === "owner";
            const isMe = auth.currentUser?.uid === uid;

            // ✅ Only disable nickname editing if it's an owner AND not me
            const nickDisabled = isOwner && !isMe;

            return `
              <div class="card" style="padding:14px; background:rgba(255,255,255,.05); box-shadow:none;">
                <div style="display:flex; justify-content:space-between; gap:12px; align-items:center; flex-wrap:wrap;">
                  <div style="min-width:260px;">
                    <div style="font-weight:800;">
                      ${escapeHTML(nick ? `${nick} (${email})` : email)}
                    </div>
                    <div style="color:rgba(234,234,255,.65); font-size:13px;">
                      <span style="color:${statusColor}; font-weight:900;">${escapeHTML(status.toUpperCase())}</span>
                      • Role: <b>${escapeHTML(role)}</b>
                      • UID: <span style="opacity:.6;">${uid.slice(0, 6)}…</span>
                    </div>
                  </div>

                  <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; justify-content:flex-end;">
                    <select class="input" style="width:auto; padding:10px 12px;" onchange="changeRole('${uid}', this.value)" ${
                      isOwner ? "disabled" : ""
                    }>
                      ${["user", "admin", "owner"]
                        .map((r) => `<option value="${r}" ${r === role ? "selected" : ""}>${r}</option>`)
                        .join("")}
                    </select>

                    <input class="input" style="width:180px; padding:10px 12px;" placeholder="Nickname"
                      value="${escapeHTML(nick)}"
                      oninput="this.dataset.val=this.value" ${nickDisabled ? "disabled" : ""} />

                    <button class="btn secondary" onclick="setNickname('${uid}', this.previousElementSibling.dataset.val ?? this.previousElementSibling.value)" ${
                      nickDisabled ? "disabled" : ""
                    }>
                      Save Nick
                    </button>

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
          })
          .join("")}
      </div>
    `;

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

  unsubAdminUsers = onSnapshot(query(collection(db, "users"), orderBy("createdAt", "desc")), (snap) => {
    latestUsers = [];
    snap.forEach((d) => latestUsers.push({ id: d.id, ...d.data() }));
    rerender();
  });

  unsubAdminPendingPosts = onSnapshot(query(collection(db, "posts"), where("status", "==", "pending")), (snap) => {
    latestPending = [];
    snap.forEach((d) => latestPending.push({ id: d.id, ...d.data() }));
    rerender();
  });
}

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

window.setNickname = async function (uid, nickname) {
  if (!isAdmin()) return;
  const clean = String(nickname || "").trim();
  await updateDoc(doc(db, "users", uid), { nickname: clean });
};

// ===============================
// CHAT — The Boys (admin delete)
// ===============================
const CHAT_ROOM_ID = "theboys";

function chatTemplate() {
  return `
    <div class="chatWrap">
      <div class="chatList" id="chatList">
        <div class="empty">Loading chat...</div>
      </div>

      <div class="chatComposer">
        <div class="chatInput">
          <textarea class="input textarea" id="chatText" placeholder="Message..." style="min-height:90px;"></textarea>
          <div class="chatSmall" id="chatHint">Realtime chat • room: The Boys</div>
        </div>

        <div style="display:flex; flex-direction:column; gap:10px; min-width:220px;">
          <input class="file" type="file" id="chatFile" accept="image/*,application/pdf" />
          <button class="btn" onclick="sendChat()">Send</button>
          <button class="btn secondary" onclick="clearChatFile()">Clear file</button>
        </div>
      </div>
    </div>
  `;
}

function startRealtimeChat() {
  if (unsubChat) unsubChat();

  const listEl = document.getElementById("chatList");
  if (!listEl) return;

  const msgsRef = collection(db, "rooms", CHAT_ROOM_ID, "messages");
  const q = query(msgsRef, orderBy("createdAt", "asc"), limit(200));

  unsubChat = onSnapshot(
    q,
    (snap) => {
      if (snap.empty) {
        listEl.innerHTML = `<div class="empty">No messages yet.</div>`;
        return;
      }

      let html = "";
      snap.forEach((d) => {
        const m = d.data();
        const id = d.id;
        const when = m.createdAt ? new Date(tsMs(m.createdAt)).toLocaleString() : "";
        const delBtn = isAdmin()
          ? `<button class="btn danger" style="padding:8px 10px;" onclick="deleteChatMsg('${id}')">Delete</button>`
          : "";

        const who = displayNameFor(m.createdBy, m.createdByEmail || "");

        html += `
          <div class="chatMsg">
            <div style="flex:1;">
              <div class="chatMeta">
                <b>${escapeHTML(who)}</b> • ${escapeHTML(when)}
              </div>
              ${m.text ? `<div class="chatText">${escapeHTML(m.text)}</div>` : ""}
              ${m.fileURL ? renderFilePreview(m.fileURL, m.fileType) : ""}
            </div>
            <div style="display:flex; align-items:flex-start;">
              ${delBtn}
            </div>
          </div>
        `;
      });

      listEl.innerHTML = html;
      listEl.scrollTop = listEl.scrollHeight;
    },
    (err) => {
      console.error("chat error:", err);
      listEl.innerHTML = `<div class="empty">Chat error. Check Console.</div>`;
    }
  );
}

window.clearChatFile = function () {
  const f = document.getElementById("chatFile");
  if (f) f.value = "";
};

window.sendChat = async function () {
  const textEl = document.getElementById("chatText");
  const fileEl = document.getElementById("chatFile");
  const hintEl = document.getElementById("chatHint");
  if (!textEl || !fileEl) return;

  const text = (textEl.value || "").trim();
  const file = fileEl.files?.[0] || null;
  if (!text && !file) return alert("Type a message or add a file.");

  let fileURL = "";
  let fileType = "";

  try {
    if (file) {
      if (hintEl) hintEl.textContent = "Uploading...";
      const up = await uploadToCloudinary(file);
      fileURL = up.url;
      fileType = up.type;
      if (hintEl) hintEl.textContent = "Uploaded ✔ sending...";
    }

    const msgsRef = collection(db, "rooms", CHAT_ROOM_ID, "messages");
    await addDoc(msgsRef, {
      text,
      fileURL,
      fileType,
      createdBy: auth.currentUser.uid,
      createdByEmail: currentUserProfile.email || "",
      createdAt: serverTimestamp()
    });

    textEl.value = "";
    fileEl.value = "";
    if (hintEl) hintEl.textContent = "Realtime chat • room: The Boys";
  } catch (err) {
    console.error(err);
    alert(err?.message || "Failed to send.");
    if (hintEl) hintEl.textContent = "Realtime chat • room: The Boys";
  }
};

window.deleteChatMsg = async function (messageId) {
  if (!isAdmin()) return;
  if (!confirm("Delete this message?")) return;
  await deleteDoc(doc(db, "rooms", CHAT_ROOM_ID, "messages", messageId));
};

// ===============================
// AI TUTOR (100% FREE via local Ollama)
// NOTE: This calls your *local* computer at http://localhost:11434
// If your site is served over HTTPS (GitHub Pages), browsers may block mixed-content requests.
// For Tutor to work reliably, open the Hub via a local server (http://localhost/...)
// ===============================
const OLLAMA_URL = "http://localhost:11434/api/chat";
const OLLAMA_MODEL = "llava";


function tutorTemplate() {
  return `
    <div style="display:flex; flex-direction:column; gap:12px;">
      <div style="color:rgba(238,242,255,.80); line-height:1.5;">
        <b>Study Tutor</b> (runs on your computer — free). Upload a photo/screenshot and ask a question.
        <div class="mutedNote" style="margin-top:8px;">
          If this tab says it can’t reach Ollama, make sure Ollama is running and you opened the Hub on <b>http://localhost</b> (not https).
        </div>
      </div>

      <input class="file" type="file" id="tutorImg" accept="image/*" />

      <textarea class="input textarea" id="tutorQ"
        placeholder="Ask your question... (ex: 'Solve #4 and explain each step')"
        style="min-height:120px;"></textarea>

      <div class="row">
        <button class="btn" onclick="runTutor()">Analyze</button>
        <button class="btn secondary" onclick="clearTutor()">Clear</button>
      </div>

      <div class="hint" id="tutorHint"></div>

      <textarea class="input textarea" id="tutorA"
        placeholder="Answer will appear here..."
        style="min-height:240px;" readonly></textarea>

      <div class="mutedNote">
        Tip: ask it to show steps and to double-check. No AI is perfect — verification is how you stay “right.”
      </div>
    </div>
  `;
}

function setTutorHint(msg) {
  const el = document.getElementById("tutorHint");
  if (el) el.textContent = msg || "";
}

window.clearTutor = function () {
  const img = document.getElementById("tutorImg");
  const q = document.getElementById("tutorQ");
  const a = document.getElementById("tutorA");
  if (img) img.value = "";
  if (q) q.value = "";
  if (a) a.value = "";
  setTutorHint("");
};

async function fileToBase64NoPrefix(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || "");
      const b64 = s.includes(",") ? s.split(",")[1] : s;
      resolve(b64);
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

window.runTutor = async function () {
  const imgEl = document.getElementById("tutorImg");
  const qEl = document.getElementById("tutorQ");
  const aEl = document.getElementById("tutorA");

  if (!qEl || !aEl || !imgEl) return;
  const question = (qEl.value || "").trim();
  const file = imgEl.files?.[0] || null;

  if (!question) return alert("Type a question.");
  if (!file) return alert("Upload an image.");

  try {
    setTutorHint("Reading image...");
    aEl.value = "";

    const b64 = await fileToBase64NoPrefix(file);

    setTutorHint("Talking to local AI (Ollama)...");
    const prompt =
`You are a school tutor. Use the image to answer the question accurately.
- Explain briefly with steps.
- If anything is unclear, ask one short clarification.
Question: ${question}`;

    const body = {
      model: OLLAMA_MODEL,
      stream: false,
      messages: [{ role: "user", content: prompt, images: [b64] }]
    };

    const res = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`Ollama error (${res.status}). ${t || "Is Ollama running?"}`);
    }

    const data = await res.json();
    const out = data?.message?.content || "";
    aEl.value = out || "(No response)";
    setTutorHint("Done ✅");
  } catch (err) {
    console.error(err);
    const msg = String(err?.message || "Tutor failed.");
    if (msg.toLowerCase().includes("failed to fetch")) {
      setTutorHint("Error: blocked or unreachable. Open the Hub via http://localhost and make sure Ollama is running.");
    } else {
      setTutorHint("Error: " + msg);
    }
  }
};

// ===============================
// Render Tabs
// ===============================
function renderTab() {
  if (!sectionTitle || !sectionBody) return;

  cleanupTabRealtime();

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
    if (sideCard) sideCard.style.display = "block";
    if (sideTitle) sideTitle.textContent = "Chat";
    if (sideBody) sideBody.textContent = "Realtime";
    sectionBody.innerHTML = chatTemplate();
    startRealtimeChat();
  }

  if (currentTab === "tutor") {
    sectionTitle.textContent = "Tutor";
    if (newBtn) newBtn.style.display = "none";
    if (sideCard) sideCard.style.display = "none";
    sectionBody.innerHTML = tutorTemplate();
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
            • Non-admin posts = <b>pending approval</b><br/>
            • Click any post to full-view ✅<br/>
            • Admin can delete posts ✅<br/>
            • Admin can delete chat messages ✅<br/>
            • Admin can set nicknames ✅<br/>
            • Owner can set their own nickname ✅<br/>
            • Tutor (local AI) ✅
          </div>
        </div>
      </div>
    `;
    if (sideCard) sideCard.style.display = "none";
  }
}

window.refreshSide = function () {
  renderTab();
};

// ===============================
// Auth state
// ===============================
onAuthStateChanged(auth, async (user) => {
  cleanupAllRealtime();

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
      nickname: "",
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

  // Start realtime nickname/display cache
  startRealtimeUserNames();

  // Show YOUR display name in the header using the same priority
  const myName = displayNameFor(user.uid, data.email || user.email || "");
  if (displayNameEl) displayNameEl.textContent = myName;

  if (rolePill) rolePill.textContent = (data.role || "user").toUpperCase();
  if (subTitle) subTitle.textContent = isAdmin() ? "Administrator Dashboard" : "Dashboard";

  const adminTabBtn = document.querySelector('.tab[data-tab="admin"]');
  if (adminTabBtn) adminTabBtn.style.display = isAdmin() ? "inline-flex" : "none";

  renderTab();
});
