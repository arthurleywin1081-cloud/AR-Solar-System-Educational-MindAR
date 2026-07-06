// ============================================================
// gate.js — Simple client-side access key gate
//
// NOT real security. This is a plain-text password check that
// runs entirely in the browser. Anyone who looks at this file's
// source can read the password directly. This is intentional —
// per the project spec, the goal is only to deter casual/
// accidental access, not to resist a determined attacker.
// ============================================================

const ACCESS_KEY = "5123825710";

const gate = document.getElementById("gate");
const app = document.getElementById("app");
const input = document.getElementById("gate-input");
const submitBtn = document.getElementById("gate-submit");
const errorEl = document.getElementById("gate-error");

function tryUnlock() {
  if (input.value === ACCESS_KEY) {
    gate.classList.add("hidden");
    app.style.display = "block";
    // Notify main.js it's safe to start the render loop / WebGL context
    window.dispatchEvent(new CustomEvent("app-unlocked"));
  } else {
    errorEl.textContent = "Incorrect key. Try again.";
    input.value = "";
    input.focus();
  }
}

submitBtn.addEventListener("click", tryUnlock);
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") tryUnlock();
});

// Script runs after DOM is ready (placed before </body>), so focus immediately
input.focus();
