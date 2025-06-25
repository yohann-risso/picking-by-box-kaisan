export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const GAS_URL = "https://script.google.com/macros/s/AKfycbymQwy2XDKVGYQF0Cc1QNqVSdfLQ1ThC5mtogO3v_Ayde1d-Eb-ObvizSarMMWQlFCP/exec"; // sua URL
    const TOKEN = "mFa7kVRyLpT4xZq32uEXWJgHoMb58nPCvtKhALNfY9IQcrszdeUG0jBwmSl6TO1D"; // o mesmo do GAS

    const response = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: TOKEN })
    });

    const json = await response.json();
    res.status(200).json(json);
  } catch (error) {
    console.error("Erro ao acionar GAS:", error);
    res.status(500).json({ status: "erro", message: error.message });
  }
}
