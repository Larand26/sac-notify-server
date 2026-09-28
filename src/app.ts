import express from "express";
import cors from "cors";
import routes from "./routes";
import helmet from "helmet";

const app = express();
app.use(helmet());
app.use(express.json());
app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.use(routes);

export default app;
