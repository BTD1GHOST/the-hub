
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
