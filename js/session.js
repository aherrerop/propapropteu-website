/* ============================================================
   Manager session + API client (shared by acceso + admin).
   Talks to the Apps Script web app (SITE_CONFIG.adminApi) with
   plain-text JSON POSTs (simple request, no CORS preflight).
   ============================================================ */

const Admin = {
  api: (typeof SITE_CONFIG !== "undefined" && SITE_CONFIG.adminApi) || "",
  tokenKey: "ppt-admin-token",
  userKey: "ppt-admin-user",

  get token() { try { return sessionStorage.getItem(this.tokenKey); } catch (e) { return null; } },
  get user() { try { return JSON.parse(sessionStorage.getItem(this.userKey) || "null"); } catch (e) { return null; } },

  setSession(token, user) {
    try {
      sessionStorage.setItem(this.tokenKey, token);
      sessionStorage.setItem(this.userKey, JSON.stringify(user));
    } catch (e) { /* private mode */ }
  },
  clear() {
    try { sessionStorage.removeItem(this.tokenKey); sessionStorage.removeItem(this.userKey); } catch (e) {}
  },

  async call(action, payload) {
    if (!this.api) {
      return { ok: false, error: "noapi", message: "Backend no configurado todavía (adminApi en js/config.js)." };
    }
    const body = Object.assign({ action }, payload || {});
    if (action !== "login") body.token = this.token;
    let res;
    try {
      res = await fetch(this.api, { method: "POST", body: JSON.stringify(body), redirect: "follow" });
    } catch (e) {
      return { ok: false, error: "network", message: "No se ha podido conectar con el servidor." };
    }
    try { return await res.json(); }
    catch (e) { return { ok: false, error: "parse", message: "Respuesta no válida del servidor." }; }
  },

  /* For admin.html: bounce to login if there's no valid session. */
  async requireLogin() {
    if (!this.token) { location.href = "acceso.html"; return false; }
    const r = await this.call("me");
    if (!r.ok) { this.clear(); location.href = "acceso.html"; return false; }
    return true;
  }
};
