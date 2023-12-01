const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const logger = require("firebase-functions/logger");

const express = require("express");
const line = require("@line/bot-sdk");

setGlobalOptions({ region: "asia-east1" });

require("dotenv").config();

const config = {
  channelId: process.env.LINE_CHANNEL_ID,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_TOKEN,
};

const client = new line.Client(config);

const app = express();

app.disable("x-powered-by");

const handleEvent = async (event) => {
  if (event.type !== "message" || event.message.type !== "text") {
    return null; // 不處理
  }
  const msg = event.message && event.message.text || "<empty>";
  const echo = {
    type: "text",
    text: msg,
  };
  logger.info(
    `Hello linebot logs! ${event.replyToken} ${msg}`,
    { structuredData: true });
  return client.replyMessage(event.replyToken, echo);
};

app.post("/webhook", line.middleware(config), (req, res) => {
  // req近來的body內是json,並含有events陣列才進行處理
  Promise
    .all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((error) => {
      console.error(error);
      res.status(500).end();
    });
});

// 一個確認ap正常工作的常見作法
app.get("/ping", (_, res) => res.send("pong"));

exports.trigger = onRequest(app);
