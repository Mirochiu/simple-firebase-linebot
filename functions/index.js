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

// 實作Line Notify的功能
const NOTIFY_GID = process.env.LINE_NOTIFY_GROUP_ID || '';
const NOTIFY_TOKEN = process.env.LINE_NOTIFY_TOKEN || ''
const NOTIFY_AUTH = `Bearer ${NOTIFY_TOKEN}`;

const app = express();

app.disable("x-powered-by");

// 回覆使用者訊息的函式
const replyTextMessage = (event, text) =>
  client.replyMessage({
    replyToken: event.replyToken,
    messages: [{ type: "text", text }],
  });

// 推送群組訊息的函式
//   如果是群組id, 是以C開頭的一個英文與數字編碼的字串
//   如果是使用者id, 是U開頭的一個英文與數字編碼的字串
const pushTextMessage = (id, message) =>
  client.pushMessage({
    to: id,
    messages: [{ type: "text", text: message }],
  });

const onStickerMessage = async (event) => {
  const { packageId, stickerId } = event.message;
  return replyTextMessage(event, `這個貼圖的packageId: ${packageId} stickerId: ${stickerId}`);
};

const onLocationMessage = async (event) => {
  const { title, address, latitude, longitude } = event.message;
  return replyTextMessage(event, `這個地點是 ${title} 地址: ${address} 緯經度: (${latitude}, ${longitude})`);
};

const onTextMessage = async (event) => {
  const text = event.message.text || "<空訊息>";
  const uid = event.source.userId;
  logger.info(`${uid} 的文字訊息: ${text}`);
  // 文字指令
  switch (text) {
    case "Time":
    case "time":
      return replyTextMessage(event, `當前時間: ${new Date().toISOString()}`);
    case "uid":
    case "Uid":
      return replyTextMessage(event, `使用者ID: ${event.source.userId}`);
    case "Gid":
    case "gid":
      return replyTextMessage(event, `群組ID: ${event.source.groupId || "<不在群組內>"}`);
    default:
      return replyTextMessage(event, text);
  }
};

const handleEvent = async (event) => {
  if (event.type !== "message") {
    return null; // 只處理訊息
  }
  const type = event.message.type;
  switch (type) {
    case "text": return await onTextMessage(event); // 文字訊息
    case "sticker": return await onStickerMessage(event); // 貼圖訊息
    case "location": return await onLocationMessage(event); // 地點訊息
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

app.post("/api/notify", (req, res) => {
  if (!NOTIFY_TOKEN || !NOTIFY_GID) {
    // 如果已經部屬且測試成功過,請註解下面這行
    logger.debug({ message: "env[LINE_NOTIFY_GROUP_ID] or env[LINE_NOTIFY_TOKEN] not set" });
    return res.status(404).end();
  }

  const ctype = req.get("Content-Type") || "";
  const auth = req.get("Authorization") || "";

  // 如果已經部屬且測試成功過,請註解下面這行
  logger.debug({ 'content-type': ctype, 'authorization': auth, 'body-type': typeof req.body });

  // 目前只實作application/x-www-form-urlencoded
  if (typeof ctype !== "string" || !ctype.startsWith("application/x-www-form-urlencoded")) {
    return res.status(400).json({ status: 400, message: "Bad request" });
  }

  if (typeof auth !== "string") {
    return res.status(400).json({ status: 400, message: "Bad request" });
  }

  if (typeof req.body !== "object" || typeof req.body.message !== "string") {
    return res.status(400).json({ status: 400, message: "Bad request" });
  }

  if (auth !== NOTIFY_AUTH) {
    return res.status(401).json({ status: 401, message: "Invalid access token" });
  }

  const message = req.body.message || '';

  logger.info(`notify ${NOTIFY_GID} with msg:${message}`);

  Promise
    .all([pushTextMessage(NOTIFY_GID, message)])
    .then(() => res.json({ message: "Success" }))
    .catch((error) => {
      logger.error(error.message, error);
      res.status(500).json({ status: 500, message: error.message });
    });
});

exports.trigger = onRequest(app);
