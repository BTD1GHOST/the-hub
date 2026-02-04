// ===== Firebase =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc,
  updateDoc, collection, addDoc,
  onSnapshot, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  getMessaging, getToken, onMessage
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";

// ===== Config =====
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
const messaging = getMessaging(app);

// ===== DOM =====
const authScreen = document.getElementById("authScreen");
const pendingScreen = document.getElementById("pendingScreen");
const appScreen = document.getElementById("appScreen");
const sectionBody = document.getElementById("sectionBody");
const adminTab = document.getElementById("adminTab");

let currentUserProfile = null;
let currentTab = "chat";

// ===== Helpers =====
const show = (a,b,c) => {
  authScreen.style.display=a;
  pendingScreen.style.display=b;
  appScreen.style.display=c;
};
const isAdmin = () => currentUserProfile?.role === "admin";

// ===== AUTH =====
window.signup = async () => {
  const email = email.value;
  const password = password.value;
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await setDoc(doc(db,"users",cred.user.uid),{
    email, role:"user", status:"pending", createdAt:Date.now()
  });
};

window.login = async () => {
  await signInWithEmailAndPassword(auth,email.value,password.value);
};

window.logout = async () => signOut(auth);

// ===== NOTIFICATIONS =====
window.enableNotifications = async () => {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return alert("Blocked");

  const token = await getToken(messaging,{
    vapidKey: "PASTE_YOUR_VAPID_KEY_HERE"
  });

  await updateDoc(doc(db,"users",auth.currentUser.uid),{
    pushToken: token
  });

  alert("Notifications enabled");
};

onMessage(messaging, payload => {
  alert(payload.notification.title + "\n" + payload.notification.body);
});

// ===== CHAT =====
function renderChat() {
  sectionBody.innerHTML = `
    <div class="chatList" id="chatList"></div>
    <textarea id="chatText" class="input"></textarea>
    <button class="btn" onclick="sendChat()">Send</button>
  `;

  const list = document.getElementById("chatList");

  onSnapshot(collection(db,"rooms","theboys","messages"), snap => {
    list.innerHTML="";
    snap.forEach(d=>{
      const m=d.data();
      list.innerHTML+=`
        <div class="chatMsg">
          <b>${m.createdByEmail}</b>: ${m.text}
          ${isAdmin()?`<button onclick="deleteMsg('${d.id}')">🗑</button>`:""}
        </div>`;
    });
  });
}

window.sendChat = async () => {
  await addDoc(collection(db,"rooms","theboys","messages"),{
    text: chatText.value,
    createdBy: auth.currentUser.uid,
    createdByEmail: currentUserProfile.email,
    createdAt: serverTimestamp()
  });
  chatText.value="";
};

window.deleteMsg = async id =>
  await deleteDoc(doc(db,"rooms","theboys","messages",id));

// ===== ADMIN =====
function renderAdmin() {
  sectionBody.innerHTML="<h2>Admin</h2>";
}

// ===== TABS =====
window.showTab = tab => {
  currentTab=tab;
  tab==="chat"?renderChat():renderAdmin();
};

// ===== AUTH STATE =====
onAuthStateChanged(auth, async user => {
  if(!user) return show("block","none","none");

  const snap = await getDoc(doc(db,"users",user.uid));
  if(!snap.exists()) return;

  currentUserProfile=snap.data();

  if(currentUserProfile.status==="pending")
    return show("none","block","none");

  show("none","none","block");

  displayName.textContent=currentUserProfile.email;
  rolePill.textContent=currentUserProfile.role.toUpperCase();
  adminTab.style.display=isAdmin()?"inline-block":"none";

  showTab("chat");
});
