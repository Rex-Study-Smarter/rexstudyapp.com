// Never run inside someone else's frame: a framed reset form is a
// clickjacking target. (GitHub Pages can't send a frame-ancestors header.)
if (window.top !== window.self) { document.body.innerHTML = ""; window.top.location = window.location.href; }

// Public values: the project URL and its publishable key are meant to ship in
// clients (the iOS app carries the same pair). Row-level security, not this
// key, is what protects data.
var SUPABASE_URL = "https://umtkjhtwuvhhyekmjnhz.supabase.co";
var SUPABASE_KEY = "sb_publishable_f7fZyMIuAN8iCkAnGpn4PQ_yFpm-jNG";
var client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: true, flowType: "implicit" }
});

function show(id) {
  ["checking", "form", "done", "expired", "sent"].forEach(function (s) {
    document.getElementById(s).hidden = (s !== id);
  });
}

function expired(reason) {
  if (reason) document.getElementById("expired-why").textContent = reason + " Enter your email and we'll send you a new link.";
  show("expired");
}

async function start() {
  var query = new URLSearchParams(location.search);
  var hash = new URLSearchParams(location.hash.slice(1));

  // Supabase reports a bad or used link in the fragment. Its wording is never
  // shown: anything in the URL is attacker-editable, so the page says its own.
  if (hash.get("error") || query.get("error")) return expired("That link has already been used or has expired.");

  var tokenHash = query.get("token_hash");
  if (tokenHash) {
    // The recovery email links here with a one-time token hash. Verifying it
    // signs this page in as that user, just long enough to set a password.
    var res = await client.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
    // Keep the token out of the address bar and history once it's spent.
    history.replaceState(null, "", location.pathname);
    if (res.error || !res.data.session) return expired("That link has already been used or has expired.");
    return ready(res.data.session);
  }

  // Older emails put the session straight in the fragment (#access_token=…).
  var got = await client.auth.getSession();
  history.replaceState(null, "", location.pathname);
  if (got.data && got.data.session) return ready(got.data.session);

  expired();
}

function ready(session) {
  var email = session.user && session.user.email;
  if (email) document.getElementById("for-email").textContent = "For " + email + ". Pick something at least 8 characters long.";
  show("form");
  document.getElementById("pw").focus();
}

document.getElementById("reset").addEventListener("submit", async function (e) {
  e.preventDefault();
  var pw = document.getElementById("pw").value, pw2 = document.getElementById("pw2").value;
  var out = document.getElementById("form-error"), btn = document.getElementById("save");
  out.textContent = "";
  if (pw.length < 8) { out.textContent = "Use at least 8 characters."; return; }
  if (pw !== pw2) { out.textContent = "Those two don't match."; return; }
  btn.disabled = true; btn.textContent = "Saving…";
  var res = await client.auth.updateUser({ password: pw });
  if (res.error) {
    out.textContent = /different from the old/i.test(res.error.message)
      ? "That's your current password. Choose a new one."
      : res.error.message;
    btn.disabled = false; btn.textContent = "Save password";
    return;
  }
  await client.auth.signOut();
  show("done");
});

document.getElementById("again").addEventListener("submit", async function (e) {
  e.preventDefault();
  var email = document.getElementById("email").value.trim();
  var out = document.getElementById("again-error"), btn = document.getElementById("send");
  out.textContent = ""; btn.disabled = true; btn.textContent = "Sending…";
  var res = await client.auth.resetPasswordForEmail(email, { redirectTo: location.origin + "/reset-password/" });
  if (res.error && !/rate limit/i.test(res.error.message)) {
    out.textContent = res.error.message; btn.disabled = false; btn.textContent = "Send a new link"; return;
  }
  show("sent");
});

start();
