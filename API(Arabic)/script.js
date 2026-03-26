(() => {
  const API_BASE_URL = "http://127.0.0.1:8000";
  const TOKEN_KEY = "access_token";

  const historyEl = document.querySelector(".history");
  const priceOutput = document.querySelector(".price");
  const statusEl = document.querySelector(".static");
  const downloadLinks = document.querySelectorAll(".download a.df");

  let lastPredictionId = null;

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function getFilenameFromContentDisposition(contentDisposition, fallback) {
    if (!contentDisposition) return fallback;
    const match = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(contentDisposition);
    if (!match) return fallback;
    return match[1].replace(/['"]/g, "");
  }

  function showMessage(message) {
    if (statusEl) {
      statusEl.textContent = message;
      return;
    }
    window.alert(message);
  }

  function parseIntSafe(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
  }

  function parseFloatSafe(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function computeAge(year) {
    const y = parseIntSafe(year, NaN);
    if (!Number.isFinite(y)) return 0;
    const currentYear = new Date().getFullYear();
    return Math.max(0, currentYear - y);
  }

  async function apiFetch(path, options = {}) {
    const token = getToken();

    const headers = { ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        ...headers,
      },
    });

    return res;
  }

  async function downloadWithAuth(path, fallbackFilename) {
    const res = await apiFetch(path, { method: "GET" });
    if (!res) return;
    if (!res.ok) throw new Error(`Download failed (${res.status})`);

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

  function getFieldValue(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : "";
  }

  function mapDriveWheels(value) {
    // Match backend expectations: Front/Rear/4X4
    if (value === "امامي") return "Front";
    if (value === "خلفي") return "Rear";
    return value; // keep 4X4 / already-correct values
  }

  function mapWheel(value) {
    // Match backend expectations: Left/Right
    if (value === "يسار") return "Left";
    if (value === "يمين") return "Right";
    return value;
  }

  function renderHistoryFromMetadata(meta) {
    if (!historyEl || !meta || !meta.data || !meta.data.chart) return;

    const chart = meta.data.chart;
    const labels = chart.labels || [];
    const prices = chart.prices || [];
    const names = chart.names || [];

    historyEl.innerHTML = "";

    const count = Math.max(labels.length, prices.length, names.length);
    for (let i = 0; i < count; i++) {
      const card = document.createElement("div");
      card.className = "history-card";
      const label = labels[i] ?? "";
      const price = prices[i] ?? "";
      const name = names[i] ?? "";

      card.innerHTML = `
        <label class="hc">سيارة ${i + 1}</label>
        <p>${name ? `السيارة : ${name}` : ""}</p>
        <p>${price !== "" ? `السعر : ${price}` : ""}</p>
        <p>${label ? `التاريخ : ${label}` : ""}</p>
      `;

      historyEl.appendChild(card);
    }
  }

  async function loadDashboardMetadata() {
    const res = await apiFetch("/dashboard/metadata", { method: "GET" });
    if (!res) return;
    if (!res.ok) {
      showMessage("تعذر تحميل لوحة التحكم.");
      return;
    }

    const payload = await res.json();
    if (!payload || payload.status !== "success") return;

    renderHistoryFromMetadata(payload);

    if (priceOutput && payload.data && payload.data.stats) {
      const avg = payload.data.stats.average_price ?? 0;
      priceOutput.textContent = Number(avg).toLocaleString();
    }
  }

  async function predictNow() {
    const manufacturer = getFieldValue("manufacturer");
    const year = getFieldValue("year");
    const model = getFieldValue("model");
    const engineVolume = parseFloatSafe(getFieldValue("engineVolume"), NaN);
    const mileage = parseIntSafe(getFieldValue("mileage"), NaN);
    const cylinders = parseIntSafe(getFieldValue("cylinders"), NaN);
    const color = getFieldValue("color");
    const airbags = parseIntSafe(getFieldValue("airbags"), NaN);
    const fuelType = getFieldValue("fuelType");
    const category = getFieldValue("category");
    const gearBoxType = getFieldValue("gearBoxType");
    const driveWheelsRaw = getFieldValue("driveWheels");
    const wheelRaw = getFieldValue("wheel");

    // Levy input is not currently present in Arabic API page, but backend requires it.
    // We will try to read it if user added it later (otherwise default to 0).
    const levyInput = document.getElementById("levy");
    const levy = levyInput ? parseIntSafe(levyInput.value, 0) : 0;

    const driveWheels = mapDriveWheels(driveWheelsRaw);
    const wheel = mapWheel(wheelRaw);
    const age = computeAge(year);

    if (!manufacturer || !model || !fuelType || !category || !gearBoxType || !driveWheels || !wheel || !color) {
      showMessage("يرجى تعبئة جميع حقول النص المطلوبة.");
      return;
    }
    if (
      !Number.isFinite(engineVolume) ||
      !Number.isFinite(mileage) ||
      !Number.isFinite(cylinders) ||
      !Number.isFinite(levy) ||
      !Number.isFinite(airbags)
    ) {
      showMessage("يرجى تعبئة جميع حقول الأرقام المطلوبة.");
      return;
    }

    const body = {
      Manufacturer: manufacturer,
      Model: model,
      Category: category,
      Fuel_type: fuelType,
      Gear_box_type: gearBoxType,
      Drive_wheels: driveWheels,
      Wheel: wheel,
      Color: color,
      Engine_volume: engineVolume,
      Mileage: mileage,
      Levy: levy,
      Cylinders: cylinders,
      Airbags: airbags,
      age: age,
    };

    const res = await apiFetch("/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res) return;

    if (!res.ok) {
      let payload = null;
      try {
        payload = await res.json();
      } catch (e) {
        // ignore
      }
      showMessage((payload && payload.detail) || "فشل التنبؤ.");
      return;
    }

    const payload = await res.json();
    if (!payload || payload.status !== "success") {
      showMessage("فشل التنبؤ.");
      return;
    }

    const data = payload.data || {};
    lastPredictionId = data.prediction_id ?? null;
    const predictedPrice = data.price ?? 0;
    const confidence = data.confidence ?? null;

    if (priceOutput) priceOutput.textContent = Number(predictedPrice).toLocaleString();

    if (historyEl) {
      const card = document.createElement("div");
      card.className = "history-card";
      card.innerHTML = `
        <label class="hc">تنبؤ جديد</label>
        <p>الماركة : ${manufacturer}</p>
        <p>الموديل : ${model}</p>
        <p>السعر : ${Number(predictedPrice).toLocaleString()}</p>
        <p>${confidence !== null ? `درجة الثقة : ${confidence}%` : ""}</p>
      `;
      historyEl.prepend(card);
    }

    await loadDashboardMetadata();
    if (lastPredictionId) {
      showMessage("اكتمل التنبؤ. يمكنك تنزيل PDF للتنبؤ الأخير.");
    }
  }

  function bindDownloads() {
    if (!downloadLinks || downloadLinks.length < 2) return;
    const pdfLink = downloadLinks[0];
    const excelLink = downloadLinks[1];

    if (pdfLink) {
      pdfLink.addEventListener("click", async (e) => {
        e.preventDefault();
        if (!lastPredictionId) {
          showMessage("قم بعمل تنبؤ أولاً لتنزيل PDF.");
          return;
        }
        try {
          await downloadWithAuth(`/prediction/${lastPredictionId}/pdf`, `Report_${lastPredictionId}.pdf`);
        } catch (err) {
          showMessage(err.message || "تعذر تنزيل PDF.");
        }
      });
    }

    if (excelLink) {
      excelLink.addEventListener("click", async (e) => {
        e.preventDefault();
        try {
          await downloadWithAuth("/dashboard/export-excel", "Predictions_Export.xlsx");
        } catch (err) {
          showMessage(err.message || "تعذر تنزيل Excel.");
        }
      });
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    bindDownloads();

    const submitBtn = document.querySelector("input.submit") || document.querySelector("button.submit");
    if (submitBtn) submitBtn.addEventListener("click", predictNow);

    await loadDashboardMetadata();
  });
})();

