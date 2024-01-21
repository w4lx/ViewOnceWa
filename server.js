import express from "express";

export function keepAlive() {
  const app = express();

  const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;

  app.get("/", (req, res) => {
    res.send("Funcionando...");
  });

  app.listen(PORT, () => console.log("¡Server ready!"));
}
