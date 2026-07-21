/* ============================================================
   SITE CONFIGURATION — edit this file with your real data.
   Everything here is safe to publish (no secret keys).
   ============================================================ */

const SITE_CONFIG = {
  businessName: "Prop a Prop Teu",
  tagline: "Props, tools & materials", // shown next to logo on wide screens

  // Path to the logo file. Replace assets/logo.svg with your real logo
  // (keep the same filename, or change this path).
  logo: "assets/logo.svg",

  // --- SNIPCART (cart & checkout) ---
  // 1. Create a free account at https://snipcart.com
  // 2. Copy your PUBLIC API key (Test key first, Live key when ready)
  // 3. Paste it here. Taxes (21% IVA) and shipping rates are configured
  //    in the Snipcart dashboard: Store configuration > Taxes / Shipping.
  snipcartApiKey: "PUT_YOUR_SNIPCART_PUBLIC_API_KEY_HERE",
  currency: "eur",

  // --- CONTACT ---
  email: "hola@propaproteu.com",           // change to real address
  whatsapp: "34600000000",                 // international format, digits only ("" hides button)
  phoneDisplay: "+34 600 00 00 00",
  address: "Barcelona, Catalunya",

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

  // --- LANGUAGES ---
  languages: ["ca", "es", "en"],
  defaultLang: "ca",       // fallback when browser language is not ca/es/en
  autoDetectLang: true,    // use the visitor's browser language on first visit

  // --- CATALOG ---
  showPricesWithIva: true  // prices in products.json are IVA included
};
