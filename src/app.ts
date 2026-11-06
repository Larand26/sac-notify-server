import express from "express";
import type { Request, Response, NextFunction } from "express";
import cors from "cors";
import routes from "./routes";
import helmet from "helmet";
import { logger } from "./logger";

const app = express();
app.use(helmet());

// Log de todas as requisições HTTP (método, rota, status e tempo)
app.use((req: Request, res: Response, next: NextFunction) => {
  const inicio = Date.now();
  res.on("finish", () => {
    const fn = res.statusCode >= 500 ? logger.error : res.statusCode >= 400 ? logger.warn : logger.info;
    fn("HTTP", `${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - inicio}ms)`);
  });
  next();
});

app.use(express.json());
app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.use(routes);

// Erros (ex.: JSON inválido no corpo do webhook)
app.use((err: Error & { status?: number }, req: Request, res: Response, _next: NextFunction) => {
  logger.error("HTTP", `Erro em ${req.method} ${req.originalUrl}: ${err.message}`, err);
  res.status(err.status ?? 500).json({ success: false, message: err.message });
});

export default app;
