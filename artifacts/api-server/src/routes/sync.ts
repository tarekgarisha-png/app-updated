import { Router, type IRouter } from "express";
import { buildDebtsCSV, buildHistoryCSV, buildProductsCSV, getData, mergeData } from "../lib/store";

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

router.get("/export/products.csv", (_req, res) => {
  const data = getData();
  res.type("text/csv").send(buildProductsCSV(data.products));
});

router.get("/export/history.csv", (_req, res) => {
  const data = getData();
  res.type("text/csv").send(buildHistoryCSV(data.history));
});

router.get("/export/debts.csv", (_req, res) => {
  const data = getData();
  res.type("text/csv").send(buildDebtsCSV(data.history));
});

export default router;
