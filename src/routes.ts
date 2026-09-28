import { Router } from "express";
import type { Request, Response, NextFunction } from "express";

const routes = Router();

routes.get("/", (req: Request, res: Response, next: NextFunction) => {
  return res.json({ message: "Welcome to the API!" });
});

export default routes;
