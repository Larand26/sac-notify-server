import { Router } from "express";
import type { Request, Response, NextFunction } from "express";

const routes = Router();

routes.get("/", (req: Request, res: Response, next: NextFunction) => {
  return res.json({ message: "Welcome to the API!" });
});

routes.post(
  "/magento/webhook",
  (req: Request, res: Response, next: NextFunction) => {
    const orderData = req.body as {
      orderId: string;
      incrementId: string;
      customerName: string;
      customerEmail: string;
    };
    const io = req.app.get("io");

    console.log(`[Webhook] Novo pedido recebido: #${orderData.incrementId}`);
    io.emit("new_order", orderData);
    res
      .status(200)
      .json({ success: true, message: "Notificação enviada ao SAC." });
  },
);

export default routes;
