const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// 🔥 ENV DEBUG (çok önemli)
console.log("PORT:", PORT);
console.log("STRIPE KEY VAR MI:", !!process.env.STRIPE_SECRET_KEY);

// 🔥 Stripe güvenli başlatma (crash yapmaz)
let stripe = null;

if (process.env.STRIPE_SECRET_KEY) {
  const Stripe = require("stripe");
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  console.log("✅ Stripe aktif");
} else {
  console.log("⚠️ Stripe devre dışı (key yok)");
}

// 🟢 ANA ENDPOINT
app.get("/", (req, res) => {
  res.send("API çalışıyor 🚀");
});

// 🟢 TEST ENDPOINT
app.get("/test", (req, res) => {
  res.json({
    status: "ok",
    stripeActive: !!stripe,
  });
});

// 💰 STRIPE PAYMENT
app.post("/create-payment-intent", async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({
        error: "Stripe aktif değil",
      });
    }

    const { amount } = req.body;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount || 1000,
      currency: "usd",
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
    });

  } catch (err) {
    console.error("Stripe error:", err);
    res.status(500).json({
      error: "Payment error",
    });
  }
});

// 🚀 SERVER BAŞLAT
app.listen(PORT, () => {
  console.log("🚀 Server running on port " + PORT);
});