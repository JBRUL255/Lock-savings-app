import express from "express";
import axios from "axios";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static("public"));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 10000;
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

const paymentsFile = path.join(__dirname, "payments.json");
const walletsFile = path.join(__dirname, "wallets.json");

/* ================================
   INITIALIZE PAYMENT
================================ */

app.post("/api/paystack", async (req, res) => {

  try {

    const { phone, amount } = req.body;

    if (!phone || !amount) {
      return res.status(400).json({
        error: "Phone number and amount required"
      });
    }

    const email = `user${phone}@apexnetworks.com`;

    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email,
        amount: amount * 100,
        currency: "KES",

        callback_url:
          "https://apexnetworks.onrender.com/api/verify-payment",

        metadata: {
          phone
        }
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    res.json({
      authorization_url:
        response.data.data.authorization_url
    });

  } catch (error) {

    console.error(
      "Paystack init error:",
      error.response?.data || error.message
    );

    res.status(500).json({
      error: "Payment initialization failed"
    });

  }

});


/* ================================
   VERIFY PAYMENT
================================ */

app.get("/api/verify-payment", async (req, res) => {

  const { reference } = req.query;

  if (!reference) {
    return res.status(400).send("Missing reference");
  }

  try {

    const verifyRes = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`
        }
      }
    );

    const data = verifyRes.data.data;

    if (data.status !== "success") {
      return res.send("Payment not successful");
    }

    /* =============================
       SAVE PAYMENT RECORD
    ============================= */

    let payments = [];

    if (fs.existsSync(paymentsFile)) {
      payments = JSON.parse(
        fs.readFileSync(paymentsFile)
      );
    }

    const alreadyPaid =
      payments.find(p => p.reference === reference);

    if (alreadyPaid) {
      return res.send("Payment already processed");
    }

    const record = {
      phone: data.metadata.phone,
      amount: data.amount / 100,
      reference: data.reference,
      status: data.status,
      date: new Date().toISOString()
    };

    payments.push(record);

    fs.writeFileSync(
      paymentsFile,
      JSON.stringify(payments, null, 2)
    );


    /* =============================
       UPDATE WALLET
    ============================= */

    let wallets = {};

    if (fs.existsSync(walletsFile)) {
      wallets = JSON.parse(
        fs.readFileSync(walletsFile)
      );
    }

    const phone = data.metadata.phone;

    if (!wallets[phone]) {
      wallets[phone] = 0;
    }

    wallets[phone] += data.amount / 100;

    fs.writeFileSync(
      walletsFile,
      JSON.stringify(wallets, null, 2)
    );


    /* =============================
       SUCCESS PAGE
    ============================= */

    res.send(`
      <html>
      <body style="font-family:Poppins;text-align:center;background:#f8f9fb;margin-top:10%">
        <div style="background:#fff;padding:40px;border-radius:10px;display:inline-block;box-shadow:0 4px 12px rgba(0,0,0,0.1)">
          <h2 style="color:#00c853">✅ Payment Verified!</h2>
          <p>Phone: ${phone}</p>
          <p>Amount: Ksh ${(data.amount / 100).toFixed(2)}</p>
          <p>Status: ${data.status}</p>
          <p>Wallet Updated ✔</p>

          <a href="/"
           style="text-decoration:none;color:#2a5298;font-weight:bold">
           Return to Dashboard
          </a>
        </div>
      </body>
      </html>
    `);

  } catch (err) {

    console.error(
      "Verification error:",
      err.response?.data || err.message
    );

    res.status(500).send("Payment verification failed");

  }

});


/* ================================
   GET WALLET BALANCE
================================ */

app.get("/api/wallet/:phone", (req, res) => {

  const { phone } = req.params;

  let wallets = {};

  if (fs.existsSync(walletsFile)) {
    wallets = JSON.parse(fs.readFileSync(walletsFile));
  }

  const balance = wallets[phone] || 0;

  res.json({ balance });

});


/* ================================
   GET PAYMENT HISTORY
================================ */

app.get("/api/payments", (req, res) => {

  if (!fs.existsSync(paymentsFile)) {
    return res.json([]);
  }

  const payments = JSON.parse(
    fs.readFileSync(paymentsFile)
  );

  res.json(payments);

});


/* ================================
   START SERVER
================================ */

app.listen(PORT, () =>
  console.log(`✅ Apex Networks server running on port ${PORT}`)
);
