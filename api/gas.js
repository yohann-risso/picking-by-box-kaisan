export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ status: "error", message: "Método não permitido" });
  }

  try {
    const response = await fetch(
      "https://script.google.com/macros/s/AKfycbwUMPjyOqeMBX3vRSdMmJmtnt9-Dt8MHdPYl1aTS9cLaPZ7CuyNuw_uuEwRX0Speh5h/exec",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body),
      }
    );

    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    console.error("Erro no proxy GAS:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
}
