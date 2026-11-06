import app from "./app";
import http from "http";
import { Server } from "socket.io";
import { logger } from "./logger";
import { pedidosPendentes } from "./routes";

// Railway envia SIGTERM ao reiniciar/fazer deploy: pedidos aguardando o atraso se perdem
for (const sinal of ["SIGTERM", "SIGINT"] as const) {
  process.on(sinal, () => {
    const pendentes = pedidosPendentes();
    if (pendentes.length) {
      logger.error(
        "Server",
        `Servidor encerrando (${sinal}) com ${pendentes.length} pedido(s) aguardando — NÃO serão notificados`,
        pendentes,
      );
    } else {
      logger.info("Server", `Servidor encerrando (${sinal})`);
    }
    process.exit(0);
  });
}

process.on("unhandledRejection", (reason) => {
  logger.error("Process", "Promise rejeitada sem tratamento", reason);
});
process.on("uncaughtException", (err) => {
  logger.error("Process", "Exceção não tratada — encerrando processo", err);
  process.exit(1);
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  pingInterval: 5000,
  pingTimeout: 7000,
});

app.set("io", io);

io.engine.on("connection_error", (err: { code: number; message: string; context?: unknown }) => {
  logger.error("Socket.io", `Erro de conexão (code=${err.code}): ${err.message}`, err.context);
});

// Controla períodos em que NENHUMA extensão está conectada
let semClientesDesde: number | null = Date.now();

io.on("connection", (socket) => {
  const connectedAt = Date.now();
  const ip =
    (socket.handshake.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
    socket.handshake.address;
  const userAgent = socket.handshake.headers["user-agent"] ?? "desconhecido";

  socket.data.ip = ip;
  socket.data.userAgent = userAgent;
  socket.data.connectedAt = connectedAt;
  socket.data.lastPongAt = connectedAt;

  // Cada "pong" é a resposta da extensão ao ping do servidor (a cada 5s)
  socket.conn.on("packet", (packet: { type: string }) => {
    if (packet.type === "pong") socket.data.lastPongAt = Date.now();
  });

  logger.info("Socket.io", `Cliente conectado: socket=${socket.id} ip=${ip}`, {
    userAgent,
    transport: socket.conn.transport.name,
    totalConectados: io.of("/").sockets.size,
  });

  if (semClientesDesde !== null) {
    logger.info(
      "Socket.io",
      `Primeira extensão conectada após ${Math.round((connectedAt - semClientesDesde) / 1000)}s sem nenhuma conectada`,
    );
    semClientesDesde = null;
  }

  socket.on("disconnect", (reason) => {
    const restantes = io.of("/").sockets.size;
    logger.warn(
      "Socket.io",
      `Cliente desconectado: socket=${socket.id} ip=${ip} — motivo: ${reason}`,
      {
        duracaoSeg: Math.round((Date.now() - connectedAt) / 1000),
        ultimoPongHaSeg: Math.round((Date.now() - socket.data.lastPongAt) / 1000),
        totalConectados: restantes,
      },
    );
    if (restantes === 0) {
      semClientesDesde = Date.now();
      logger.error("Socket.io", "Nenhuma extensão conectada agora — pedidos enviados enquanto isso serão perdidos");
    }
  });

  socket.on("error", (err) => {
    logger.error("Socket.io", `Erro no socket ${socket.id} (ip=${ip})`, err);
  });
});

server.listen(3000, () => {
  logger.info("Server", "🚀 Servidor a correr na porta 3000");
});
