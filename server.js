const express = require("express");
const path = require("path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const sqlite3 = require("sqlite3").verbose();
require("dotenv").config();

const app = express();
const cors = require("cors");

app.use(cors({
  origin: [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://nextgencommerce.shop",
    "https://www.nextgencommerce.shop"
  ],
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

const stripeKey = (process.env.STRIPE_SECRET_KEY || "").trim();
console.log("STRIPE KEY VAR MI", !!stripeKey);
console.log("STRIPE KEY LEN", stripeKey.length);

if (!stripeKey) {
  throw new Error("Missing STRIPE_SECRET_KEY");
}

const stripe = require("stripe")(stripeKey);

const PORT = process.env.PORT || 3000;
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key-change-this";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

const dbPath = path.join(__dirname, "app.db");
const db = new sqlite3.Database(dbPath);


app.post("/api/create-checkout-session", async (req, res) => {
  const { pack } = req.body;

  const prices = {
    daily: 1,
    weekly: 5,
    monthly: 10
  };

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `AI Message Pack (${pack})`,
          },
          unit_amount: prices[pack] * 100,
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    success_url: `${process.env.APP_URL}/success.html`,
    cancel_url: `${process.env.APP_URL}/cancel.html`,
  });

  res.json({ url: session.url });
});
// Stripe webhook raw body must come before express.json()
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    return res.status(400).send("Stripe webhook is not configured.");
  }

  const signature = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      if (session.payment_status === "paid") {
        const userId = Number(session.metadata?.userId);
        const pack = session.metadata?.pack || "starter";
        const stripeSessionId = session.id;

        const existingPayment = await get(
          "SELECT id FROM payments WHERE stripe_session_id = ?",
          [stripeSessionId]
        );

        if (!existingPayment) {
          const packConfig = getPackConfig(pack);
          if (!packConfig) {
            throw new Error(`Unknown pack: ${pack}`);
          }

          await run(
            `INSERT INTO payments (user_id, stripe_session_id, stripe_payment_intent, amount, currency, pack, status)
             VALUES (?, ?, ?, ?, ?, ?, 'paid')`,
            [
              userId,
              stripeSessionId,
              session.payment_intent || "",
              packConfig.amount,
              packConfig.currency,
              pack
            ]
          );

          await run(
            `UPDATE users
             SET plan = ?, credits = credits + ?
             WHERE id = ?`,
            [packConfig.plan, packConfig.credits, userId]
          );
        }
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error("Webhook processing error:", error);
    res.status(500).send("Webhook processing failed.");
  }
});

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function initDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      plan TEXT NOT NULL DEFAULT 'free',
      credits INTEGER NOT NULL DEFAULT 3,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS generations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      target TEXT NOT NULL,
      goal TEXT NOT NULL,
      tone TEXT NOT NULL,
      context TEXT NOT NULL,
      result TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      stripe_session_id TEXT UNIQUE NOT NULL,
      stripe_payment_intent TEXT,
      amount INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'usd',
      pack TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'paid',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);
}

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      plan: user.plan
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

async function auth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    if (!token) {
      return res.status(401).json({ ok: false, error: "Oturum gerekli." });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await get("SELECT id, email, plan, credits FROM users WHERE id = ?", [decoded.id]);

    if (!user) {
      return res.status(401).json({ ok: false, error: "Kullanıcı bulunamadı." });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ ok: false, error: "Geçersiz oturum." });
  }
}

function getPackConfig(pack) {
  const packs = {
    starter: {
      name: "Starter Pack",
      amount: 499,
      currency: "usd",
      credits: 50,
      plan: "starter"
    },
    pro: {
      name: "Pro Pack",
      amount: 1499,
      currency: "usd",
      credits: 250,
      plan: "pro"
    },
    max: {
      name: "Max Pack",
      amount: 3999,
      currency: "usd",
      credits: 1000,
      plan: "max"
    }
  };

  return packs[pack] || null;
}

function buildPrompt({ target, goal, tone, context, gender }) {
  return `
Sen profesyonel bir Türkçe mesaj yazma asistanısın.

Kullanıcının verdiği bilgiye göre kısa, doğal, direkt gönderilebilir bir mesaj yaz.

Kurallar:
- Tek final mesaj ver
- Türkçe yaz
- Yapay durmasın
- Abartılı emoji kullanma
- Gereksiz uzun olmasın
- Ton: ${tone}
- Hedef: ${target}
- Karşı tarafın cinsiyeti: ${gender || "belirtilmedi"}
- Amaç: ${goal}
- Durum: ${context}

Sadece mesajı yaz.
`.trim();
}

function mockGenerate({ goal, tone, context }) {
  const intros = {
    cool: "Selam,",
    romantik: "Merhaba,",
    profesyonel: "Merhaba,",
    karizmatik: "Selam,"
  };

  const mid = {
    cool: "bunu fazla uzatmadan yazmak istedim.",
    romantik: "içimden geldiği için yazmak istedim.",
    profesyonel: "konuya net şekilde değinmek istedim.",
    karizmatik: "direkt ve net olmak istedim."
  };

  return `${intros[tone] || "Merhaba,"} ${context} ${mid[tone] || ""} ${goal} niyetiyle sana ulaşıyorum. Uygunsan devam edebiliriz.`;
}

