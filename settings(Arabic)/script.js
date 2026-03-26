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
  if (!toast) {
    window.alert(message);
    return;
  }
  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(function () {
    toast.classList.remove("show");
  }, 3000);
}

const API_BASE_URL = "http://127.0.0.1:8000";
const TOKEN_KEY = "access_token";

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function getFilenameFromContentDisposition(contentDisposition, fallback) {
  if (!contentDisposition) return fallback;
  const match = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(contentDisposition);
  if (!match) return fallback;
  return match[1].replace(/['"]/g, "");
}

async function downloadWithAuth(url, fallbackFilename) {
  const token = getToken();
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { headers });

  if (!res.ok) {
    let payload = null;
    try {
      payload = await res.json();
    } catch (e) {
      // ignore
    }
    throw new Error((payload && payload.detail) || `Request failed (${res.status})`);
  }

  const blob = await res.blob();
  const cd = res.headers.get("content-disposition");
  const filename = getFilenameFromContentDisposition(cd, fallbackFilename);

  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

document.addEventListener("DOMContentLoaded", () => {
  const downloadBtn = document.querySelector(".download-d");
  const deleteBtn = document.querySelector(".delete-d");
  const uploadBtn = document.querySelector(".upload-d");

  if (downloadBtn) {
    downloadBtn.addEventListener("click", async () => {
      try {
        await downloadWithAuth(`${API_BASE_URL}/dashboard/export-excel`, "Predictions_Export.xlsx");
      } catch (err) {
        showToast(err.message || "Download failed");
      }
    });
  }

  if (deleteBtn) {
    deleteBtn.addEventListener("click", () => {
      showToast("غير مدعوم حاليًا في الـ backend");
    });
  }
  if (uploadBtn) {
    uploadBtn.addEventListener("click", () => {
      showToast("غير متصل حاليًا بـ backend");
    });
  }
});