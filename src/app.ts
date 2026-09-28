import express from "express";
import cors from "cors";
import routes from "./routes";
import helmet from "helmet";

const app = express();
app.use(helmet());
app.use(express.json());
app.use(cors());
app.use(routes);

export default app;
