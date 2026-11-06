import { Router } from "express";
import type { Request, Response } from "express";
import type { Server } from "socket.io";
import { logger } from "./logger";

const routes = Router();

// Atraso antes de notificar o SAC, para dar tempo da integração com o ERP.
// Padrão: 5 minutos. Pode ser alterado pela variável de ambiente NOTIFY_DELAY_MS.
const NOTIFY_DELAY_MS = Number(process.env.NOTIFY_DELAY_MS ?? 5 * 60 * 1000);

type OrderData = {
  orderId: string;
  incrementId: string;
  customerName: string;
  customerEmail: string;
};

// Pedidos aguardando o envio (ficam só em memória)
const pendentes = new Map<
  string,
  { orderData: Partial<OrderData>; enviarEm: number; timer: NodeJS.Timeout }
>();

export function pedidosPendentes() {
  return [...pendentes.values()].map((p) => ({
    incrementId: p.orderData.incrementId ?? null,
    enviarEm: new Date(p.enviarEm).toISOString(),
  }));
}

routes.get("/", (req: Request, res: Response) => {
  return res.json({ message: "Welcome to the API!" });
});

// Lista as extensões conectadas e os pedidos aguardando envio
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
    atrasoNotificacaoSeg: Math.round(NOTIFY_DELAY_MS / 1000),
    pedidosAguardando: pedidosPendentes(),
  });
});

async function enviarPedido(io: Server, orderData: Partial<OrderData>) {
  const tag = `#${orderData.incrementId ?? "?"}`;
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
    logger.info(
      "Webhook",
      `Enviando pedido ${tag} para ${sockets.length} extensão(ões)`,
      destinos,
    );

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
}

routes.post("/magento/webhook", (req: Request, res: Response) => {
  const orderData = (req.body ?? {}) as Partial<OrderData>;
  const io = req.app.get("io") as Server;
  const tag = `#${orderData.incrementId ?? "?"}`;

  logger.info("Webhook", `Pedido recebido ${tag}`, orderData);

  const faltando = (["orderId", "incrementId", "customerName"] as const).filter(
    (k) =>
      orderData[k] === undefined ||
      orderData[k] === null ||
      orderData[k] === "",
  );
  if (faltando.length) {
    // orderId ausente faz a extensão quebrar ao criar a notificação
    logger.error(
      "Webhook",
      `Pedido ${tag} com campos ausentes: ${faltando.join(", ")}`,
      {
        contentType: req.headers["content-type"],
      },
    );
  }

  // Se o Magento mandar o mesmo pedido de novo, reinicia a espera em vez de notificar duas vezes
  const chave = String(
    orderData.orderId ?? orderData.incrementId ?? `sem-id-${Date.now()}`,
  );
  const anterior = pendentes.get(chave);
  if (anterior) {
    clearTimeout(anterior.timer);
    logger.warn(
      "Webhook",
      `Pedido ${tag} recebido de novo enquanto aguardava; espera reiniciada`,
    );
  }

  const enviarEm = Date.now() + NOTIFY_DELAY_MS;
  const timer = setTimeout(() => {
    pendentes.delete(chave);
    enviarPedido(io, orderData).catch((err) =>
      logger.error("Webhook", `Falha ao enviar pedido ${tag}`, err),
    );
  }, NOTIFY_DELAY_MS);
  pendentes.set(chave, { orderData, enviarEm, timer });

  logger.info(
    "Webhook",
    `Pedido ${tag} agendado para notificar em ${Math.round(NOTIFY_DELAY_MS / 1000)}s (${new Date(enviarEm).toISOString()})`,
    { aguardando: pendentes.size },
  );

  return res.status(200).json({
    success: true,
    message: `Notificação agendada para daqui a ${Math.round(NOTIFY_DELAY_MS / 60000)} minuto(s).`,
    enviarEm: new Date(enviarEm).toISOString(),
  });
});

export default routes;
