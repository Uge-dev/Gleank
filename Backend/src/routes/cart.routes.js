import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  addCartItem,
  clearCart,
  listCart,
  mergeCart,
  removeCartItem,
  replaceCart,
  setCartItemQuantity,
} from "../services/cart.service.js";

export const cartRouter = Router();

cartRouter.use(requireAuth);

cartRouter.get("/", (req, res) => {
  res.json({ cartItems: listCart(req.auth.user_id) });
});

cartRouter.post("/items", (req, res) => {
  res.status(201).json({ cartItems: addCartItem(req.auth.user_id, req.body) });
});

cartRouter.patch("/items/:productId", (req, res) => {
  res.json({
    cartItems: setCartItemQuantity(
      req.auth.user_id,
      req.params.productId,
      req.body?.quantity,
    ),
  });
});

cartRouter.delete("/items/:productId", (req, res) => {
  res.json({ cartItems: removeCartItem(req.auth.user_id, req.params.productId) });
});

cartRouter.delete("/", (req, res) => {
  res.json({ cartItems: clearCart(req.auth.user_id) });
});

cartRouter.post("/merge", (req, res) => {
  res.json({ cartItems: mergeCart(req.auth.user_id, req.body?.items) });
});

cartRouter.put("/", (req, res) => {
  res.json({ cartItems: replaceCart(req.auth.user_id, req.body?.items) });
});
