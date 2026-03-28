const express = require("express");
const path = require("path");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const publicPath = path.join(__dirname, "public");

// static dosyalar
app.use(express.static(publicPath));

// test api
app.get("/api/test", (req, res) => {
  res.json({
    status: "ok",
    message: "API çalışıyor 🚀"
  });
});

// ana sayfa
app.get("/", (req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port " + PORT);
  console.log("Public path:", publicPath);
});