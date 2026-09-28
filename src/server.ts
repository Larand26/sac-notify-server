import app from "./app";
import http from "http";
import { Server } from "socket.io";

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  pingInterval: 20000,
  pingTimeout: 10000,
});

app.set("io", io);

io.on("connection", (socket) => {
  console.log(`[Socket.io] Novo cliente conectado: ${socket.id}`);
  socket.on("disconnect", () =>
    console.log(`[Socket.io] Desconectado: ${socket.id}`),
  );
});

server.listen(3000, () => {
  console.log("🚀 Servidor a correr na porta 3000");
});
