const express = require("express");
const path = require("path");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// 🔥 Public klasörü (frontend)
const publicPath = path.join(__dirname, "public");
app.use(express.static(publicPath));

// ✅ API ROUTES
app.get("/api/test", (req, res) => {
  res.json({
    status: "ok",
    message: "API çalışıyor 🚀",
    time: new Date(),
  });
});

// (opsiyonel) Stripe debug
app.get("/api/env", (req, res) => {
  res.json({
    stripe: process.env.STRIPE_SECRET_KEY ? "VAR" : "YOK",
  });
});

// 🔥 ROOT → index.html dön
app.get("/", (req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

// 🔥 SPA fallback (çok önemli)
app.get("*", (req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

// Server başlat
app.listen(PORT, () => {
  console.log("🚀 Server running on port " + PORT);
});