async function generateWithAI(input) {
  if (!process.env.OPENAI_API_KEY) {
    return mockGenerate(input);
  }

  const prompt = buildPrompt(input);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: "Sen güçlü bir Türkçe mesaj yazma asistanısın." },
        { role: "user", content: prompt }
      ],
      temperature: 0.8,
      max_tokens: 180
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`AI isteği başarısız: ${errText}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content?.trim() || mockGenerate(input);
}

app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ ok: false, error: "Email ve şifre gerekli." });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const exists = await get("SELECT id FROM users WHERE email = ?", [normalizedEmail]);

    if (exists) {
      return res.status(400).json({ ok: false, error: "Bu email zaten kayıtlı." });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await run(
      "INSERT INTO users (email, password_hash, plan, credits) VALUES (?, ?, 'free', 3)",
      [normalizedEmail, passwordHash]
    );

    const user = await get("SELECT id, email, plan, credits FROM users WHERE id = ?", [result.lastID]);
    const token = signToken(user);

    res.json({ ok: true, token, user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: "Kayıt sırasında hata oluştu." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ ok: false, error: "Email ve şifre gerekli." });
    }

    const userRow = await get("SELECT * FROM users WHERE email = ?", [email.trim().toLowerCase()]);

    if (!userRow) {
      return res.status(401).json({ ok: false, error: "Email veya şifre hatalı." });
    }

    const valid = await bcrypt.compare(password, userRow.password_hash);
    if (!valid) {
      return res.status(401).json({ ok: false, error: "Email veya şifre hatalı." });
    }

    const user = {
      id: userRow.id,
      email: userRow.email,
      plan: userRow.plan,
      credits: userRow.credits
    };

    const token = signToken(user);

    res.json({ ok: true, token, user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: "Giriş sırasında hata oluştu." });
  }
});

app.get("/api/me", auth, async (req, res) => {
  res.json({ ok: true, user: req.user });
});

app.get("/api/packs", auth, async (req, res) => {
  res.json({
    ok: true,
    packs: [
      { key: "starter", ...getPackConfig("starter") },
      { key: "pro", ...getPackConfig("pro") },
      { key: "max", ...getPackConfig("max") }
    ]
  });
});

app.post("/api/create-checkout-session", auth, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({ ok: false, error: "Stripe yapılandırılmamış." });
    }

    const { pack } = req.body || {};
    const packConfig = getPackConfig(pack);

    if (!packConfig) {
      return res.status(400).json({ ok: false, error: "Geçersiz paket." });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      client_reference_id: String(req.user.id),
      customer_email: req.user.email,
      line_items: [
        {
          price_data: {
            currency: packConfig.currency,
            product_data: {
              name: packConfig.name,
              description: `${packConfig.credits} kredi`
            },
            unit_amount: packConfig.amount
          },
          quantity: 1
        }
      ],
      metadata: {
        userId: String(req.user.id),
        pack
      },
      success_url: `${APP_URL}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/?payment=cancel`
    });

    res.json({ ok: true, url: session.url });
  } catch (error) {
    console.error("Create checkout session error:", error);
    res.status(500).json({ ok: false, error: "Ödeme oturumu oluşturulamadı." });
  }
});

app.get("/api/payment/session-status", auth, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({ ok: false, error: "Stripe yapılandırılmamış." });
    }

    const sessionId = req.query.session_id;
    if (!sessionId) {
      return res.status(400).json({ ok: false, error: "session_id gerekli." });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const payment = await get(
      "SELECT id, pack, amount, currency, status, created_at FROM payments WHERE stripe_session_id = ?",
      [sessionId]
    );

    const user = await get("SELECT id, email, plan, credits FROM users WHERE id = ?", [req.user.id]);

    res.json({
      ok: true,
      stripeStatus: session.payment_status,
      paid: !!payment,
      payment,
      user
    });
  } catch (error) {
    console.error("Session status error:", error);
    res.status(500).json({ ok: false, error: "Ödeme durumu alınamadı." });
  }
});

app.post("/api/generate", auth, async (req, res) => {
  try {
    const { target, goal, tone, context, gender } = req.body || {};

    if (!target || !goal || !tone || !context) {
      return res.status(400).json({ ok: false, error: "Eksik alan var." });
    }

    const user = await get("SELECT id, email, plan, credits FROM users WHERE id = ?", [req.user.id]);

    if (!user) {
      return res.status(401).json({ ok: false, error: "Kullanıcı yok." });
    }

    if (user.credits <= 0) {
      return res.status(403).json({
        ok: false,
        error: "Krediniz bitti. Paket satın alın."
      });
    }

    const message = await generateWithAI({ target, goal, tone, context, gender });

    await run(
      `INSERT INTO generations (user_id, target, goal, tone, context, result)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [user.id, target, goal, tone, context, message]
    );

    await run("UPDATE users SET credits = credits - 1 WHERE id = ? AND credits > 0", [user.id]);

    const updatedUser = await get("SELECT id, email, plan, credits FROM users WHERE id = ?", [user.id]);

    res.json({
      ok: true,
      message,
      user: updatedUser
    });
  } catch (error) {
    console.error("Generate error:", error);
    res.status(500).json({
      ok: false,
      error: "Mesaj üretilirken hata oluştu."
    });
  }
});

app.get("/api/history", auth, async (req, res) => {
  try {
    const rows = await all(
      `SELECT id, target, goal, tone, context, result, created_at
       FROM generations
       WHERE user_id = ?
       ORDER BY id DESC
       LIMIT 20`,
      [req.user.id]
    );

    res.json({ ok: true, items: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: "Geçmiş alınamadı." });
  }
});

app.get("/api/payments", auth, async (req, res) => {
  try {
    const rows = await all(
      `SELECT id, stripe_session_id, amount, currency, pack, status, created_at
       FROM payments
       WHERE user_id = ?
       ORDER BY id DESC
       LIMIT 10`,
      [req.user.id]
    );

    res.json({ ok: true, items: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: "Ödeme geçmişi alınamadı." });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Premium AI Tool + Stripe çalışıyor: ${APP_URL}`);
    });
  })
  .catch((error) => {
    console.error("DB init error:", error);
    process.exit(1);
  });
