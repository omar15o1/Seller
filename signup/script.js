function myFunction() {
  var password1 = document.getElementById("password1");
  var password2 = document.getElementById("password2");
  if (password1.type === "password") {
    password1.type = "text";
    password2.type = "text";
  } else {
    password1.type = "password";
    password2.type = "password";
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

async function registerApi({ username, password }) {
  const res = await fetch(`${API_BASE_URL}/register`, {
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
    const detail = payload && payload.detail ? payload.detail : `Register failed (${res.status})`;
    throw new Error(detail);
  }

  return payload;
}

async function validateForm(event) {
  event.preventDefault();

  var username = document.getElementById("username").value.trim();
  var password1 = document.getElementById("password1").value.trim();
  var password2 = document.getElementById("password2").value.trim();

  if (username === "") {
    showToast("Please enter a username");
    return false;
  }

  if (password1 === "") {
    showToast("Please enter a password");
    return false;
  }

  if (password2 === "") {
    showToast("Please confirm your password");
    return false;
  }

  if (password1 !== password2) {
    showToast("Passwords do not match");
    return false;
  }

  try {
    const loadEl = document.getElementById("load");
    if (loadEl) loadEl.style.display = "block";

    await registerApi({ username, password: password1 });
    showToast("Account created successfully");
    window.location.href = "../login/index.html";
    return true;
  } catch (err) {
    showToast(err.message || "Signup failed");
    return false;
  } finally {
    const loadEl = document.getElementById("load");
    if (loadEl) loadEl.style.display = "none";
  }
}

