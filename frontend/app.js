const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

let activeDirectory = "donors";
let cachedDonors = [];
let cachedRecipients = [];

// =============================================================================
// UI Feedback: Toast Notifications & Status Messages
// =============================================================================
function showToast(message) {
  const toast = $("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 3500);
}

function setMessage(selector, message, isError = false) {
  const node = $(selector);
  if (!node) return;
  node.textContent = message;
  node.classList.toggle("error", isError);
}

function setSubmitting(form, isSubmitting, loadingText = "Saving…") {
  const button = form.querySelector('button[type="submit"]');
  if (!button) return;
  if (isSubmitting) {
    button.dataset.originalText = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `${loadingText} <span>⏳</span>`;
  } else {
    button.disabled = false;
    if (button.dataset.originalText) {
      button.innerHTML = button.dataset.originalText;
    }
  }
}

// =============================================================================
// API Fetch Helper
// =============================================================================
async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data.error || (data.message ? data.message : "Request failed. Please try again.");
    throw new Error(errorMsg);
  }

  return data;
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

// =============================================================================
// Theme and Mobile Navigation
// =============================================================================
$("#themeToggle").addEventListener("click", () => {
  const dark = document.documentElement.dataset.theme !== "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  $("#themeIcon").textContent = dark ? "☀" : "☾";
  $("#themeToggle").setAttribute(
    "aria-label",
    dark ? "Switch to bright mode" : "Switch to dark mode"
  );
});

$("#menuToggle").addEventListener("click", () => {
  const open = $("#navLinks")?.classList.toggle("open");
  $("#menuToggle").setAttribute("aria-expanded", String(Boolean(open)));
});

// Setup nav id and click handlers
const navLinks = $(".nav-links");
if (navLinks) {
  navLinks.id = "navLinks";
  $$(".nav-link").forEach((link) =>
    link.addEventListener("click", () => {
      navLinks.classList.remove("open");
      $("#menuToggle").setAttribute("aria-expanded", "false");
    })
  );
}

// =============================================================================
// Authentication Tabs & Submissions
// =============================================================================
function setAccountTab(mode) {
  const login = mode === "login";
  $("#loginForm").classList.toggle("hidden", !login);
  $("#registerForm").classList.toggle("hidden", login);
  $("#loginTab").classList.toggle("selected", login);
  $("#registerTab").classList.toggle("selected", !login);
  setMessage("#loginMessage", "");
  setMessage("#registerMessage", "");
}

$("#loginTab").addEventListener("click", () => setAccountTab("login"));
$("#registerTab").addEventListener("click", () => setAccountTab("register"));

$("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  setSubmitting(form, true, "Signing in…");
  setMessage("#loginMessage", "Verifying credentials…");

  try {
    const payload = formData(form);
    const data = await api("/api/login", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    if (data.token) {
      localStorage.setItem("hemoconnect_token", data.token);
    }

    setMessage("#loginMessage", data.message || "Signed in successfully!");
    showToast(data.message || "Signed in successfully!");
    form.reset();
  } catch (error) {
    setMessage("#loginMessage", error.message, true);
  } finally {
    setSubmitting(form, false);
  }
});

$("#registerForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  setSubmitting(form, true, "Creating account…");
  setMessage("#registerMessage", "Registering account…");

  try {
    const payload = formData(form);
    const data = await api("/api/register", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    setMessage("#registerMessage", data.message || "Account created successfully!");
    showToast("Account created successfully!");
    form.reset();
    setAccountTab("login");
    setMessage("#loginMessage", "Account created successfully — sign in with your password.");
  } catch (error) {
    setMessage("#registerMessage", error.message, true);
  } finally {
    setSubmitting(form, false);
  }
});

// =============================================================================
// Donor Registration Form
// =============================================================================
$("#donorForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  setSubmitting(form, true, "Saving details…");
  setMessage("#donorMessage", "Saving donor details…");

  const data = formData(form);
  data.age = Number(data.age);
  if (!data.lastDonation) {
    data.lastDonation = null;
  }

  try {
    const result = await api("/api/donors", {
      method: "POST",
      body: JSON.stringify(data)
    });

    setMessage("#donorMessage", result.message || "Donor registration saved!");
    showToast("Donor registration saved to database!");
    form.reset();
    await loadDirectory();
  } catch (error) {
    setMessage("#donorMessage", error.message, true);
  } finally {
    setSubmitting(form, false);
  }
});

// =============================================================================
// Receiver Request Form
// =============================================================================
$("#recipientForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  setSubmitting(form, true, "Saving request…");
  setMessage("#recipientMessage", "Saving blood request…");

  const data = formData(form);
  data.age = Number(data.age);
  data.units = Number(data.units);

  try {
    // Sends to POST /api/recievers
    const result = await api("/api/recievers", {
      method: "POST",
      body: JSON.stringify(data)
    });

    setMessage("#recipientMessage", result.message || "Blood request saved!");
    showToast("Blood request saved to database!");
    form.reset();
    $("#recipientForm [name='units']").value = "1";
    $("#recipientForm [name='urgency']").value = "Normal";
    await loadDirectory();
  } catch (error) {
    setMessage("#recipientMessage", error.message, true);
  } finally {
    setSubmitting(form, false);
  }
});

