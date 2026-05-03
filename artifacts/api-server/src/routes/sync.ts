import { Router, type IRouter } from "express";
import { getData, mergeData } from "../lib/store";

const router: IRouter = Router();

router.get("/sync", (_req, res) => {
  res.json(getData());
});

router.post("/sync", (req, res) => {
  const { products = [], history = [], partialPayments = [] } =
    (req.body as {
      products?: unknown[];
      history?: unknown[];
      partialPayments?: unknown[];
    }) ?? {};

  const merged = mergeData({
    products: products as Parameters<typeof mergeData>[0]["products"],
    history: history as Parameters<typeof mergeData>[0]["history"],
    partialPayments:
      partialPayments as Parameters<typeof mergeData>[0]["partialPayments"],
  });

  res.json(merged);
});

export default router;
