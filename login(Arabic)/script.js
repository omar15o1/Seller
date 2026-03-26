function myFunction() {
  var x = document.getElementById("password");
  if (x.type === "password") {
    x.type = "text";
  } else {
    x.type = "password";
  }
}

function showToast(message) {
  var toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  
  setTimeout(function() {
    toast.classList.remove("show");
  }, 3000);
}

const API_BASE_URL = "http://127.0.0.1:8000";
const TOKEN_KEY = "access_token";

async function loginApi({ username, password }) {
  const res = await fetch(`${API_BASE_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  let payload = null;
  try {
    payload = await res.json();
  } catch (e) {
    // ignore
  }

  if (!res.ok) {
    const detail = payload && payload.detail ? payload.detail : `Login failed (${res.status})`;
    throw new Error(detail);
  }

  return payload;
}

async function validateالنموذج(event) {
  event.preventDefault();

  var username = document.getElementById("username").value.trim();
  var password = document.getElementById("password").value.trim();

  if (username === "") {
    showToast("Please enter a username");
    return false;
  }

  if (password === "") {
    showToast("Please enter a password");
    return false;
  }

  try {
    const payload = await loginApi({ username, password });
    const token = payload.access_token;
    if (!token) {
      showToast("Unexpected response from server");
      return false;
    }

    localStorage.setItem(TOKEN_KEY, token);
    window.location.href = "../API(Arabic)/index.html";
    return true;
  } catch (err) {
    showToast(err.message || "Login failed");
    return false;
  } finally {
    const loadEl = document.getElementById("load");
    if (loadEl) loadEl.style.display = "none";
  }
}

// Backward-compat: if some page calls validateForm
function validateForm(event) {
  return validateالنموذج(event);
}

function loading() {
  const paragraph = document.getElementById("load");
  if (!paragraph) return;
  paragraph.style.display = "block";
}
