// Dependencias necesarias.
import {
  makeWASocket,
  useMultiFileAuthState,
  downloadMediaMessage,
  DisconnectReason,
  Browsers,
} from "@whiskeysockets/baileys";
import { fileTypeFromBuffer } from "file-type";
import { createInterface } from "node:readline";
import { keepAlive } from "./server.js";
import { Boom } from "@hapi/boom";
import pino from "pino";

keepAlive();

async function connectToWA() {
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = (input) => {
    return new Promise((resolve) => readline.question(input, resolve));
  };

  const { state, saveCreds } = await useMultiFileAuthState("auth");

  const browser = Browsers.appropriate("chrome");

  const socket = makeWASocket({
    mobile: false,
    auth: state,
    logger: pino({ level: "silent" }),
    browser,
  });

  if (!socket.authState.creds.registered) {
    const number = await prompt(`Introduce tu número de WhatsApp: `);
    const formatNumber = number.replace(/[\s+-]/g, "");

    const code = await socket.requestPairingCode(formatNumber);

    console.log("Tu código de conexión es:", code);
  }

  // Evento connection.update
  socket.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "close") {
      const shouldReconnect =
        (lastDisconnect.error instanceof Boom)?.output?.statusCode !==
        DisconnectReason.loggedOut;

      console.log(
        "Conexión cerrada debido a",
        lastDisconnect.error + ", reconectando...".red,
        shouldReconnect
      );

      if (shouldReconnect) {
        connectToWA();
      }
    } else if (connection === "open") {
      console.log("WhatsApp bot ready!");
    }
  });

  // Evento messages.upsert
  socket.ev.on("messages.upsert", async ({ type, messages }) => {
    if (!messages[0]?.message) return;

    if (type !== "notify") return;

    if (messages[0]?.key?.fromMe) return;

    const fileType = Object.keys(messages[0].message)[0];

    if (fileType !== "messageContextInfo" && fileType !== "viewOnceMessageV2") {
      return;
    }

    const data = await downloadMediaMessage(messages[0], "buffer");

    const { mime } = await fileTypeFromBuffer(data);

    console.log(mime);

    if (!socket?.user?.id) return;

    socket.sendMessage(socket.user.id, {
      [mime.split("/")[0] || "document"]: data,
      caption: `Enviado por *${messages[0]?.pushName || "Desconocido"}*`,
    });
  });

  // Evento creds.update
  socket.ev.on("creds.update", saveCreds);
}

// Ejecutamos
await connectToWA();

// Por si hay un error, que no se apague.
process.on("uncaughtException", (error) => console.error(error));

process.on("uncaughtExceptionMonitor", (error) => console.error(error));

process.on("unhandledRejection", (error) => console.error(error));

process.stdin.resume();
