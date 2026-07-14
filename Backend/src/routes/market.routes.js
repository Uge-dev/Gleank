import { Router } from "express";
import {
  getCampusMarket,
  getLocalMarketById,
  getMarketCategories,
  getMarketHub,
  getNearbySellers,
  getUsedMarket,
  listLocalMarkets,
  searchMarket,
} from "../services/market.service.js";

export const marketRouter = Router();

function viewerId(req) {
  return req.auth?.user_id || req.auth?.id || "";
}

function viewerCampus(req) {
  return String(req.query.campus || req.auth?.campus || "").trim();
}

function requestedCampus(req) {
  return String(req.query.campus || "").trim();
}

marketRouter.get("/hub", (req, res) => {
  res.json({
    hub: getMarketHub({
      viewerId: viewerId(req),
      campus: requestedCampus(req),
    }),
  });
});

marketRouter.get("/used", (req, res) => {
  res.json(
    getUsedMarket({
      query: String(req.query.q || ""),
      category: String(req.query.category || ""),
    }),
  );
});

marketRouter.get("/campus", (req, res) => {
  res.json(
    getCampusMarket({
      query: String(req.query.q || ""),
      campus: requestedCampus(req),
      viewerId: viewerId(req),
    }),
  );
});

marketRouter.get("/local", (req, res) => {
  res.json({
    markets: listLocalMarkets({
      query: String(req.query.q || ""),
    }),
  });
});

marketRouter.get("/local/:marketId", (req, res) => {
  res.json(
    getLocalMarketById(req.params.marketId, {
      viewerId: viewerId(req),
      publicOnly: true,
    }),
  );
});

marketRouter.get("/nearby", (req, res) => {
  res.json(
    getNearbySellers({
      query: String(req.query.q || ""),
      campus: viewerCampus(req),
      viewerId: viewerId(req),
    }),
  );
});

marketRouter.get("/categories", (_req, res) => {
  res.json({
    categories: getMarketCategories(),
  });
});

marketRouter.get("/search", (req, res) => {
  res.json(
    searchMarket({
      query: String(req.query.q || ""),
      type: String(req.query.type || "all"),
      campus: requestedCampus(req),
      viewerId: viewerId(req),
    }),
  );
});
