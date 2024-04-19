const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const logger = require("firebase-functions/logger");

const express = require("express");
const line = require("@line/bot-sdk");
const MessagingApiClient = line.messagingApi.MessagingApiClient;

setGlobalOptions({ region: "asia-east1" });

require("dotenv").config();

const client = new MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_TOKEN,
});

const middleware = line.middleware({
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_TOKEN,
});

const app = express();

app.disable("x-powered-by");

const replyTextMessage = (event, text) =>
  client.replyMessage({
    replyToken: event.replyToken,
    messages: [{ type: "text", text }],
  });

const onTextMessage = (event) => {
  const text = event.message.text || "<空訊息>";
  const uid = event.source.userId;
  logger.info(`${uid} 的文字訊息: ${text}`);
  return replyTextMessage(event, text);
}

const handleEvent = async (event) => {
  if (event.type !== "message") {
    return null; // 只處理訊息
  }
  const type = event.message.type;
  switch (type) {
    case "text": return onTextMessage(event);
    default: return replyTextMessage(event, `尚未支援的訊息類型: ${type}`);
  }
};

app.post("/webhook", middleware, (req, res) => {
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
