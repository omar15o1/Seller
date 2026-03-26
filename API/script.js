(() => {
  const API_BASE_URL = "http://127.0.0.1:8000";
  const TOKEN_KEY = "access_token";

  const form = document.getElementById("pridiction");
  const predictBtn = document.querySelector('input.submit[type="button"]');
  const fillBtn = document.querySelector("button.fill");
  const historyEl = document.querySelector(".history");
  // تم تغيير هذا السطر: أصبح يشير إلى العنصر ذو الكلاس "price"
  const priceOutput = document.querySelector(".price"); // هذا هو العنصر الذي سيتم استخدامه لعرض الحالة
  const downloadLinks = document.querySelectorAll(".df");

  const els = {
    manufacturer: document.getElementById("manufacturer"),
    year: document.getElementById("year"),
    model: document.getElementById("model"),
    engineVolume: document.getElementById("engineVolume"),
    mileage: document.getElementById("mileage"),
    cylinders: document.getElementById("cylinders"),
    color: document.getElementById("color"),
    levy: document.getElementById("levy"),
    airbags: document.getElementById("airbags"),
    fuelType: document.getElementById("fuelType"),
    category: document.getElementById("category"),
    gearBoxType: document.getElementById("gearBoxType"),
    driveWheels: document.getElementById("driveWheels"),
    wheel: document.getElementById("wheel"),
  };

  let lastPredictionId = null;

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function setToken(token) {
    if (!token) localStorage.removeItem(TOKEN_KEY);
    else localStorage.setItem(TOKEN_KEY, token);
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function showStatus(kind, title, details) {
    // تم تعديل هذه الدالة لاستخدام priceOutput بدلاً من statusEl
    if (!priceOutput) return;
    const bg =
      kind === "success"
        ? "#ffffff"
        : kind === "error"
          ? "#ff0000"
          : "#ffffff";
    priceOutput.style.background = bg;
    priceOutput.style.color = "black";
    priceOutput.style.borderRadius = "10px";
    priceOutput.style.padding = "12px";
    priceOutput.style.textAlign = "left";
    priceOutput.innerHTML = `
      <div style="font-weight:min(220px, 80%);margin-bottom:6px;">${escapeHtml(title)}</div>
      <div style="opacity:.95;line-height:40px;">${escapeHtml(details ?? "")}</div>
    `;
  }

  async function apiFetch(path, options = {}) {
    const token = getToken();
    const headers = new Headers(options.headers || {});
    if (!headers.has("Content-Type") && options.body) {
      headers.set("Content-Type", "application/json");
    }
    if (token) headers.set("Authorization", `Bearer ${token}`);

    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    });

    const contentType = res.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    const body = isJson ? await res.json().catch(() => null) : await res.text().catch(() => "");

    if (!res.ok) {
      const msg =
        (body && body.detail) ||
        (body && body.message) ||
        (typeof body === "string" ? body : "") ||
        `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return body;
  }

  function coerceInt(v, fallback = 0) {
    const n = Number.parseInt(String(v ?? "").replace(/[^\d-]/g, ""), 10);
    return Number.isFinite(n) ? n : fallback;
  }

  function coerceFloat(v, fallback = 0) {
    const n = Number.parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : fallback;
  }

  function getCarInputPayload() {
    const year = coerceInt(els.year?.value, new Date().getFullYear());
    const currentYear = new Date().getFullYear();
    const age = Math.max(0, currentYear - year);

    return {
      Manufacturer: (els.manufacturer?.value || "").trim(),
      Model: (els.model?.value || "").trim(),
      Category: (els.category?.value || "").trim(),
      Fuel_type: (els.fuelType?.value || "").trim(),
      Gear_box_type: (els.gearBoxType?.value || "").trim(),
      Drive_wheels: (els.driveWheels?.value || "").trim(),
      Wheel: (els.wheel?.value || "").trim(),
      Color: (els.color?.value || "").trim(),
      Engine_volume: coerceFloat(els.engineVolume?.value, 1.6),
      Mileage: coerceInt(els.mileage?.value, 0),
      Levy: coerceInt(els.levy?.value, 0),
      Cylinders: coerceInt(els.cylinders?.value, 4),
      Airbags: coerceInt(els.airbags?.value, 0),
      age,
    };
  }

  function validatePayload(payload) {
    const required = [
      "Manufacturer",
      "Model",
      "Category",
      "Fuel_type",
      "Gear_box_type",
      "Drive_wheels",
      "Wheel",
      "Color",
    ];
    const missing = required.filter((k) => !String(payload[k] ?? "").trim());
    if (missing.length) {
      throw new Error(`Please fill: ${missing.join(", ")}`);
    }
  }

  async function refreshDashboard() {
    try {
      const meta = await apiFetch("/dashboard/metadata");
      const d = meta?.data;
      if (!d) return;
      showStatus(
        "success",
        `Total predictions: ${d.stats?.total_predictions ?? 0}\nAverage price: ${d.stats?.average_price ?? 0}`
      );
    } catch (e) {
      showStatus("error", "Backend connection error", e?.message || String(e));
    }
  }

  async function runPrediction() {
    const payload = getCarInputPayload();
    validatePayload(payload);

    showStatus("info", "Predicting...", "Sending data to backend.");
    const res = await apiFetch("/predict", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const price = res?.data?.price;
    lastPredictionId = res?.data?.prediction_id ?? null;
    // تم إزالة السطر الخاص بـ priceOutput.value لأنه سيتم عرض السعر داخل showStatus

    showStatus(
      "success",
      "Prediction complete",
      `Price: ${price}\nConfidence: ${res?.data?.confidence ?? "-"}%\nPrediction ID: ${lastPredictionId ?? "-"}`
    );
    await refreshDashboard();
    updateDownloadLinks();
  }

  function updateDownloadLinks() {
    const pdf = downloadLinks?.[0];
    const excel = downloadLinks?.[1];

    if (pdf) {
      if (!lastPredictionId) {
        pdf.href = "";
        pdf.setAttribute("aria-disabled", "true");
        pdf.style.pointerEvents = "none";
        pdf.style.opacity = "0.6";
      } else {
        pdf.href = `${API_BASE_URL}/prediction/${lastPredictionId}/pdf`;
        pdf.removeAttribute("aria-disabled");
        pdf.style.pointerEvents = "";
        pdf.style.opacity = "";
      }
    }

    if (excel) {
      excel.href = `${API_BASE_URL}/dashboard/export-excel`;
    }
  }

  function setFormValues(values) {
    Object.entries(values).forEach(([k, v]) => {
      if (els[k]) els[k].value = v;
    });
  }

  function wireHistoryCards() {
    if (!historyEl) return;
    historyEl.addEventListener("click", (e) => {
      const btn = e.target?.closest?.("button.btn-card");
      if (!btn) return;
      const card = btn.closest(".history-card");
      if (!card) return;
      const lines = Array.from(card.querySelectorAll("p")).map((p) => p.textContent || "");
      const getVal = (prefix) => {
        const line = lines.find((l) => l.toLowerCase().startsWith(prefix.toLowerCase()));
        return line ? line.split(":").slice(1).join(":").trim() : "";
      };
      const manufacturer = getVal("Manufacturer");
      const model = getVal("Model");
      const year = getVal("Year");
      const mileage = getVal("Mileage").replaceAll(",", "").replaceAll("km", "").trim();
      const color = getVal("Color");
      setFormValues({
        manufacturer,
        model,
        year: coerceInt(year, "").toString(),
        mileage: coerceInt(mileage, "").toString(),
        color,
      });
      showStatus("info", "Filled from history", `${manufacturer} ${model}`);
    });
  }

  function wireFillButton() {
    if (!fillBtn) return;
    fillBtn.addEventListener("click", (e) => {
      e.preventDefault();
      // Sensible defaults to avoid missing required fields
      if (!els.category.value) els.category.value = "Sedan";
      if (!els.fuelType.value) els.fuelType.value = "Petrol";
      if (!els.gearBoxType.value) els.gearBoxType.value = "Automatic";
      if (!els.driveWheels.value || els.driveWheels.value === "Drive wheels") els.driveWheels.value = "Front";
      if (!els.wheel.value || els.wheel.value === "Wheel") els.wheel.value = "Left";
      if (!els.color.value) els.color.value = "Black";
      if (!els.engineVolume.value) els.engineVolume.value = "1.6";
      if (!els.cylinders.value) els.cylinders.value = "4";
      if (!els.airbags.value) els.airbags.value = "2";
      if (!els.levy.value) els.levy.value = "0";
      if (!els.mileage.value) els.mileage.value = "0";
      showStatus("info", "Filled defaults", "You can edit any value before predicting.");
    });
  }

  function wirePredictButton() {
    if (!predictBtn) return;
    predictBtn.addEventListener("click", async () => {
      try {
        await runPrediction();
      } catch (e) {
        showStatus("error", "Prediction failed", e?.message || String(e));
      }
    });
  }

  function preventFormSubmit() {
    if (!form) return;
    form.addEventListener("submit", (e) => e.preventDefault());
  }

  // Optional: if you already have a token from /login you can paste it here quickly.
  // Example: window.setToken("...jwt...")
  window.setToken = setToken;

  preventFormSubmit();
  wireHistoryCards();
  wireFillButton();
  wirePredictButton();
  updateDownloadLinks();
  refreshDashboard();
})();