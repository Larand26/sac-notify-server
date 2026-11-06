import { Router } from "express";
import type { Request, Response } from "express";
import type { Server } from "socket.io";
import { logger } from "./logger";

const routes = Router();

routes.get("/", (req: Request, res: Response) => {
  return res.json({ message: "Welcome to the API!" });
});

// Lista as extensões conectadas no momento (útil para diagnóstico)
routes.get("/status", async (req: Request, res: Response) => {
  const io = req.app.get("io") as Server;
  const sockets = await io.fetchSockets();
  const agora = Date.now();
  return res.json({
    conectados: sockets.length,
    clientes: sockets.map((s) => ({
      socketId: s.id,
      conectadoDesde: new Date(s.data.connectedAt).toISOString(),
      ultimoPongHaSeg: Math.round((agora - s.data.lastPongAt) / 1000),
    })),
  });
});

type OrderData = {
  orderId: string;
  incrementId: string;
  customerName: string;
  customerEmail: string;
};

routes.post("/magento/webhook", async (req: Request, res: Response) => {
  const orderData = (req.body ?? {}) as Partial<OrderData>;
  const io = req.app.get("io") as Server;
  const tag = `#${orderData.incrementId ?? "?"}`;

  logger.info("Webhook", `Pedido recebido ${tag}`, orderData);

  const faltando = (["orderId", "incrementId", "customerName"] as const).filter(
    (k) => orderData[k] === undefined || orderData[k] === null || orderData[k] === "",
  );
  if (faltando.length) {
    // orderId ausente faz a extensão quebrar ao criar a notificação
    logger.error("Webhook", `Pedido ${tag} com campos ausentes: ${faltando.join(", ")}`, {
      contentType: req.headers["content-type"],
    });
  }

  const sockets = await io.fetchSockets();
  const agora = Date.now();

  if (sockets.length === 0) {
    logger.error(
      "Webhook",
      `Nenhuma extensão conectada — pedido ${tag} NÃO será notificado a ninguém.`,
    );
  } else {
    const destinos = sockets.map((s) => ({
      socketId: s.id,
      ip: s.data.ip,
      ultimoPongHaSeg: Math.round((agora - s.data.lastPongAt) / 1000),
    }));
    logger.info("Webhook", `Enviando pedido ${tag} para ${sockets.length} extensão(ões)`, destinos);

    // Conexão sem responder ao ping há mais de 15s provavelmente está morta
    const suspeitos = destinos.filter((d) => d.ultimoPongHaSeg > 15);
    if (suspeitos.length) {
      logger.warn(
        "Webhook",
        `Pedido ${tag}: ${suspeitos.length} conexão(ões) sem resposta recente — podem não receber o aviso`,
        suspeitos,
      );
    }
  }

  io.emit("new_order", orderData);

  return res.status(200).json({
    success: true,
    message: "Notificação enviada ao SAC.",
    extensoesConectadas: sockets.length,
  });
});

export default routes;