// =============================================================================
// Directory Views, Filters & Actions
// =============================================================================
$("#showDonors").addEventListener("click", () => setDirectory("donors"));
$("#showRecipients").addEventListener("click", () => setDirectory("recievers"));
$("#refreshDirectory").addEventListener("click", loadDirectory);
$("#filterBlood").addEventListener("change", renderDirectory);
$("#filterCity").addEventListener("input", renderDirectory);

function setDirectory(which) {
  activeDirectory = which;
  const isDonors = which === "donors";
  $("#showDonors").classList.toggle("selected", isDonors);
  $("#showRecipients").classList.toggle("selected", !isDonors);
  renderDirectory();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));
}

function renderDirectory() {
  const records = activeDirectory === "donors" ? cachedDonors : cachedRecipients;
  const blood = $("#filterBlood").value;
  const city = $("#filterCity").value.trim().toLowerCase();

  const filtered = records.filter((record) => {
    const recordBlood = record.bloodGroup || record.blood_group;
    const recordCity = String(record.city || "").toLowerCase();
    const matchesBlood = !blood || recordBlood === blood;
    const matchesCity = !city || recordCity.includes(city);
    return matchesBlood && matchesCity;
  });

  if (!filtered.length) {
    $("#directoryContent").innerHTML = `
      <div class="empty-state">
        <span>✧</span>
        <h3>No records found</h3>
        <p>Try changing your filters or add a new registration above.</p>
      </div>`;
    return;
  }

  const isDonor = activeDirectory === "donors";
  const headers = isDonor
    ? ["Name", "Age", "Blood group", "Phone", "City", "Last donation", "Action"]
    : ["Receiver", "Age", "Blood group", "Units", "Hospital", "City", "Urgency", "Action"];

  const rows = filtered
    .map((r) => {
      const id = r.id;
      const fullName = escapeHtml(r.fullName || r.full_name);
      const age = escapeHtml(r.age);
      const bloodGroup = escapeHtml(r.bloodGroup || r.blood_group);
      const phone = escapeHtml(r.phone);
      const cityVal = escapeHtml(r.city);

      if (isDonor) {
        const lastDonation = escapeHtml(r.lastDonation || r.last_donation_date || "—");
        return `
          <tr>
            <td><strong>${fullName}</strong></td>
            <td>${age}</td>
            <td><span class="blood-pill">${bloodGroup}</span></td>
            <td>${phone}</td>
            <td>${cityVal}</td>
            <td>${lastDonation}</td>
            <td>
              <button class="delete-btn" data-delete="${id}" data-kind="donors" title="Delete donor">Delete</button>
            </td>
          </tr>`;
      } else {
        const units = escapeHtml(r.units);
        const hospital = escapeHtml(r.hospital);
        const urgency = escapeHtml(r.urgency || "Normal");
        const urgencyClass = urgency.toLowerCase();

        return `
          <tr>
            <td><strong>${fullName}</strong></td>
            <td>${age}</td>
            <td><span class="blood-pill">${bloodGroup}</span></td>
            <td>${units}</td>
            <td>${hospital}</td>
            <td>${cityVal}</td>
            <td><span class="urgency ${urgencyClass}">${urgency}</span></td>
            <td>
              <button class="delete-btn" data-delete="${id}" data-kind="recievers" title="Delete request">Delete</button>
            </td>
          </tr>`;
      }
    })
    .join("");

  $("#directoryContent").innerHTML = `
    <table class="records-table">
      <thead>
        <tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  // Attach delete handlers
  $$("[data-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      const kind = button.dataset.kind; // 'donors' or 'recievers'
      const id = button.dataset.delete;
      const label = kind === "donors" ? "donor registration" : "blood request";

      if (!confirm(`Are you sure you want to delete this ${label}? This cannot be undone.`)) {
        return;
      }

      button.disabled = true;
      button.textContent = "Deleting…";

      try {
        await api(`/api/${kind}/${id}`, { method: "DELETE" });
        showToast("Record successfully deleted from Supabase.");
        await loadDirectory();
      } catch (error) {
        showToast(error.message);
        button.disabled = false;
        button.textContent = "Delete";
      }
    });
  });
}

// =============================================================================
// Load Directory Records from Supabase API
// =============================================================================
async function loadDirectory() {
  $("#refreshDirectory").disabled = true;
  $("#refreshDirectory").textContent = "Loading…";

  try {
    const [donors, receivers] = await Promise.all([
      api("/api/donors"),
      api("/api/recievers")
    ]);

    cachedDonors = Array.isArray(donors) ? donors : [];
    cachedRecipients = Array.isArray(receivers) ? receivers : [];

    $("#donorCount").textContent = cachedDonors.length;
    $("#recipientCount").textContent = cachedRecipients.length;

    renderDirectory();
  } catch (error) {
    console.error("Failed to load records:", error);
    $("#directoryContent").innerHTML = `
      <div class="empty-state">
        <span>!</span>
        <h3>Could not load directory records</h3>
        <p>${escapeHtml(error.message)}. Ensure backend server is running on port 5000 and schema.sql has been executed in Supabase.</p>
      </div>`;
  } finally {
    $("#refreshDirectory").disabled = false;
    $("#refreshDirectory").textContent = "Refresh ↻";
  }
}

// Initial directory fetch on page load
loadDirectory();