export default async function handler(req, res) {
  const { usuario } = req.query;

  if (!usuario) {
    return res.status(400).json({ error: "Usuário não informado" });
  }

  try {
    // Requisição à página de remessas no GE
    const response = await fetch("https://ge.kaisan.com.br/?page=meta/view&id_view=nfe_arquivo_remessa_conferencia&_menu_acessado=610", {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Cookie: `PHPSESSID=${session}`,
      },
    });

    if (!response.ok) {
      return res.status(500).json({ error: "Falha ao acessar GE" });
    }

    const html = await response.text();

    // (Opcional) Filtrar por nome do operador na linha do HTML
    const regex = new RegExp(
      `<button[^>]+ctr_cod_arquivo_remessa=(\\d+)[\\s\\S]+?${usuario}`,
      "i"
    );

    const match = html.match(regex);

    if (match && match[1]) {
      return res.status(200).json({ remessa: parseInt(match[1], 10) });
    }

    // Plano B: só extrai o primeiro encontrado
    const fallback = html.match(/ctr_cod_arquivo_remessa=(\d+)/);
    if (fallback && fallback[1]) {
      return res.status(200).json({
        remessa: parseInt(fallback[1], 10),
        aviso: "Remessa encontrada sem correspondência exata do usuário.",
      });
    }

    return res.status(404).json({ error: "Nenhuma remessa encontrada" });

  } catch (error) {
    console.error("Erro ao buscar remessa:", error);
    return res.status(500).json({ error: "Erro interno ao buscar remessa" });
  }
}
