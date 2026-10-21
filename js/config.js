/* ============================================================
   SITE CONFIGURATION — edit this file with your real data.
   Everything here is safe to publish (no secret keys).
   ============================================================ */

const SITE_CONFIG = {
  businessName: "Prop a Prop Teu",
  tagline: "Props, tools & materials", // shown next to logo on wide screens

  // Brand logo files (both live in assets/, no spaces in filenames).
  //  logo     = the icon mark (also used as favicon + og:image + header icon)
  //  wordmark = the horizontal lettering shown next to the icon in the header
  logo: "assets/logo_mark.svg",
  wordmark: "assets/logo_lletras_v1_horitzontal.svg",

  // --- SNIPCART (cart & checkout) ---
  // 1. Create a free account at https://snipcart.com
  // 2. Copy your PUBLIC API key (Test key first, Live key when ready)
  // 3. Paste it here. Taxes (21% IVA) and shipping rates are configured
  //    in the Snipcart dashboard: Store configuration > Taxes / Shipping.
  snipcartApiKey: "PUT_YOUR_SNIPCART_PUBLIC_API_KEY_HERE",
  currency: "eur",

  // --- CONTACT ---
  email: "info@propapropteu.com",          // change to real address
  whatsapp: "34638003367",                 // international format, digits only ("" hides button)
  phoneDisplay: "+34 638 00 33 67",
  address: "Barcelona, España",

  // --- CONTACT / QUOTE FORMS ---
  // Create a free form at https://formspree.io, then paste the endpoint
  // (looks like https://formspree.io/f/xxxxxxx). Same endpoint can serve
  // both the contact form and the custom-prop quote form.
  formEndpoint: "https://formspree.io/f/YOUR_FORM_ID",

  // --- SOCIAL MEDIA --- (leave "" to hide an icon)
  social: {
    instagram: "https://instagram.com/propaproteu",
    tiktok: "",
    youtube: "",
    facebook: ""
  },

  // --- MANAGER LOGIN BACKEND ---
  // Paste the Apps Script Web app URL here (ends in /exec). See backend/SETUP.md.
  // Leave "" until the backend is deployed; the login page will say so.
  adminApi: "https://script.google.com/macros/s/AKfycbx03Ql3nWT1bFbsRDfTm6AXQXG-hS4J6KHPxpaKsnIviajJxj56xyFh9dF77qCp84sn/exec",

  // --- LANGUAGES ---
  languages: ["ca", "es", "en"],
  defaultLang: "es",       // Spanish first (per current design/reference)
  autoDetectLang: false,   // always start in Spanish until the visitor switches

  // --- CATALOG ---
  showPricesWithIva: true  // prices in products.json are IVA included
};
